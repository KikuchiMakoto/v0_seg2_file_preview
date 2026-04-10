"use client"

import { useMemo } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Eye, EyeOff, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type ChannelGroup } from "@/lib/channel-types"

// Color palette for groups (matching waveform colors)
const GROUP_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-lime-500",
]

interface SortableGroupItemProps {
  group: ChannelGroup
  index: number
  onToggleVisibility: (id: string) => void
  onToggleReversed: (id: string) => void
}

function SortableGroupItem({
  group,
  index,
  onToggleVisibility,
  onToggleReversed,
}: SortableGroupItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const colorClass = GROUP_COLORS[index % GROUP_COLORS.length]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 p-1.5 rounded border transition-colors ${
        isDragging
          ? "bg-slate-700 border-slate-500 shadow-lg z-10"
          : "bg-slate-800 border-slate-700 hover:border-slate-600"
      } ${!group.visible ? "opacity-50" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-slate-400 hover:text-slate-200"
        aria-label="Drag to reorder"
      >
        <GripVertical size={12} />
      </button>

      <div className={`w-2 h-2 rounded-full ${colorClass}`} />

      <span className="flex-1 text-[10px] text-slate-200 truncate">
        {group.name}
      </span>

      <span className="text-[10px] text-slate-400 font-mono">
        {group.reversed ? `${group.channels[group.channels.length - 1] + 1}-${group.channels[0] + 1}` : `${group.channels[0] + 1}-${group.channels[group.channels.length - 1] + 1}`}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
        onClick={() => onToggleReversed(group.id)}
        title={group.reversed ? "Normal order" : "Reverse order"}
      >
        <ArrowUpDown size={10} />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
        onClick={() => onToggleVisibility(group.id)}
        title={group.visible ? "Hide group" : "Show group"}
      >
        {group.visible ? <Eye size={10} /> : <EyeOff size={10} />}
      </Button>
    </div>
  )
}

interface ChannelGroupPanelProps {
  groups: ChannelGroup[]
  onGroupsChange: (groups: ChannelGroup[]) => void
}

export function ChannelGroupPanel({ groups, onGroupsChange }: ChannelGroupPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const groupIds = useMemo(() => groups.map((g) => g.id), [groups])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = groups.findIndex((g) => g.id === active.id)
      const newIndex = groups.findIndex((g) => g.id === over.id)
      onGroupsChange(arrayMove(groups, oldIndex, newIndex))
    }
  }

  function handleToggleVisibility(id: string) {
    onGroupsChange(
      groups.map((g) =>
        g.id === id ? { ...g, visible: !g.visible } : g
      )
    )
  }

  function handleToggleReversed(id: string) {
    onGroupsChange(
      groups.map((g) =>
        g.id === id ? { ...g, reversed: !g.reversed } : g
      )
    )
  }

  const visibleCount = groups.filter((g) => g.visible).length
  const totalChannels = groups
    .filter((g) => g.visible)
    .reduce((sum, g) => sum + g.channels.length, 0)

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium text-slate-200">Channel Groups</h3>
        <span className="text-[10px] text-slate-400">
          {visibleCount}g / {totalChannels}ch
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {groups.map((group, index) => (
              <SortableGroupItem
                key={group.id}
                group={group}
                index={index}
                onToggleVisibility={handleToggleVisibility}
                onToggleReversed={handleToggleReversed}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-1.5 pt-1.5 border-t border-slate-700 flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-6 text-[10px] bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
          onClick={() =>
            onGroupsChange(groups.map((g) => ({ ...g, visible: true })))
          }
        >
          Show All
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-6 text-[10px] bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
          onClick={() =>
            onGroupsChange(groups.map((g) => ({ ...g, visible: false })))
          }
        >
          Hide All
        </Button>
      </div>
    </div>
  )
}
