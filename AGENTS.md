# AGENTS.md

## Project Overview
SEG2ファイルビューワー。Next.js + TypeScript + Tailwind CSS で構築されたブラウザベースのSEG2地震波形データビジュアライザー。

## Tech Stack
- **Runtime/Package Manager**: Bun (`bun install`, `bun run dev`, `bun run build`)
- **Framework**: Next.js (App Router, "use client" components)
- **UI**: Tailwind CSS + shadcn/ui components
- **Drag-and-Drop sorting**: @dnd-kit/core

## Project Structure
```
app/
  page.tsx           # Main page: state management, layout (header tabs + sidebar + canvas)
  layout.tsx         # Root layout
components/
  file-dropzone.tsx  # Drag-and-drop / file select input
  file-info-panel.tsx # File metadata card (Channels, Samples, SampleFreq, Duration, Format)
  filter-controls.tsx # Bandpass filter UI (HPF/LPF sliders)
  gain-controls.tsx  # Gain mode radio + multiplier slider
  channel-group-panel.tsx # Sortable channel group list with visibility toggle
  waveform-canvas.tsx # Canvas-based waveform / intensity renderer
  ui/                # shadcn/ui primitives
lib/
  seg2-parser.ts     # Binary SEG2 format parser
  channel-types.ts   # ChannelGroup type and createDefaultGroups()
  utils.ts           # Tailwind cn() utility
```

## Key Data Types
- `SEG2File`: `{ header: SEG2Header, traces: SEG2Trace[], sampleRate: number }`
- `SEG2Header`: includes `numberOfTraces`, `freeFormatStrings`
- `SEG2Trace`: includes `numberOfSamplesInDataBlock`, `dataFormatCode`, `data: Float32Array`
- `ChannelGroup`: `{ id, name, channels: number[], visible: boolean, reversed: boolean }`

## Multi-File State (app/page.tsx)
```
FileEntry { id, fileName, seg2Data, channelGroups }
files: FileEntry[]          -- all loaded files
activeFileId: string | null -- id of active tab
```
Channel groups are stored per file. Gain/filter settings are global.

## Commands
```bash
bun install          # Install dependencies
bun run dev          # Start dev server
bun run build        # Production build (NEXT_TELEMETRY_DISABLED=1)
bun run lint         # ESLint
```

## Conventions
- All components are "use client" (no server components besides layout)
- Dark theme: `bg-slate-950` base, `slate-900` cards, `slate-800` inputs
- Font sizes in sidebar: `text-xs` (12px) for labels, `text-[10px]` for values/secondary
- Compact mode (`compact` prop) used for sidebar panels
- Tab name format: `{baseFilename}-{traceCount}ch` (e.g., `sxgw3414-24ch`)
