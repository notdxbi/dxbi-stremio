package com.notdxbi.dxbi.tv

import android.content.Context
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * What the page (dxbi-tv.js) can ask the app for: the plugin, its settings, and playback.
 *
 * Android hands this object to every frame in the page, embedded YouTube trailers included, so
 * each call carries [TOKEN]: it's written into dxbi-tv.js, which only runs on Stremio's own page.
 */
class Bridge(private val activity: MainActivity) {

    private val prefs = activity.getSharedPreferences("plugin-settings", Context.MODE_PRIVATE)

    private fun allowed(token: String): Boolean =
        MessageDigest.isEqual(token.toByteArray(), TOKEN.toByteArray())

    /** The dx.bi plugin: the one built in, or a newer one it has updated itself to */
    @JavascriptInterface
    fun pluginSource(token: String): String = if (!allowed(token)) "" else try {
        Updates.forTv(Updates.pluginSource(activity))
    } catch (_: Exception) {
        ""
    }

    /** A plugin's saved settings, as a JSON object (what Stremio Enhanced keeps in <plugin>.plugin.json) */
    @JavascriptInterface
    fun getSettings(token: String, plugin: String): String =
        if (!allowed(token)) "{}" else prefs.getString(plugin, "{}") ?: "{}"

    @JavascriptInterface
    fun saveSetting(token: String, plugin: String, key: String, valueJson: String) {
        if (!allowed(token)) return
        synchronized(this) {
            val all = try { JSONObject(prefs.getString(plugin, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
            val value: Any? = try { JSONObject("{\"v\":$valueJson}").opt("v") } catch (_: Exception) { valueJson }
            all.put(key, value ?: JSONObject.NULL)
            prefs.edit().putString(plugin, all.toString()).apply()
        }
    }

    @JavascriptInterface
    fun play(token: String, json: String) {
        if (!allowed(token)) return
        activity.runOnUiThread { activity.play(json) }
    }

    /** The stream the native player has right now (the page lost track of it if it restarted), or "" */
    @JavascriptInterface
    fun activePlayback(token: String): String = if (!allowed(token)) "" else PlaybackBus.activePlayback ?: ""

    /** How the native player closed while the page was restarting (so it couldn't be told), or "" */
    @JavascriptInterface
    fun takePendingClose(token: String): String {
        if (!allowed(token)) return ""
        return PlaybackBus.takePendingClose() ?: ""
    }

    @JavascriptInterface
    fun openExternal(token: String, url: String) {
        if (!allowed(token)) return
        activity.runOnUiThread { activity.openExternal(url) }
    }

    @JavascriptInterface
    fun toast(token: String, text: String) {
        if (!allowed(token)) return
        activity.runOnUiThread { Toast.makeText(activity, text, Toast.LENGTH_LONG).show() }
    }

    /** Looks for streaming servers on the network; the page hears back through __dxbiTv.serversFound */
    @JavascriptInterface
    fun findServers(token: String) {
        if (!allowed(token)) return
        ServerFinder.find { urls ->
            activity.js("window.__dxbiTv && window.__dxbiTv.serversFound && window.__dxbiTv.serversFound(${org.json.JSONArray(urls)})")
        }
    }

    /** A phone or tablet rather than a TV: browsing can turn upright */
    @JavascriptInterface
    fun isPhone(): Boolean {
        val ui = activity.getSystemService(Context.UI_MODE_SERVICE) as android.app.UiModeManager
        return ui.currentModeType != android.content.res.Configuration.UI_MODE_TYPE_TELEVISION &&
            !activity.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK)
    }

    @JavascriptInterface
    fun version(): String = BuildConfigVersion.name(activity)

    companion object {
        /** Fresh for every launch; replaces [PLACEHOLDER] in dxbi-tv.js */
        val TOKEN: String = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        const val PLACEHOLDER = "__DXBI_TV_TOKEN__"
    }
}
