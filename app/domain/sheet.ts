/** A collapsed phone sheet is 154px, or 94px once a start is set. These match the stylesheet. */
export const COLLAPSED_HEIGHT = 154
export const COLLAPSED_HEIGHT_WITH_START = 94
/** An expanded sheet sits 68px below the top and 8px above the bottom, so it is the area minus 76px. */
export const EXPANDED_INSET = 76
/** Speed in px per ms that counts as a flick. A flick decides where the sheet settles, ahead of its position. */
export const FLICK_SPEED = 0.4

/**
 * The height a sheet should have while a finger has moved dy pixels from where the drag began.
 * It follows the finger and stops at its collapsed and expanded heights.
 */
export function sheetHeight(startHeight: number, dy: number, minHeight: number, maxHeight: number): number {
  return Math.min(maxHeight, Math.max(minHeight, startHeight - dy))
}

/**
 * Where a released sheet finishes. A flick decides it, up to expand and down to collapse. Otherwise the nearer
 * state wins. Speed is positive when the finger moves down.
 */
export function sheetSettle(height: number, minHeight: number, maxHeight: number, speed: number): 'expand' | 'collapse' {
  if (speed <= -FLICK_SPEED) return 'expand'
  if (speed >= FLICK_SPEED) return 'collapse'
  return height > (minHeight + maxHeight) / 2 ? 'expand' : 'collapse'
}

/** The summary view shows only in the last SWITCH_DISTANCE px above the collapsed height. */
export const SWITCH_DISTANCE = 10

/**
 * Which view a phone sheet shows at this height. The planning view holds for most of the travel, on both opening
 * and closing. The summary shows only once the sheet is nearly at its collapsed height.
 */
export function sheetShowsExpanded(height: number, minHeight: number): boolean {
  return height > minHeight + SWITCH_DISTANCE
}

/** How far a finger must move, in px, before a touch becomes a drag. Shorter touches are taps, and the click handles them. */
export const DRAG_SLOP = 8

/** Whether a touch that has moved `moved` px vertically is a drag yet. */
export function dragBegun(moved: number): boolean {
  return Math.abs(moved) >= DRAG_SLOP
}

/** A drag that starts inside a list scrolled down scrolls the list. It does not move the sheet. */
export function sheetDragScrolls(expanded: boolean, scrollTop: number): boolean {
  return expanded && scrollTop > 0
}
