import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import SavedRouteRow from '../../app/components/SavedRouteRow.vue'
import { initialSettings } from '../../app/domain/planner'
import type { RouteCandidate } from '../../app/domain/planner'

const MILE = 1609.344
const pace = { bike: 5, run: 9.5, walk: 20 }

// Stands in for the shared icon button: a native button that carries the label and the disabled state.
const IconButtonStub = {
  props: ['icon', 'label', 'disabled', 'danger'],
  setup(props: { label: string; disabled?: boolean }) {
    return () => h('button', { type: 'button', 'aria-label': props.label, disabled: props.disabled })
  },
}

function route(): RouteCandidate {
  return {
    id: 'saved-1', name: 'Kincaid St loop', mode: 'run', coordinates: [[-79.94, 40.46], [-79.95, 40.47]],
    distanceMeters: 2 * MILE, gainMeters: 30, elevationProfile: [], turns: [], settings: initialSettings(),
    provenance: { kind: 'snapshot', version: 'test', region: 'Test' },
  }
}

const mounted: Array<{ unmount(): void }> = []
afterEach(() => { for (const wrapper of mounted.splice(0)) wrapper.unmount() })

function mountRow(patch: Record<string, unknown> = {}) {
  const wrapper = mount(SavedRouteRow, {
    attachTo: document.body,
    props: { route: route(), shown: route(), selected: false, renaming: false, reversing: false, units: 'mi', pace: { ...pace }, ...patch },
    global: { stubs: { Icon: true, RouteThumbnail: true, IconButton: IconButtonStub } },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('saved route row', () => {
  it('shows the name as text while no rename is open', () => {
    const row = mountRow()
    expect(row.find('.saved-name').text()).toBe('Kincaid St loop')
    expect(row.find('input').exists()).toBe(false)
  })

  it('selects the route when the title area is clicked', async () => {
    const row = mountRow()
    await row.find('.saved-select-hit').trigger('click')
    expect(row.emitted('select')).toHaveLength(1)
  })

  it('shows the action row only for the selected route', () => {
    expect(mountRow({ selected: false }).find('.saved-row-actions').exists()).toBe(false)
    const labels = mountRow({ selected: true }).findAll('.saved-row-actions button').map(button => button.attributes('aria-label'))
    expect(labels).toEqual(['Rename route', 'Reverse route', 'Share route', 'Delete route'])
  })

  it('emits the matching event for each action button', async () => {
    const row = mountRow({ selected: true })
    const click = (label: string) => row.find(`[aria-label="${label}"]`).trigger('click')
    await click('Rename route')
    await click('Reverse route')
    await click('Share route')
    await click('Delete route')
    expect(row.emitted('rename')).toHaveLength(1)
    expect(row.emitted('reverse')).toHaveLength(1)
    expect(row.emitted('share')).toHaveLength(1)
    expect(row.emitted('remove')).toHaveLength(1)
  })

  it('disables reverse while the route is being reversed', () => {
    const reverse = mountRow({ selected: true, reversing: true }).find('[aria-label="Reverse route"]').element as HTMLButtonElement
    expect(reverse.disabled).toBe(true)
  })

  it('opens a focused rename box that holds the current name, in place of the title', () => {
    const row = mountRow({ renaming: true })
    const input = row.find('input.rename-input')
    expect(row.find('.saved-name').exists()).toBe(false)
    expect((input.element as HTMLInputElement).value).toBe('Kincaid St loop')
    expect(document.activeElement).toBe(input.element)
  })

  it('saves the typed name once on Enter, and a later blur does nothing', async () => {
    const row = mountRow({ renaming: true })
    const input = row.find('input.rename-input')
    await input.setValue('Saturday long run')
    await input.trigger('keydown.enter')
    expect(row.emitted('commitRename')).toEqual([['Saturday long run']])
    await input.trigger('blur')
    expect(row.emitted('commitRename')).toHaveLength(1)
  })

  it('cancels on Escape without saving, and a later blur does nothing', async () => {
    const row = mountRow({ renaming: true })
    const input = row.find('input.rename-input')
    await input.setValue('Discarded')
    await input.trigger('keydown.esc')
    expect(row.emitted('cancelRename')).toHaveLength(1)
    expect(row.emitted('commitRename')).toBeUndefined()
    await input.trigger('blur')
    expect(row.emitted('commitRename')).toBeUndefined()
  })

  it('saves when the user clicks away', async () => {
    const row = mountRow({ renaming: true })
    const input = row.find('input.rename-input')
    await input.setValue('Blur saved')
    await input.trigger('blur')
    expect(row.emitted('commitRename')).toEqual([['Blur saved']])
  })

  it('reopens with the current name and handles Escape again on the next rename', async () => {
    const row = mountRow({ renaming: true })
    await row.find('input.rename-input').trigger('keydown.enter')
    await row.setProps({ renaming: false })
    await row.setProps({ renaming: true })
    const input = row.find('input.rename-input')
    expect((input.element as HTMLInputElement).value).toBe('Kincaid St loop')
    await input.trigger('keydown.esc')
    expect(row.emitted('cancelRename')).toHaveLength(1)
  })
})
