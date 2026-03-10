package com.ivansevill.gymhub.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ivansevill.gymhub.api.RetrofitClient
import com.ivansevill.gymhub.utils.SessionManager
import com.ivansevill.gymhub.BuildConfig
import kotlinx.coroutines.launch

@Composable
fun FitbitPanel(sessionManager: SessionManager) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isSyncing by remember { mutableStateOf(false) }
    var userEmail = sessionManager.getEmail() ?: ""
    
    // We would ideally fetch the user status from the API again to check if Fitbit is connected
    // For this demo, let's assume we have it or provide a button to check
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B).copy(alpha = 0.4f)),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.linearGradient(
            colors = listOf(Color.White.copy(alpha = 0.1f), Color.White.copy(alpha = 0.05f))
        ))
    ) {
        Column(modifier = Modifier.padding(24.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Conexión con Fitbit",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        "Sincroniza tus calorías y ritmo cardíaco",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
                Text("⌚", fontSize = 24.sp)
            }

            Spacer(modifier = Modifier.height(24.dp))

            var isConnected by remember { mutableStateOf(sessionManager.isFitbitConnected()) }

            if (isConnected) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(Color.Green.copy(alpha = 0.1f), RoundedCornerShape(12.dp)).padding(10.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("✅ Fitbit Conectado", color = Color.Green, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (!isConnected) {
                    Button(
                        onClick = {
                            val baseUrl = BuildConfig.API_URL
                            val uri = Uri.parse("${baseUrl}auth/fitbit/connect?user_email=$userEmail")
                            val intent = Intent(Intent.ACTION_VIEW, uri)
                            context.startActivity(intent)
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00B0B9)), // Fitbit Teal
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Conectar", fontWeight = FontWeight.Bold)
                    }
                } else {
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                isSyncing = true
                                try {
                                    RetrofitClient.apiService.syncWorkouts(userEmail)
                                } catch (e: Exception) { }
                                isSyncing = false
                            }
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !isSyncing
                    ) {
                        if (isSyncing) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Sincronizar", fontSize = 12.sp)
                        }
                    }

                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                try {
                                    val resp = RetrofitClient.apiService.disconnectFitbit(userEmail)
                                    if (resp.isSuccessful) {
                                        // Update local state - unfortunately SessionManager doesn't have a setFitbitConnected
                                        // But we can clear and let user know
                                        isConnected = false
                                        // In a real app we'd update SharedPreferences here too
                                    }
                                } catch (e: Exception) { }
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red.copy(alpha = 0.7f)),
                        border = ButtonDefaults.outlinedButtonBorder.copy(brush = Brush.linearGradient(listOf(Color.Red.copy(alpha = 0.3f), Color.Red.copy(alpha = 0.3f)))),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Desvincular", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

// Helper to provide a nicer coroutine scope
@Composable
fun rememberCoroutineOf() = rememberCoroutineScope()
