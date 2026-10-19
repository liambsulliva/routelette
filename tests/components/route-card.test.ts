import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RouteCard from '../../app/components/RouteCard.vue'
import { initialSettings } from '../../app/domain/planner'
import type { RouteCandidate, Units } from '../../app/domain/planner'

const MILE = 1609.344
const pace = { bike: 5, run: 9.5, walk: 20 }

function route(): RouteCandidate {
  return {
    id: 'route-1', name: 'Route 1', mode: 'run', coordinates: [[-79.94, 40.46], [-79.95, 40.47]],
    distanceMeters: 2 * MILE, gainMeters: 30, elevationProfile: [], turns: [], settings: initialSettings(),
    provenance: { kind: 'snapshot', version: 'test', region: 'Test' },
  }
}

function mountCard(units: Units = 'mi') {
  return mount(RouteCard, {
    props: { route: route(), selected: false, hovered: false, saved: false, units, pace: { ...pace } },
    global: { stubs: { Icon: true, IconButton: true } },
  })
}

async function openPaceBox(card: ReturnType<typeof mountCard>) {
  await card.find('.time-button').trigger('click')
  return card.find('.pace-input')
}

describe('route card pace', () => {
  it('shows the time the saved pace gives for the route', () => {
    // Two miles at 9.5 minutes per mile.
    expect(mountCard().find('.time-button').text()).toContain('19')
  })

  it('replaces the time with a pace box in the same row, labelled min/mi', async () => {
    const card = mountCard()
    const input = await openPaceBox(card)
    expect((input.element as HTMLInputElement).value).toBe('9.5')
    expect(card.find('.time-button').exists()).toBe(false)
    expect(card.find('.pace-stat .unit').text()).toBe('min/mi')
    expect(input.element.closest('.route-stats')).toBe(card.find('.route-stats').element)
  })

  it('shows the same pace per kilometer when units are kilometers', async () => {
    const input = await openPaceBox(mountCard('km'))
    expect((input.element as HTMLInputElement).value).toBe('5.9')
    expect(input.element.nextElementSibling?.textContent).toBe('min/km')
  })

  it('commits a typed minutes-per-mile pace on Enter', async () => {
    const card = mountCard()
    const input = await openPaceBox(card)
    await input.setValue('7.5')
    await input.trigger('keydown.enter')
    expect(card.emitted('pace')).toEqual([['run', 7.5]])
    expect(card.find('.time-button').exists()).toBe(true)
  })

  it('converts a typed kilometer pace to minutes per mile before committing', async () => {
    const card = mountCard('km')
    const input = await openPaceBox(card)
    await input.setValue('5')
    await input.trigger('keydown.enter')
    const [mode, value] = card.emitted('pace')![0]! as [string, number]
    expect(mode).toBe('run')
    expect(value).toBeCloseTo(5 * 1.609344, 5)
  })

  it('cancels on Escape without changing the pace', async () => {
    const card = mountCard()
    const input = await openPaceBox(card)
    await input.setValue('7')
    await input.trigger('keydown.esc')
    expect(card.emitted('pace')).toBeUndefined()
    expect(card.find('.time-button').exists()).toBe(true)
  })

  it('commits on blur, and a later Enter or blur does not commit again', async () => {
    const card = mountCard()
    const input = await openPaceBox(card)
    await input.setValue('8')
    await input.trigger('blur')
    expect(card.emitted('pace')).toEqual([['run', 8]])
    await input.trigger('keydown.enter')
    await input.trigger('blur')
    expect(card.emitted('pace')).toHaveLength(1)
  })

  it('keeps the current pace for an empty, zero, or out-of-range entry', async () => {
    const card = mountCard()
    for (const entry of ['', '0', '121']) {
      const input = await openPaceBox(card)
      await input.setValue(entry)
      await input.trigger('keydown.enter')
    }
    expect(card.emitted('pace')).toBeUndefined()
  })

  it('rejects a kilometer entry that is above 120 minutes per mile once converted', async () => {
    const card = mountCard('km')
    const input = await openPaceBox(card)
    await input.setValue('75')
    await input.trigger('keydown.enter')
    expect(card.emitted('pace')).toBeUndefined()
  })
})
