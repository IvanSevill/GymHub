package com.ivansevill.gymhub.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ivansevill.gymhub.model.Workout
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.*

@Composable
fun WorkoutCard(workout: Workout) {
    val cardBackground = Color(0xFF1E293B).copy(alpha = 0.4f)
    val accentCyan = Color(0xFF06B6D4)
    val accentPurple = Color(0xFF8B5CF6)

    // Simpler date parsing for older Android or just string split for quick demo
    val dateDisplay = try {
        val zdt = ZonedDateTime.parse(workout.date)
        zdt.format(DateTimeFormatter.ofPattern("dd MMM", Locale("es", "ES")))
    } catch (e: Exception) {
        workout.date.split("T").firstOrNull() ?: ""
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = cardBackground),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(
            colors = listOf(Color.White.copy(alpha = 0.1f), Color.White.copy(alpha = 0.05f))
        ))
    ) {
        Column(
            modifier = Modifier.padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = Color.White.copy(alpha = 0.05f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = dateDisplay.uppercase(),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.Gray
                    )
                }

                if (workout.source == "fitbit") {
                   Text(text = "⌚", fontSize = 16.sp)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = workout.title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            if (!workout.muscles.isNullOrEmpty()) {
                Text(
                    text = workout.muscles.joinToString(" - ") { it.name },
                    fontSize = 12.sp,
                    color = accentCyan,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }


            Spacer(modifier = Modifier.height(20.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Quick info bits
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${workout.exerciseSets.size} ejercicios",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }

                Button(
                    onClick = { /* TODO: Navigation to Details */ },
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                    modifier = Modifier.height(36.dp)
                ) {
                    Text("Ver más", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
