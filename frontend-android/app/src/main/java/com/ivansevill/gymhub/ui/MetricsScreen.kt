package com.ivansevill.gymhub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ivansevill.gymhub.model.Workout
import com.ivansevill.gymhub.viewmodel.HomeState
import com.ivansevill.gymhub.viewmodel.HomeViewModel
import kotlin.math.max

@Composable
fun MetricsScreen(viewModel: HomeViewModel) {
    val state by viewModel.state
    val navyBackground = Color(0xFF020617)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(navyBackground)
            .padding(horizontal = 16.dp)
    ) {
        Text(
            text = "Análisis de Rendimiento",
            fontSize = 24.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            modifier = Modifier.padding(vertical = 16.dp)
        )

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
                        Text("No hay datos para analizar", color = Color.Gray)
                    }
                } else {
                    MetricsContent(workouts)
                }
            }
            is HomeState.Error -> {
                Text("Error al cargar datos", color = Color.Red, modifier = Modifier.align(Alignment.CenterHorizontally))
            }
        }
    }
}

@Composable
fun MetricsContent(workouts: List<Workout>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            MetricCard(title = "Volumen de Carga (kg)") {
                VolumeChart(workouts)
            }
        }
        item {
            Spacer(modifier = Modifier.height(16.dp))
            MetricCard(title = "Frecuencia por Músculo") {
                FrequencyChart(workouts)
            }
        }
    }
}

@Composable
fun MetricCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B).copy(alpha = 0.4f)),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(
            colors = listOf(Color.White.copy(alpha = 0.1f), Color.White.copy(alpha = 0.05f))
        ))
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(title, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(20.dp))
            content()
        }
    }
}

@Composable
fun VolumeChart(workouts: List<Workout>) {
    // Simple custom chart using Canvas
    val data = workouts.take(10).reversed().map { w ->
        w.exerciseSets.sumOf { (it.value1 ?: 0.0) + (it.value2 ?: 0.0) + (it.value3 ?: 0.0) + (it.value4 ?: 0.0) }
    }
    
    val maxVal = if (data.isNotEmpty()) data.maxOrNull() ?: 1.0 else 1.0
    val accentCyan = Color(0xFF06B6D4)

    Canvas(modifier = Modifier
        .fillMaxWidth()
        .height(150.dp)
    ) {
        if (data.size < 2) return@Canvas
        
        val width = size.width
        val height = size.height
        val stepX = width / (data.size - 1)
        
        val path = Path()
        val fillPath = Path()
        
        data.forEachIndexed { index, value ->
            val x = index * stepX
            val y = height - (value.toFloat() / maxVal.toFloat() * height)
            
            if (index == 0) {
                path.moveTo(x, y)
                fillPath.moveTo(x, height)
                fillPath.lineTo(x, y)
            } else {
                path.lineTo(x, y)
                fillPath.lineTo(x, y)
            }
            
            if (index == data.size - 1) {
                fillPath.lineTo(x, height)
                fillPath.close()
            }
        }
        
        drawPath(
            path = fillPath,
            brush = Brush.verticalGradient(
                colors = listOf(accentCyan.copy(alpha = 0.3f), Color.Transparent)
            )
        )
        
        drawPath(
            path = path,
            color = accentCyan,
            style = Stroke(width = 3.dp.toPx())
        )
    }
}

@Composable
fun FrequencyChart(workouts: List<Workout>) {
    val muscles = mutableMapOf<String, Int>()
    workouts.forEach { w ->
        w.muscleGroups?.split(",")?.forEach { m ->
            val clean = m.trim()
            if (clean.isNotEmpty()) {
                muscles[clean] = (muscles[clean] ?: 0) + 1
            }
        }
    }
    
    val sortedMuscles = muscles.toList().sortedByDescending { it.second }.take(5)
    val maxFreq = sortedMuscles.firstOrNull()?.second ?: 1
    val accentPurple = Color(0xFF8B5CF6)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        sortedMuscles.forEach { (name, count) ->
            Column {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, color = Color.Gray, fontSize = 12.sp)
                    Text("$count sesiones", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(4.dp))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(fraction = count.toFloat() / maxFreq.toFloat())
                            .fillMaxHeight()
                            .background(accentPurple, RoundedCornerShape(4.dp))
                    )
                }
            }
        }
    }
}
