package com.bharata.astras

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.webkit.JavascriptInterface

/**
 * Native Android bridge exposed to the Three.js / React game engine at window.AndroidBridge.
 * Handles hardware haptic feedback, screen-awake locking, mode synchronization, and exit requests.
 */
class AndroidGameBridge(
    private val activity: Activity,
    private val onModeSync: (String) -> Unit
) {

    @JavascriptInterface
    fun isNativeAndroid(): Boolean = true

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun setGameMode(mode: String) {
        onModeSync(mode)
    }

    @JavascriptInterface
    fun vibrate(durationMs: Long, amplitude: Int) {
        val safeDuration = durationMs.coerceIn(5L, 250L)
        val safeAmplitude = amplitude.coerceIn(1, 255)
        try {
            val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val manager = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                manager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            if (vibrator == null || !vibrator.hasVibrator()) return

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(
                    VibrationEffect.createOneShot(safeDuration, safeAmplitude)
                )
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(safeDuration)
            }
        } catch (_: SecurityException) {
            // Safely ignore if vibrator hardware or permission is restricted on device
        }
    }

    @JavascriptInterface
    fun keepScreenAwake(enabled: Boolean) {
        activity.runOnUiThread {
            if (enabled) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    @JavascriptInterface
    fun exitApp() {
        activity.runOnUiThread {
            activity.finish()
        }
    }
}
