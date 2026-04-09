"use client"

import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FilterSettings } from "@/lib/seg2-parser"

interface FilterControlsProps {
  settings: FilterSettings
  onSettingsChange: (settings: FilterSettings) => void
  sampleRate: number
}

export function FilterControls({
  settings,
  onSettingsChange,
  sampleRate,
}: FilterControlsProps) {
  const nyquist = sampleRate / 2
  const maxLowpass = Math.min(1000, nyquist * 0.9)
  const maxHighpass = Math.min(100, nyquist * 0.5)

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-200">Bandpass Filter</h3>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) =>
            onSettingsChange({ ...settings, enabled })
          }
        />
      </div>

      <div className={settings.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-slate-400">HPF (High-pass)</Label>
            <span className="text-xs font-mono text-blue-400">{settings.highpassHz} Hz</span>
          </div>
          <Slider
            value={[settings.highpassHz]}
            onValueChange={([value]) =>
              onSettingsChange({ ...settings, highpassHz: value })
            }
            min={1}
            max={maxHighpass}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-slate-500">1 Hz</span>
            <span className="text-[10px] text-slate-500">{maxHighpass} Hz</span>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-slate-400">LPF (Low-pass)</Label>
            <span className="text-xs font-mono text-blue-400">{settings.lowpassHz} Hz</span>
          </div>
          <Slider
            value={[settings.lowpassHz]}
            onValueChange={([value]) =>
              onSettingsChange({ ...settings, lowpassHz: value })
            }
            min={10}
            max={maxLowpass}
            step={10}
            className="w-full"
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-slate-500">10 Hz</span>
            <span className="text-[10px] text-slate-500">{maxLowpass} Hz</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-slate-400">Filter Order</Label>
          </div>
          <Select
            value={settings.order.toString()}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, order: parseInt(value) })
            }
          >
            <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">2nd order (gentle)</SelectItem>
              <SelectItem value="2">4th order (standard)</SelectItem>
              <SelectItem value="3">6th order (steep)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
