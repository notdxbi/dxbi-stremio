package com.notdxbi.dxbi.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONObject
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * dx.bi TV: Stremio's web app with dx.bi built in, steered with the remote. Streams play in
 * [PlayerActivity]; this screen stays alive underneath so Stremio keeps the watch progress.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var injectedAtStart = false
    private var lastBack = 0L
    private var playbackListener: PlaybackBus.Listener? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        if (!webViewIsRecentEnough()) return

        // Debug builds can be inspected from a computer (chrome://inspect)
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(getColor(R.color.background))
        web.isFocusable = true
        web.isFocusableInTouchMode = true

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            // A desktop browser's identity (Stremio's web app is made for one), plus dx.bi TV's mark
            userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromeVersion()} Safari/537.36 dxbi-tv/${BuildConfigVersion.name(this@MainActivity)}"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.addJavascriptInterface(Bridge(this), "DxbiTV")
        val startScript = assets.open("dxbi-tv.js").bufferedReader().use { it.readText() }.replace(Bridge.PLACEHOLDER, Bridge.TOKEN)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, startScript, setOf(STREMIO_ORIGIN))
            injectedAtStart = true
        }

        web.webChromeClient = object : WebChromeClient() {
            // A video that hasn't drawn its first frame shows WebView's grey play button: show nothing
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                // Older WebViews can't run a script before the page: run it as early as possible instead
                if (!injectedAtStart && url != null && url.startsWith(STREMIO_ORIGIN)) view.evaluateJavascript(startScript, null)
            }

            // The page's engine crashed, or Android took its memory back (TVs with 1.5–2 GB): without
            // this, Android closes dx.bi straight back to the home screen
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                recoverFromCrash(detail.didCrash())
                return true
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "web.stremio.com") return false
                if (url.scheme == "stremio") {
                    openStremioLink(url)
                    return true
                }
                // Everything else leaves the app (sign-in pages, links in descriptions…) if something can open it
                openExternal(url.toString())
                return true
            }
        }

        playbackListener = object : PlaybackBus.Listener {
            override fun onProgress(positionMs: Long, durationMs: Long, paused: Boolean) {
                js("window.__dxbiTv && window.__dxbiTv.onProgress($positionMs, $durationMs, $paused)")
            }

            // The page takes the details from PlaybackBus (a restarted page picks them up as it loads)
            override fun onClosed() {
                js("window.__dxbiTv && window.__dxbiTv.playerClosed && window.__dxbiTv.playerClosed()")
            }
        }

        PlaybackBus.listener = playbackListener

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })

        val link = intent?.data
        if (link?.scheme == "stremio") openStremioLink(link) else web.loadUrl(STREMIO_URL)
        web.requestFocus()

        Updates.checkPlugin(this)
        Updates.checkApp(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // The "update your web engine" message is showing instead of the page
        if (!::web.isInitialized) return
        intent.data?.takeIf { it.scheme == "stremio" }?.let { openStremioLink(it) }
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        if (::web.isInitialized) web.requestFocus()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Play/pause keys on the Home screen do nothing useful in the page: keep them from scrolling it
        if (event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) return true
        return super.dispatchKeyEvent(event)
    }

    /** The page decides first (closing a card or menu, going back a screen); on Home, Back twice leaves. */
    private fun goBack() {
        web.evaluateJavascript("(window.__dxbiTv && window.__dxbiTv.back()) ? 1 : 0") { handled ->
            if (handled == "1") return@evaluateJavascript
            val now = System.currentTimeMillis()
            if (now - lastBack < 2500) finish()
            else {
                lastBack = now
                Toast.makeText(this, "Press Back again to leave dx.bi", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Start the page again in a lighter way: the intro film is the heaviest moment of a start, so it's
     * switched off (it can be switched back on in dx.bi's settings). A second crash soon after says so.
     */
    private fun recoverFromCrash(crashed: Boolean) {
        val state = getSharedPreferences("app", MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val again = now - state.getLong("lastPageCrash", 0) < 3 * 60_000
        state.edit().putLong("lastPageCrash", now).apply()
        android.util.Log.w("dxbi", "page engine gone (crashed=$crashed, again=$again)")

        val settings = getSharedPreferences("plugin-settings", MODE_PRIVATE)
        val dxbi = try { JSONObject(settings.getString("dxbi", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        dxbi.put("splash", false)
        settings.edit().putString("dxbi", dxbi.toString()).commit()

        (web.parent as? ViewGroup)?.removeView(web)
        web.destroy()
        if (again) {
            setContentView(View(this))
            AlertDialog.Builder(this)
                .setTitle("dx.bi keeps stopping")
                .setMessage("dx.bi's screen stopped twice in a row on this TV, usually because the TV is short of memory. Closing other apps (or restarting the TV) helps. Try again?")
                .setCancelable(false)
                .setPositiveButton("Try again") { _, _ -> recreate() }
                .setNegativeButton("Close") { _, _ -> finish() }
                .show()
        } else {
            recreate()
        }
    }

    fun play(json: String) {
        PlaybackBus.started(json)
        startActivity(Intent(this, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_STREAM, json))
    }

    fun openExternal(url: String) {
        val uri = Uri.parse(url)
        // YouTube (trailers): the TV's YouTube app, asked for by name. Google TV hands a plain YouTube
        // link to a "no browser" stub instead of the app
        if (uri.host?.endsWith("youtube.com") == true || uri.host == "youtu.be") {
            for (pkg in listOf("com.google.android.youtube.tv", "com.amazon.firetv.youtube", "com.google.android.youtube")) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage(pkg))
                    return
                } catch (_: Exception) { /* not on this TV: the next one */ }
            }
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            Toast.makeText(this, "No app on this TV can open that link", Toast.LENGTH_SHORT).show()
        }
    }

    private fun openStremioLink(uri: Uri) {
        // stremio://host/path/manifest.json → install the addon through Stremio's Addons screen
        val manifest = uri.toString().replaceFirst("stremio://", "https://")
        web.loadUrl("$STREMIO_URL#/addons?addon=" + Uri.encode(manifest))
    }

    fun js(code: String) {
        if (::web.isInitialized) web.post { web.evaluateJavascript(code, null) }
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun chromeVersion(): String =
        WebViewCompat.getCurrentWebViewPackage(this)?.versionName?.substringBefore(" ") ?: "120.0.0.0"

    /**
     * Stremio's web app needs a modern WebView; old TVs that never updated it get told how. Only a
     * version we can actually read counts as too old (Fire TV's own WebView names itself differently).
     */
    private fun webViewIsRecentEnough(): Boolean {
        val name = WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: return true
        val major = Regex("""^(\d+)\.""").find(name)?.groupValues?.get(1)?.toIntOrNull() ?: return true
        if (major >= MIN_WEBVIEW) return true
        val fireTv = Build.MANUFACTURER.equals("Amazon", ignoreCase = true)
        setContentView(View(this))
        val builder = AlertDialog.Builder(this)
            .setTitle(if (fireTv) "Update your Fire TV" else "Update Android System WebView")
            .setCancelable(false)
        if (fireTv) {
            builder.setMessage("dx.bi needs a newer web engine than this Fire TV has ($major). Update it under Settings → My Fire TV → About → Check for Updates, then open dx.bi again.")
                .setPositiveButton("Close") { _, _ -> finish() }
        } else {
            builder.setMessage("dx.bi needs Android System WebView $MIN_WEBVIEW or newer (this TV has $major). Update it from the Play Store (search \"Android System WebView\"), then open dx.bi again.")
                .setPositiveButton("Open Play Store") { _, _ ->
                    openExternal("market://details?id=com.google.android.webview")
                    finish()
                }
                .setNegativeButton("Close") { _, _ -> finish() }
        }
        builder.show()
        return false
    }

    override fun onDestroy() {
        // recreate() can bring up the new screen before this one is gone: leave its listener alone
        if (PlaybackBus.listener === playbackListener) PlaybackBus.listener = null
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    companion object {
        const val STREMIO_ORIGIN = "https://web.stremio.com"
        const val STREMIO_URL = "https://web.stremio.com/"
        const val MIN_WEBVIEW = 100
    }
}
