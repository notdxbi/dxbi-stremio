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

data class SeasonRemap(
    val packId: String,
    val matchPattern: String,
    val season: Int,
    val episodes: Map<String, Int>,
    val filePatterns: Map<String, String> = emptyMap(),
) {
    companion object {
        fun from(o: org.json.JSONObject): SeasonRemap? {
            val packId = o.optString("packId").takeIf { it.isNotBlank() } ?: return null
            val season = o.optInt("season").takeIf { it in 1..99 } ?: return null
            val selections = o.optJSONArray("files").objects().mapNotNull { file ->
                val id = file.optString("id").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                val episode = file.optInt("episode").takeIf { it > 0 } ?: return@mapNotNull null
                Triple(id, episode, file.optString("pattern"))
            }
            return SeasonRemap(
                packId,
                o.optString("matchPattern"),
                season,
                selections.associate { it.first to it.second },
                selections.mapNotNull { (fileId, _, pattern) -> pattern.takeIf { it.isNotBlank() }?.let { fileId to it } }.toMap(),
            )
        }
    }
}

data class AddonFileGroup(val season: Int?, val files: List<AddonFile>) {
    val label: String
        get() = when (season) {
            0 -> "Specials"
            null -> "Files"
            else -> "Season $season"
        }
}

object AddonFiles {
    private val naturalParts = Regex("\\d+|\\D+")

    fun applyRemaps(files: List<AddonFile>, remaps: List<SeasonRemap>): List<AddonFile> =
        files.map { file ->
            val remap = remaps.lastOrNull { rule ->
                rule.episodes.containsKey(file.id) || rule.filePatterns.values.any { it.equals(file.title, ignoreCase = true) }
            } ?: return@map file
            val episode = remap.episodes[file.id]
                ?: remap.filePatterns.entries.firstOrNull { it.value.equals(file.title, ignoreCase = true) }?.let { remap.episodes[it.key] }
                ?: file.episode
            if (episode == null || episode <= 0) file else file.copy(season = remap.season, episode = episode)
        }

    fun groups(files: List<AddonFile>): List<AddonFileGroup> =
        files.groupBy(AddonFile::season)
            .map { (season, entries) ->
                AddonFileGroup(season, entries.sortedWith(
                    compareBy<AddonFile> { it.episode ?: Int.MAX_VALUE }
                        .thenComparator { a, b -> naturalCompare(a.title, b.title) },
                ))
            }
            .sortedWith(compareBy<AddonFileGroup> { it.season == null }.thenBy { it.season ?: Int.MAX_VALUE })

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

data class PhoneFilePlaylist(
    val metaId: String,
    val files: List<AddonFile>,
    val currentFileId: String,
    val type: String = "other",
) {
    val hasNext: Boolean get() = nextEpisode() != null
    val nextFile: AddonFile? get() = nextEpisode()

    fun nextEpisode(): AddonFile? {
        val episodes = AddonFiles.groups(files)
            .filter { it.season != null && it.season > 0 }
            .flatMap { it.files }
        val index = episodes.indexOfFirst { it.id == currentFileId }
        if (index < 0) return null
        return episodes.getOrNull(index + 1)
    }
}
