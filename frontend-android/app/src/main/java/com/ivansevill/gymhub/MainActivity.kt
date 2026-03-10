package com.ivansevill.gymhub

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import com.ivansevill.gymhub.ui.HomeWorkoutList
import com.ivansevill.gymhub.ui.CalendarScreen
import com.ivansevill.gymhub.ui.MetricsScreen
import com.ivansevill.gymhub.ui.SettingsScreen
import com.ivansevill.gymhub.ui.PlaceholderScreen
import com.ivansevill.gymhub.ui.theme.GymHubTheme
import com.ivansevill.gymhub.ui.LoginScreen
import com.ivansevill.gymhub.utils.SessionManager
import com.ivansevill.gymhub.viewmodel.HomeViewModel
import com.ivansevill.gymhub.viewmodel.LoginState
import com.ivansevill.gymhub.viewmodel.LoginViewModel
import androidx.compose.ui.graphics.Color

class MainActivity : ComponentActivity() {
    private lateinit var sessionManager: SessionManager
    private lateinit var loginViewModel: LoginViewModel
    // Mutable state to trigger recomposition from onNewIntent
    private val fitbitConnectedEvent = mutableStateOf(0)

    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account?.idToken
            if (idToken != null) {
                loginViewModel.connectWithGoogleIdToken(idToken)
            } else {
                Toast.makeText(this, "No se pudo obtener el token de Google.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: ApiException) {
            Toast.makeText(this, "Fallo al iniciar sesión en Google: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(this)
        
        // Handle deep link if app was opened fresh via gymhub://auth-callback
        handleFitbitDeepLink(intent)

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
                // Observe fitbitConnectedEvent to refresh SettingsScreen state if needed
                val fitbitEvent by fitbitConnectedEvent

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
                            MainTabbedScreen(
                                homeViewModel = homeViewModel,
                                sessionManager = sessionManager,
                                fitbitRefreshKey = fitbitEvent,
                                onLogout = { 
                                    loginViewModel.resetState()
                                    currentMainScreen = "login" 
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    // Called when app is already running and gets opened again via deep link
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleFitbitDeepLink(intent)
    }

    private fun handleFitbitDeepLink(intent: Intent) {
        val data = intent.data ?: return
        if (data.scheme == "gymhub" && data.host == "auth-callback") {
            val status = data.getQueryParameter("status")
            if (status == "success") {
                sessionManager.setFitbitConnected(true)
                // Bump counter to trigger recomposition in settings
                fitbitConnectedEvent.value++
                Toast.makeText(this, "✅ Fitbit conectado correctamente", Toast.LENGTH_LONG).show()
            } else {
                val reason = data.getQueryParameter("reason") ?: "Error desconocido"
                Toast.makeText(this, "❌ Error al conectar Fitbit: $reason", Toast.LENGTH_LONG).show()
            }
            // Clear the intent so it doesn't re-process on rotation
            this.intent = Intent()
        }
    }

    private fun launchGoogleSignIn() {
        // IMPORTANT: requestServerAuthCode must receive the WEB Client ID (not Android Client ID).
        // The Android Client ID (with SHA-1) is registered in Google Cloud Console, but the
        // server needs this Web Client ID to exchange the auth code for tokens.
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken("67135520736-c8slcjall71jmd9j79amvs1lol9h9aln.apps.googleusercontent.com") // Web Client ID
            .requestEmail()
            .requestProfile()
            .build()
        val client = GoogleSignIn.getClient(this, gso)
        // Sign out first to force account picker (avoids silent re-login)
        client.signOut().addOnCompleteListener {
            googleSignInLauncher.launch(client.signInIntent)
        }
    }
}


@Composable
fun MainTabbedScreen(
    homeViewModel: HomeViewModel,
    sessionManager: SessionManager,
    fitbitRefreshKey: Int = 0,
    onLogout: () -> Unit
) {
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
                    icon = { Icon(Icons.Default.Star, contentDescription = "Métricas") },
                    label = { Text("Análisis") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Ajustes") },
                    label = { Text("Ajustes") }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> HomeWorkoutList(homeViewModel, sessionManager)
                1 -> CalendarScreen(homeViewModel)
                2 -> MetricsScreen(homeViewModel)
                3 -> SettingsScreen(sessionManager, fitbitRefreshKey, onLogout)
            }
        }
    }
}
