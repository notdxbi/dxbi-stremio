package com.notdxbi.dxbi.tv.phone

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

data class AddonFile(
    val id: String,
    val title: String,
    val season: Int?,
    val episode: Int?,
) {
    companion object {
        private val seasonFolder = Regex("""(?i)^(?:season|series|s)[ ._-]*(\d{1,2})(?:\b.*)?$""")
        private val seasonEpisode = Regex("""(?i)(?:^|[^a-z0-9])s(\d{1,2})[ ._-]*e(\d{1,3})(?:[^0-9]|$)""")
        private val crossSeasonEpisode = Regex("""(?i)(?:^|[^0-9])(\d{1,2})x(\d{1,3})(?:[^0-9]|$)""")
        private val namedEpisode = Regex("""(?i)(?:^|[\s._-]|\[|\()(?:episode|ep|e)[\s._-]*(\d{1,3})(?=$|[\s._-]|\]|\))""")
        private val standaloneEpisode = Regex("""(?i)(?:^|[\s._-]|\[|\()\s*(\d{1,3})(?=$|[\s._-]|\]|\))""")
        private val extraMarker = Regex("""(?i)(?:[\s._\-\[(]|^)(?:NCED|NCOP|OVA|OAD|SP|PV|MENU|PREVIEW|EXTRAS|SPECIALS?)(?:[\s._\-\]\)\d]|$)""")
        private val isolatedOpeningEnding = Regex("""(?i)(?:^|[\s._\-\[(])(?:OP|ED)\s*\d*(?:[\s._\-\]\)]|$)""")
        private val extraFolder = Regex("""(?i)^(?:specials?|ovas?|oads?|extras?)$""")
        fun from(video: Video): AddonFile {
            val paths = listOf(video.title, decodePath(video.id.substringAfterLast(':')))
            var folderSeason: Int? = null
            var inSeasonFolder = false
            var inExtraFolder = false
            var detectedSeason: Int? = null
            var detectedEpisode: Int? = null
            var isExtra = false

            for (path in paths) {
                val parts = path.split('/', '\\')
                val leaf = parts.lastOrNull().orEmpty()
                val folders = parts.dropLast(1)
                for (folder in folders) {
                    if (extraFolder.matches(folder.trim())) inExtraFolder = true
                    seasonFolder.find(folder.trim())?.groupValues?.get(1)?.toIntOrNull()?.let {
                        folderSeason = it
                        inSeasonFolder = true
                    }
                }

                val se = seasonEpisode.find(leaf)
                val cross = crossSeasonEpisode.find(leaf)
                val hasSxxExx = se != null || cross != null

                if (!hasSxxExx && (extraMarker.containsMatchIn(leaf) || isolatedOpeningEnding.containsMatchIn(leaf) || inExtraFolder)) {
                    isExtra = true
                    continue
                }

                val episode = when {
                    se != null -> {
                        detectedSeason = se.groupValues[1].toIntOrNull()
                        se.groupValues[2].toIntOrNull()
                    }
                    cross != null -> {
                        detectedSeason = cross.groupValues[1].toIntOrNull()
                        cross.groupValues[2].toIntOrNull()
                    }
                    else -> namedEpisode.find(leaf)?.groupValues?.get(1)?.toIntOrNull()
                        ?: standaloneEpisode.find(leaf)?.groupValues?.get(1)?.toIntOrNull()
                }
                if (episode != null) {
                    detectedEpisode = episode
                    break
                }
            }

            val season = when {
                isExtra -> 0
                detectedSeason != null -> detectedSeason
                inSeasonFolder -> folderSeason
                else -> video.season
            }
            val detected = detectedEpisode ?: video.episode?.takeIf { it > 0 }
            val episode = if (isExtra) null else detected
            return AddonFile(video.id, video.title, season, episode)
        }

        private fun decodePath(value: String): String = try {
            URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8)
        } catch (_: IllegalArgumentException) {
            value
        }
    }
}

/**
 * A library addon's season pack (StremThru Store and the like: type "other") as seasons and episodes,
 * read from its files' names and folders, so its page lists them the way a series' page does.
 * Extras (openings, endings, OVAs…) go in Specials (season 0); files with no season go in season 1.
 */
object AddonFiles {
    private val naturalParts = Regex("\\d+|\\D+")

    fun asEpisodes(videos: List<Video>): List<Video> =
        videos.map { v -> AddonFile.from(v).let { f -> v.copy(season = f.season ?: 1, episode = f.episode) } }
            .sortedWith(
                compareBy<Video>({ it.season == 0 }, { it.season }, { it.episode ?: Int.MAX_VALUE })
                    .thenComparator { a, b -> naturalCompare(a.title, b.title) },
            )

    private fun naturalCompare(first: String, second: String): Int {
        val a = naturalParts.findAll(first.lowercase()).map { it.value }.toList()
        val b = naturalParts.findAll(second.lowercase()).map { it.value }.toList()
        for (i in 0 until minOf(a.size, b.size)) {
            val left = a[i]
            val right = b[i]
            val comparison = if (left.first().isDigit() && right.first().isDigit()) {
                left.toBigInteger().compareTo(right.toBigInteger())
            } else {
                left.compareTo(right)
            }
            if (comparison != 0) return comparison
        }
        return a.size.compareTo(b.size)
    }
}
