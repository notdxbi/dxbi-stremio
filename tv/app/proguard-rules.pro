# The page calls these through the JavaScript bridge
-keepclassmembers class com.notdxbi.dxbi.tv.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}

# The torrent engine: libtorrent's Java side is called from its native code
-keep class org.libtorrent4j.** { *; }
-dontwarn org.libtorrent4j.**
-keep class fi.iki.elonen.** { *; }
