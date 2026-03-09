package com.ivansevill.gymhub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ivansevill.gymhub.model.Workout
import com.ivansevill.gymhub.ui.components.WorkoutCard
import com.ivansevill.gymhub.viewmodel.HomeState
import com.ivansevill.gymhub.viewmodel.HomeViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.*

@Composable
fun CalendarScreen(viewModel: HomeViewModel) {
    val state by viewModel.state
    val now = LocalDate.now()
    var selectedDate by remember { mutableStateOf(now) }
    val navyBackground = Color(0xFF020617)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(navyBackground)
            .padding(horizontal = 16.dp)
    ) {
        Text(
            text = "Calendario",
            fontSize = 24.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            modifier = Modifier.padding(vertical = 16.dp)
        )

        // Week selector
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            val startOfWeek = now.minusDays(now.dayOfWeek.value.toLong() - 1)
            (0..6).forEach { dayOffset ->
                val date = startOfWeek.plusDays(dayOffset.toLong())
                val isSelected = date == selectedDate
                val dayName = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale("es", "ES")).substring(0, 1)

                Column(
                    modifier = Modifier
                        .clickable { selectedDate = date }
                        .padding(4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(dayName, color = if (isSelected) Color(0xFF06B6D4) else Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Black)
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(
                                color = if (isSelected) Color(0xFF06B6D4) else Color.Transparent,
                                shape = CircleShape
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = date.dayOfMonth.toString(),
                            color = if (isSelected) Color.Black else Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        Text(
            text = selectedDate.format(DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", Locale("es", "ES"))).replaceFirstChar { it.uppercase() },
            fontSize = 14.sp,
            color = Color.Gray,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        when (state) {
            is HomeState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color(0xFF06B6D4))
                }
            }
            is HomeState.Success -> {
                val allWorkouts = (state as HomeState.Success).workouts
                val dateString = selectedDate.toString() // YYYY-MM-DD
                val filtered = allWorkouts.filter { it.date.startsWith(dateString) }

                if (filtered.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No hay entrenamientos este día", color = Color.Gray)
                    }
                } else {
                    LazyColumn {
                        items(filtered) { workout ->
                            WorkoutCard(workout)
                        }
                    }
                }
            }
            else -> {}
        }
    }
}
