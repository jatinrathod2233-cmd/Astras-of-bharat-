package com.bharata.astras

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import kotlin.math.abs

class MainActivity : AppCompatActivity() {

    private lateinit var gameWebView: WebView
    private lateinit var gameBridge: AndroidGameBridge

    @Volatile
    private var currentGameMode: String = "TITLE"
    private var lastBackPressMs: Long = 0L

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(APP_ASSET_DOMAIN)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureImmersiveFullscreen()
        setContentView(R.layout.activity_main)

        gameWebView = findViewById(R.id.gameWebView)
        setupGameWebView()
        registerBackHandler()

        if (savedInstanceState == null || gameWebView.restoreState(savedInstanceState) == null) {
            gameWebView.loadUrl(ENTRY_URL)
        }
    }

    private fun configureImmersiveFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.TRANSPARENT
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.TRANSPARENT
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }

        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupGameWebView() {
        gameWebView.setBackgroundColor(Color.parseColor("#0D1016"))
        gameWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        gameWebView.overScrollMode = View.OVER_SCROLL_NEVER
        gameWebView.isHorizontalScrollBarEnabled = false
        gameWebView.isVerticalScrollBarEnabled = false
        gameWebView.isHapticFeedbackEnabled = true

        with(gameWebView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        gameBridge = AndroidGameBridge(this) { mode ->
            currentGameMode = mode
        }
        gameWebView.addJavascriptInterface(gameBridge, "AndroidBridge")

        gameWebView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val url = request.url
                if (url.host == APP_ASSET_DOMAIN) {
                    return resolveAssetWithStrictMime(url)
                }
                return super.shouldInterceptRequest(view, request)
            }

            @Suppress("DEPRECATION")
            @Deprecated("Required for API 24 compatibility fallback")
            override fun shouldInterceptRequest(
                view: WebView,
                url: String
            ): WebResourceResponse? {
                val parsed = Uri.parse(url)
                if (parsed.host == APP_ASSET_DOMAIN) {
                    return resolveAssetWithStrictMime(parsed)
                }
                return super.shouldInterceptRequest(view, url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                // Keep all gameplay navigation locked inside local bundled assets
                return request.url.host != APP_ASSET_DOMAIN
            }

            override fun onRenderProcessGone(
                view: WebView,
                detail: RenderProcessGoneDetail
            ): Boolean {
                // Automatically recover if Android OS reclaims WebGL renderer process
                val parent = view.parent as? ViewGroup
                parent?.removeView(view)
                view.destroy()
                recreate()
                return true
            }
        }

        gameWebView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                return BuildConfig.DEBUG
            }
        }
    }

    private fun resolveAssetWithStrictMime(url: Uri): WebResourceResponse? {
        val response = assetLoader.shouldInterceptRequest(url) ?: return null
        val path = url.path?.lowercase() ?: return response
        when {
            path.endsWith(".js") || path.endsWith(".mjs") -> response.mimeType = "application/javascript"
            path.endsWith(".css") -> response.mimeType = "text/css"
            path.endsWith(".html") || path.endsWith(".htm") -> response.mimeType = "text/html"
            path.endsWith(".json") -> response.mimeType = "application/json"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> response.mimeType = "image/jpeg"
            path.endsWith(".png") -> response.mimeType = "image/png"
            path.endsWith(".webp") -> response.mimeType = "image/webp"
            path.endsWith(".svg") -> response.mimeType = "image/svg+xml"
            path.endsWith(".woff2") -> response.mimeType = "font/woff2"
        }
        return response
    }

    private fun registerBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (currentGameMode == "PLAYING" || currentGameMode == "PAUSED") {
                    dispatchVirtualKey("Escape", isDown = true)
                    return
                }
                val now = SystemClock.elapsedRealtime()
                if (now - lastBackPressMs <= 1800L) {
                    finish()
                } else {
                    lastBackPressMs = now
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.press_back_again_exit),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        })
    }

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        val isJoystick = (event.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
        if (isJoystick && event.action == MotionEvent.ACTION_MOVE) {
            val lx = deadzone(event.getAxisValue(MotionEvent.AXIS_X))
            val ly = deadzone(-event.getAxisValue(MotionEvent.AXIS_Y))
            val rx = deadzone(event.getAxisValue(MotionEvent.AXIS_Z))
            val ry = deadzone(event.getAxisValue(MotionEvent.AXIS_RZ))
            val js = """
                (function() {
                  var e = window.__ramayanaEngine;
                  if (e && e.input) {
                    e.input.moveX = $lx;
                    e.input.moveY = $ly;
                    e.input.cameraDeltaX += ${rx * 14f};
                    e.input.cameraDeltaY += ${ry * 10f};
                  }
                })();
            """.trimIndent()
            gameWebView.evaluateJavascript(js, null)
            return true
        }
        return super.onGenericMotionEvent(event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isGamepad =
            (event.source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (event.source and InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD
        if (isGamepad) {
            val code = mapGamepadKeyCode(event.keyCode)
            if (code != null) {
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                    dispatchVirtualKey(code, isDown = true)
                } else if (event.action == KeyEvent.ACTION_UP) {
                    dispatchVirtualKey(code, isDown = false)
                }
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun mapGamepadKeyCode(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_BUTTON_A -> "Space"
        KeyEvent.KEYCODE_BUTTON_X -> "KeyF"
        KeyEvent.KEYCODE_BUTTON_Y -> "KeyQ"
        KeyEvent.KEYCODE_BUTTON_B -> "KeyE"
        KeyEvent.KEYCODE_BUTTON_L1 -> "KeyC"
        KeyEvent.KEYCODE_BUTTON_R1 -> "ShiftLeft"
        KeyEvent.KEYCODE_BUTTON_SELECT -> "KeyV"
        KeyEvent.KEYCODE_BUTTON_START -> "Escape"
        KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
        KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
        KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
        else -> null
    }

    private fun dispatchVirtualKey(code: String, isDown: Boolean) {
        val type = if (isDown) "keydown" else "keyup"
        val script =
            "window.dispatchEvent(new KeyboardEvent('$type', { code: '$code', key: '$code', bubbles: true }));"
        gameWebView.evaluateJavascript(script, null)
    }

    private fun deadzone(value: Float, threshold: Float = 0.14f): Float {
        return if (abs(value) < threshold) 0f else value
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            configureImmersiveFullscreen()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        gameWebView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        configureImmersiveFullscreen()
        gameWebView.onResume()
        gameWebView.resumeTimers()
    }

    override fun onPause() {
        gameWebView.onPause()
        gameWebView.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
        if (::gameWebView.isInitialized) {
            gameWebView.removeJavascriptInterface("AndroidBridge")
            gameWebView.stopLoading()
            gameWebView.clearHistory()
            (gameWebView.parent as? ViewGroup)?.removeView(gameWebView)
            gameWebView.removeAllViews()
            gameWebView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val APP_ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val ENTRY_URL = "https://$APP_ASSET_DOMAIN/index.html"
    }
}
