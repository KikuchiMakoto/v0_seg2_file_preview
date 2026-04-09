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
}

export function GainControls({
  gainMode,
  onGainModeChange,
  fixedGain,
  onFixedGainChange,
}: GainControlsProps) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
      <h3 className="text-xs font-medium text-slate-200 mb-2">Gain Control</h3>

      <RadioGroup
        value={gainMode}
        onValueChange={(value) => onGainModeChange(value as GainMode)}
        className="flex flex-col gap-2"
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

      {(gainMode === "fixed" || gainMode === "agc-fixed") && (
        <div className="mt-3 pt-2 border-t border-slate-700">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-slate-400">Multiplier</Label>
            <span className="text-xs font-mono text-blue-400">
              x{fixedGain.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[fixedGain]}
            onValueChange={([value]) => onFixedGainChange(value)}
            min={0.1}
            max={10}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-slate-500">0.1x</span>
            <span className="text-[10px] text-slate-500">10x</span>
          </div>
        </div>
      )}
    </div>
  )
}
