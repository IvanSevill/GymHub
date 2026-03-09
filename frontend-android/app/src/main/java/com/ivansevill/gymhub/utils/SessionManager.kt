package com.ivansevill.gymhub.utils

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("gymhub_prefs", Context.MODE_PRIVATE)

    companion object {
        const val USER_EMAIL = "gymhub_user_email"
        const val USER_NAME = "gymhub_user_name"
    }

    fun saveUser(email: String, name: String?) {
        val editor = prefs.edit()
        editor.putString(USER_EMAIL, email)
        editor.putString(USER_NAME, name)
        editor.apply()
    }

    fun getEmail(): String? {
        return prefs.getString(USER_EMAIL, null)
    }

    fun getName(): String? {
        return prefs.getString(USER_NAME, null)
    }

    fun clearSession() {
        val editor = prefs.edit()
        editor.remove(USER_EMAIL)
        editor.remove(USER_NAME)
        editor.apply()
    }

    fun isLoggedIn(): Boolean {
        return getEmail() != null
    }
}
