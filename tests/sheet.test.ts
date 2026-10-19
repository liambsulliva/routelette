import { describe, expect, it } from 'vitest'
import { DRAG_SLOP, FLICK_SPEED, SWITCH_DISTANCE, dragBegun, sheetDragScrolls, sheetHeight, sheetSettle, sheetShowsExpanded } from '../app/domain/sheet'

const MIN = 154
const MAX = 700

describe('phone sheet touch start', () => {
  it('treats a touch that has not moved as a tap, which leaves the sheet alone', () => {
    expect(dragBegun(0)).toBe(false)
    expect(dragBegun(DRAG_SLOP - 1)).toBe(false)
    expect(dragBegun(-(DRAG_SLOP - 1))).toBe(false)
  })

  it('starts a drag once the finger has moved past the slop, in either direction', () => {
    expect(dragBegun(DRAG_SLOP)).toBe(true)
    expect(dragBegun(-DRAG_SLOP)).toBe(true)
  })
})

describe('phone sheet view', () => {
  it('shows the summary only when the sheet is within SWITCH_DISTANCE of its collapsed height', () => {
    expect(sheetShowsExpanded(MIN, MIN)).toBe(false)
    expect(sheetShowsExpanded(MIN + SWITCH_DISTANCE, MIN)).toBe(false)
    expect(sheetShowsExpanded(MIN + SWITCH_DISTANCE + 1, MIN)).toBe(true)
  })

  it('shows the planning view through most of an opening, so it appears as soon as the finger moves', () => {
    for (const height of [MIN + 20, MIN + 100, MIN + 300, MAX]) expect(sheetShowsExpanded(height, MIN)).toBe(true)
  })

  it('shows the planning view through most of a closing, and gives way only at a very low height', () => {
    for (const height of [MAX, MAX - 200, MIN + 300, MIN + 20]) expect(sheetShowsExpanded(height, MIN)).toBe(true)
    expect(sheetShowsExpanded(MIN + 5, MIN)).toBe(false)
  })
})

describe('phone sheet drag', () => {
  it('follows the finger upward, taller, as the finger rises', () => {
    expect(sheetHeight(MIN, -100, MIN, MAX)).toBe(MIN + 100)
    expect(sheetHeight(MIN, -300, MIN, MAX)).toBe(MIN + 300)
  })

  it('follows the finger downward, shorter, as the finger falls', () => {
    expect(sheetHeight(MAX, 120, MIN, MAX)).toBe(MAX - 120)
  })

  it('stops at its collapsed and expanded heights, however far the finger goes', () => {
    expect(sheetHeight(MIN, -5000, MIN, MAX)).toBe(MAX)
    expect(sheetHeight(MAX, 5000, MIN, MAX)).toBe(MIN)
  })

  it('settles on the nearer state when the release is slow', () => {
    expect(sheetSettle(MIN + 0.6 * (MAX - MIN), MIN, MAX, 0)).toBe('expand')
    expect(sheetSettle(MIN + 0.4 * (MAX - MIN), MIN, MAX, 0)).toBe('collapse')
  })

  it('lets a fast flick decide, even when the sheet is nearer the other state', () => {
    expect(sheetSettle(MIN + 0.2 * (MAX - MIN), MIN, MAX, -FLICK_SPEED)).toBe('expand')
    expect(sheetSettle(MAX - 0.2 * (MAX - MIN), MIN, MAX, FLICK_SPEED)).toBe('collapse')
  })

  it('does not treat a slow move as a flick', () => {
    expect(sheetSettle(MIN + 0.2 * (MAX - MIN), MIN, MAX, -FLICK_SPEED / 2)).toBe('collapse')
  })

  it('scrolls a list that is scrolled down, rather than dragging the sheet', () => {
    expect(sheetDragScrolls(true, 40)).toBe(true)
  })

  it('drags the sheet when the list is at the top, or when the sheet is collapsed', () => {
    expect(sheetDragScrolls(true, 0)).toBe(false)
    expect(sheetDragScrolls(false, 40)).toBe(false)
  })
})
