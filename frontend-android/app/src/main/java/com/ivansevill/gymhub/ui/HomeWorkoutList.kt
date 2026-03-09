package com.ivansevill.gymhub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.ivansevill.gymhub.ui.components.WorkoutCard
import com.ivansevill.gymhub.viewmodel.HomeState
import com.ivansevill.gymhub.viewmodel.HomeViewModel

import com.ivansevill.gymhub.utils.SessionManager

@Composable
fun HomeWorkoutList(viewModel: HomeViewModel, sessionManager: SessionManager) {
    val state by viewModel.state
    val scope = rememberCoroutineScope()
    var isSyncing by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "GymHub",
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
                color = Color.White
            )
            
            IconButton(onClick = { viewModel.loadWorkouts() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refrescar", color = Color.Gray)
            }
        }

        // Fitbit connection panel at the top
        FitbitPanel(sessionManager = sessionManager)
        
        Spacer(modifier = Modifier.size(8.dp))

        when (state) {
            is HomeState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color(0xFF06B6D4))
                }
            }
            is HomeState.Success -> {
                val workouts = (state as HomeState.Success).workouts
                if (workouts.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No hay entrenamientos todavía", color = Color.Gray)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 80.dp) // Space for bottom bar
                    ) {
                        items(workouts) { workout ->
                            WorkoutCard(workout)
                        }
                    }
                }
            }
            is HomeState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Error al cargar datos", color = Color.Red)
                        Text((state as HomeState.Error).message, color = Color.Gray, fontSize = 12.sp)
                        Button(onClick = { viewModel.loadWorkouts() }, modifier = Modifier.padding(top = 16.dp)) {
                            Text("Reintentar")
                        }
                    }
                }
            }
        }
    }
}
