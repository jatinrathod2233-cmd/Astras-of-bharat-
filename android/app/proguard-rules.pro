# Preserve AndroidGameBridge methods invoked from WebView JavaScript under R8 minification
-keepclassmembers class com.bharata.astras.AndroidGameBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep class com.bharata.astras.BuildConfig { *; }
-keepattributes JavascriptInterface,Annotation,Signature,InnerClasses,EnclosingMethod
-dontwarn android.webkit.**
