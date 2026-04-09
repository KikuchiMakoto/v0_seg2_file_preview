// Channel group and ordering types for SEG2 viewer

export interface ChannelGroup {
  id: string
  name: string
  channels: number[] // Original channel indices (0-based)
  reversed: boolean // If true, display channels in reverse order
  visible: boolean
}

// Create default 8 groups of 12 channels each (for 96ch data)
export function createDefaultGroups(totalChannels: number = 96): ChannelGroup[] {
  const groupSize = 12
  const numGroups = Math.floor(totalChannels / groupSize)
  const groups: ChannelGroup[] = []

  for (let i = 0; i < numGroups; i++) {
    const startChannel = i * groupSize
    const channels = Array.from({ length: groupSize }, (_, j) => startChannel + j)
    groups.push({
      id: `group-${i}`,
      name: `Cable ${i + 1} (CH ${startChannel + 1}-${startChannel + groupSize})`,
      channels,
      reversed: false,
      visible: true,
    })
  }

  return groups
}

// Get ordered channel indices based on group configuration
export function getOrderedChannels(groups: ChannelGroup[]): number[] {
  const orderedChannels: number[] = []

  for (const group of groups) {
    if (!group.visible) continue

    const channels = group.reversed ? [...group.channels].reverse() : group.channels
    orderedChannels.push(...channels)
  }

  return orderedChannels
}

// Filter out extra channels (those that are remainder when divided by 48)
export function filterDisplayChannels(totalChannels: number): number[] {
  const displayableCount = Math.floor(totalChannels / 48) * 48
  return Array.from({ length: displayableCount }, (_, i) => i)
}

// Move a group from one position to another
export function reorderGroups(
  groups: ChannelGroup[],
  fromIndex: number,
  toIndex: number
): ChannelGroup[] {
  const result = [...groups]
  const [removed] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, removed)
  return result
}

// Toggle group visibility
export function toggleGroupVisibility(
  groups: ChannelGroup[],
  groupId: string
): ChannelGroup[] {
  return groups.map((group) =>
    group.id === groupId ? { ...group, visible: !group.visible } : group
  )
}

// Toggle group channel order
export function toggleGroupReversed(
  groups: ChannelGroup[],
  groupId: string
): ChannelGroup[] {
  return groups.map((group) =>
    group.id === groupId ? { ...group, reversed: !group.reversed } : group
  )
}
