package com.gymhub.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request

// Premium Color Suite
val DeepSpace = Color(0xFF020617)
val NebulaBlue = Color(0xFF1E293B)
val CyanGlow = Color(0xFF06B6D4)
val VioletPulse = Color(0xFF8B5CF6)
val GlassWhite = Color(0x33FFFFFF)

// Domain Models
data class ExerciseModel(
    val exercise_name: String,
    val weight_kg: Float,
    val reps: Int,
    val is_pr: Int
)

data class WorkoutModel(
    val id: Int,
    val title: String,
    val date: String,
    val exercise_sets: List<ExerciseModel>
)

class MainActivity : ComponentActivity() {
    private val client = OkHttpClient()
    private val userEmail = "test@gymhub.app" // Demo User

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GymHubEliteTheme {
                var currentScreen by remember { mutableStateOf("login") }
                
                AnimatedContent(
                    targetState = currentScreen,
                    transitionSpec = {
                        fadeIn(animationSpec = tween(500)) togetherWith fadeOut(animationSpec = tween(500))
                    }
                ) { screen ->
                    when (screen) {
                        "login" -> LoginScreenElite { currentScreen = "dashboard" }
                        "dashboard" -> DashboardElite()
                    }
                }
            }
        }
    }

    @Composable
    fun LoginScreenElite(onSuccess: () -> Unit) {
        val infiniteTransition = rememberInfiniteTransition()
        val glowAlpha by infiniteTransition.animateFloat(
            initialValue = 0.4f, targetValue = 0.8f,
            animationSpec = infiniteRepeatable(tween(2000), RepeatMode.Reverse)
        )

        Box(
            modifier = Modifier.fillMaxSize().background(DeepSpace),
            contentAlignment = Alignment.Center
        ) {
            // Background Orbs for depth
            Box(modifier = Modifier.size(300.dp).offset(x = (-100).dp, y = (-150).dp).background(VioletPulse.copy(alpha = 0.15f), CircleShape))
            Box(modifier = Modifier.size(200.dp).offset(x = 120.dp, y = 180.dp).background(CyanGlow.copy(alpha = 0.15f), CircleShape))

            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                Icon(Icons.Default.FitnessCenter, contentDescription = null, tint = CyanGlow, modifier = Modifier.size(80.dp).alpha(glowAlpha))
                Spacer(modifier = Modifier.height(24.dp))
                Text("GymHub", style = MaterialTheme.typography.displayMedium, color = Color.White, fontWeight = FontWeight.Black)
                Text("Eleva tu rendimiento", color = Color.Gray, letterSpacing = 2.sp)
                
                Spacer(modifier = Modifier.height(100.dp))

                Button(
                    onClick = { onSuccess() },
                    modifier = Modifier.fillMaxWidth().height(64.dp).shadow(20.dp, RoundedCornerShape(20.dp)),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Icon(Icons.Default.Login, contentDescription = null, tint = DeepSpace)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Entrar como Ivan", color = DeepSpace, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                Text("OAuth Google (Demo Mode)", color = Color.DarkGray, fontSize = 12.sp)
            }
        }
    }

    @Composable
    fun DashboardElite() {
        var workouts by remember { mutableStateOf<List<WorkoutModel>>(emptyList()) }
        var isLoading by remember { mutableStateOf(true) }

        LaunchedEffect(Unit) {
            fetchWorkoutsFromBackend { data ->
                workouts = data
                isLoading = false
            }
        }

        Scaffold(
            bottomBar = { BottomNavBar() },
            containerColor = DeepSpace
        ) { padding ->
            Column(modifier = Modifier.fillMaxSize().padding(padding).padding(20.dp)) {
                Text("Tu Progreso", color = Color.White, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(24.dp))

                // Real Data Cards
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    StatCardElite("Sesiones", "${workouts.size}", Icons.Default.DateRange, Modifier.weight(1f))
                    StatCardElite("Récords", "${workouts.flatMap { it.exercise_sets }.count { it.is_pr == 1 }}", Icons.Default.EmojiEvents, Modifier.weight(1f))
                }

                Spacer(modifier = Modifier.height(32.dp))
                Text("Entrenamientos Recientes", color = Color.Gray, style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(16.dp))

                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = CyanGlow)
                    }
                } else if (workouts.isEmpty()) {
                    EmptyStateElite()
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        items(workouts) { workout ->
                            WorkoutCardElite(workout)
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun WorkoutCardElite(workout: WorkoutModel) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = NebulaBlue.copy(alpha = 0.7f)),
            shape = RoundedCornerShape(24.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, GlassWhite)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(48.dp).background(VioletPulse.copy(alpha = 0.2f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Bolt, contentDescription = null, tint = VioletPulse)
                    }
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text(workout.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(workout.date.take(10), color = Color.Gray, fontSize = 12.sp)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                workout.exercise_sets.forEach { ex ->
                    ExerciseRowElite(ex)
                }
            }
        }
    }

    @Composable
    fun ExerciseRowElite(ex: ExerciseModel) {
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("•", color = CyanGlow, modifier = Modifier.padding(end = 8.dp))
            Text(ex.exercise_name, color = Color.White, modifier = Modifier.weight(1f), fontSize = 14.sp)
            Text("${ex.weight_kg}kg", color = Color.White, fontWeight = FontWeight.Black)
            if (ex.is_pr == 1) {
                Spacer(modifier = Modifier.width(8.dp))
                Icon(Icons.Default.EmojiEvents, contentDescription = null, tint = CyanGlow, modifier = Modifier.size(16.dp))
            }
        }
    }

    @Composable
    fun StatCardElite(label: String, value: String, icon: ImageVector, modifier: Modifier) {
        Card(
            modifier = modifier,
            colors = CardDefaults.cardColors(containerColor = NebulaBlue),
            shape = RoundedCornerShape(20.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Icon(icon, contentDescription = null, tint = CyanGlow, modifier = Modifier.size(24.dp))
                Spacer(modifier = Modifier.height(12.dp))
                Text(label, color = Color.Gray, fontSize = 12.sp)
                Text(value, color = Color.White, fontWeight = FontWeight.Black, fontSize = 24.sp)
            }
        }
    }

    @Composable
    fun EmptyStateElite() {
        Column(modifier = Modifier.fillMaxSize().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.History, contentDescription = null, tint = Color.DarkGray, modifier = Modifier.size(100.dp))
            Spacer(modifier = Modifier.height(16.dp))
            Text("Aún no hay datos", color = Color.DarkGray, fontWeight = FontWeight.Bold)
            Text("Tu primer entrenamiento aparecerá aquí", color = Color.DarkGray, textAlign = TextAlign.Center)
        }
    }

    @Composable
    fun BottomNavBar() {
        NavigationBar(containerColor = DeepSpace, contentColor = Color.White, tonalElevation = 0.dp) {
            NavigationBarItem(selected = true, onClick = {}, icon = { Icon(Icons.Default.Home, null) }, label = { Text("Inicio") })
            FloatingActionButton(onClick = { /* New Workout logic */ }, containerColor = CyanGlow, shape = CircleShape) {
                Icon(Icons.Default.Add, null, tint = DeepSpace)
            }
            NavigationBarItem(selected = false, onClick = {}, icon = { Icon(Icons.Default.Person, null) }, label = { Text("Perfil") })
        }
    }

    private fun fetchWorkoutsFromBackend(onResult: (List<WorkoutModel>) -> Unit) {
        lifecycleScope.launch {
            try {
                val request = Request.Builder()
                    .url("http://10.0.2.2:8000/workouts?user_email=$userEmail")
                    .build()

                client.newCall(request).enqueue(object : okhttp3.Callback {
                    override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                        onResult(emptyList())
                    }

                    override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                        try {
                            val body = response.body?.string() ?: "[]"
                            val type = object : TypeToken<List<WorkoutModel>>() {}.type
                            val data = Gson().fromJson<List<WorkoutModel>>(body, type)
                            runOnUiThread { onResult(data) }
                        } catch (e: Exception) {
                            runOnUiThread { onResult(emptyList()) }
                        }
                    }
                })
            } catch (e: Exception) {
                onResult(emptyList())
            }
        }
    }
}

@Composable
fun GymHubEliteTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(primary = VioletPulse, secondary = CyanGlow, background = DeepSpace),
        content = content
    )
}
