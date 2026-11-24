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
 * Handles hardware haptic feedback, screen-awake locking, mode synchronization,
 * offline Wi-Fi hotspot LAN multiplayer sockets, and exit requests.
 */
class AndroidGameBridge(
    private val activity: Activity,
    private val lanManager: LanMultiplayerManager,
    private val onModeSync: (String) -> Unit
) {

    @JavascriptInterface
    fun isNativeAndroid(): Boolean = true

    @JavascriptInterface
    fun lanIsSupported(): Boolean = true

    @JavascriptInterface
    fun lanGetNetworkInfo(): String = lanManager.getNetworkInfoJson()

    @JavascriptInterface
    fun lanStartHost(roomName: String, hostName: String, roomCode: String, heroId: String) {
        lanManager.startHost(roomName, hostName, roomCode, heroId)
    }

    @JavascriptInterface
    fun lanStartDiscovery() {
        lanManager.startDiscovery()
    }

    @JavascriptInterface
    fun lanStopDiscovery() {
        lanManager.stopDiscovery()
    }

    @JavascriptInterface
    fun lanJoinHost(hostIp: String, port: Int, roomCode: String, playerName: String, heroId: String) {
        lanManager.joinHost(hostIp, port, roomCode, playerName, heroId)
    }

    @JavascriptInterface
    fun lanSend(wireJson: String) {
        lanManager.sendWireMessage(wireJson)
    }

    @JavascriptInterface
    fun lanStopAll() {
        lanManager.stopAll()
    }

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
            lanManager.stopAll()
            activity.finish()
        }
    }
}

