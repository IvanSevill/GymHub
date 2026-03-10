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
    val accentCyan = Color(0xFF06B6D4)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(navyBackground)
            .padding(horizontal = 16.dp)
    ) {
        Text(
            text = "Calendario",
            fontSize = 28.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            modifier = Modifier.padding(top = 24.dp, bottom = 8.dp)
        )
        
        Text(
            text = "Planifica y revisa tus sesiones",
            fontSize = 14.sp,
            color = Color.Gray,
            modifier = Modifier.padding(bottom = 24.dp)
        )

        // Premium Week selector with Navigation
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = { selectedDate = selectedDate.minusWeeks(1) }) {
                Text("<", color = accentCyan, fontWeight = FontWeight.Black)
            }
            
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(24.dp))
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    val startOfWeek = selectedDate.minusDays(selectedDate.dayOfWeek.value.toLong() - 1)
                    (0..6).forEach { dayOffset ->
                        val date = startOfWeek.plusDays(dayOffset.toLong())
                        val isSelected = date == selectedDate
                        val isToday = date == now
                        val dayName = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale("es", "ES")).substring(0, 1).uppercase()

                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { selectedDate = date }
                                .padding(vertical = 4.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = dayName, 
                                color = if (isSelected) accentCyan else Color.Gray.copy(alpha = 0.6f), 
                                fontSize = 10.sp, 
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(
                                        color = if (isSelected) accentCyan else if (isToday) Color.White.copy(alpha = 0.1f) else Color.Transparent,
                                        shape = RoundedCornerShape(12.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = date.dayOfMonth.toString(),
                                    color = if (isSelected) Color.Black else Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = if (isSelected) FontWeight.Black else FontWeight.Medium
                                )
                            }
                            if (isToday && !isSelected) {
                                Box(modifier = Modifier.padding(top = 4.dp).size(4.dp).background(accentCyan, CircleShape))
                            }
                        }
                    }
                }
            }
            
            IconButton(onClick = { selectedDate = selectedDate.plusWeeks(1) }) {
                Text(">", color = accentCyan, fontWeight = FontWeight.Black)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = selectedDate.format(DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", Locale("es", "ES"))).replaceFirstChar { it.uppercase() },
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            
            Surface(
                color = Color.White.copy(alpha = 0.05f),
                shape = CircleShape
            ) {
                Text(
                    text = if (selectedDate == now) "HOY" else if (selectedDate == now.plusDays(1)) "MAÑANA" else "",
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = accentCyan
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (state) {
            is HomeState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = accentCyan)
                }
            }
            is HomeState.Success -> {
                val allWorkouts = (state as HomeState.Success).workouts
                val dateString = selectedDate.toString() // YYYY-MM-DD
                val filtered = allWorkouts.filter { it.date.startsWith(dateString) }

                if (filtered.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("✨", fontSize = 48.sp)
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("Día de descanso", color = Color.White, fontWeight = FontWeight.Bold)
                            Text("No hay entrenamientos planificados", color = Color.Gray, fontSize = 12.sp)
                        }
                    }
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(bottom = 100.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(filtered) { workout ->
                            WorkoutCard(workout)
                        }
                    }
                }
            }
            else -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Error al cargar datos", color = Color.Red)
                }
            }
        }
    }
}
