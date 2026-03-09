package com.ivansevill.gymhub.viewmodel

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ivansevill.gymhub.api.RetrofitClient
import com.ivansevill.gymhub.model.Workout
import com.ivansevill.gymhub.utils.SessionManager
import kotlinx.coroutines.launch

sealed class HomeState {
    object Loading : HomeState()
    data class Success(val workouts: List<Workout>) : HomeState()
    data class Error(val message: String) : HomeState()
}

class HomeViewModel(private val sessionManager: SessionManager) : ViewModel() {

    private val _state = mutableStateOf<HomeState>(HomeState.Loading)
    val state: State<HomeState> = _state

    init {
        loadWorkouts()
    }

    fun loadWorkouts() {
        val email = sessionManager.getEmail() ?: return
        viewModelScope.launch {
            _state.value = HomeState.Loading
            try {
                val response = RetrofitClient.apiService.getWorkouts(email)
                if (response.isSuccessful && response.body() != null) {
                    _state.value = HomeState.Success(response.body()!!)
                } else {
                    _state.value = HomeState.Error("Error: ${response.code()}")
                }
            } catch (e: Exception) {
                _state.value = HomeState.Error("Fallo de red: ${e.message}")
            }
        }
    }
}
