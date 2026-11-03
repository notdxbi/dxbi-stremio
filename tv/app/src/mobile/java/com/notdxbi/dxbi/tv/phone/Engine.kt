package com.notdxbi.dxbi.tv.phone

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * The phone app's way into Stremio: the page underneath (Stremio's web app, dx.bi's plugin and
 * dxbi-engine.js) does Stremio's work, and the native screens read its state and ask it for things.
 *
 * To the page: `window.__dxbiEngine.handle({id, op, args})`, run by [run].
 * From the page (through Bridge.engine): `{type: "reply", id, ok, data | error}`,
 * `{type: "state", field, data}` for each watched model as it changes, and `{type: "ready"}`.
 */
class Engine(private val run: (String) -> Unit) {

    class Failure(message: String) : Exception(message)

    private val ids = AtomicInteger()
    private val pending = ConcurrentHashMap<Int, CompletableDeferred<Any?>>()
    private val states = ConcurrentHashMap<String, MutableStateFlow<JSONObject?>>()
    private val watched = ConcurrentHashMap.newKeySet<String>()

    /** Whether Stremio's core is up in the page (it starts again with the page after a crash) */
    val ready = MutableStateFlow(false)

    /** Stremio's core events: UserAuthenticated, Error ({source, error: {message}}), LibraryItemsPulledFromAPI… */
    val events = MutableSharedFlow<Pair<String, JSONObject?>>(extraBufferCapacity = 16)

    /** A model's state as the screens need it (dxbi-engine.js trims it), kept current; null until it arrives */
    fun state(field: String): StateFlow<JSONObject?> {
        val flow = states.getOrPut(field) { MutableStateFlow(null) }
        if (watched.add(field)) send("watch", JSONObject().put("fields", JSONArray(watched.toList())))
        return flow
    }

    /** Asks the page for something and waits for its answer (a JSONObject, JSONArray, string, number… or null) */
    suspend fun call(op: String, args: JSONObject = JSONObject(), timeoutMs: Long = 20_000): Any? {
        val id = ids.incrementAndGet()
        val answer = CompletableDeferred<Any?>()
        pending[id] = answer
        send(op, args, id)
        return try {
            withTimeout(timeoutMs) { answer.await() }
        } finally {
            pending.remove(id)
        }
    }

    /** Fire and forget */
    fun send(op: String, args: JSONObject = JSONObject(), id: Int = 0) {
        val message = JSONObject().put("id", id).put("op", op).put("args", args)
        run("window.__dxbiEngine && window.__dxbiEngine.handle($message)")
    }

    fun onMessage(json: String) {
        val message = try { JSONObject(json) } catch (_: Exception) { return }
        when (message.optString("type")) {
            "reply" -> pending.remove(message.optInt("id"))?.let { answer ->
                if (message.optBoolean("ok")) answer.complete(message.opt("data").takeUnless { it == JSONObject.NULL })
                else answer.completeExceptionally(Failure(message.optString("error", "the page couldn't do that")))
            }
            "state" -> {
                val field = message.optString("field")
                states.getOrPut(field) { MutableStateFlow(null) }.value = message.optJSONObject("data")
            }
            "ready" -> {
                ready.value = true
                // A page that started again has forgotten what was watched
                if (watched.isNotEmpty()) send("watch", JSONObject().put("fields", JSONArray(watched.toList())))
            }
            "event" -> events.tryEmit(message.optString("event") to message.optJSONObject("args"))
            "gone" -> ready.value = false
        }
    }
}
