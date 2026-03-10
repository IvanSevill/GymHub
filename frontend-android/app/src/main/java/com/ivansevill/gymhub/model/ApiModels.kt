package com.ivansevill.gymhub.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class User(
    val email: String,
    val name: String?,
    @Json(name = "picture_url") val pictureUrl: String?,
    @Json(name = "selected_calendar_id") val selectedCalendarId: String?,
    @Json(name = "fitbit_access_token") val fitbitAccessToken: String?,
    @Json(name = "is_root") val isRoot: Boolean
)

@JsonClass(generateAdapter = true)
data class Muscle(
    val id: Int,
    val name: String
)

@JsonClass(generateAdapter = true)
data class ExerciseSet(
    @Json(name = "exercise_name") val exerciseName: String,
    @Json(name = "muscle_group") val muscleGroup: String?,
    val value1: Double?,
    val value2: Double?,
    val value3: Double?,
    val value4: Double?,
    val unit: String?,
    val reps: Int?,
    @Json(name = "weight_display") val weightDisplay: String?
)

@JsonClass(generateAdapter = true)
data class FitbitData(
    val calories: Int?,
    @Json(name = "heart_rate_avg") val heartRateAvg: Int?,
    @Json(name = "duration_ms") val durationMs: Long?,
    val steps: Int?,
    @Json(name = "distance_km") val distanceKm: Double?,
    @Json(name = "elevation_gain_m") val elevationGainM: Double?,
    @Json(name = "activity_name") val activityName: String?
)

@JsonClass(generateAdapter = true)
data class Workout(
    val id: Int,
    val title: String,
    val date: String, // ISO string
    @Json(name = "start_time") val startTime: String?,
    @Json(name = "end_time") val endTime: String?,
    val source: String,
    val muscles: List<Muscle>? = null,
    @Json(name = "exercise_sets") val exerciseSets: List<ExerciseSet>,
    @Json(name = "fitbit_data") val fitbitData: FitbitData?
)

@JsonClass(generateAdapter = true)
data class GoogleConnectRequest(val code: String)

@JsonClass(generateAdapter = true)
data class MobileAuthRequest(
    @Json(name = "id_token") val idToken: String,
    @Json(name = "access_token") val accessToken: String? = null
)

@JsonClass(generateAdapter = true)
data class AuthResponse(
    val user: User,
    val status: String?
)
