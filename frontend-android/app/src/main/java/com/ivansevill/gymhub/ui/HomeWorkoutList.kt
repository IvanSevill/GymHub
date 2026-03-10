package com.ivansevill.gymhub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
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
import kotlinx.coroutines.launch

@Composable
fun HomeWorkoutList(viewModel: HomeViewModel, sessionManager: SessionManager) {
    val state by viewModel.state
    val scope = rememberCoroutineScope()
    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Color.Transparent,
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = Color(0xFF06B6D4),
                contentColor = Color.Black,
                shape = CircleShape
            ) {
                Icon(Icons.Default.Add, contentDescription = "Añadir Entrenamiento")
            }
        }
    ) { padding ->
        // ... (existing Column code) ...
        if (showAddDialog) {
            AddWorkoutDialog(
                onDismiss = { showAddDialog = false },
                onConfirm = { title ->
                    // For now, let's just refresh or show a toast
                    // In a real app, call a viewModel method
                    showAddDialog = false
                    viewModel.loadWorkouts()
                }
            )
        }
        
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            // ... (rest of the code)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "GymHub",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )
                    Text(
                        text = "Hola, ${sessionManager.getName() ?: "Atleta"}",
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                }
                
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { viewModel.loadWorkouts() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refrescar", tint = Color.Gray)
                    }
                    
                    Spacer(modifier = Modifier.width(8.dp))
                    
                    // Profile Image
                    Surface(
                        modifier = Modifier.size(40.dp),
                        shape = CircleShape,
                        color = Color(0xFF1E293B)
                    ) {
                        val pictureUrl = sessionManager.getPictureUrl()
                        if (pictureUrl != null) {
                            // Normally use Coil or Glide here. For now, a placeholder with initials
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = (sessionManager.getName()?.take(1) ?: "U").uppercase(),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            // In a real app: AsyncImage(model = pictureUrl, contentDescription = null)
                        } else {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = null,
                                tint = Color.Gray,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }
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
}
@Composable
fun AddWorkoutDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var title by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Añadir Entrenamiento", color = Color.White) },
        text = {
            Column {
                Text("Introduce el nombre del entrenamiento (ej: Pecho, Pierna...)", color = Color.Gray, fontSize = 12.sp)
                Spacer(modifier = Modifier.height(8.dp))
                TextField(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = { Text("Ej: Pecho y Tríceps") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF1E293B),
                        unfocusedContainerColor = Color(0xFF1E293B),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(title) },
                enabled = title.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF06B6D4))
            ) {
                Text("Crear", color = Color.Black)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar", color = Color.Gray)
            }
        },
        containerColor = Color(0xFF0F172A)
    )
}
