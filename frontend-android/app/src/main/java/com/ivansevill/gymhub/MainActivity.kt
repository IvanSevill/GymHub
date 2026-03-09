package com.ivansevill.gymhub

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import com.ivansevill.gymhub.ui.HomeWorkoutList
import com.ivansevill.gymhub.ui.PlaceholderScreen
import com.ivansevill.gymhub.ui.LoginScreen
import com.ivansevill.gymhub.ui.theme.GymHubTheme
import com.ivansevill.gymhub.utils.SessionManager
import com.ivansevill.gymhub.viewmodel.HomeViewModel
import com.ivansevill.gymhub.viewmodel.LoginState
import com.ivansevill.gymhub.viewmodel.LoginViewModel
import androidx.compose.ui.graphics.Color

class MainActivity : ComponentActivity() {
    private lateinit var sessionManager: SessionManager
    private lateinit var loginViewModel: LoginViewModel

    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val authCode = account?.serverAuthCode
            if (authCode != null) {
                loginViewModel.connectWithGoogle(authCode)
            } else {
                Toast.makeText(this, "No se pudo obtener el código de Google.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: ApiException) {
            Toast.makeText(this, "Fallo al iniciar sesión en Google: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)
        
        // Manual DI for simplicity, normally use Hilt
        val factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return when (modelClass) {
                    LoginViewModel::class.java -> LoginViewModel(sessionManager) as T
                    HomeViewModel::class.java -> HomeViewModel(sessionManager) as T
                    else -> throw IllegalArgumentException("Unknown ViewModel class")
                }
            }
        }
        loginViewModel = ViewModelProvider(this, factory)[LoginViewModel::class.java]
        val homeViewModel = ViewModelProvider(this, factory)[HomeViewModel::class.java]

        setContent {
            GymHubTheme {
                val loginState by loginViewModel.state
                var currentMainScreen by remember { 
                    mutableStateOf(if (sessionManager.isLoggedIn()) "dashboard" else "login") 
                }

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    when (currentMainScreen) {
                        "login" -> {
                            LoginScreen(
                                onSignInClick = { launchGoogleSignIn() },
                                isLoading = loginState is LoginState.Loading
                            )
                            
                            if (loginState is LoginState.Success) {
                                currentMainScreen = "dashboard"
                            }
                            
                            if (loginState is LoginState.Error) {
                                Toast.makeText(this, (loginState as LoginState.Error).message, Toast.LENGTH_LONG).show()
                            }
                        }
                        "dashboard" -> {
                            MainTabbedScreen(homeViewModel, sessionManager)
                        }
                    }
                }
            }
        }
    }

    private fun launchGoogleSignIn() {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestServerAuthCode("67135520736-c8slcjall71jmd9j79amvs1lol9h9aln.apps.googleusercontent.com")
            .requestEmail()
            .build()
        val client = GoogleSignIn.getClient(this, gso)
        googleSignInLauncher.launch(client.signInIntent)
    }
}

@Composable
fun MainTabbedScreen(homeViewModel: HomeViewModel, sessionManager: SessionManager) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF020617).copy(alpha = 0.95f),
                tonalElevation = 8.dp
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.DateRange, contentDescription = "Calendario") },
                    label = { Text("Calendario") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.TrendingUp, contentDescription = "Métricas") },
                    label = { Text("Análisis") }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> HomeWorkoutList(homeViewModel)
                1 -> PlaceholderScreen("Calendario (Próximamente)")
                2 -> PlaceholderScreen("Análisis (Próximamente)")
            }
        }
    }
}
