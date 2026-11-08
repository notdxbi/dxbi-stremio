package com.notdxbi.dxbi.tv

import android.content.Context
import android.net.Uri
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.libtorrent4j.AnnounceEntry
import org.libtorrent4j.Priority
import org.libtorrent4j.SessionHandle
import org.libtorrent4j.SessionManager
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.Sha1Hash
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.TorrentHandle
import org.libtorrent4j.TorrentInfo
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Torrents played on the TV itself, with no streaming server anywhere: libtorrent fetches the file
 * in order (the part being watched first), and a small web server on 127.0.0.1 hands it to the
 * player as if it were any other link, waiting for pieces that haven't arrived yet.
 *
 * One torrent at a time; its download is deleted when playback stops (and at the next start, in
 * case the app was closed mid-way).
 *
 * Phones also save torrents to watch offline (Downloads.kt): those are "kept" torrents, any number
 * at once, in a folder that survives restarts. Media3's downloader copies the file from the same
 * web server (/k/<hash>) as it arrives, and the torrent's own copy is deleted once that's done.
 */
object TorrentEngine {
    private const val TAG = "dxbi-torrent"
    private const val METADATA_TIMEOUT_S = 60
    private const val READ_AHEAD_PIECES = 12
    private const val PIECE_WAIT_MS = 90_000L
    // (a download's reader gives up a little sooner than its HTTP client would, then asks again from
    // where it got to: Media3 retries, and only fails after several waits with nothing new)
    private const val KEPT_PIECE_WAIT_MS = 45_000L
    const val SCHEME = "dxbi-torrent"

    // Well-known open trackers, added to every torrent alongside its own (as Stremio's server does):
    // many streams list few or none, and leave finding peers to the DHT
    private val OPEN_TRACKERS = listOf(
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://open.demonii.com:1337/announce",
        "udp://explodie.org:6969/announce",
    )

    private var session: SessionManager? = null
    private var server: Server? = null
    private lateinit var dir: File
    private val worker = Executors.newSingleThreadExecutor()

    /** The torrent being played */
    private class Active(val hash: String, val handle: TorrentHandle, val info: TorrentInfo, val file: Int, val path: File) {
        val offset: Long = info.files().fileOffset(file)
        val size: Long = info.files().fileSize(file)
        val pieceLength: Int = info.pieceLength()
        @Volatile var closed = false
        // a download's: playback stopping leaves it be
        @Volatile var kept = false
        @Volatile var paused = false
    }

    /** Torrents being saved for offline, by hash */
    private val kept = ConcurrentHashMap<String, Active>()
    private val keptLocks = ConcurrentHashMap<String, Any>()

    @Volatile private var active: Active? = null
    @Volatile private var opening: String? = null
    @Volatile private var failure: String? = null

    /** Set up once: the download folder (emptied) and the session */
    @Synchronized
    private fun ensure(context: Context) {
        if (session != null) return
        dir = File(context.cacheDir, "torrents")
        dir.deleteRecursively()
        dir.mkdirs()
        val settings = SettingsPack()
            .listenInterfaces("0.0.0.0:6881,[::]:6881")
            .connectionsLimit(120)
            .activeDownloads(8)
        val s = SessionManager(false)
        s.start(SessionParams(settings))
        session = s
        server = Server().also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true) }
        Log.i(TAG, "engine up, web server on ${server!!.listeningPort}")
    }

    /**
     * Starts fetching [infoHash] (file [fileIdx], or the biggest video in it when -1) and returns the
     * address the player reads it from. Getting the torrent's details from peers happens in the
     * background: the address answers once they're in.
     */
    fun open(context: Context, infoHash: String, fileIdx: Int, trackers: List<String>, nameHint: String): String {
        ensure(context)
        val hash = infoHash.lowercase()
        val current = active
        if (current == null || current.hash != hash) {
            close()
            opening = hash
            failure = null
            worker.execute { start(hash, fileIdx, trackers, nameHint) }
        }
        return "http://127.0.0.1:${server!!.listeningPort}/t/$hash"
    }

    private fun start(hash: String, fileIdx: Int, trackers: List<String>, nameHint: String) {
        val s = session ?: return
        // being downloaded already: played from that copy (which stays when playback stops)
        kept[hash]?.let { k ->
            if (k.paused) { k.handle.resume(); k.paused = false }
            if (opening == hash) active = k
            return
        }
        try {
            val allTrackers = (trackers.take(30) + OPEN_TRACKERS).distinct()
            val magnet = buildString {
                append("magnet:?xt=urn:btih:").append(hash)
                for (t in allTrackers) append("&tr=").append(java.net.URLEncoder.encode(t, "UTF-8"))
            }
            // the torrent's file list and pieces, from peers (DHT and the stream's trackers)
            val bytes = s.fetchMagnet(magnet, METADATA_TIMEOUT_S, dir)
            if (opening != hash) return
            if (bytes == null) {
                failure = "No peers answered for this torrent. Try another stream."
                return
            }
            val info = TorrentInfo.bdecode(bytes)
            val files = info.files()
            val pick = if (fileIdx in 0 until files.numFiles()) fileIdx else chooseFile(info, nameHint)
            // only the file being watched is downloaded
            val priorities = Array(files.numFiles()) { if (it == pick) Priority.DEFAULT else Priority.IGNORE }
            s.download(info, dir, null, priorities, null, TorrentFlags.SEQUENTIAL_DOWNLOAD)
            val handle = s.find(Sha1Hash.parseHex(hash)) ?: run { failure = "Couldn't start the torrent."; return }
            handle.setFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD)
            // the torrent's details don't carry the trackers: give them back, and ask them for peers now
            for (t in allTrackers) handle.addTracker(AnnounceEntry(t))
            handle.forceReannounce()
            handle.forceDHTAnnounce()
            val a = Active(hash, handle, info, pick, File(dir, files.filePath(pick)))
            // the start and the very end first: players read a file's index (MP4's moov, MKV's cues)
            // from either end before playing
            val first = a.offset / a.pieceLength
            val last = (a.offset + a.size - 1) / a.pieceLength
            for (p in first..minOf(last, first + READ_AHEAD_PIECES)) handle.setPieceDeadline(p.toInt(), 300 + (p - first).toInt() * 150)
            for (p in maxOf(first, last - 1)..last) handle.setPieceDeadline(p.toInt(), 600)
            if (opening != hash) { s.remove(handle, SessionHandle.DELETE_FILES); return }
            active = a
            Log.i(TAG, "playing ${files.filePath(pick)} (${a.size / 1048576} MB)")
        } catch (e: Exception) {
            Log.w(TAG, "couldn't open $hash", e)
            failure = "Couldn't open this torrent."
        }
    }

    // Stremio sends the file to play; when it doesn't, the biggest video file is the film/episode
    private fun chooseFile(info: TorrentInfo, nameHint: String): Int {
        val files = info.files()
        val videos = (0 until files.numFiles()).filter { Regex("""\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|flv)$""", RegexOption.IGNORE_CASE).containsMatchIn(files.fileName(it)) }
        val pool = videos.ifEmpty { (0 until files.numFiles()).toList() }
        val hinted = if (nameHint.isNotBlank()) pool.filter { files.fileName(it).contains(nameHint, ignoreCase = true) } else emptyList()
        return (hinted.ifEmpty { pool }).maxByOrNull { files.fileSize(it) } ?: 0
    }

    /** Stops the download and deletes it (unless it's also being saved for offline) */
    fun close() {
        opening = null
        val a = active ?: return
        active = null
        if (a.kept) return
        a.closed = true
        try { session?.remove(a.handle, SessionHandle.DELETE_FILES) } catch (_: Exception) { }
        Log.i(TAG, "closed ${a.hash}")
    }

    // ---- Downloads (phones) ----

    /** The address a download of [infoHash] is saved under: the same every time, whatever port the web server gets */
    fun downloadUri(infoHash: String, fileIdx: Int, trackers: List<String>, nameHint: String): String =
        Uri.Builder().scheme(SCHEME).authority(infoHash.lowercase())
            .appendQueryParameter("f", fileIdx.toString())
            .appendQueryParameter("n", nameHint)
            .apply { trackers.take(30).forEach { appendQueryParameter("tr", it) } }
            .build().toString()

    fun hashOf(uri: String): String? = Uri.parse(uri).takeIf { it.scheme == SCHEME }?.authority?.lowercase()

    /**
     * Where the downloader reads a [downloadUri] from right now: starts (or carries on) fetching it into
     * [dir], first getting the torrent's details from peers when they aren't saved yet. Blocks; throws
     * when it can't, and the downloader tries again.
     */
    fun resolveDownload(context: Context, uri: Uri, dir: File): Uri {
        ensure(context)
        val hash = uri.authority?.lowercase()?.takeIf { it.matches(Regex("[0-9a-f]{40}")) } ?: throw IOException("Not a torrent")
        val address = Uri.parse("http://127.0.0.1:${server!!.listeningPort}/k/$hash")
        synchronized(keptLocks.getOrPut(hash) { Any() }) {
            kept[hash]?.let { k ->
                if (k.paused) { k.handle.resume(); k.paused = false }
                return address
            }
            val s = session ?: throw IOException("The torrent engine isn't running")
            // playing it right now: that copy carries on as the download
            active?.takeIf { it.hash == hash }?.let { a ->
                a.kept = true
                kept[hash] = a
                return address
            }
            val trackers = uri.getQueryParameters("tr").filter { it.isNotEmpty() }
            val allTrackers = (trackers + OPEN_TRACKERS).distinct()
            dir.mkdirs()
            // the torrent's details, from the last time or from peers (DHT and the stream's trackers)
            val saved = File(dir, "$hash.torrent")
            val bytes = saved.takeIf { it.length() > 0 }?.readBytes() ?: run {
                val magnet = buildString {
                    append("magnet:?xt=urn:btih:").append(hash)
                    for (t in allTrackers) append("&tr=").append(java.net.URLEncoder.encode(t, "UTF-8"))
                }
                s.fetchMagnet(magnet, METADATA_TIMEOUT_S, dir)?.also { runCatching { saved.writeBytes(it) } }
            } ?: throw IOException("No peers answered for this torrent")
            val info = TorrentInfo.bdecode(bytes)
            val files = info.files()
            val fileIdx = uri.getQueryParameter("f")?.toIntOrNull() ?: -1
            val pick = if (fileIdx in 0 until files.numFiles()) fileIdx else chooseFile(info, uri.getQueryParameter("n").orEmpty())
            val priorities = Array(files.numFiles()) { if (it == pick) Priority.DEFAULT else Priority.IGNORE }
            val data = File(dir, hash)
            // (what's already in the folder from before is checked and kept)
            s.download(info, data, null, priorities, null, TorrentFlags.SEQUENTIAL_DOWNLOAD)
            val handle = s.find(Sha1Hash.parseHex(hash)) ?: throw IOException("Couldn't start the torrent")
            handle.unsetFlags(TorrentFlags.AUTO_MANAGED)
            handle.setFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD)
            handle.resume()
            for (t in allTrackers) handle.addTracker(AnnounceEntry(t))
            handle.forceReannounce()
            handle.forceDHTAnnounce()
            val a = Active(hash, handle, info, pick, File(data, files.filePath(pick))).apply { this.kept = true }
            kept[hash] = a
            Log.i(TAG, "downloading ${files.filePath(pick)} (${a.size / 1048576} MB)")
            return address
        }
    }

    /**
     * Downloads that aren't running (paused, waiting for Wi-Fi, queued) stop fetching too: only
     * [running] carry on, and they start again when the downloader next reads them.
     */
    fun keepRunning(running: Set<String>) {
        for ((hash, a) in kept) {
            if (hash in running || a.paused || active === a) continue
            runCatching { a.handle.pause() }
            a.paused = true
        }
    }

    /** A download that's finished or been deleted: the torrent's own copy goes */
    fun drop(context: Context, hash: String, dir: File) {
        worker.execute {
            synchronized(keptLocks.getOrPut(hash) { Any() }) {
                val a = kept.remove(hash)
                if (a != null) {
                    a.kept = false
                    if (active !== a) {
                        a.closed = true
                        runCatching { session?.remove(a.handle, SessionHandle.DELETE_FILES) }
                    }
                }
                File(dir, hash).deleteRecursively()
                File(dir, "$hash.torrent").delete()
            }
        }
        Log.i(TAG, "dropped download $hash")
    }

    /** Clears out torrents left in [dir] by downloads that are no longer there ([wanted]: the ones that are) */
    fun tidy(dir: File, wanted: Set<String>) {
        worker.execute {
            dir.listFiles()?.forEach { f ->
                val hash = f.name.removeSuffix(".torrent")
                if (hash.matches(Regex("[0-9a-f]{40}")) && hash !in wanted && !kept.containsKey(hash)) f.deleteRecursively()
            }
        }
    }

    /** For the player's status line: "Finding peers…", "12 peers · 2.4 MB/s", or why it failed */
    fun status(): String? {
        failure?.let { return it }
        val a = active ?: return if (opening != null) "Finding peers…" else null
        return try {
            val st = a.handle.status()
            val rate = st.downloadPayloadRate() / 1048576.0
            "${st.numPeers()} peer${if (st.numPeers() == 1) "" else "s"} · ${"%.1f".format(rate)} MB/s"
        } catch (_: Exception) { null }
    }

    fun failed(): String? = failure

    // ---- Reading the file as it arrives ----

    /** Waits until [piece] is downloaded (asking for it, and the next few, urgently) */
    private fun await(a: Active, piece: Int): Boolean {
        if (a.handle.havePiece(piece)) return true
        val lastPiece = ((a.offset + a.size - 1) / a.pieceLength).toInt()
        for (p in piece..minOf(lastPiece, piece + READ_AHEAD_PIECES)) a.handle.setPieceDeadline(p, (p - piece) * 200)
        val until = System.currentTimeMillis() + if (a.kept && active !== a) KEPT_PIECE_WAIT_MS else PIECE_WAIT_MS
        while (!a.closed && System.currentTimeMillis() < until) {
            if (a.handle.havePiece(piece)) return true
            Thread.sleep(60)
        }
        return false
    }

    /** The file from [start], handed over piece by piece as each one arrives */
    private class PieceStream(private val a: Active, start: Long, private val end: Long) : InputStream() {
        private var pos = start
        private var raf: RandomAccessFile? = null

        override fun read(): Int {
            val one = ByteArray(1)
            return if (read(one, 0, 1) == 1) one[0].toInt() and 0xff else -1
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (pos > end || a.closed) return -1
            val piece = ((a.offset + pos) / a.pieceLength).toInt()
            if (!await(a, piece)) return -1
            // as far as the end of this piece (the next may not be here yet)
            val pieceEnd = (piece.toLong() + 1) * a.pieceLength - a.offset
            val n = minOf(len.toLong(), end - pos + 1, pieceEnd - pos).toInt()
            val file = raf ?: RandomAccessFile(a.path, "r").also { raf = it }
            file.seek(pos)
            val got = file.read(b, off, n)
            if (got > 0) pos += got
            return got
        }

        override fun close() {
            try { raf?.close() } catch (_: Exception) { }
        }
    }

    private class Server : NanoHTTPD("127.0.0.1", 0) {
        override fun serve(session: IHTTPSession): Response {
            if (session.uri.startsWith("/k/")) {
                val a = kept[session.uri.removePrefix("/k/").lowercase()] ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not downloading")
                return send(a, session)
            }
            val hash = session.uri.removePrefix("/t/").lowercase()
            // the torrent's details can take a while to arrive from peers: the player's first request waits
            val until = System.currentTimeMillis() + (METADATA_TIMEOUT_S + 5) * 1000L
            var a = active
            while ((a == null || a.hash != hash) && failure == null && opening == hash && System.currentTimeMillis() < until) {
                Thread.sleep(100)
                a = active
            }
            if (a == null || a.hash != hash) return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, failure ?: "not playing")
            return send(a, session)
        }

        private fun send(a: Active, session: IHTTPSession): Response {
            // the file is created as soon as the download starts; wait for it to exist
            for (i in 0 until 50) { if (a.path.exists()) break; Thread.sleep(100) }

            val size = a.size
            var start = 0L
            var end = size - 1
            val range = session.headers["range"]
            val ranged = range != null && range.startsWith("bytes=")
            if (ranged) {
                val parts = range!!.removePrefix("bytes=").split("-")
                start = parts[0].toLongOrNull() ?: 0L
                end = parts.getOrNull(1)?.toLongOrNull()?.coerceAtMost(size - 1) ?: (size - 1)
                if (start >= size) {
                    return newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, MIME_PLAINTEXT, "").apply { addHeader("Content-Range", "bytes */$size") }
                }
            }
            val length = end - start + 1
            val response = newFixedLengthResponse(if (ranged) Response.Status.PARTIAL_CONTENT else Response.Status.OK, mime(a.path.name), PieceStream(a, start, end), length)
            response.addHeader("Accept-Ranges", "bytes")
            if (ranged) response.addHeader("Content-Range", "bytes $start-$end/$size")
            return response
        }

        private fun mime(name: String): String = when (name.substringAfterLast('.').lowercase()) {
            "mp4", "m4v" -> "video/mp4"
            "webm" -> "video/webm"
            "avi" -> "video/x-msvideo"
            "ts", "m2ts" -> "video/mp2t"
            "mov" -> "video/quicktime"
            else -> "video/x-matroska"
        }
    }
}
