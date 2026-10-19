/** Why the planner last changed the map. Each one decides whether the camera moves and whether lines draw in. */
export type PresentationKind = 'generate' | 'selection' | 'restore' | 'reverse' | 'reshape' | 'saved' | 'shared'

export interface PresentationOptions { animate: boolean; fit: boolean; reveal: boolean; deferAlternates: boolean }

/**
 * What the map does for a change. A new generation, a saved route's selection, and a shared link's route
 * refit the camera to the routes. Every change that draws a route in animates it, unless reduced motion is on.
 */
export function presentationFor(presentation: string, reducedMotion: boolean): PresentationOptions {
  return {
    animate: !reducedMotion,
    fit: presentation === 'generate' || presentation === 'saved' || presentation === 'shared',
    reveal: ['generate', 'restore', 'reverse', 'saved', 'shared'].includes(presentation),
    deferAlternates: ['generate', 'restore'].includes(presentation),
  }
}
