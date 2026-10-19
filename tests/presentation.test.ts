import { describe, expect, it } from 'vitest'
import { presentationFor } from '../app/map/presentation'

describe('map presentation', () => {
  it('refits the camera and draws the route in when a saved route is selected', () => {
    expect(presentationFor('saved', false)).toEqual({ animate: true, fit: true, reveal: true, deferAlternates: false })
  })

  it('still refits and draws in a saved route with reduced motion, but without animation', () => {
    expect(presentationFor('saved', true)).toEqual({ animate: false, fit: true, reveal: true, deferAlternates: false })
  })

  it('refits and reveals a new generation, deferring the alternates until the selected route is drawn', () => {
    expect(presentationFor('generate', false)).toEqual({ animate: true, fit: true, reveal: true, deferAlternates: true })
  })

  it('does not move the camera when a result card is selected, or when a reverse or reshape lands', () => {
    expect(presentationFor('selection', false).fit).toBe(false)
    expect(presentationFor('selection', false).reveal).toBe(false)
    expect(presentationFor('reverse', false).fit).toBe(false)
    expect(presentationFor('reverse', false).reveal).toBe(true)
    expect(presentationFor('reshape', false).fit).toBe(false)
    expect(presentationFor('reshape', false).reveal).toBe(false)
  })

  it('restores a busy result without refitting the camera', () => {
    expect(presentationFor('restore', false)).toEqual({ animate: true, fit: false, reveal: true, deferAlternates: true })
  })
})
