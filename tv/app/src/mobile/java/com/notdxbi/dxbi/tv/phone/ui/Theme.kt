package com.notdxbi.dxbi.tv.phone.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.notdxbi.dxbi.tv.R

// dx.bi on a phone: black, white text, the dx.bi red for what matters
object Dx {
    val Accent = Color(0xFFE50914)
    val Background = Color(0xFF000000)
    val Surface = Color(0xFF141414)
    val Raised = Color(0xFF232323)
    val Line = Color(0xFF2F2F2F)
    val Text = Color(0xFFFFFFFF)
    val Muted = Color(0xFFB3B3B3)
    val Faint = Color(0xFF808080)
    val Imdb = Color(0xFFF5C518)
}

private val Type = Typography(
    headlineMedium = TextStyle(fontWeight = FontWeight.Black, fontSize = 26.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 17.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 18.sp),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 21.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 19.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 15.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 13.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 0.6.sp),
)

private val Bebas = FontFamily(Font(R.font.bebas_neue))

/** The DX.BI wordmark, as dx.bi's theme draws it everywhere else: Bebas Neue, slightly spaced, in the accent */
@Composable
fun Logo(size: TextUnit = 38.sp, modifier: Modifier = Modifier) {
    Text(
        "DX.BI",
        modifier = modifier,
        style = TextStyle(
            fontFamily = Bebas,
            fontSize = size,
            lineHeight = size,
            letterSpacing = 0.05.em,
            color = Dx.Accent,
            shadow = Shadow(Color.Black.copy(alpha = 0.45f), Offset(0f, 2f), 14f),
        ),
    )
}

/** Room the screens keep free at the bottom for the floating tab bar */
val LocalBarSpace = compositionLocalOf { 0.dp }

@Composable
fun DxTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Dx.Accent,
            onPrimary = Color.White,
            background = Dx.Background,
            onBackground = Dx.Text,
            surface = Dx.Surface,
            onSurface = Dx.Text,
            surfaceVariant = Dx.Raised,
            onSurfaceVariant = Dx.Muted,
            surfaceContainer = Dx.Surface,
            surfaceContainerHigh = Dx.Raised,
            surfaceContainerLow = Dx.Surface,
            outline = Dx.Line,
            secondaryContainer = Dx.Raised,
            onSecondaryContainer = Dx.Text,
        ),
        typography = Type,
        content = content,
    )
}
