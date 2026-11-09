package com.notdxbi.dxbi.tv.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class AddonFilesTest {
    private fun video(title: String, season: Int? = null, episode: Int? = null) = Video(
        id = "pack:${title}",
        title = title,
        season = season,
        episode = episode,
        thumbnail = null,
        released = null,
        overview = null,
        watched = false,
        progress = null,
        upcoming = false,
    )

    @Test
    fun canonEpisodesStayInTheirSeasonAndExtrasBecomeSpecials() {
        val canon = AddonFile.from(video("Season 1/[Judas] JoJo no Kimyou na Bouken S01E01.mkv"))
        assertEquals(1, canon.season)
        assertEquals(1, canon.episode)

        listOf("NCED", "NCOP", "OVA", "OAD", "SP", "PV", "MENU", "PREVIEW", "EXTRAS", "SPECIALS")
            .forEach { marker ->
                val extra = AddonFile.from(video("Season 1/[Judas] JoJo - S01 $marker 01.mkv", season = 1, episode = 0))
                assertEquals("$marker is a special", 0, extra.season)
                assertEquals("$marker is not episode zero", null, extra.episode)
            }
    }

    @Test
    fun isolatedOpeningEndingMarkersDoNotMatchOrdinaryWords() {
        val opening = AddonFile.from(video("Season 1/[Judas] JoJo - OP 01.mkv"))
        val ending = AddonFile.from(video("Season 1/[Judas] JoJo - ED 01.mkv"))
        val parenthesizedExtra = AddonFile.from(video("Season 1/JoJo (NCOP 01).mkv"))
        assertEquals(0, opening.season)
        assertEquals(0, ending.season)
        assertEquals(0, parenthesizedExtra.season)
        assertEquals(null, parenthesizedExtra.episode)

        val ordinaryTitle = AddonFile.from(video("Season 1/One Piece - S01E02 - Crusaders Limited Edition.mkv"))
        assertEquals(1, ordinaryTitle.season)
        assertEquals(2, ordinaryTitle.episode)
    }

    @Test
    fun unnumberedFilesInsideSeasonFoldersStayNonSpecial() {
        val unnumbered = AddonFile.from(video("Season 1/[Judas] JoJo sample clip.mkv", season = 1))
        assertEquals(1, unnumbered.season)
        assertEquals(null, unnumbered.episode)

        val numbered = AddonFile.from(video("Season 1/02 - The Joestar Family.mkv"))
        assertEquals(1, numbered.season)
        assertEquals(2, numbered.episode)

        val crossNumbered = AddonFile.from(video("Season 1/1x03 - The Evil Spirit.mkv"))
        assertEquals(1, crossNumbered.season)
        assertEquals(3, crossNumbered.episode)
    }

    @Test
    fun arcNamesKeepStandaloneEpisodeNumbersAvailableForRemapping() {
        val arcEpisode = AddonFile.from(video("Diamond is Unbreakable - 01.mkv"))
        assertEquals(null, arcEpisode.season)
        assertEquals(1, arcEpisode.episode)

        val ordinaryWords = AddonFile.from(video("Season 1/One Piece - 24 - Crusaders Limited Edition.mkv"))
        assertEquals(1, ordinaryWords.season)
        assertEquals(24, ordinaryWords.episode)
    }

    @Test
    fun savedSeasonRemapsAssignSelectedFilesAndPreserveDetectedEpisodeNumbers() {
        val files = listOf(
            AddonFile("pack:arc-01", "Diamond is Unbreakable - 01.mkv", null, 1),
            AddonFile("pack:arc-02", "Diamond is Unbreakable - 02.mkv", null, 2),
        )
        val remap = SeasonRemap("cached-pack", "Diamond is Unbreakable", 4, mapOf("pack:arc-01" to 1, "pack:arc-02" to 2))
        val mapped = AddonFiles.applyRemaps(files, listOf(remap))
        assertEquals(listOf(4 to 1, 4 to 2), mapped.map { it.season to it.episode })

        val refreshedId = files.first().copy(id = "new-pack:arc-01")
        val patternRemap = remap.copy(
            episodes = mapOf("old-pack:arc-01" to 1),
            filePatterns = mapOf("old-pack:arc-01" to refreshedId.title),
        )
        assertEquals(4, AddonFiles.applyRemaps(listOf(refreshedId), listOf(patternRemap)).single().season)
    }

    @Test
    fun canonicalEpisodeMarkerWinsOverAdjacentOpeningEndingToken() {
        val episode = AddonFile.from(video("Season 1/Show S01E01 OP.mkv"))
        assertEquals(1, episode.season)
        assertEquals(1, episode.episode)
    }

    @Test
    fun libraryPlaylistNextSkipsSpecialsAndStaysInsideItsPack() {
        val files = listOf(
            AddonFile.from(video("Specials/NCOP.mkv")),
            AddonFile.from(video("Season 1/S01E01.mkv")),
            AddonFile.from(video("Season 1/S01E02.mkv")),
            AddonFile.from(video("Season 2/S02E01.mkv")),
        )
        val playlist = PhoneFilePlaylist("cached-pack", files, "pack:Season 1/S01E02.mkv")
        assertEquals("pack:Season 2/S02E01.mkv", playlist.nextEpisode()?.id)
        assertEquals(null, playlist.copy(currentFileId = "pack:Season 2/S02E01.mkv").nextEpisode())
        assertEquals("pack:Season 2/S02E01.mkv", playlist.copy(type = "series").nextEpisode()?.id)
    }
}
