package com.notdxbi.dxbi.tv

import androidx.annotation.OptIn
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.Renderer

/** The subtitle renderer, told the position [delayUs] earlier: subtitle sync (positive = later) */
@OptIn(UnstableApi::class)
class DelayedText(private val renderer: Renderer, private val delayUs: () -> Long) : Renderer by renderer {
    override fun render(positionUs: Long, elapsedRealtimeUs: Long) = renderer.render(positionUs - delayUs(), elapsedRealtimeUs)

    // (Kotlin's delegation leaves out Java's default methods)
    override fun release() = renderer.release()
    override fun setTimeline(timeline: Timeline) = renderer.setTimeline(timeline)
    override fun setPlaybackSpeed(currentPlaybackSpeed: Float, targetPlaybackSpeed: Float) = renderer.setPlaybackSpeed(currentPlaybackSpeed, targetPlaybackSpeed)
    override fun enableMayRenderStartOfStream() = renderer.enableMayRenderStartOfStream()
    override fun getDurationToProgressUs(positionUs: Long, elapsedRealtimeUs: Long) = renderer.getDurationToProgressUs(positionUs, elapsedRealtimeUs)
}
