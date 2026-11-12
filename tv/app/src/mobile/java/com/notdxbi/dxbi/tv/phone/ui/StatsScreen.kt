package com.notdxbi.dxbi.tv.phone.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.objects
import com.notdxbi.dxbi.tv.phone.text
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/** Your stats: how long you've watched, what and when (dx.bi's Watch stats, counted on this phone) */
@Composable
fun StatsScreen(stremio: Stremio, onBack: () -> Unit) {
    var stats by remember { mutableStateOf<JSONObject?>(null) }
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        stats = stremio.stats()
        loaded = true
    }
    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Your stats", onBack)
        val s = stats
        when {
            s != null -> StatsList(s)
            loaded -> Text("Watch stats are off. Turn them on in dx.bi settings to count how long you watch.", color = Dx.Muted, modifier = Modifier.padding(Gutter))
            else -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
        }
    }
}

@Composable
private fun StatsList(s: JSONObject) {
    val year = s.optString("year")
    LazyColumn(contentPadding = PaddingValues(Gutter, 4.dp, Gutter, 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            val since = DateFormat.getDateInstance(DateFormat.LONG).format(Date(s.optLong("since")))
            Text("${hours(s.optDouble("total"))} in total · since $since", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
        }
        item {
            val tiles = s.optJSONArray("tiles").objects().map { it.optString("label") to hours(it.optDouble("sec")) }
            val streak = s.optJSONObject("streak")
            val all = tiles + ("Streak" to "${streak?.optInt("current") ?: 0} days · best ${streak?.optInt("best") ?: 0}")
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                all.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        pair.forEach { (label, value) -> Tile(label, value, Modifier.weight(1f)) }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        item { Heading("Last 30 days") }
        item {
            val days = s.optJSONArray("days").objects().map { it.optDouble("sec") }
            val peak = (days.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
            Row(Modifier.fillMaxWidth().height(120.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
                days.forEach { sec ->
                    Box(
                        Modifier.weight(1f).fillMaxHeight((sec / peak).toFloat().coerceAtLeast(0.03f)).clip(RoundedCornerShape(3.dp))
                            .background(if (sec > 0) Dx.Accent else Dx.Raised),
                    )
                }
            }
        }
        item { Heading("Most watched in $year") }
        val top = s.optJSONArray("top").objects()
        if (top.isEmpty()) item { Text("Nothing yet this year. Start watching and it shows up here.", color = Dx.Muted) }
        top.forEachIndexed { i, t ->
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}", color = Dx.Text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.width(30.dp))
                    Art(t.text("poster"), t.optString("name"), Modifier.width(44.dp).height(66.dp), RoundedCornerShape(6.dp))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(t.optString("name"), color = Dx.Text, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("${if (t.optString("type") == "series") "Series" else "Film"} · ${hours(t.optDouble("sec"))}", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        item { Heading("Top genres in $year") }
        val genres = s.optJSONArray("genres").objects()
        val genreTotal = genres.sumOf { it.optDouble("sec") }.coerceAtLeast(1.0)
        if (genres.isEmpty()) item { Text("Genres appear once you've watched a few titles.", color = Dx.Muted) }
        genres.forEach { g ->
            item {
                val share = (g.optDouble("sec") / genreTotal).toFloat()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(g.optString("name"), color = Dx.Text, modifier = Modifier.width(110.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(Dx.Raised)) {
                        Box(Modifier.fillMaxWidth(share).fillMaxHeight().background(Dx.Accent))
                    }
                    Text("${Math.round(share * 100)}%", color = Dx.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(44.dp).padding(start = 8.dp))
                }
            }
        }
        item { Heading("Habits") }
        item {
            val hour = if (s.isNull("hour")) null else s.optInt("hour")
            Fact("Favourite time", hour?.let { "%02d:00–%02d:00".format(it, (it + 1) % 24) } ?: "–")
            Fact("Busiest day", s.text("day") ?: "–")
            Fact("In your Library", "${s.optInt("movies")} films · ${s.optInt("series")} series")
        }
        item {
            Text("Stats stay on this phone (saved with dx.bi's data). Only time spent actually playing counts.", color = Dx.Faint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
private fun Tile(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(Dx.Surface).padding(14.dp)) {
        Text(label, color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
        Text(value, color = Dx.Text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun Heading(text: String) =
    Text(text, color = Dx.Text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 14.dp))

@Composable
private fun Fact(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Text(label, color = Dx.Muted, modifier = Modifier.weight(1f))
        Text(value, color = Dx.Text, fontWeight = FontWeight.SemiBold)
    }
}

private fun hours(sec: Double): String {
    val s = Math.round(sec).toInt()
    if (s < 60) return if (s > 0) "<1m" else "0m"
    val h = s / 3600
    val m = s % 3600 / 60
    return if (h > 0) "${h}h %02dm".format(m) else "${m}m"
}
