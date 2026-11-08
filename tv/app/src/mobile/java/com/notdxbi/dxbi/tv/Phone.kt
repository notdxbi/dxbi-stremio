package com.notdxbi.dxbi.tv

import android.app.PendingIntent
import android.app.UiModeManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.ComposeView
import androidx.media3.common.util.UnstableApi
import com.notdxbi.dxbi.tv.phone.Engine
import com.notdxbi.dxbi.tv.phone.PhoneApp
import org.json.JSONObject
import java.io.File

/**
 * dx.bi for phones, joined to dx.bi TV's code (see PhoneHooks.kt): native screens over the page,
 * which keeps doing Stremio's work underneath (laid out and running, just covered), and where a
 * stream goes when it's played. On a TV the phone app is just dx.bi TV.
 */
object Phone {

    /**
     * Where the next stream the page hands over goes (the screens choose before asking the page to
     * play): dx.bi's own player, another app, a Chromecast, or a download. Back to [Target.Player] once used.
     */
    enum class Target { Player, External, Cast, Download }

    @Volatile
    var nextTarget = Target.Player

    /** The screens' way into the page (null on a TV) */
    private var engine: Engine? = null
    private var external: ActivityResultLauncher<Intent>? = null

    /** A phone or tablet rather than a TV */
    fun isPhone(context: Context): Boolean {
        val ui = context.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return ui.currentModeType != Configuration.UI_MODE_TYPE_TELEVISION &&
            !context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    fun attach(activity: MainActivity, root: FrameLayout, js: (String) -> Unit) {
        engine = null
        if (!isPhone(activity)) return
        // Another app playing a stream (VLC, mpv, MX Player…): it says where it got to when it closes
        external = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { ExternalPlayer.finished(it.data) }
        val engine = Engine(js).also { engine = it }
        // (downloads left unfinished last time carry on as soon as dx.bi opens)
        Downloads.manager(activity)
        // (where it draws nothing, touches reach the page: how the page shows through when it's needed)
        val screens = ComposeView(activity).apply { setContent { PhoneApp(engine) } }
        root.addView(screens, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }

    /** dxbi-engine.js, run in the page after dxbi-tv.js (only when the screens are there) */
    fun pageScript(context: Context): String =
        if (engine == null) "" else "\n" + context.assets.open("dxbi-engine.js").bufferedReader().use { it.readText() }

    fun pageMessage(json: String) {
        engine?.onMessage(json)
    }

    fun pageGone() {
        engine?.onMessage("""{"type":"gone"}""")
    }

    /** A stream the page handed over, when it isn't for dx.bi's player: true when it's been dealt with */
    fun play(activity: MainActivity, json: String): Boolean {
        val target = nextTarget.also { nextTarget = Target.Player }
        when (target) {
            Target.Player -> return false
            Target.External -> external?.let { ExternalPlayer.open(activity, json, it) } ?: return false
            Target.Cast -> Cast.play(activity, json)
            Target.Download -> {
                Downloads.add(activity, json)
                // nothing plays: the page goes back to where it was
                PlaybackBus.closed(0, 0, ended = false, error = null)
            }
        }
        return true
    }

    @UnstableApi
    fun player(host: PlayerHost, stream: JSONObject): PlayerHooks? =
        if (isPhone(host.activity)) PhonePlayer(host, stream) else null

    /**
     * Installs a downloaded update through Android's package installer: from Android 12, once dx.bi
     * installed the copy it's replacing (every update after the first), it installs without asking,
     * and dx.bi closes to restart as the new version. Otherwise Android asks first (UpdateReceiver
     * brings that up). False: older Androids, which get the installer screen instead.
     */
    fun install(activity: MainActivity, apk: File): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        return try {
            val installer = activity.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(activity.packageName)
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val id = installer.createSession(params)
            installer.openSession(id).use { session ->
                session.openWrite("dxbi.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val done = PendingIntent.getBroadcast(
                    activity, id, Intent(activity, UpdateReceiver::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
                activity.runOnUiThread { Toast.makeText(activity, "Installing the update: dx.bi will close and open as the new version", Toast.LENGTH_LONG).show() }
                session.commit(done.intentSender)
            }
            true
        } catch (_: Exception) {
            false // the installer screen instead
        }
    }
}

/** Hears how an update's install went: brings up Android's "Install?" when it wants to ask, or says why it failed */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Unit // (the new version is starting)
            PackageInstaller.STATUS_FAILURE_ABORTED -> Unit // they said no
            else -> Toast.makeText(context, "The update didn't install: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "try again later"}", Toast.LENGTH_LONG).show()
        }
    }
}
