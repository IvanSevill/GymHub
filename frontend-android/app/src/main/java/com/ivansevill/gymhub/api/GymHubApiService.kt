package com.ivansevill.gymhub.api

import com.ivansevill.gymhub.model.AuthResponse
import com.ivansevill.gymhub.model.GoogleConnectRequest
import com.ivansevill.gymhub.model.MobileAuthRequest
import com.ivansevill.gymhub.model.User
import com.ivansevill.gymhub.model.Workout
import retrofit2.Response
import retrofit2.http.*

interface GymHubApiService {

    @POST("auth/google/connect")
    suspend fun connectGoogle(@Body request: GoogleConnectRequest): Response<AuthResponse>

    // Mobile-specific endpoint: uses id_token instead of auth code
    @POST("auth/google/callback")
    suspend fun connectGoogleMobile(@Body request: MobileAuthRequest): Response<AuthResponse>

    @GET("users/me")
    suspend fun getMe(@Query("user_email") userEmail: String): Response<User>

    @GET("workouts/")
    suspend fun getWorkouts(@Query("user_email") userEmail: String): Response<List<Workout>>

    @POST("sync/manual")
    suspend fun syncWorkouts(@Query("user_email") userEmail: String): Response<Map<String, Any>>

    @POST("auth/fitbit/disconnect")
    suspend fun disconnectFitbit(@Query("user_email") userEmail: String): Response<Map<String, Any>>
    
    // Add more endpoints as needed...
}
