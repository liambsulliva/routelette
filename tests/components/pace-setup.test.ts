import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PaceSetup from '../../app/components/PaceSetup.vue'
import type { Units } from '../../app/domain/planner'

const defaults = { bike: 5, run: 9.5, walk: 20 }

function mountSetup(units: Units = 'mi') {
  return mount(PaceSetup, { props: { open: false, units, paces: { ...defaults } }, global: { stubs: { Icon: true } } })
}

async function openSetup(wrapper: ReturnType<typeof mountSetup>) {
  await wrapper.setProps({ open: true })
}

function inputs(wrapper: ReturnType<typeof mountSetup>) {
  return wrapper.findAll('.pace-setup-row input')
}

describe('usual-pace setup', () => {
  it('opens with the defaults in min/mi for biking, running and walking', async () => {
    const wrapper = mountSetup()
    await openSetup(wrapper)
    expect((wrapper.find('dialog').element as HTMLDialogElement).open).toBe(true)
    expect(inputs(wrapper).map(input => (input.element as HTMLInputElement).value)).toEqual(['5', '9.5', '20'])
    expect(wrapper.findAll('.pace-setup-row .unit').map(unit => unit.text())).toEqual(['min/mi', 'min/mi', 'min/mi'])
  })

  it('shows the same paces per kilometer when units are kilometers', async () => {
    const wrapper = mountSetup('km')
    await openSetup(wrapper)
    expect(inputs(wrapper).map(input => (input.element as HTMLInputElement).value)).toEqual(['3.11', '5.9', '12.43'])
    expect(wrapper.findAll('.pace-setup-row .unit').map(unit => unit.text())).toEqual(['min/km', 'min/km', 'min/km'])
  })

  it('saves the edited pace in minutes per mile and keeps the other rows exact', async () => {
    const wrapper = mountSetup()
    await openSetup(wrapper)
    await inputs(wrapper)[1]!.setValue('8')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ bike: 5, run: 8, walk: 20 }]])
  })

  it('converts a kilometer pace back to minutes per mile when saving', async () => {
    const wrapper = mountSetup('km')
    await openSetup(wrapper)
    await inputs(wrapper)[1]!.setValue('5.9')
    await wrapper.find('form').trigger('submit')
    const saved = wrapper.emitted('save')![0]![0] as Record<string, number>
    expect(saved.run).toBeCloseTo(9.5, 1)
  })

  it('does not round rows the user left alone when units change', async () => {
    // 5 min/mi shows as 3.11 min/km. Saving without edits must still give exactly 5.
    const wrapper = mountSetup('km')
    await openSetup(wrapper)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('save')![0]![0]).toEqual(defaults)
  })

  it('keeps Continue disabled for an empty or out-of-range pace', async () => {
    const wrapper = mountSetup()
    await openSetup(wrapper)
    const button = wrapper.find('.pace-setup-submit').element as HTMLButtonElement
    expect(button.disabled).toBe(false)
    for (const entry of ['', '0.5', '121']) {
      await inputs(wrapper)[0]!.setValue(entry)
      expect(button.disabled).toBe(true)
    }
    await inputs(wrapper)[0]!.setValue('1')
    expect(button.disabled).toBe(false)
  })

  it('does not dismiss on Escape, so the baseline is always set by Continue', async () => {
    const wrapper = mountSetup()
    await openSetup(wrapper)
    const event = new Event('cancel', { cancelable: true })
    wrapper.find('dialog').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
