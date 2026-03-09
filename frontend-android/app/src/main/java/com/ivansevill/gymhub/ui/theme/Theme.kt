package com.ivansevill.gymhub.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Cyan40 = Color(0xFF06B6D4)
val Purple40 = Color(0xFF8B5CF6)
val Navy900 = Color(0xFF020617)

private val DarkColorScheme = darkColorScheme(
    primary = Cyan40,
    secondary = Purple40,
    background = Navy900,
    surface = Navy900
)

@Composable
fun GymHubTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
