"use client"

import { useCallback, useRef } from "react"
import { Upload } from "lucide-react"

interface FileDropzoneProps {
  onFileLoad: (buffer: ArrayBuffer, fileName: string) => void
}

export function FileDropzone({ onFileLoad }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const buffer = await file.arrayBuffer()
          onFileLoad(buffer, file.name)
        }
      }
      // reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ""
    },
    [onFileLoad]
  )

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".seg2,.sg2,.dat,.ydt"
        multiple
        onChange={handleFileInput}
        className="hidden"
        id="file-input"
      />
      <label
        htmlFor="file-input"
        className="cursor-pointer flex items-center justify-center gap-1.5 w-full h-7 rounded bg-blue-600 hover:bg-blue-700 transition-colors text-xs font-medium text-white select-none"
      >
        <Upload size={13} />
        Upload File
      </label>
    </>
  )
}
