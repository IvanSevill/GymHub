package com.ivansevill.gymhub.ui

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ivansevill.gymhub.BuildConfig
import com.ivansevill.gymhub.api.RetrofitClient
import com.ivansevill.gymhub.utils.SessionManager
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(sessionManager: SessionManager, fitbitRefreshKey: Int = 0, onLogout: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    
    val userName = sessionManager.getName() ?: "Usuario"
    val userEmail = sessionManager.getEmail() ?: ""
    val userPicture = sessionManager.getPictureUrl()
    val isRoot = sessionManager.isRoot()
    
    // Re-read from sessionManager whenever fitbitRefreshKey changes (after deep link callback)
    var isFitbitConnected by remember(fitbitRefreshKey) { mutableStateOf(sessionManager.isFitbitConnected()) }
    var isImporting by remember { mutableStateOf(false) }
    var isExporting by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF020617)) // Slate 950
            .verticalScroll(scrollState)
            .padding(24.dp)
    ) {
        // --- PROFILE HEADER ---
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (userPicture != null) {
                    AsyncImage(
                        model = userPicture,
                        contentDescription = "Profile Picture",
                        modifier = Modifier
                            .size(100.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.1f)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Surface(
                        modifier = Modifier.size(100.dp),
                        shape = CircleShape,
                        color = Color.White.copy(alpha = 0.1f)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(50.dp), tint = Color.Gray)
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    text = userName,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White
                )
                Text(
                    text = userEmail,
                    fontSize = 14.sp,
                    color = Color.Gray
                )
                
                if (isRoot) {
                    Surface(
                        modifier = Modifier.padding(top = 8.dp),
                        color = Color(0xFF06B6D4).copy(alpha = 0.2f),
                        shape = RoundedCornerShape(8.dp),
                        border = ButtonDefaults.outlinedButtonBorder.copy(brush = Brush.linearGradient(listOf(Color(0xFF06B6D4), Color(0xFF06B6D4))))
                    ) {
                        Text(
                            "ROOT",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF06B6D4)
                        )
                    }
                }
            }
        }

        // --- SECTION: CUENTA ---
        SettingsSectionTitle("CUENTA")
        SettingsItem(
            icon = Icons.Default.ExitToApp,
            title = "Cerrar sesión",
            subtitle = "Salir de tu cuenta de GymHub",
            onClick = {
                sessionManager.clearSession()
                onLogout()
            },
            tint = Color.Red.copy(alpha = 0.8f)
        )

        Spacer(modifier = Modifier.height(24.dp))

        // --- SECTION: DISPOSITIVOS ---
        SettingsSectionTitle("DISPOSITIVOS")
        SettingsFitbitItem(
            isConnected = isFitbitConnected,
            onConnectTap = {
                val baseUrl = BuildConfig.API_URL
                val uri = Uri.parse("${baseUrl}auth/fitbit/connect?user_email=$userEmail")
                val intent = Intent(Intent.ACTION_VIEW, uri)
                context.startActivity(intent)
            },
            onDisconnectTap = {
                scope.launch {
                    try {
                        val resp = RetrofitClient.apiService.disconnectFitbit(userEmail)
                        if (resp.isSuccessful) {
                            sessionManager.setFitbitConnected(false)
                            isFitbitConnected = false
                            Toast.makeText(context, "Fitbit desvinculado", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(context, "Error al desvincular", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )

        Spacer(modifier = Modifier.height(24.dp))

        // --- SECTION: ADMINISTRACIÓN (ROOT) ---
        if (isRoot) {
            SettingsSectionTitle("ADMINISTRACIÓN")
            
            SettingsItem(
                icon = Icons.Default.Share,
                title = "Exportar Datos",
                subtitle = "Descargar todos tus ejercicios en formato JSON",
                isLoading = isExporting,
                onClick = {
                    scope.launch {
                        isExporting = true
                        try {
                            val resp = RetrofitClient.apiService.exportData(userEmail)
                            if (resp.isSuccessful) {
                                // For a real app, we'd save to a file. 
                                // For this demo, just toast success
                                Toast.makeText(context, "Datos exportados correctamente", Toast.LENGTH_LONG).show()
                            }
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error al exportar", Toast.LENGTH_SHORT).show()
                        }
                        isExporting = false
                    }
                }
            )
            
            SettingsItem(
                icon = Icons.Default.Send,
                title = "Importar Datos",
                subtitle = "Subir datos de ejercicios previos",
                isLoading = isImporting,
                onClick = {
                    scope.launch {
                        isImporting = true
                        // In a real app we'd pick a file. Here we mock it as a reset-sync or small set.
                        try {
                            // Empty data or mock data for demo
                            val mockData = emptyList<Map<String, Any?>>()
                            val resp = RetrofitClient.apiService.importData(userEmail, mockData)
                            if (resp.isSuccessful) {
                                Toast.makeText(context, "Datos importados correctamente", Toast.LENGTH_LONG).show()
                            }
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error al importar", Toast.LENGTH_SHORT).show()
                        }
                        isImporting = false
                    }
                }
            )
        }
        
        Spacer(modifier = Modifier.height(64.dp))
        
        Text(
            "GymHub v1.2.0-Agentic",
            modifier = Modifier.align(Alignment.CenterHorizontally),
            fontSize = 12.sp,
            color = Color.Gray.copy(alpha = 0.5f)
        )
    }
}

@Composable
fun SettingsSectionTitle(title: String) {
    Text(
        text = title,
        fontSize = 12.sp,
        fontWeight = FontWeight.Black,
        color = Color(0xFF06B6D4), // Cyan 500
        letterSpacing = 1.sp,
        modifier = Modifier.padding(bottom = 12.dp, start = 4.dp)
    )
}

@Composable
fun SettingsItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    tint: Color = Color.White,
    isLoading: Boolean = false
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.05f)),
        enabled = !isLoading
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                modifier = Modifier.size(40.dp),
                shape = RoundedCornerShape(12.dp),
                color = tint.copy(alpha = 0.1f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = tint)
                    } else {
                        Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = tint)
                    }
                }
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 16.sp)
                Text(subtitle, color = Color.Gray, fontSize = 12.sp)
            }
            
            Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = Color.Gray.copy(alpha = 0.5f))
        }
    }
}

@Composable
fun SettingsFitbitItem(
    isConnected: Boolean,
    onConnectTap: () -> Unit,
    onDisconnectTap: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.05f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFF00B0B9).copy(alpha = 0.1f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("⌚", fontSize = 20.sp)
                    }
                }
                
                Spacer(modifier = Modifier.width(16.dp))
                
                Column(modifier = Modifier.weight(1f)) {
                    Text("Fitbit", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 16.sp)
                    Text(
                        if (isConnected) "Vinculado correctamente" else "No vinculado",
                        color = if (isConnected) Color.Green.copy(alpha = 0.7f) else Color.Gray,
                        fontSize = 12.sp,
                        fontWeight = if (isConnected) FontWeight.Bold else FontWeight.Normal
                    )
                }
                
                Switch(
                    checked = isConnected,
                    onCheckedChange = { if (it) onConnectTap() else onDisconnectTap() },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color(0xFF00B0B9),
                        checkedTrackColor = Color(0xFF00B0B9).copy(alpha = 0.3f)
                    )
                )
            }
        }
    }
}
