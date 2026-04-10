"use client"

import { useCallback, useState } from "react"
import { Upload } from "lucide-react"

interface FileDropzoneProps {
  onFileLoad: (buffer: ArrayBuffer, fileName: string) => void
  compact?: boolean
}

export function FileDropzone({ onFileLoad, compact = false }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = e.dataTransfer.files
      if (files.length > 0) {
        const file = files[0]
        const buffer = await file.arrayBuffer()
        onFileLoad(buffer, file.name)
      }
    },
    [onFileLoad]
  )

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const file = files[0]
        const buffer = await file.arrayBuffer()
        onFileLoad(buffer, file.name)
      }
    },
    [onFileLoad]
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-lg text-center
        transition-colors cursor-pointer
        ${compact ? "p-2" : "p-6"}
        ${
          isDragging
            ? "border-blue-400 bg-blue-500/10"
            : "border-slate-600 hover:border-slate-500 bg-slate-800/50"
        }
      `}
    >
      <input
        type="file"
        accept=".seg2,.sg2,.dat"
        onChange={handleFileInput}
        className="hidden"
        id="file-input"
      />
      <label htmlFor="file-input" className="cursor-pointer flex items-center justify-center gap-2">
        <Upload
          className={`${isDragging ? "text-blue-400" : "text-slate-400"}`}
          size={compact ? 16 : 24}
        />
        <span className={`${compact ? "text-xs" : "text-sm"} text-slate-300`}>
          {compact ? "Drop SEG2 or click" : "Drop SEG2 file here or click to browse"}
        </span>
      </label>
    </div>
  )
}
