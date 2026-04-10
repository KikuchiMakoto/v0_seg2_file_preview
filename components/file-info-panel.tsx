"use client"

import type { SEG2File } from "@/lib/seg2-parser"

interface FileInfoPanelProps {
  seg2Data: SEG2File | null
  fileName: string | null
  compact?: boolean
}

export function FileInfoPanel({ seg2Data, fileName, compact = false }: FileInfoPanelProps) {
  if (!seg2Data || !fileName) {
    return null
  }

  const header = seg2Data.header
  const firstTrace = seg2Data.traces[0]
  const numSamples = firstTrace?.numberOfSamplesInDataBlock || 0
  const totalTime = numSamples / seg2Data.sampleRate

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 p-2">
      <h3 className="text-xs font-medium text-slate-200 mb-1.5">File Info</h3>

      <dl className={`flex flex-col ${compact ? "gap-0.5 text-xs" : "gap-2 text-sm"}`}>
        <div className="flex justify-between">
          <dt className="text-slate-400">Channel</dt>
          <dd className="text-slate-200 font-mono">{header.numberOfTraces}</dd>
        </div>

        <div className="flex justify-between">
          <dt className="text-slate-400">SampleFreq</dt>
          <dd className="text-slate-200 font-mono">{seg2Data.sampleRate.toFixed(0)} Hz</dd>
        </div>

        <div className="flex justify-between">
          <dt className="text-slate-400">Samples</dt>
          <dd className="text-slate-200 font-mono">{numSamples}</dd>
        </div>

        <div className="flex justify-between">
          <dt className="text-slate-400">Duration</dt>
          <dd className="text-slate-200 font-mono">
            {totalTime > 0 ? `${totalTime.toFixed(3)} s` : "N/A"}
          </dd>
        </div>

        <div className="flex justify-between">
          <dt className="text-slate-400">Format</dt>
          <dd className="text-slate-200 font-mono">
            {getDataFormatName(firstTrace?.dataFormatCode || 0)}
          </dd>
        </div>
      </dl>

      {Object.keys(header.freeFormatStrings).length > 0 && (
        <details className="mt-1.5">
          <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">
            Metadata ({Object.keys(header.freeFormatStrings).length})
          </summary>
          <div className="mt-1 p-1.5 bg-slate-800 rounded text-[10px] font-mono max-h-24 overflow-auto">
            {Object.entries(header.freeFormatStrings).map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <span className="text-blue-400">{key}:</span>
                <span className="text-slate-300">{value}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function getDataFormatName(code: number): string {
  switch (code) {
    case 1:
      return "Int16"
    case 2:
      return "Int32"
    case 3:
      return "Int24"
    case 4:
      return "Float32"
    case 5:
      return "Float64"
    default:
      return `Unknown (${code})`
  }
}
