package com.ivansevill.gymhub.viewmodel

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ivansevill.gymhub.api.RetrofitClient
import com.ivansevill.gymhub.model.GoogleConnectRequest
import com.ivansevill.gymhub.model.User
import com.ivansevill.gymhub.utils.SessionManager
import kotlinx.coroutines.launch

sealed class LoginState {
    object Idle : LoginState()
    object Loading : LoginState()
    data class Success(val user: User) : LoginState()
    data class Error(val message: String) : LoginState()
}

class LoginViewModel(private val sessionManager: SessionManager) : ViewModel() {

    private val _state = mutableStateOf<LoginState>(LoginState.Idle)
    val state: State<LoginState> = _state

    fun connectWithGoogle(serverAuthCode: String) {
        viewModelScope.launch {
            _state.value = LoginState.Loading
            try {
                val response = RetrofitClient.apiService.connectGoogle(GoogleConnectRequest(serverAuthCode))
                if (response.isSuccessful && response.body() != null) {
                    val user = response.body()!!.user
                    sessionManager.saveUser(user.email, user.name)
                    _state.value = LoginState.Success(user)
                } else {
                    _state.value = LoginState.Error("Error al conectar con el servidor: ${response.code()}")
                }
            } catch (e: Exception) {
                _state.value = LoginState.Error("Fallo de red: ${e.message}")
            }
        }
    }
}
