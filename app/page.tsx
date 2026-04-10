"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { parseSEG2, type SEG2File, type GainMode, type FilterSettings } from "@/lib/seg2-parser"
import { parseYDT, isYDTFile } from "@/lib/ydt-parser"
import { createDefaultGroups, type ChannelGroup } from "@/lib/channel-types"
import { WaveformCanvas, type DisplayMode } from "@/components/waveform-canvas"
import { ChannelGroupPanel } from "@/components/channel-group-panel"
import { GainControls } from "@/components/gain-controls"
import { FilterControls } from "@/components/filter-controls"
import { FileInfoPanel } from "@/components/file-info-panel"
import { FileDropzone } from "@/components/file-dropzone"
import { Button } from "@/components/ui/button"
import { Waves, Grid3X3, X, Upload } from "lucide-react"

interface FileEntry {
  id: string
  fileName: string
  seg2Data: SEG2File
  channelGroups: ChannelGroup[]
}

function getTabName(fileName: string, traceCount: number): string {
  const baseName = fileName.replace(/\.[^.]+$/, "")
  return `${baseName}-${traceCount}ch`
}

export default function SEG2Viewer() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [gainMode, setGainMode] = useState<GainMode>("agc")
  const [fixedGain, setFixedGain] = useState(1000)
  const [agcFixedGain, setAgcFixedGain] = useState(1)
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    enabled: true,
    highpassHz: 5,
    lowpassHz: 500,
    order: 2,
  })
  const [error, setError] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 700 })
  const [displayMode, setDisplayMode] = useState<DisplayMode>("waveform")
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      const isArrow = e.key === "ArrowLeft" || e.key === "ArrowRight"
      const isAD = e.key === "a" || e.key === "d"
      if (!isAD && !isArrow) return
      // Arrow keys must not interfere with sliders
      if (isArrow && target.getAttribute("role") === "slider") return
      const goNext = e.key === "d" || e.key === "ArrowRight"
      setFiles((prev) => {
        if (prev.length === 0) return prev
        setActiveFileId((currentId) => {
          const idx = prev.findIndex((f) => f.id === currentId)
          if (idx < 0) return currentId
          const next = goNext ? Math.min(idx + 1, prev.length - 1) : Math.max(idx - 1, 0)
          return prev[next].id
        })
        return prev
      })
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const activeFile = files.find((f) => f.id === activeFileId) ?? null
  const seg2Data = activeFile?.seg2Data ?? null
  const fileName = activeFile?.fileName ?? null
  const channelGroups = activeFile?.channelGroups ?? []

  const handleFileLoad = useCallback(
    (buffer: ArrayBuffer, name: string) => {
      try {
        setError(null)
        const ext = name.split(".").pop()?.toLowerCase()
        let data: SEG2File
        if (ext === "ydt" || isYDTFile(buffer)) {
          data = parseYDT(buffer)
        } else {
          data = parseSEG2(buffer)
        }

        // Debug output
        console.log("=== File Debug Info ===")
        console.log("Sample Rate:", data.sampleRate)
        console.log("Number of traces:", data.traces.length)
        if (data.traces[0]) {
          console.log("First trace free strings:", data.traces[0].freeFormatStrings)
          console.log("First trace samples:", data.traces[0].data.length)
          console.log("First trace format:", data.traces[0].dataFormatCode)
        }
        console.log("Header free strings:", data.header.freeFormatStrings)
        console.log("=======================")

        setFiles((prev) => {
          const existingIndex = prev.findIndex((f) => f.fileName === name)
          if (existingIndex >= 0) {
            // Update existing entry, preserve groups if trace count unchanged
            const existing = prev[existingIndex]
            const prevTraceCount = existing.channelGroups.reduce((sum, g) => sum + g.channels.length, 0)
            const newGroups =
              prevTraceCount !== data.traces.length
                ? createDefaultGroups(data.traces.length)
                : existing.channelGroups
            const updated = prev.map((f) =>
              f.fileName === name ? { ...f, seg2Data: data, channelGroups: newGroups } : f
            )
            setActiveFileId(existing.id)
            return updated
          } else {
            // Add new tab
            const id = `${name}-${Date.now()}`
            const groups = createDefaultGroups(data.traces.length)
            setActiveFileId(id)
            return [...prev, { id, fileName: name, seg2Data: data, channelGroups: groups }]
          }
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file")
      }
    },
    []
  )

  const handleCloseTab = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const newFiles = prev.filter((f) => f.id !== id)
        if (activeFileId === id) {
          setActiveFileId(newFiles.length > 0 ? newFiles[newFiles.length - 1].id : null)
        }
        return newFiles
      })
    },
    [activeFileId]
  )

  const handleChannelGroupsChange = useCallback(
    (groups: ChannelGroup[]) => {
      if (!activeFileId) return
      setFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, channelGroups: groups } : f)))
    },
    [activeFileId]
  )

  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) setIsDragOver(true)
  }, [])

  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }, [])

  const handlePageDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        const buffer = await file.arrayBuffer()
        handleFileLoad(buffer, file.name)
      }
    },
    [handleFileLoad]
  )

  const sampleRate = seg2Data?.sampleRate || 1000

  return (
    <div
      className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* Full-page drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 border-4 border-blue-400 border-dashed flex flex-col items-center justify-center gap-4 pointer-events-none">
          <Upload size={64} className="text-blue-400" />
          <span className="text-blue-300 text-2xl font-semibold tracking-wide">Drop SEG2/YDT Files</span>
        </div>
      )}
      {/* Header with Chrome-style file tabs */}
      <header className="flex-none border-b border-slate-800 px-2 flex items-end h-8 gap-0">
        <span className="text-xs font-semibold text-slate-100 px-2 pb-1 flex-none">SEG2/YDT</span>

        {/* Tabs */}
        <div className="flex-1 flex items-end gap-0.5 overflow-x-auto min-w-0 h-full pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {files.map((file) => {
            const tabName = getTabName(file.fileName, file.seg2Data.traces.length)
            const isActive = file.id === activeFileId
            return (
              <div
                key={file.id}
                className={`flex items-center gap-1 px-2 h-6 rounded-t text-[10px] cursor-pointer flex-none select-none transition-colors ${
                  isActive
                    ? "bg-slate-800 text-slate-100 border border-b-0 border-slate-600"
                    : "bg-slate-900 text-slate-400 hover:text-slate-300 border border-transparent hover:border-slate-700"
                }`}
                onClick={() => setActiveFileId(file.id)}
              >
                <span className="truncate max-w-[120px]">{tabName}</span>
                <button
                  className="rounded hover:bg-slate-600 p-0.5 text-slate-500 hover:text-slate-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCloseTab(file.id)
                  }}
                  aria-label="Close tab"
                >
                  <X size={8} />
                </button>
              </div>
            )
          })}
        </div>

        {/* Keyboard navigation hint */}
        <span className="text-[10px] text-slate-400 pb-1 px-2 flex-none leading-none font-medium tracking-wide whitespace-nowrap">
          ← → / A D : tab
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 flex-none border-r border-slate-800 p-2 flex flex-col gap-1.5 overflow-y-auto">
          {/* Upper controls – flex-none keeps them stable regardless of ChannelGroupPanel height */}
          <div className="flex-none flex flex-col gap-1.5">
            <FileDropzone onFileLoad={handleFileLoad} />

            {/* Display Mode Toggle */}
            <div className="flex gap-1">
              <Button
                variant={displayMode === "waveform" ? "default" : "outline"}
                size="sm"
                className={`flex-1 h-6 text-[10px] gap-1 ${displayMode === "waveform" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"}`}
                onClick={() => setDisplayMode("waveform")}
              >
                <Waves size={12} />
                Waveform
              </Button>
              <Button
                variant={displayMode === "intensity" ? "default" : "outline"}
                size="sm"
                className={`flex-1 h-6 text-[10px] gap-1 ${displayMode === "intensity" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"}`}
                onClick={() => setDisplayMode("intensity")}
              >
                <Grid3X3 size={12} />
                Intensity
              </Button>
            </div>

            {error && (
              <div className="p-1.5 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
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
              agcFixedGain={agcFixedGain}
              onAgcFixedGainChange={setAgcFixedGain}
            />
          </div>

          {channelGroups.length > 0 && (
            <ChannelGroupPanel groups={channelGroups} onGroupsChange={handleChannelGroupsChange} />
          )}

          <FileInfoPanel seg2Data={seg2Data} fileName={fileName} compact />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-2 overflow-hidden flex items-center justify-center">
          <WaveformCanvas
            seg2Data={seg2Data}
            channelGroups={channelGroups}
            gainMode={gainMode}
            fixedGain={gainMode === "agc-fixed" ? agcFixedGain : fixedGain}
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
