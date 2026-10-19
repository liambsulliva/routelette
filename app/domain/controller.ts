import { computed, reactive } from 'vue'
import { copySettings, initialSettings, PlanningFailure } from './planner'
import type { PlanningNotice, PlanningService, PlanningSettings, RouteCandidate, PlanningRequest } from './planner'

/**
 * The card row says "No routes available" only after a generation that finished with nothing.
 * While one is running, after a failure, or before any generation, it stays hidden.
 */
export function noRoutesShown(state: { busy: boolean; error: string; routes: unknown[]; presentation: string }): boolean {
  return !state.busy && !state.error && state.routes.length === 0 && state.presentation === 'generate'
}

export function createPlanner(service: PlanningService, settings = initialSettings()) {
  const state = reactive({
    settings, routes: [] as RouteCandidate[], selectedId: '', busy: false, error: '',
    elevationAvailable: true, revision: 0, presentation: 'selection' as 'generate' | 'selection' | 'restore' | 'reverse' | 'reshape' | 'saved',
    toast: '', notices: [] as PlanningNotice[],
  })
  let sequence = 0
  let active: AbortController | null = null
  const selected = computed(() => state.routes.find(route => route.id === state.selectedId) ?? null)
  function cancel() { ++sequence; active?.abort(); active = null; state.busy = false }
  async function run(operation: PlanningRequest['operation'] = 'generate') {
    cancel()
    if (!state.settings.start) return
    const id = sequence
    const abort = new AbortController()
    active = abort
    state.busy = true
    state.error = ''
    const request: PlanningRequest = { id, operation, settings: copySettings(state.settings) }
    if (selected.value) request.route = JSON.parse(JSON.stringify(selected.value)) as RouteCandidate
    try {
      const result = await service.execute(request, abort.signal)
      if (id !== sequence || abort.signal.aborted) return
      if (operation !== 'generate' && selected.value && result.routes[0]) {
        const index = state.routes.findIndex(route => route.id === state.selectedId)
        const replacement = result.routes[0]
        state.routes[index] = replacement
        state.selectedId = replacement.id
      } else {
        state.routes = result.routes
        state.selectedId = result.routes[0]?.id ?? ''
      }
      state.elevationAvailable = result.elevationAvailable
      state.notices = result.notices ?? []
      state.presentation = operation
      state.revision++
      if (result.adjustedForLegality) state.toast = 'Route adjusted to follow road rules.'
    } catch (error) {
      if (id !== sequence || abort.signal.aborted) return
      state.error = error instanceof Error ? error.message : "Can't load routes right now."
      if (error instanceof PlanningFailure && error.code === 'elevation-unavailable') state.elevationAvailable = false
    } finally {
      if (id === sequence) { state.busy = false; active = null }
    }
  }
  async function change(patch: Partial<PlanningSettings>) {
    Object.assign(state.settings, patch)
    await run()
  }
  async function roll() {
    const seed = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? crypto.getRandomValues(new Uint32Array(1))[0]! : Date.now()
    await change({ seed, joints: [] })
  }
  function select(id: string, deliberate = true) {
    const route = state.routes.find(candidate => candidate.id === id)
    if (!route || (!deliberate && state.busy)) return
    const wasBusy = state.busy
    if (wasBusy) cancel()
    state.selectedId = id
    state.settings = copySettings(route.settings)
    state.presentation = wasBusy ? 'restore' : 'selection'
    state.revision++
  }
  function load(routes: RouteCandidate[], reason: 'selection' | 'restore' = 'restore') {
    cancel(); state.routes = routes; state.selectedId = routes[0]?.id ?? ''
    if (routes[0]) state.settings = copySettings(routes[0].settings)
    state.presentation = reason; state.revision++; state.error = ''; state.notices = []
  }
  let detachedSequence = 0
  /** Calculates the legal reverse of one route without touching the current results. */
  async function reverseCopy(route: RouteCandidate) {
    const result = await service.execute({ id: ++detachedSequence, operation: 'reverse', settings: copySettings(route.settings), route: JSON.parse(JSON.stringify(route)) as RouteCandidate }, new AbortController().signal)
    const reversed = result.routes[0]
    if (!reversed) throw new PlanningFailure('no-route', "Couldn't find a legal route in the other direction.")
    return { route: reversed, adjustedForLegality: result.adjustedForLegality }
  }
  async function dropJoint(index: number, coordinates: [number, number]) {
    const joints = state.settings.joints.map(p => [...p] as [number, number])
    joints[index] = coordinates
    state.settings.joints = joints
    await run('reshape')
  }
  return { state, selected, run, change, roll, select, load, cancel, reverseCopy, dropJoint, dispose: cancel }
}
export type PlannerController = ReturnType<typeof createPlanner>
