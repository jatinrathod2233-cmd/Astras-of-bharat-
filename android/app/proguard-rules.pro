# Preserve AndroidGameBridge methods invoked from WebView JavaScript
-keepclassmembers class com.bharata.astras.AndroidGameBridge {
    @android.webkit.JavascriptInterface <methods>;
}

-keepattributes JavascriptInterface
-keepattributes *Annotation*
-dontwarn android.webkit.**
