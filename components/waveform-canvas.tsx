"use client"

import { useRef, useEffect, useMemo, useCallback, useState } from "react"
import type { SEG2File } from "@/lib/seg2-parser"
import { processTraceData, applyBandpassFilter, type GainMode, type FilterSettings } from "@/lib/seg2-parser"
import { getOrderedChannels, type ChannelGroup } from "@/lib/channel-types"

export type DisplayMode = "waveform" | "intensity"

interface WaveformCanvasProps {
  seg2Data: SEG2File | null
  channelGroups: ChannelGroup[]
  gainMode: GainMode
  fixedGain: number
  filterSettings: FilterSettings
  displayMode: DisplayMode
  width?: number
  height?: number
}

// Color palette for different cable groups
const GROUP_COLORS = [
  { fill: "rgba(59, 130, 246, 0.5)", stroke: "rgb(59, 130, 246)", rgb: [59, 130, 246] },
  { fill: "rgba(16, 185, 129, 0.5)", stroke: "rgb(16, 185, 129)", rgb: [16, 185, 129] },
  { fill: "rgba(245, 158, 11, 0.5)", stroke: "rgb(245, 158, 11)", rgb: [245, 158, 11] },
  { fill: "rgba(239, 68, 68, 0.5)", stroke: "rgb(239, 68, 68)", rgb: [239, 68, 68] },
  { fill: "rgba(139, 92, 246, 0.5)", stroke: "rgb(139, 92, 246)", rgb: [139, 92, 246] },
  { fill: "rgba(236, 72, 153, 0.5)", stroke: "rgb(236, 72, 153)", rgb: [236, 72, 153] },
  { fill: "rgba(6, 182, 212, 0.5)", stroke: "rgb(6, 182, 212)", rgb: [6, 182, 212] },
  { fill: "rgba(132, 204, 22, 0.5)", stroke: "rgb(132, 204, 22)", rgb: [132, 204, 22] },
]

export function WaveformCanvas({
  seg2Data,
  channelGroups,
  gainMode,
  fixedGain,
  filterSettings,
  displayMode,
  width = 1200,
  height = 800,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom and pan state: viewStart and viewEnd are fractions [0, 1] of total time
  const [viewStart, setViewStart] = useState(0)
  const [viewEnd, setViewEnd] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panStartX, setPanStartX] = useState(0)
  const [panStartView, setPanStartView] = useState({ start: 0, end: 1 })

  // Reset view when new data is loaded
  useEffect(() => {
    setViewStart(0)
    setViewEnd(1)
  }, [seg2Data])

  const orderedChannels = useMemo(() => {
    return getOrderedChannels(channelGroups)
  }, [channelGroups])

  // Stable string key for dependency tracking
  const orderedChannelsKey = useMemo(() => orderedChannels.join(","), [orderedChannels])

  const channelToGroupIndex = useMemo(() => {
    const map = new Map<number, number>()
    channelGroups.forEach((group, groupIndex) => {
      group.channels.forEach((ch) => {
        map.set(ch, groupIndex)
      })
    })
    return map
  }, [channelGroups])

  // Pre-process and filter all traces
  const processedTraces = useMemo(() => {
    if (!seg2Data) return new Map<number, Float32Array>()

    const result = new Map<number, Float32Array>()
    const sampleRate = seg2Data.sampleRate

    for (const channelIndex of orderedChannels) {
      if (channelIndex >= seg2Data.traces.length) continue

      let data = seg2Data.traces[channelIndex].data

      // Apply bandpass filter first (before gain processing)
      data = applyBandpassFilter(data, sampleRate, filterSettings)

      // Then apply gain processing
      data = processTraceData(data, gainMode, fixedGain)

      result.set(channelIndex, data)
    }

    return result
  }, [seg2Data, orderedChannels, gainMode, fixedGain, filterSettings])

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // Vertical layout: time is on Y axis
    const topMargin = 30
    const bottomMargin = 20
    const plotHeight = height - topMargin - bottomMargin
    const mouseY = e.clientY - rect.top - topMargin
    const mouseFraction = Math.max(0, Math.min(1, mouseY / plotHeight))

    // Calculate current view position at mouse
    const currentRange = viewEnd - viewStart
    const mouseTime = viewStart + mouseFraction * currentRange

    // Zoom factor
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
    const newRange = Math.max(0.01, Math.min(1, currentRange * zoomFactor))

    // Keep mouse position stable
    let newStart = mouseTime - mouseFraction * newRange
    let newEnd = mouseTime + (1 - mouseFraction) * newRange

    // Clamp to valid range
    if (newStart < 0) {
      newStart = 0
      newEnd = newRange
    }
    if (newEnd > 1) {
      newEnd = 1
      newStart = 1 - newRange
    }

    setViewStart(Math.max(0, newStart))
    setViewEnd(Math.min(1, newEnd))
  }, [viewStart, viewEnd, height])

  // Handle mouse drag for panning
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(true)
    setPanStartX(e.clientY) // Use Y for vertical layout
    setPanStartView({ start: viewStart, end: viewEnd })
  }, [viewStart, viewEnd])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning) return

    const topMargin = 30
    const bottomMargin = 20
    const plotHeight = height - topMargin - bottomMargin
    const deltaY = e.clientY - panStartX
    const deltaNorm = deltaY / plotHeight

    const range = panStartView.end - panStartView.start
    let newStart = panStartView.start - deltaNorm * range
    let newEnd = panStartView.end - deltaNorm * range

    // Clamp
    if (newStart < 0) {
      newStart = 0
      newEnd = range
    }
    if (newEnd > 1) {
      newEnd = 1
      newStart = 1 - range
    }

    setViewStart(newStart)
    setViewEnd(newEnd)
  }, [isPanning, panStartX, panStartView, height])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !seg2Data) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.fillStyle = "#0f172a"
    ctx.fillRect(0, 0, width, height)

    const numChannels = orderedChannels.length
    if (numChannels === 0) return

    // Layout: X axis = channels, Y axis = time (swapped from before)
    // In intensity mode, minimize margins for full image display
    const leftMargin = displayMode === "intensity" ? 30 : 40
    const rightMargin = displayMode === "intensity" ? 5 : 10
    const topMargin = displayMode === "intensity" ? 10 : 30
    const bottomMargin = displayMode === "intensity" ? 10 : 20
    const plotWidth = width - leftMargin - rightMargin
    const plotHeight = height - topMargin - bottomMargin
    const channelWidth = plotWidth / numChannels

    // Time info
    const sampleInterval = 1 / seg2Data.sampleRate
    const numSamples = seg2Data.traces[0]?.numberOfSamplesInDataBlock || 0
    const totalTime = numSamples * sampleInterval

    // Visible time range
    const visibleStartTime = totalTime * viewStart
    const visibleEndTime = totalTime * viewEnd
    const visibleDuration = visibleEndTime - visibleStartTime

    ctx.fillStyle = "#94a3b8"
    ctx.font = "10px monospace"

    // Draw time axis (vertical, on left side)
    ctx.textAlign = "right"
    const numTimeLabels = Math.min(10, Math.floor(plotHeight / 40))
    for (let i = 0; i <= numTimeLabels; i++) {
      const y = topMargin + (plotHeight * i) / numTimeLabels
      const time = visibleStartTime + (visibleDuration * i) / numTimeLabels
      ctx.fillText(`${time.toFixed(3)}s`, leftMargin - 5, y + 3)

      // Horizontal grid lines
      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)"
      ctx.beginPath()
      ctx.moveTo(leftMargin, y)
      ctx.lineTo(width - rightMargin, y)
      ctx.stroke()
    }

    // Draw channel labels at top (only in waveform mode)
    if (displayMode === "waveform") {
      ctx.textAlign = "center"
      orderedChannels.forEach((channelIndex, displayIndex) => {
        const xCenter = leftMargin + channelWidth * displayIndex + channelWidth / 2
        const groupIndex = channelToGroupIndex.get(channelIndex) || 0
        const colors = GROUP_COLORS[groupIndex % GROUP_COLORS.length]
        ctx.fillStyle = colors.stroke
        ctx.fillText(`${channelIndex + 1}`, xCenter, topMargin - 8)
      })
    }

    if (displayMode === "waveform") {
      // Draw each channel waveform
      orderedChannels.forEach((channelIndex, displayIndex) => {
        const processedData = processedTraces.get(channelIndex)
        if (!processedData) return

        const xCenter = leftMargin + channelWidth * displayIndex + channelWidth / 2
        const amplitude = channelWidth / 2 * 0.85

        const groupIndex = channelToGroupIndex.get(channelIndex) || 0
        const colors = GROUP_COLORS[groupIndex % GROUP_COLORS.length]

        // Create clipping region for this channel
        ctx.save()
        ctx.beginPath()
        ctx.rect(leftMargin + channelWidth * displayIndex, topMargin, channelWidth, plotHeight)
        ctx.clip()

        // Draw zero line (vertical)
        ctx.strokeStyle = "rgba(148, 163, 184, 0.15)"
        ctx.beginPath()
        ctx.moveTo(xCenter, topMargin)
        ctx.lineTo(xCenter, topMargin + plotHeight)
        ctx.stroke()

        const numPoints = processedData.length
        if (numPoints === 0) {
          ctx.restore()
          return
        }

        // Calculate visible sample range
        const startSample = Math.floor(viewStart * numPoints)
        const endSample = Math.ceil(viewEnd * numPoints)
        const visibleSamples = endSample - startSample

        // Downsample for performance
        const maxPoints = plotHeight * 2
        const step = Math.max(1, Math.floor(visibleSamples / maxPoints))

        // Draw positive fill (right of zero line)
        ctx.fillStyle = colors.fill
        ctx.beginPath()
        ctx.moveTo(xCenter, topMargin)

        for (let i = startSample; i < endSample; i += step) {
          const normI = (i - startSample) / visibleSamples
          const y = topMargin + normI * plotHeight
          const value = processedData[i]
          const x = xCenter + value * amplitude
          ctx.lineTo(Math.max(x, xCenter), y)
        }
        ctx.lineTo(xCenter, topMargin + plotHeight)
        ctx.closePath()
        ctx.fill()

        // Draw negative fill (left of zero line)
        ctx.beginPath()
        ctx.moveTo(xCenter, topMargin)

        for (let i = startSample; i < endSample; i += step) {
          const normI = (i - startSample) / visibleSamples
          const y = topMargin + normI * plotHeight
          const value = processedData[i]
          const x = xCenter + value * amplitude
          ctx.lineTo(Math.min(x, xCenter), y)
        }
        ctx.lineTo(xCenter, topMargin + plotHeight)
        ctx.closePath()
        ctx.fill()

        // Draw waveform line
        ctx.strokeStyle = colors.stroke
        ctx.lineWidth = 1
        ctx.beginPath()

        for (let i = startSample; i < endSample; i += step) {
          const normI = (i - startSample) / visibleSamples
          const y = topMargin + normI * plotHeight
          const value = processedData[i]
          const x = xCenter + value * amplitude

          if (i === startSample) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()

        ctx.restore()
      })
    } else {
      // Intensity display mode
      // Create ImageData for the plot area
      const imageData = ctx.createImageData(Math.floor(plotWidth), Math.floor(plotHeight))
      const pixels = imageData.data

      orderedChannels.forEach((channelIndex, displayIndex) => {
        const processedData = processedTraces.get(channelIndex)
        if (!processedData) return

        const groupIndex = channelToGroupIndex.get(channelIndex) || 0
        const colors = GROUP_COLORS[groupIndex % GROUP_COLORS.length]
        const [r, g, b] = colors.rgb

        const numPoints = processedData.length
        if (numPoints === 0) return

        // Calculate visible sample range
        const startSample = Math.floor(viewStart * numPoints)
        const endSample = Math.ceil(viewEnd * numPoints)
        const visibleSamples = endSample - startSample

        // Channel pixel range (left to right)
        const channelStartX = Math.floor(channelWidth * displayIndex)
        const channelEndX = Math.floor(channelWidth * (displayIndex + 1))
        const channelPixelWidth = channelEndX - channelStartX

        // Fill each row (time sample)
        for (let py = 0; py < Math.floor(plotHeight); py++) {
          // Map pixel Y to sample index
          const sampleFrac = py / plotHeight
          const sampleIdx = Math.floor(startSample + sampleFrac * visibleSamples)
          const clampedIdx = Math.max(startSample, Math.min(endSample - 1, sampleIdx))

          // Get value and convert to grayscale
          // Value is in [-1, 1], map to [0, 255]
          const value = processedData[clampedIdx]
          const clamped = Math.max(-1, Math.min(1, value))
          const gray = Math.round((clamped + 1) * 127.5) // [-1,1] -> [0,255]

          // Blend grayscale with color overlay (15% color, 85% grayscale)
          const colorBlend = 0.15
          const finalR = Math.round(gray * (1 - colorBlend) + r * colorBlend * (gray / 255))
          const finalG = Math.round(gray * (1 - colorBlend) + g * colorBlend * (gray / 255))
          const finalB = Math.round(gray * (1 - colorBlend) + b * colorBlend * (gray / 255))

          // Fill all pixels in this channel's width
          for (let px = channelStartX; px < channelEndX; px++) {
            const idx = (py * Math.floor(plotWidth) + px) * 4
            pixels[idx] = finalR     // R
            pixels[idx + 1] = finalG // G
            pixels[idx + 2] = finalB // B
            pixels[idx + 3] = 255    // A
          }
        }
      })

      // Draw the image data
      ctx.putImageData(imageData, leftMargin, topMargin)
    }

    // Draw border
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)"
    ctx.lineWidth = 1
    ctx.strokeRect(leftMargin, topMargin, plotWidth, plotHeight)

    // Draw zoom indicator
    if (viewStart > 0 || viewEnd < 1) {
      ctx.fillStyle = "#60a5fa"
      ctx.font = "10px sans-serif"
      ctx.textAlign = "left"
      const zoomLevel = (1 / (viewEnd - viewStart)).toFixed(1)
      ctx.fillText(`${zoomLevel}x zoom`, leftMargin + 5, topMargin + 12)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg2Data, width, height, viewStart, viewEnd, displayMode, orderedChannelsKey, channelToGroupIndex, processedTraces])

  if (!seg2Data) {
    return (
      <div
        className="flex items-center justify-center bg-slate-900 rounded-lg border border-slate-700"
        style={{ width, height }}
      >
        <p className="text-slate-400 text-sm">No data loaded. Drop a SEG2 file to display waveforms.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <canvas
        ref={canvasRef}
        style={{ width, height, cursor: isPanning ? "grabbing" : "grab" }}
        className="rounded-lg"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 pointer-events-none">
        Scroll to zoom / Drag to pan
      </div>
    </div>
  )
}
