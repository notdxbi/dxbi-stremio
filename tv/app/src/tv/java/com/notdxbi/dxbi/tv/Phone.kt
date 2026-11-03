package com.notdxbi.dxbi.tv

import android.content.Context
import android.widget.FrameLayout
import androidx.media3.common.util.UnstableApi
import org.json.JSONObject
import java.io.File

/** dx.bi TV has none of the phone app's parts (they're src/mobile's): see PhoneHooks.kt */
object Phone {
    fun attach(activity: MainActivity, root: FrameLayout, js: (String) -> Unit) = Unit
    fun pageScript(context: Context) = ""
    fun pageMessage(json: String) = Unit
    fun pageGone() = Unit
    fun play(activity: MainActivity, json: String) = false
    @UnstableApi
    fun player(host: PlayerHost, stream: JSONObject): PlayerHooks? = null
    fun install(activity: MainActivity, apk: File) = false
}
