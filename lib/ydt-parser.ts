// KEYENCE NR-X100 YDT (binary) File Format Parser
// Reference: key_parser.py (reverse-engineered binary format)

import type { SEG2File, SEG2Header, SEG2Trace } from "./seg2-parser"

const GROUP_HEADER_SIZE = 72

export class YDTParser {
  private buffer: ArrayBuffer
  private view: DataView
  private bytes: Uint8Array

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer
    this.view = new DataView(buffer)
    this.bytes = new Uint8Array(buffer)
  }

  private readUint32(offset: number): number {
    return this.view.getUint32(offset, true)
  }

  private readUtf16LE(offset: number, maxChars: number = 64): string {
    const chars: string[] = []
    let i = offset
    while (i + 1 < this.buffer.byteLength && chars.length < maxChars) {
      const ch = this.view.getUint16(i, true)
      if (ch === 0) break
      chars.push(String.fromCharCode(ch))
      i += 2
    }
    return chars.join("")
  }

  private findFirstGroupHeader(searchStart: number): number {
    const target = new Uint8Array([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0])
    let idx = searchStart
    while (idx < this.buffer.byteLength - 12) {
      let found = true
      for (let i = 0; i < 12; i++) {
        if (this.bytes[idx + i] !== target[i]) {
          found = false
          break
        }
      }
      if (!found) {
        idx++
        continue
      }
      if (idx < 60) {
        idx++
        continue
      }
      const hdrStart = idx - 60
      if (hdrStart < searchStart) {
        idx++
        continue
      }
      const numPts = this.readUint32(hdrStart + 44)
      const chPerGrp = this.readUint32(hdrStart + 48)
      if (chPerGrp >= 1 && chPerGrp <= 64 && numPts >= 1 && numPts <= 10000000) {
        return hdrStart
      }
      idx++
    }
    throw new Error("Could not locate group header in YDT data")
  }

  private parseGroupHeader(offset: number) {
    return {
      recordId: this.readUint32(offset),
      headerSize: this.readUint32(offset + 4),
      samplingParam: this.readUint32(offset + 40),
      numPoints: this.readUint32(offset + 44),
      chPerGroup: this.readUint32(offset + 48),
      chIndices: [
        this.readUint32(offset + 60),
        this.readUint32(offset + 64),
        this.readUint32(offset + 68),
      ],
    }
  }

  private scanUtf16Names(start: number, end: number, pattern: string): string[] {
    const names: string[] = []
    const patBytes: number[] = []
    for (let i = 0; i < pattern.length; i++) {
      const code = pattern.charCodeAt(i)
      patBytes.push(code & 0xff, (code >> 8) & 0xff)
    }
    let i = start
    while (i < end - patBytes.length) {
      let match = true
      for (let j = 0; j < patBytes.length; j++) {
        if (this.bytes[i + j] !== patBytes[j]) {
          match = false
          break
        }
      }
      if (match) {
        const name = this.readUtf16LE(i, 32)
        if (name.length >= 3) names.push(name)
        i += patBytes.length
      } else {
        i += 2
      }
    }
    return names
  }

  private extractMetadata(ciEnd: number, numChannels: number) {
    const meta: {
      sampleIntervalUs: number
      channelNames: string[]
      units: string[]
    } = {
      sampleIntervalUs: 10.0,
      channelNames: [],
      units: [],
    }

    const searchLimit = Math.min(ciEnd + 10000, this.buffer.byteLength - 4)
    for (let off = ciEnd; off < searchLimit; off += 4) {
      if (this.readUint32(off) !== 3) continue

      const rawInt = this.readUint32(off + 20)
      const base = rawInt & 0xffff
      meta.sampleIntervalUs = base

      const p1 = this.readUint32(off + 4)
      let uOff = off + p1
      for (let ch = 0; ch < numChannels; ch++) {
        if (uOff + 28 > this.buffer.byteLength) break
        const tag = this.readUint32(uOff)
        if (tag === 0x00040005) {
          uOff += 28
        } else if (tag === 0) {
          uOff += 28
        } else {
          break
        }
      }
      break
    }

    const nameSearchEnd = Math.min(ciEnd + 50000, this.buffer.byteLength)
    const chNames = this.scanUtf16Names(ciEnd, nameSearchEnd, "Ch")
    if (chNames.length >= numChannels) {
      meta.channelNames = chNames.slice(0, numChannels)
    } else {
      meta.channelNames = Array.from({ length: numChannels }, (_, i) => `CH${i + 1}`)
    }

    let unitStr = ""
    const patterns = ["m/s^2", "g", "m/s"]
    for (const pat of patterns) {
      const patBytes = new TextEncoder().encode(pat)
      let found = false
      for (let i = ciEnd; i < nameSearchEnd - patBytes.length; i++) {
        let match = true
        for (let j = 0; j < patBytes.length; j++) {
          if (this.bytes[i + j] !== patBytes[j]) {
            match = false
            break
          }
        }
        if (match) {
          unitStr = pat
          found = true
          break
        }
      }
      if (found) break
    }
    meta.units = Array(numChannels).fill(unitStr)

    return meta
  }

  public parse(): SEG2File {
    const ciOffset = this.readUint32(0x20)
    const ciSize = this.readUint32(0x24)
    const numPoints = this.readUint32(0x58)
    const ciEnd = 0x1c + ciOffset + ciSize

    const firstGh = this.findFirstGroupHeader(ciEnd)
    const firstGhInfo = this.parseGroupHeader(firstGh)

    const groupArrays: Float32Array[] = []
    const groupChCounts: number[] = []
    let offset = firstGh

    while (offset + GROUP_HEADER_SIZE < this.buffer.byteLength) {
      const gh = this.parseGroupHeader(offset)
      const nPts = gh.numPoints
      const nCh = gh.chPerGroup
      const dataStart = offset + GROUP_HEADER_SIZE
      const dataBytes = nCh * nPts * 4

      if (dataStart + dataBytes > this.buffer.byteLength) break

      const interleaved = new Float32Array(
        this.buffer.slice(dataStart, dataStart + dataBytes)
      )

      groupArrays.push(interleaved)
      groupChCounts.push(nCh)

      offset = dataStart + dataBytes

      if (offset + GROUP_HEADER_SIZE > this.buffer.byteLength) break
      const nextGh = this.parseGroupHeader(offset)
      if (nextGh.numPoints !== nPts) break
    }

    const totalCh = groupChCounts.reduce((a, b) => a + b, 0)

    const meta = this.extractMetadata(ciEnd, totalCh)

    const traces: SEG2Trace[] = []
    for (let g = 0; g < groupArrays.length; g++) {
      const interleaved = groupArrays[g]
      const nPts = numPoints
      const nCh = groupChCounts[g]
      const chBase = traces.length

      for (let ch = 0; ch < nCh; ch++) {
        const channelData = new Float32Array(nPts)
        for (let s = 0; s < nPts; s++) {
          channelData[s] = interleaved[s * nCh + ch]
        }
        traces.push({
          traceDescriptorBlockId: 0,
          sizeOfBlock: 0,
          sizeOfDataBlock: nPts * 4,
          numberOfSamplesInDataBlock: nPts,
          dataFormatCode: 4,
          freeFormatStrings: {
            CHANNEL_NAME: meta.channelNames[chBase + ch] || `CH${chBase + ch + 1}`,
            UNIT: meta.units[chBase + ch] || "",
          },
          data: channelData,
        })
      }
    }

    const sampleRate = meta.sampleIntervalUs > 0
      ? Math.round(1000000 / meta.sampleIntervalUs)
      : 100000

    const header: SEG2Header = {
      fileDescriptorBlockId: 0,
      revisionNumber: 0,
      sizeOfTracePointerSubBlock: 0,
      numberOfTraces: traces.length,
      sizeOfStringTerminator: 0,
      stringTerminator: "\0",
      lineTerminator: "\n",
      freeFormatStrings: {
        FORMAT: "YDT",
        NUM_CHANNELS: String(totalCh),
        NUM_POINTS: String(numPoints),
        SAMPLE_INTERVAL_US: String(meta.sampleIntervalUs),
        CHANNELS_PER_GROUP: String(firstGhInfo.chPerGroup),
        GROUP_HEADER_SIZE: String(firstGhInfo.headerSize),
        RECORD_ID: String(firstGhInfo.recordId),
        CHANNEL_INDICES: firstGhInfo.chIndices.join(","),
      },
    }

    return { header, traces, sampleRate }
  }
}

export function parseYDT(buffer: ArrayBuffer): SEG2File {
  const parser = new YDTParser(buffer)
  return parser.parse()
}

export function isYDTFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 16) return false
  const view = new DataView(buffer)
  const magic = [
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
    view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7),
  ]
  const expected = [0x4e, 0x52, 0x58] // "NRX"
  return expected.every((b, i) => magic[i] === b)
}
