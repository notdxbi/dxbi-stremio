package com.notdxbi.dxbi.tv

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Keeps dx.bi current on the TV:
 *  - the dx.bi plugin updates itself between app releases, like it does on a computer: a newer copy
 *    is fetched in the background and used from the next launch
 *  - a new dx.bi TV release is offered once, and downloaded and installed when wanted
 */
object Updates {
    // The plugin from the latest release, not the main branch: unreleased work never reaches TVs
    private const val PLUGIN_URL = "https://github.com/notdxbi/dxbi-stremio/releases/latest/download/dxbi.plugin.js"
    private const val RELEASES_URL = "https://api.github.com/repos/notdxbi/dxbi-stremio/releases/latest"
    private const val APK_ASSET = "dxbi-tv.apk"
    private const val UPDATED_PLUGIN = "dxbi.plugin.js"

    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()
    }

    /** The plugin to run: the bundled one, or a newer one fetched earlier */
    fun pluginSource(context: Context): String {
        val bundled = context.assets.open("dxbi.plugin.js").bufferedReader().use { it.readText() }
        val updated = File(context.filesDir, UPDATED_PLUGIN)
        if (updated.exists()) {
            val text = updated.readText()
            if (isNewer(version(text), version(bundled))) return text
            updated.delete() // the app itself has caught up
        }
        return bundled
    }

    /**
     * The plugin as the TV runs it: without the intro film and the picture enhancer's shaders, which
     * dx.bi TV never uses: about 40% smaller, so a 2 GB TV has that much less to hold while starting.
     */
    fun forTv(source: String): String = source
        .replace(Regex("""(\n  function introVideoData\(\) \{\n    return )"[^\n]*"""), "$1\"\";")
        .replace(Regex("""(\n  function anime4kShaders\(\) \{\n    return )\{[^\n]*"""), "$1{};")

    fun checkPlugin(context: Context) = thread(name = "dxbi-plugin-update") {
        try {
            val text = get(PLUGIN_URL) ?: return@thread
            if (!text.contains("@name dx.bi")) return@thread
            if (isNewer(version(text), version(pluginSource(context)))) {
                // Written next to it and swapped in whole: a half-written copy (power cut, app closed)
                // would otherwise keep its new version number and be loaded, and never fetched again
                val partial = File(context.filesDir, "$UPDATED_PLUGIN.download")
                partial.writeText(text)
                if (!partial.renameTo(File(context.filesDir, UPDATED_PLUGIN))) partial.delete()
            }
        } catch (_: Exception) { /* offline: try again next launch */ }
    }

    fun checkApp(activity: MainActivity) = thread(name = "dxbi-app-update") {
        try {
            val release = JSONObject(get(RELEASES_URL) ?: return@thread)
            val latest = release.optString("tag_name").removePrefix("v")
            val current = BuildConfigVersion.name(activity)
            if (!isNewer(latest, current)) return@thread
            val prefs = activity.getSharedPreferences("updates", Context.MODE_PRIVATE)
            if (prefs.getString("skipped", null) == latest) return@thread
            val assets = release.optJSONArray("assets") ?: return@thread
            // (only once GitHub has the whole file: an asset still uploading is listed too)
            val asset = (0 until assets.length()).map { assets.getJSONObject(it) }
                .firstOrNull { it.optString("name") == APK_ASSET && it.optString("state", "uploaded") == "uploaded" } ?: return@thread
            val url = asset.optString("browser_download_url")
            val size = asset.optLong("size", -1)
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                AlertDialog.Builder(activity)
                    .setTitle("dx.bi $latest is out")
                    .setMessage("You have $current. Update now? It downloads in the background, then Android asks you to install it.")
                    .setPositiveButton("Update") { _, _ -> download(activity, url, size, latest) }
                    .setNegativeButton("Not now", null)
                    .setNeutralButton("Skip this version") { _, _ -> prefs.edit().putString("skipped", latest).apply() }
                    .show()
            }
        } catch (_: Exception) { /* offline: try again next launch */ }
    }

    private val downloading = java.util.concurrent.atomic.AtomicBoolean(false)

    private fun download(activity: MainActivity, url: String, size: Long, version: String) {
        // Android only installs apps from dx.bi once it's allowed to ("Install unknown apps")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            try {
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
                Toast.makeText(activity, "Allow dx.bi to install apps, then choose Update again", Toast.LENGTH_LONG).show()
            } catch (_: Exception) {
                // Some TVs (Fire OS among them) have no such screen to open directly
                Toast.makeText(activity, "Allow dx.bi to install apps in the TV's settings (on Fire TV: My Fire TV → Developer options → Install unknown apps), then choose Update again", Toast.LENGTH_LONG).show()
            }
            return
        }
        // One download at a time: pressing Update twice had two downloads writing the same file, and
        // Android then said "There was a problem parsing the package"
        if (!downloading.compareAndSet(false, true)) {
            Toast.makeText(activity, "The update is already downloading…", Toast.LENGTH_SHORT).show()
            return
        }
        Toast.makeText(activity, "Downloading the update…", Toast.LENGTH_SHORT).show()
        thread(name = "dxbi-apk-download") {
            try {
                val dir = File(activity.cacheDir, "updates").apply { deleteRecursively(); mkdirs() }
                val apk = File(dir, "dxbi-tv-$version.apk")
                // A download cut short (slow Wi-Fi, the TV sleeping) is tried again before giving up
                var problem: String? = null
                for (attempt in 1..3) {
                    problem = fetchApk(url, apk, size, version, activity)
                    if (problem == null) break
                }
                if (problem != null) throw IllegalStateException(problem)
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", apk)
                activity.runOnUiThread {
                    activity.startActivity(Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    if (activity.isFinishing) return@runOnUiThread
                    AlertDialog.Builder(activity)
                        .setTitle("The update didn't download")
                        .setMessage("${e.message}\n\nTry again later, or install it with the Downloader app from:\ngithub.com/notdxbi/dxbi-stremio/releases/latest/download/dxbi-tv.apk")
                        .setPositiveButton("OK", null)
                        .show()
                }
            } finally {
                downloading.set(false)
            }
        }
    }

    /**
     * Downloads the APK and makes sure Android will be able to install it: every byte there, and a
     * readable dx.bi package of the version expected. Returns null when it's good, else what's wrong.
     */
    private fun fetchApk(url: String, apk: File, size: Long, version: String, activity: MainActivity): String? {
        val partial = File(apk.parentFile, apk.name + ".part")
        try {
            http.newCall(Request.Builder().url(url).build()).execute().use { response ->
                if (!response.isSuccessful) return "the server answered ${response.code}"
                partial.outputStream().use { out -> response.body!!.byteStream().copyTo(out) }
            }
        } catch (e: Exception) {
            partial.delete()
            return "the download was interrupted (${e.message ?: e.javaClass.simpleName})"
        }
        if (size > 0 && partial.length() != size) {
            val got = partial.length()
            partial.delete()
            return "the download was incomplete ($got of $size bytes)"
        }
        @Suppress("DEPRECATION")
        val info = activity.packageManager.getPackageArchiveInfo(partial.path, 0)
        if (info == null || info.packageName != activity.packageName || info.versionName != version) {
            partial.delete()
            return "the downloaded file isn't a dx.bi $version app"
        }
        apk.delete()
        if (!partial.renameTo(apk)) return "the update couldn't be saved"
        return null
    }

    private fun get(url: String): String? =
        http.newCall(Request.Builder().url(url).header("User-Agent", "dxbi-tv").build()).execute().use { r ->
            if (r.isSuccessful) r.body?.string() else null
        }

    private fun version(source: String): String = Regex("""@version\s+([\d.]+)""").find(source)?.groupValues?.get(1) ?: "0"

    fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split(".").map { it.toIntOrNull() ?: 0 }
        val b = current.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }
}
