package com.ivansevill.gymhub.utils

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("gymhub_prefs", Context.MODE_PRIVATE)

    companion object {
        const val USER_EMAIL = "gymhub_user_email"
        const val USER_NAME = "gymhub_user_name"
        const val USER_PICTURE = "gymhub_user_picture"
        const val IS_ROOT = "gymhub_is_root"
        const val FITBIT_CONNECTED = "gymhub_fitbit_connected"
    }

    fun saveUser(email: String, name: String?, pictureUrl: String?, isRoot: Boolean, fitbitConnected: Boolean = false) {
        val editor = prefs.edit()
        editor.putString(USER_EMAIL, email)
        editor.putString(USER_NAME, name)
        editor.putString(USER_PICTURE, pictureUrl)
        editor.putBoolean(IS_ROOT, isRoot)
        editor.putBoolean(FITBIT_CONNECTED, fitbitConnected)
        editor.apply()
    }

    fun getEmail(): String? {
        return prefs.getString(USER_EMAIL, null)
    }

    fun getName(): String? {
        return prefs.getString(USER_NAME, null)
    }

    fun getPictureUrl(): String? {
        return prefs.getString(USER_PICTURE, null)
    }

    fun isRoot(): Boolean {
        return prefs.getBoolean(IS_ROOT, false)
    }

    fun isFitbitConnected(): Boolean {
        return prefs.getBoolean(FITBIT_CONNECTED, false)
    }

    fun setFitbitConnected(connected: Boolean) {
        prefs.edit().putBoolean(FITBIT_CONNECTED, connected).apply()
    }

    fun clearSession() {
        val editor = prefs.edit()
        editor.remove(USER_EMAIL)
        editor.remove(USER_NAME)
        editor.remove(USER_PICTURE)
        editor.remove(IS_ROOT)
        editor.remove(FITBIT_CONNECTED)
        editor.apply()
    }

    fun isLoggedIn(): Boolean {
        return getEmail() != null
    }
}
