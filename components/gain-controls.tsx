"use client"

import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { GainMode } from "@/lib/seg2-parser"

interface GainControlsProps {
  gainMode: GainMode
  onGainModeChange: (mode: GainMode) => void
  fixedGain: number
  onFixedGainChange: (gain: number) => void
  agcFixedGain: number
  onAgcFixedGainChange: (gain: number) => void
}

export function GainControls({
  gainMode,
  onGainModeChange,
  fixedGain,
  onFixedGainChange,
  agcFixedGain,
  onAgcFixedGainChange,
}: GainControlsProps) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 p-2">
      <h3 className="text-xs font-medium text-slate-200 mb-1.5">Gain Control</h3>

      <RadioGroup
        value={gainMode}
        onValueChange={(value) => onGainModeChange(value as GainMode)}
        className="flex flex-col gap-1"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="agc"
            id="agc"
            className="border-slate-500 text-blue-500 h-3 w-3"
          />
          <Label
            htmlFor="agc"
            className="text-xs text-slate-300 cursor-pointer"
          >
            AGC (normalize per trace)
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="fixed"
            id="fixed"
            className="border-slate-500 text-blue-500 h-3 w-3"
          />
          <Label
            htmlFor="fixed"
            className="text-xs text-slate-300 cursor-pointer"
          >
            Fixed multiplier
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <RadioGroupItem
            value="agc-fixed"
            id="agc-fixed"
            className="border-slate-500 text-blue-500 h-3 w-3"
          />
          <Label
            htmlFor="agc-fixed"
            className="text-xs text-slate-300 cursor-pointer"
          >
            AGC + multiplier
          </Label>
        </div>
      </RadioGroup>

      {gainMode === "agc-fixed" && (
        <div className="mt-2 pt-1.5 border-t border-slate-700">
          <div className="flex items-center justify-between mb-0.5">
            <Label className="text-xs text-slate-400">Multiplier</Label>
            <span className="text-xs font-mono text-blue-400">
              x{agcFixedGain}
            </span>
          </div>
          <Slider
            value={[agcFixedGain]}
            onValueChange={([value]) => onAgcFixedGainChange(value)}
            min={1}
            max={100}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-slate-500">x1</span>
            <span className="text-[10px] text-slate-500">x100</span>
          </div>
        </div>
      )}

      {gainMode === "fixed" && (
        <div className="mt-2 pt-1.5 border-t border-slate-700">
          <div className="flex items-center justify-between mb-0.5">
            <Label className="text-xs text-slate-400">Multiplier</Label>
            <span className="text-xs font-mono text-blue-400">
              x{(fixedGain / 1000).toFixed(0)}k
            </span>
          </div>
          <Slider
            value={[fixedGain]}
            onValueChange={([value]) => onFixedGainChange(value)}
            min={1000}
            max={100000}
            step={1000}
            className="w-full"
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-slate-500">x1k</span>
            <span className="text-[10px] text-slate-500">x100k</span>
          </div>
        </div>
      )}
    </div>
  )
}
