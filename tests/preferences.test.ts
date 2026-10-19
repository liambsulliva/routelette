import { describe, expect, it, vi } from 'vitest'
import { needsPaceSetup, PACE_SETUP_KEY } from '../app/domain/preferences'

function storage(value: string | null | 'throw') {
  return { getItem: () => { if (value === 'throw') throw new Error('Storage is blocked'); return value } }
}

describe('usual-pace setup on first open', () => {
  it('opens when nothing has been saved yet', () => {
    expect(needsPaceSetup(storage(null))).toBe(true)
  })

  it('stays closed once the setup has been confirmed', () => {
    expect(needsPaceSetup(storage('1'))).toBe(false)
  })

  it('stays closed when storage cannot be read, rather than asking every time', () => {
    expect(needsPaceSetup(storage('throw'))).toBe(false)
  })

  it('reads its own key', () => {
    const getItem = vi.fn(() => null)
    needsPaceSetup({ getItem })
    expect(getItem).toHaveBeenCalledWith(PACE_SETUP_KEY)
  })
})
