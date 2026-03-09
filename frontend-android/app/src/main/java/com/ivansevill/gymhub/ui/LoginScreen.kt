package com.ivansevill.gymhub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LoginScreen(onSignInClick: () -> Unit) {
    val navyBackground = Color(0xFF020617)
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(navyBackground),
        contentAlignment = Alignment.Center
    ) {
        // Subtle gradients like the web version
        Box(
            modifier = Modifier
                .size(300.dp)
                .align(Alignment.TopStart)
                .offset(x = (-50).dp, y = (-50).dp)
                .background(Color(0x1A8B5CF6), RoundedCornerShape(150.dp))
        )
        
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Surface(
                modifier = Modifier.size(80.dp),
                shape = RoundedCornerShape(20.dp),
                color = Color.Transparent
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            brush = Brush.linearGradient(
                                colors = listOf(Color(0xFF06B6D4), Color(0xFF2563EB))
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text("🏋️", fontSize = 40.sp)
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Text(
                "GymHub Mobile",
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                color = Color.White
            )
            
            Text(
                "Tu rendimiento en la palma de tu mano",
                fontSize = 14.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier.padding(top = 8.dp)
            )
            
            Spacer(modifier = Modifier.height(48.dp))
            
            Button(
                onClick = onSignInClick,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillWidth()
                    .height(56.dp)
            ) {
                Text(
                    "Acceder con Google",
                    color = Color.Black,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
            }
        }
    }
}
