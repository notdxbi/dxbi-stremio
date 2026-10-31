package com.notdxbi.dxbi.tv

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Dialogue boost and Night mode, the same settings as on a computer: louder centre channel, lows
 * down, speech frequencies up, and compression. Sound sent straight to an AV receiver as Dolby or
 * DTS never comes through here: only the receiver could change it.
 */
@OptIn(UnstableApi::class)
class SoundMode : BaseAudioProcessor() {
    class Mode(val label: String, val centre: Float, val surround: Float, val low: Float, val presence: Float, val threshold: Float, val ratio: Float, val makeup: Float)

    companion object {
        val MODES = listOf(
            Mode("Normal", 0.707f, 0.707f, 0f, 0f, 0f, 1f, 1f),
            Mode("Dialogue boost", 1.2f, 0.5f, -3f, 5f, -26f, 3f, 1.4f),
            Mode("Night mode", 1.2f, 0.45f, -6f, 4f, -42f, 8f, 2.4f),
        )
    }

    @Volatile var mode = MODES[0]
        set(value) { field = value; retune = true }
    @Volatile private var retune = true

    private class Biquad {
        var b0 = 1f; var b1 = 0f; var b2 = 0f; var a1 = 0f; var a2 = 0f
        var z1 = FloatArray(0); var z2 = FloatArray(0)
        fun size(channels: Int) { z1 = FloatArray(channels); z2 = FloatArray(channels) }
        fun set(b0n: Double, b1n: Double, b2n: Double, a0: Double, a1n: Double, a2n: Double) {
            b0 = (b0n / a0).toFloat(); b1 = (b1n / a0).toFloat(); b2 = (b2n / a0).toFloat()
            a1 = (a1n / a0).toFloat(); a2 = (a2n / a0).toFloat()
        }
        fun step(x: Float, c: Int): Float {
            val y = b0 * x + z1[c]
            z1[c] = b1 * x - a1 * y + z2[c]
            z2[c] = b2 * x - a2 * y
            return y
        }
    }

    private val shelf = Biquad()
    private val peak = Biquad()
    private var envelope = 0f
    private var attack = 0f
    private var release = 0f

    override fun onConfigure(input: AudioFormat): AudioFormat {
        if (input.encoding != C.ENCODING_PCM_16BIT) return AudioFormat.NOT_SET
        shelf.size(input.channelCount)
        peak.size(input.channelCount)
        attack = exp(-1.0 / (input.sampleRate * 0.005)).toFloat()
        release = exp(-1.0 / (input.sampleRate * 0.12)).toFloat()
        retune = true
        return input
    }

    private fun tune(rate: Int) {
        retune = false
        // Low shelf at 200 Hz and a peak at 2.5 kHz (RBJ's cookbook)
        val lowGain = 10.0.pow(mode.low / 40.0)
        var w = 2 * PI * 200 / rate
        var alpha = sin(w) / 2 * sqrt(2.0)
        val root = 2 * sqrt(lowGain) * alpha
        shelf.set(
            lowGain * ((lowGain + 1) - (lowGain - 1) * cos(w) + root),
            2 * lowGain * ((lowGain - 1) - (lowGain + 1) * cos(w)),
            lowGain * ((lowGain + 1) - (lowGain - 1) * cos(w) - root),
            (lowGain + 1) + (lowGain - 1) * cos(w) + root,
            -2 * ((lowGain - 1) + (lowGain + 1) * cos(w)),
            (lowGain + 1) + (lowGain - 1) * cos(w) - root,
        )
        val peakGain = 10.0.pow(mode.presence / 40.0)
        w = 2 * PI * 2500 / rate
        alpha = sin(w) / 2
        peak.set(1 + alpha * peakGain, -2 * cos(w), 1 - alpha * peakGain, 1 + alpha / peakGain, -2 * cos(w), 1 - alpha / peakGain)
    }

    override fun queueInput(input: ByteBuffer) {
        if (!input.hasRemaining()) return
        val out = replaceOutputBuffer(input.remaining())
        val m = mode
        if (m === MODES[0]) {
            out.put(input)
            out.flip()
            return
        }
        if (retune) tune(inputAudioFormat.sampleRate)
        val channels = inputAudioFormat.channelCount
        val frame = FloatArray(channels)
        val samples = input.order(ByteOrder.nativeOrder())
        val centre = m.centre / 0.707f
        val surround = m.surround / 0.707f
        while (samples.remaining() >= channels * 2) {
            var level = 0f
            for (c in 0 until channels) {
                var v = samples.short / 32768f
                // 5.1 and 7.1: FL FR C LFE then the rest
                if (channels >= 6) { if (c == 2) v *= centre else if (c >= 4) v *= surround }
                v = peak.step(shelf.step(v, c), c)
                frame[c] = v
                level = maxOf(level, abs(v))
            }
            envelope = if (level > envelope) attack * envelope + (1 - attack) * level else release * envelope + (1 - release) * level
            var gain = m.makeup
            if (envelope > 0.00001f) {
                val over = 20 * log10(envelope) - m.threshold
                if (over > 0) gain *= 10f.pow(-over * (1 - 1 / m.ratio) / 20)
            }
            for (c in 0 until channels) out.putShort(((frame[c] * gain).coerceIn(-1f, 1f) * 32767).toInt().toShort())
        }
        out.flip()
    }
}
