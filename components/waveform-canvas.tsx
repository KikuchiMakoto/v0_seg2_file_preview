"use client"

import { useRef, useEffect, useMemo, useCallback, useState } from "react"
import type { SEG2File } from "@/lib/seg2-parser"
import { processTraceData, applyBandpassFilter, type GainMode, type FilterSettings } from "@/lib/seg2-parser"
import { getOrderedChannels, type ChannelGroup } from "@/lib/channel-types"

export type DisplayMode = "waveform" | "intensity" | "fk-spectrum"

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

interface ComplexValue {
  re: number
  im: number
}

const FK_MAX_CHANNELS = 96
const FK_MIN_SAMPLES = 16
const FK_MAX_SAMPLES = 128

function dftRealPositive(signal: Float32Array, bins: number): ComplexValue[] {
  const n = signal.length
  const out: ComplexValue[] = new Array(bins)
  for (let k = 0; k < bins; k++) {
    const angleStep = (-2 * Math.PI * k) / n
    const cosStep = Math.cos(angleStep)
    const sinStep = Math.sin(angleStep)
    let c = 1
    let s = 0
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      const value = signal[i]
      re += value * c
      im += value * s
      const nextC = c * cosStep - s * sinStep
      const nextS = c * sinStep + s * cosStep
      c = nextC
      s = nextS
    }
    out[k] = { re, im }
  }
  return out
}

function dftComplex(input: ComplexValue[]): ComplexValue[] {
  const n = input.length
  const out: ComplexValue[] = new Array(n)
  for (let k = 0; k < n; k++) {
    const angleStep = (-2 * Math.PI * k) / n
    const cosStep = Math.cos(angleStep)
    const sinStep = Math.sin(angleStep)
    let c = 1
    let s = 0
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      const v = input[i]
      re += v.re * c - v.im * s
      im += v.re * s + v.im * c
      const nextC = c * cosStep - s * sinStep
      const nextS = c * sinStep + s * cosStep
      c = nextC
      s = nextS
    }
    out[k] = { re, im }
  }
  return out
}

function sampleToLength(data: Float32Array, start: number, end: number, targetLength: number): Float32Array {
  const out = new Float32Array(targetLength)
  const span = Math.max(1, end - start)
  const spanMinusOne = span - 1
  for (let i = 0; i < targetLength; i++) {
    const frac = targetLength === 1 ? 0 : i / (targetLength - 1)
    const srcIdx = Math.min(end - 1, Math.max(start, Math.floor(start + frac * spanMinusOne)))
    out[i] = data[srcIdx]
  }
  return out
}

function getSpectrumColor(value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value))
  if (t < 0.25) {
    const u = t / 0.25
    return [10 + 20 * u, 15 + 55 * u, 40 + 120 * u]
  }
  if (t < 0.5) {
    const u = (t - 0.25) / 0.25
    return [30 + 30 * u, 70 + 70 * u, 160 + 50 * u]
  }
  if (t < 0.75) {
    const u = (t - 0.5) / 0.25
    return [60 + 170 * u, 140 + 70 * u, 210 - 110 * u]
  }
  const u = (t - 0.75) / 0.25
  return [230 + 25 * u, 210 + 35 * u, 100 + 155 * u]
}

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
    const leftMargin = displayMode === "waveform" ? 40 : displayMode === "intensity" ? 30 : 45
    const rightMargin = displayMode === "waveform" ? 10 : displayMode === "intensity" ? 5 : 10
    const topMargin = displayMode === "waveform" ? 30 : displayMode === "intensity" ? 10 : 12
    const bottomMargin = displayMode === "waveform" ? 20 : displayMode === "intensity" ? 10 : 24
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

    if (displayMode !== "fk-spectrum") {
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
    } else if (displayMode === "intensity") {
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
    } else {
      const visibleByChannel: Float32Array[] = []
      orderedChannels.forEach((channelIndex) => {
        const processedData = processedTraces.get(channelIndex)
        if (!processedData || processedData.length === 0) return
        const startSample = Math.floor(viewStart * processedData.length)
        const endSample = Math.max(startSample + 1, Math.ceil(viewEnd * processedData.length))
        visibleByChannel.push(processedData.slice(startSample, endSample))
      })

      const channelCount = visibleByChannel.length
      if (channelCount > 1) {
        const targetChannels = Math.min(FK_MAX_CHANNELS, channelCount)
        const minVisibleSamples = visibleByChannel.reduce(
          (minLength, traceData) => Math.min(minLength, traceData.length),
          Number.MAX_SAFE_INTEGER
        )
        const targetSamples = Math.max(FK_MIN_SAMPLES, Math.min(FK_MAX_SAMPLES, minVisibleSamples))

        const channelStep = (channelCount - 1) / Math.max(1, targetChannels - 1)
        const reducedTraces: Float32Array[] = []
        for (let c = 0; c < targetChannels; c++) {
          const sourceChannel = Math.round(c * channelStep)
          const source = visibleByChannel[sourceChannel]
          reducedTraces.push(sampleToLength(source, 0, source.length, targetSamples))
        }

        const freqBins = Math.floor(targetSamples / 2) + 1
        const tfSpectra: ComplexValue[][] = reducedTraces.map((trace) => dftRealPositive(trace, freqBins))
        const fkMagnitude = new Float32Array(freqBins * targetChannels)
        let maxMag = 0

        for (let f = 0; f < freqBins; f++) {
          const spatialInput: ComplexValue[] = new Array(targetChannels)
          for (let c = 0; c < targetChannels; c++) spatialInput[c] = tfSpectra[c][f]
          const spatialSpectrum = dftComplex(spatialInput)
          const shift = Math.floor(targetChannels / 2)
          for (let k = 0; k < targetChannels; k++) {
            const shiftedK = (k + shift) % targetChannels
            const value = spatialSpectrum[k]
            const mag = Math.hypot(value.re, value.im)
            const index = f * targetChannels + shiftedK
            fkMagnitude[index] = mag
            if (mag > maxMag) maxMag = mag
          }
        }

        const logMax = Math.log10(1 + maxMag)
        const imageData = ctx.createImageData(Math.floor(plotWidth), Math.floor(plotHeight))
        const pixels = imageData.data

        for (let py = 0; py < Math.floor(plotHeight); py++) {
          const yFrac = 1 - py / Math.max(1, Math.floor(plotHeight) - 1)
          const fBin = Math.min(freqBins - 1, Math.max(0, Math.round(yFrac * (freqBins - 1))))
          for (let px = 0; px < Math.floor(plotWidth); px++) {
            const xFrac = px / Math.max(1, Math.floor(plotWidth) - 1)
            const kBin = Math.min(targetChannels - 1, Math.max(0, Math.round(xFrac * (targetChannels - 1))))
            const mag = fkMagnitude[fBin * targetChannels + kBin]
            const norm = logMax > 0 ? Math.log10(1 + mag) / logMax : 0
            const [r, g, b] = getSpectrumColor(norm)
            const idx = (py * Math.floor(plotWidth) + px) * 4
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b
            pixels[idx + 3] = 255
          }
        }

        ctx.putImageData(imageData, leftMargin, topMargin)

        ctx.strokeStyle = "rgba(148, 163, 184, 0.14)"
        for (let i = 0; i <= 4; i++) {
          const x = leftMargin + (plotWidth * i) / 4
          const y = topMargin + (plotHeight * i) / 4
          ctx.beginPath()
          ctx.moveTo(x, topMargin)
          ctx.lineTo(x, topMargin + plotHeight)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(leftMargin, y)
          ctx.lineTo(leftMargin + plotWidth, y)
          ctx.stroke()
        }

        const nyquist = seg2Data.sampleRate / 2
        ctx.fillStyle = "#94a3b8"
        ctx.textAlign = "right"
        ctx.font = "10px monospace"
        for (let i = 0; i <= 4; i++) {
          const y = topMargin + (plotHeight * i) / 4
          const hz = nyquist * (1 - i / 4)
          ctx.fillText(`${hz.toFixed(0)}Hz`, leftMargin - 5, y + 3)
        }

        ctx.textAlign = "center"
        for (let i = 0; i <= 4; i++) {
          const x = leftMargin + (plotWidth * i) / 4
          const k = -0.5 + i * 0.25
          ctx.fillText(`${k.toFixed(2)}`, x, topMargin + plotHeight + 12)
        }

        ctx.fillStyle = "#64748b"
        ctx.textAlign = "left"
        ctx.fillText("f-k Spectrum (k: cycles/channel)", leftMargin + 5, topMargin + 12)
      } else {
        ctx.fillStyle = "#94a3b8"
        ctx.textAlign = "center"
        ctx.fillText("f-k spectrum requires at least 2 channels", leftMargin + plotWidth / 2, topMargin + plotHeight / 2)
      }
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
