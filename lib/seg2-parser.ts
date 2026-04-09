// SEG2 File Format Parser
// Reference: SEG-2 Revision 1 specification (1990)

export interface SEG2Header {
  fileDescriptorBlockId: number
  revisionNumber: number
  sizeOfTracePointerSubBlock: number
  numberOfTraces: number
  sizeOfStringTerminator: number
  stringTerminator: string
  lineTerminator: string
  freeFormatStrings: Record<string, string>
}

export interface SEG2Trace {
  traceDescriptorBlockId: number
  sizeOfBlock: number
  sizeOfDataBlock: number
  numberOfSamplesInDataBlock: number
  dataFormatCode: number
  freeFormatStrings: Record<string, string>
  data: Float32Array
}

export interface SEG2File {
  header: SEG2Header
  traces: SEG2Trace[]
  sampleRate: number
}

export class SEG2Parser {
  private buffer: ArrayBuffer
  private view: DataView
  private littleEndian: boolean = true
  public debug: { [key: string]: unknown } = {}

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer
    this.view = new DataView(buffer)
    this.detectEndianness()
  }

  public hexdump(start: number, length: number): string {
    const bytes: string[] = []
    for (let i = start; i < Math.min(start + length, this.buffer.byteLength); i += 16) {
      const line: string[] = []
      line.push(i.toString(16).padStart(8, "0") + "  ")
      for (let j = 0; j < 16; j++) {
        if (i + j < this.buffer.byteLength) {
          const b = this.view.getUint8(i + j)
          line.push(b.toString(16).padStart(2, "0") + " ")
        } else {
          line.push("   ")
        }
        if (j === 7) line.push(" ")
      }
      line.push(" |")
      for (let j = 0; j < 16 && i + j < this.buffer.byteLength; j++) {
        const b = this.view.getUint8(i + j)
        line.push(b >= 32 && b < 127 ? String.fromCharCode(b) : ".")
      }
      line.push("|")
      bytes.push(line.join(""))
    }
    return bytes.join("\n")
  }

  private detectEndianness(): void {
    const magic = this.view.getUint16(0, true)
    if (magic === 0x3a55) {
      this.littleEndian = true
    } else if (magic === 0x553a) {
      this.littleEndian = false
    } else {
      throw new Error(`Invalid SEG2 file: unexpected magic number 0x${magic.toString(16)}`)
    }
  }

  private readUint16(offset: number): number {
    return this.view.getUint16(offset, this.littleEndian)
  }

  private readUint32(offset: number): number {
    return this.view.getUint32(offset, this.littleEndian)
  }

  private readInt16(offset: number): number {
    return this.view.getInt16(offset, this.littleEndian)
  }

  private readInt32(offset: number): number {
    return this.view.getInt32(offset, this.littleEndian)
  }

  private readFloat32(offset: number): number {
    return this.view.getFloat32(offset, this.littleEndian)
  }

  private readFloat64(offset: number): number {
    return this.view.getFloat64(offset, this.littleEndian)
  }

  private readString(offset: number, length: number): string {
    const bytes = new Uint8Array(this.buffer, offset, length)
    let str = ""
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) break
      str += String.fromCharCode(bytes[i])
    }
    return str.trim()
  }

  private parseFreeFormatStrings(
    offset: number,
    endOffset: number,
  ): Record<string, string> {
    const result: Record<string, string> = {}
    
    // Python implementation: split by null byte, decode each segment
    const length = Math.min(endOffset - offset, this.buffer.byteLength - offset)
    if (length <= 0) return result
    
    const bytes = new Uint8Array(this.buffer, offset, length)
    
    let currentData: number[] = []
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) {
        if (currentData.length > 1) {
          try {
            // Filter out non-printable ASCII (< 0x20 except common whitespace)
            const filtered = currentData.filter(b => b >= 0x20 && b < 0x7F)
            if (filtered.length > 1) {
              const str = new TextDecoder('ascii').decode(new Uint8Array(filtered)).trim()
              if (str.length > 0) {
                const eqIndex = str.indexOf("=")
                const spaceIndex = str.indexOf(" ")
                
                if (eqIndex > 0) {
                  const key = str.substring(0, eqIndex).trim()
                  const value = str.substring(eqIndex + 1).trim()
                  if (key.length > 0) result[key] = value
                } else if (spaceIndex > 0) {
                  const key = str.substring(0, spaceIndex).trim()
                  const value = str.substring(spaceIndex + 1).trim()
                  if (key.length > 0) result[key] = value
                }
              }
            }
          } catch {
            // Skip invalid strings
          }
        }
        currentData = []
      } else {
        currentData.push(bytes[i])
      }
    }

    return result
  }

  public parse(): SEG2File {
    const fileDescriptorBlockId = this.readUint16(0)
    const revisionNumber = this.readUint16(2)
    const sizeOfTracePointerSubBlock = this.readUint16(4)
    const numberOfTraces = this.readUint16(6)

    const sizeOfStringTerminator = this.view.getUint8(8)
    const stringTerminatorByte1 = this.view.getUint8(9)
    const stringTerminatorByte2 = this.view.getUint8(10)
    const lineTerminatorByte1 = this.view.getUint8(11)
    const lineTerminatorByte2 = this.view.getUint8(12)

    const stringTerminator =
      String.fromCharCode(stringTerminatorByte1) + (sizeOfStringTerminator > 1 ? String.fromCharCode(stringTerminatorByte2) : "")
    const lineTerminator = String.fromCharCode(lineTerminatorByte1) + String.fromCharCode(lineTerminatorByte2)

    this.debug = {
      fileDescriptorBlockId: `0x${fileDescriptorBlockId.toString(16)}`,
      revisionNumber,
      sizeOfTracePointerSubBlock,
      numberOfTraces,
      sizeOfStringTerminator,
      stringTerminatorCharCodes: [stringTerminatorByte1, stringTerminatorByte2],
      lineTerminatorCharCodes: [lineTerminatorByte1, lineTerminatorByte2],
      littleEndian: this.littleEndian,
      fileSize: this.buffer.byteLength,
    }

    const tracePointers: number[] = []
    for (let i = 0; i < numberOfTraces; i++) {
      const pointerOffset = 32 + i * 4
      const ptr = this.readUint32(pointerOffset)
      tracePointers.push(ptr)
    }

    this.debug.tracePointers = tracePointers

    const freeFormatOffset = 32 + sizeOfTracePointerSubBlock
    const freeFormatEnd = tracePointers[0] || this.buffer.byteLength
    const headerFreeFormatStrings = this.parseFreeFormatStrings(freeFormatOffset, freeFormatEnd)

    this.debug.headerFreeFormatStrings = headerFreeFormatStrings

    const header: SEG2Header = {
      fileDescriptorBlockId,
      revisionNumber,
      sizeOfTracePointerSubBlock,
      numberOfTraces,
      sizeOfStringTerminator,
      stringTerminator,
      lineTerminator,
      freeFormatStrings: headerFreeFormatStrings,
    }

    const traces: SEG2Trace[] = []
    for (let i = 0; i < numberOfTraces; i++) {
      const traceOffset = tracePointers[i]
      this.debug[`trace${i}_offset`] = traceOffset
      const trace = this.parseTrace(traceOffset)
      traces.push(trace)
    }

    this.debug.traces = traces.map((t, i) => ({
      index: i,
      samples: t.data.length,
      formatCode: t.dataFormatCode,
      dataOffset: this.debug[`trace${i}_offset`] + (t as unknown as { sizeOfBlock: number }).sizeOfBlock,
    }))

    // Extract sample rate from first trace - Python uses 1.0/interval
    let sampleRate = 1000 // default 1000 Hz
    
    // Check all free format strings from first trace
    const firstTraceStrings = traces[0]?.freeFormatStrings || {}
    this.debug.firstTraceStrings = firstTraceStrings
    
    // Look for SAMPLE_INTERVAL
    const sampleIntervalStr = firstTraceStrings["SAMPLE_INTERVAL"]
    if (sampleIntervalStr) {
      const interval = parseFloat(sampleIntervalStr)
      if (interval > 0) {
        sampleRate = Math.round(1.0 / interval)
      }
    }
    
    // Also check for common variations
    if (sampleRate === 1000 || sampleRate === 0) {
      // Try SI (alias)
      const siStr = firstTraceStrings["SI"]
      if (siStr) {
        const interval = parseFloat(siStr)
        if (interval > 0) {
          sampleRate = Math.round(1.0 / interval)
        }
      }
    }

    this.debug.sampleRate = sampleRate
    return { header, traces, sampleRate }
  }

  private parseTrace(offset: number): SEG2Trace {
    if (offset < 0 || offset + 32 > this.buffer.byteLength) {
      throw new Error(`Invalid trace offset: ${offset}`)
    }

    const traceDescriptorBlockId = this.readUint16(offset)
    const sizeOfBlock = this.readUint16(offset + 2)
    const sizeOfDataBlock = this.readUint32(offset + 4)
    const numberOfSamplesInDataBlock = this.readUint32(offset + 8)
    const dataFormatCode = this.view.getUint8(offset + 12)

    const freeFormatOffset = offset + 32
    const dataOffset = offset + sizeOfBlock
    const traceFreeFormatStrings = this.parseFreeFormatStrings(freeFormatOffset, dataOffset)

    this.debug.lastTraceParsed = {
      offset,
      traceDescriptorBlockId: `0x${traceDescriptorBlockId.toString(16)}`,
      sizeOfBlock,
      sizeOfDataBlock,
      numberOfSamplesInDataBlock,
      dataFormatCode,
      dataOffset,
      freeFormatStrings: traceFreeFormatStrings,
    }

    const data = this.parseTraceData(dataOffset, numberOfSamplesInDataBlock, dataFormatCode)

    return {
      traceDescriptorBlockId,
      sizeOfBlock,
      sizeOfDataBlock,
      numberOfSamplesInDataBlock,
      dataFormatCode,
      freeFormatStrings: traceFreeFormatStrings,
      data,
    }
  }

  private parseTraceData(offset: number, numSamples: number, formatCode: number): Float32Array {
    const result = new Float32Array(numSamples)

    switch (formatCode) {
      case 1: // 16-bit signed integer - normalize to [-1, 1]
        for (let i = 0; i < numSamples; i++) {
          result[i] = this.readInt16(offset + i * 2) / 32768
        }
        break

      case 2: // 32-bit signed integer - normalize to [-1, 1]
        for (let i = 0; i < numSamples; i++) {
          result[i] = this.readInt32(offset + i * 4) / 2147483648
        }
        break

      case 3: // 20-bit or 24-bit integer (packed in 3 bytes) - normalize to [-1, 1]
        for (let i = 0; i < numSamples; i++) {
          const byteOffset = offset + i * 3
          const b0 = this.view.getUint8(byteOffset)
          const b1 = this.view.getUint8(byteOffset + 1)
          const b2 = this.view.getUint8(byteOffset + 2)
          let value: number
          if (this.littleEndian) {
            value = b0 | (b1 << 8) | (b2 << 16)
          } else {
            value = (b0 << 16) | (b1 << 8) | b2
          }
          // Sign extend from 24-bit
          if (value & 0x800000) {
            value |= 0xff000000
          }
          result[i] = value / 8388608 // 2^23
        }
        break

      case 4: // 32-bit IEEE floating point (already normalized or raw voltage)
        for (let i = 0; i < numSamples; i++) {
          result[i] = this.readFloat32(offset + i * 4)
        }
        break

      case 5: // 64-bit IEEE floating point
        for (let i = 0; i < numSamples; i++) {
          result[i] = this.readFloat64(offset + i * 8)
        }
        break

      default:
        throw new Error(`Unsupported data format code: ${formatCode}`)
    }

    return result
  }
}

export function parseSEG2(buffer: ArrayBuffer): SEG2File {
  const parser = new SEG2Parser(buffer)
  return parser.parse()
}

// AGC normalization - normalizes each trace to [-1, 1]
export function applyAGC(data: Float32Array): Float32Array {
  const maxAbs = data.reduce((max, val) => Math.max(max, Math.abs(val)), 0)
  if (maxAbs === 0) return data

  const result = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] / maxAbs
  }
  return result
}

export function applyGain(data: Float32Array, gain: number): Float32Array {
  const result = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] * gain
  }
  return result
}

export function applyAGCWithGain(data: Float32Array, gain: number): Float32Array {
  const normalized = applyAGC(data)
  return applyGain(normalized, gain)
}

export function clipData(data: Float32Array, clipValue: number = 1): Float32Array {
  const result = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = Math.max(-clipValue, Math.min(clipValue, data[i]))
  }
  return result
}

export type GainMode = "agc" | "fixed" | "agc-fixed"

export function processTraceData(
  data: Float32Array,
  gainMode: GainMode,
  fixedGain: number = 1
): Float32Array {
  let processed: Float32Array

  switch (gainMode) {
    case "agc":
      processed = applyAGC(data)
      break
    case "fixed":
      processed = applyGain(data, fixedGain)
      break
    case "agc-fixed":
      processed = applyAGCWithGain(data, fixedGain)
      break
    default:
      processed = data
  }

  return clipData(processed)
}

// ============================================
// Bandpass Filter Implementation (filtfilt-style)
// ============================================

interface BiquadCoeffs {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

// Design a 2nd-order Butterworth low-pass filter
function designLowpass(cutoffHz: number, sampleRate: number): BiquadCoeffs {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate
  const sinOmega = Math.sin(omega)
  const cosOmega = Math.cos(omega)
  const alpha = sinOmega / Math.sqrt(2) // Q = 1/sqrt(2) for Butterworth

  const a0 = 1 + alpha
  const b0 = ((1 - cosOmega) / 2) / a0
  const b1 = (1 - cosOmega) / a0
  const b2 = ((1 - cosOmega) / 2) / a0
  const a1 = (-2 * cosOmega) / a0
  const a2 = (1 - alpha) / a0

  return { b0, b1, b2, a1, a2 }
}

// Design a 2nd-order Butterworth high-pass filter
function designHighpass(cutoffHz: number, sampleRate: number): BiquadCoeffs {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate
  const sinOmega = Math.sin(omega)
  const cosOmega = Math.cos(omega)
  const alpha = sinOmega / Math.sqrt(2)

  const a0 = 1 + alpha
  const b0 = ((1 + cosOmega) / 2) / a0
  const b1 = (-(1 + cosOmega)) / a0
  const b2 = ((1 + cosOmega) / 2) / a0
  const a1 = (-2 * cosOmega) / a0
  const a2 = (1 - alpha) / a0

  return { b0, b1, b2, a1, a2 }
}

// Apply biquad filter (single direction)
function applyBiquad(data: Float32Array, coeffs: BiquadCoeffs): Float32Array {
  const { b0, b1, b2, a1, a2 } = coeffs
  const result = new Float32Array(data.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0

  for (let i = 0; i < data.length; i++) {
    const x = data[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    result[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }

  return result
}

// Reverse array in place
function reverseArray(data: Float32Array): Float32Array {
  const result = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[data.length - 1 - i]
  }
  return result
}

// Apply filter forward and backward (zero-phase filtering like filtfilt)
function filtfilt(data: Float32Array, coeffs: BiquadCoeffs): Float32Array {
  // Forward pass
  let filtered = applyBiquad(data, coeffs)
  // Reverse
  filtered = reverseArray(filtered)
  // Backward pass
  filtered = applyBiquad(filtered, coeffs)
  // Reverse again
  return reverseArray(filtered)
}

// Cascade multiple biquad sections for higher order
function cascadeFiltfilt(data: Float32Array, coeffsList: BiquadCoeffs[]): Float32Array {
  let result = data
  for (const coeffs of coeffsList) {
    result = filtfilt(result, coeffs)
  }
  return result
}

export interface FilterSettings {
  enabled: boolean
  highpassHz: number
  lowpassHz: number
  order: number // 1, 2, or 3 (each is 2nd order section, so order 2 = 4th order total)
}

export function applyBandpassFilter(
  data: Float32Array,
  sampleRate: number,
  settings: FilterSettings
): Float32Array {
  if (!settings.enabled) return data

  const nyquist = sampleRate / 2

  // Clamp frequencies to valid range
  const hpFreq = Math.min(settings.highpassHz, nyquist * 0.9)
  const lpFreq = Math.min(settings.lowpassHz, nyquist * 0.9)

  // Build filter sections based on order
  const hpCoeffs: BiquadCoeffs[] = []
  const lpCoeffs: BiquadCoeffs[] = []

  for (let i = 0; i < settings.order; i++) {
    hpCoeffs.push(designHighpass(hpFreq, sampleRate))
    lpCoeffs.push(designLowpass(lpFreq, sampleRate))
  }

  // Apply highpass then lowpass (cascaded filtfilt)
  let result = cascadeFiltfilt(data, hpCoeffs)
  result = cascadeFiltfilt(result, lpCoeffs)

  return result
}
