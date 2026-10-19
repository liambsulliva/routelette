import { describe, expect, it } from 'vitest'
import { createPlanner, noRoutesShown } from '../app/domain/controller'
import { initialSettings, PlanningFailure } from '../app/domain/planner'
import type { PlanningRequest, PlanningResult, PlanningService } from '../app/domain/planner'
import { PREVIEW_START, previewRoutes } from '../app/services/fixture-planner'

function controlledService() {
  const requests: Array<{ request: PlanningRequest; signal: AbortSignal; resolve: (result: PlanningResult) => void; reject: (error: Error) => void }> = []
  const service: PlanningService = { execute: (request, signal) => new Promise((resolve, reject) => requests.push({ request, signal, resolve, reject })) }
  return { service, requests }
}
function result() { return { routes: previewRoutes(), adjustedForLegality: false, elevationAvailable: true } }
function settings() { return { ...initialSettings(), start: PREVIEW_START } }

describe('planning orchestration', () => {
  it('keeps existing results visible and ignores a late result after a newer choice', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    planner.load(previewRoutes())
    const first = planner.change({ mode: 'bike' })
    expect(planner.state.routes).toHaveLength(3)
    const latest = planner.change({ surface: 'paved' })
    expect(fake.requests[0]!.signal.aborted).toBe(true)
    fake.requests[1]!.resolve({ ...result(), routes: [previewRoutes()[2]!] })
    await latest
    fake.requests[0]!.resolve(result())
    await first
    expect(planner.state.routes).toHaveLength(1)
    expect(planner.state.routes[0]!.id).toBe(previewRoutes()[2]!.id)
    expect(planner.state.busy).toBe(false)
  })

  it('ignores hover during generation and restores an existing route on click', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    const routes = previewRoutes(); planner.load(routes)
    const pending = planner.change({ mode: 'bike' })
    planner.select(routes[1]!.id, false)
    expect(planner.state.busy).toBe(true)
    planner.select(routes[1]!.id, true)
    expect(fake.requests[0]!.signal.aborted).toBe(true)
    expect(planner.state.settings).toEqual(routes[1]!.settings)
    expect(planner.state.presentation).toBe('restore')
    fake.requests[0]!.resolve(result()); await pending
    expect(planner.state.selectedId).toBe(routes[1]!.id)
  })

  it('retains the seed and joints for settings changes, then clears joints on Roll', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    planner.state.settings.joints = [[-79.94, 40.46]]
    const seed = planner.state.settings.seed
    const change = planner.change({ surface: 'trail' })
    expect(fake.requests[0]!.request.settings.seed).toBe(seed)
    expect(fake.requests[0]!.request.settings.joints).toHaveLength(1)
    fake.requests[0]!.resolve(result()); await change
    const roll = planner.roll()
    expect(fake.requests[1]!.request.settings.joints).toEqual([])
    expect(fake.requests[1]!.request.operation).toBe('generate')
    fake.requests[1]!.resolve(result()); await roll
  })

  it('reshapes only the selected route after a joint drop', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    const routes = previewRoutes(); planner.load(routes)
    planner.state.settings.joints = [[-79.94, 40.46]]
    const drop = planner.dropJoint(0, [-79.95, 40.47])
    expect(fake.requests[0]!.request.operation).toBe('reshape')
    expect(fake.requests[0]!.request.settings.joints).toEqual([[-79.95, 40.47]])
    const replacement = { ...routes[0]!, id: 'reshaped' }
    fake.requests[0]!.resolve({ ...result(), routes: [replacement] }); await drop
    expect(planner.state.routes.map(route => route.id)).toEqual(['reshaped', routes[1]!.id, routes[2]!.id])
    expect(planner.state.presentation).toBe('reshape')
  })

  it('reports a legal adjustment after reversal', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    planner.load(previewRoutes())
    const reverse = planner.run('reverse')
    expect(fake.requests[0]!.request.route?.coordinates).toEqual(previewRoutes()[0]!.coordinates)
    fake.requests[0]!.resolve({ ...result(), adjustedForLegality: true }); await reverse
    expect(planner.state.toast).toBe('Route adjusted to follow road rules.')
    expect(planner.state.presentation).toBe('reverse')
  })

  it('keeps prior results and distinguishes elevation failure from connectivity failure', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    planner.load(previewRoutes())
    const first = planner.change({ elevation: 'hilly' })
    fake.requests[0]!.reject(new PlanningFailure('unavailable', 'Offline')); await first
    expect(planner.state.elevationAvailable).toBe(true)
    const second = planner.run()
    fake.requests[1]!.reject(new PlanningFailure('elevation-unavailable', 'Elevation unavailable')); await second
    expect(planner.state.routes).toHaveLength(3)
    expect(planner.state.elevationAvailable).toBe(false)
    expect(planner.state.settings.elevation).toBe('hilly')
  })

  it('treats an empty generation as a result, not an error, so the card row can say so', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    planner.load(previewRoutes())
    const pending = planner.change({ elevation: 'custom', customGainMeters: 500 })
    fake.requests[0]!.resolve({ ...result(), routes: [] }); await pending
    expect(planner.state.routes).toEqual([])
    expect(planner.state.error).toBe('')
    expect(noRoutesShown(planner.state)).toBe(true)
  })

  it('hides the no-routes message before any generation, while generating, and after a failure', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    expect(noRoutesShown(planner.state)).toBe(false)
    const pending = planner.run()
    expect(noRoutesShown(planner.state)).toBe(false)
    fake.requests[0]!.reject(new PlanningFailure('no-route', 'Something failed')); await pending
    expect(noRoutesShown(planner.state)).toBe(false)
  })

  it('does not pad a response with duplicate routes', async () => {
    const fake = controlledService(), planner = createPlanner(fake.service, settings())
    const pending = planner.run()
    fake.requests[0]!.resolve({ ...result(), routes: [previewRoutes()[0]!] }); await pending
    expect(planner.state.routes).toHaveLength(1)
  })
})
