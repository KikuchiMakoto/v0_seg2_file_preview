"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { parseSEG2, type SEG2File, type GainMode, type FilterSettings } from "@/lib/seg2-parser"
import { createDefaultGroups, type ChannelGroup } from "@/lib/channel-types"
import { WaveformCanvas, type DisplayMode } from "@/components/waveform-canvas"
import { ChannelGroupPanel } from "@/components/channel-group-panel"
import { GainControls } from "@/components/gain-controls"
import { FilterControls } from "@/components/filter-controls"
import { FileInfoPanel } from "@/components/file-info-panel"
import { FileDropzone } from "@/components/file-dropzone"
import { Button } from "@/components/ui/button"
import { Waves, Grid3X3 } from "lucide-react"

export default function SEG2Viewer() {
  const [seg2Data, setSeg2Data] = useState<SEG2File | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([])
  const [gainMode, setGainMode] = useState<GainMode>("agc")
  const [fixedGain, setFixedGain] = useState(1)
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    enabled: true,
    highpassHz: 5,
    lowpassHz: 500,
    order: 2,
  })
  const [error, setError] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 700 })
  const [displayMode, setDisplayMode] = useState<DisplayMode>("waveform")

  useEffect(() => {
    const updateSize = () => {
      const width = Math.max(500, window.innerWidth - 280)
      const height = Math.max(400, window.innerHeight - 40)
      setCanvasSize({ width, height })
    }
    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  const handleFileLoad = useCallback((buffer: ArrayBuffer, name: string) => {
    try {
      setError(null)
      const data = parseSEG2(buffer)
      
      // Debug output
      console.log("=== SEG2 Debug Info ===")
      console.log("Sample Rate:", data.sampleRate)
      console.log("Number of traces:", data.traces.length)
      if (data.traces[0]) {
        console.log("First trace free strings:", data.traces[0].freeFormatStrings)
        console.log("First trace samples:", data.traces[0].data.length)
        console.log("First trace format:", data.traces[0].dataFormatCode)
      }
      console.log("Header free strings:", data.header.freeFormatStrings)
      console.log("=======================")
      
      setSeg2Data(data)
      setFileName(name)

      const totalTraces = data.traces.length
      const groupableTraces = totalTraces

      // Keep channel groups if trace count matches, otherwise reset
      const previousGroupableTraces = channelGroups.reduce((sum, g) => sum + g.channels.length, 0)
      if (previousGroupableTraces !== groupableTraces || channelGroups.length === 0) {
        const groups = createDefaultGroups(groupableTraces)
        setChannelGroups(groups)
      }
      // Filter and gain settings are preserved (no reset here)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse SEG2 file")
      setSeg2Data(null)
      setFileName(null)
    }
  }, [channelGroups])

  const visibleChannelCount = useMemo(() => {
    return channelGroups
      .filter((g) => g.visible)
      .reduce((sum, g) => sum + g.channels.length, 0)
  }, [channelGroups])

  const sampleRate = seg2Data?.sampleRate || 1000

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Minimal Header */}
      <header className="flex-none border-b border-slate-800 px-3 py-1 flex items-center justify-between h-7">
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-semibold text-slate-100">SEG2</h1>
          {fileName && (
            <span className="text-[10px] text-slate-400 truncate max-w-40">{fileName}</span>
          )}
        </div>
        {seg2Data && (
          <div className="text-[10px] text-slate-400">
            {visibleChannelCount}/{seg2Data.traces.length}ch | {sampleRate.toFixed(0)}Hz
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex-none border-r border-slate-800 p-2 flex flex-col gap-2 overflow-y-auto">
          <FileDropzone onFileLoad={handleFileLoad} compact />

          {/* Display Mode Toggle */}
          <div className="flex gap-1">
            <Button
              variant={displayMode === "waveform" ? "default" : "outline"}
              size="sm"
              className={`flex-1 h-7 text-[10px] gap-1 ${displayMode === "waveform" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"}`}
              onClick={() => setDisplayMode("waveform")}
            >
              <Waves size={12} />
              Waveform
            </Button>
            <Button
              variant={displayMode === "intensity" ? "default" : "outline"}
              size="sm"
              className={`flex-1 h-7 text-[10px] gap-1 ${displayMode === "intensity" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"}`}
              onClick={() => setDisplayMode("intensity")}
            >
              <Grid3X3 size={12} />
              Intensity
            </Button>
          </div>

          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          <FilterControls
            settings={filterSettings}
            onSettingsChange={setFilterSettings}
            sampleRate={sampleRate}
          />

          <GainControls
            gainMode={gainMode}
            onGainModeChange={setGainMode}
            fixedGain={fixedGain}
            onFixedGainChange={setFixedGain}
          />

          {channelGroups.length > 0 && (
            <ChannelGroupPanel
              groups={channelGroups}
              onGroupsChange={setChannelGroups}
            />
          )}

          <FileInfoPanel seg2Data={seg2Data} fileName={fileName} compact />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-2 overflow-hidden flex items-center justify-center">
          <WaveformCanvas
            seg2Data={seg2Data}
            channelGroups={channelGroups}
            gainMode={gainMode}
            fixedGain={fixedGain}
            filterSettings={filterSettings}
            displayMode={displayMode}
            width={canvasSize.width}
            height={canvasSize.height}
          />
        </main>
      </div>
    </div>
  )
}
