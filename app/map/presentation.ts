/** Why the planner last changed the map. Each one decides whether the camera moves and whether lines draw in. */
export type PresentationKind = 'generate' | 'selection' | 'restore' | 'reverse' | 'reshape' | 'saved'

export interface PresentationOptions { animate: boolean; fit: boolean; reveal: boolean; deferAlternates: boolean }

/**
 * What the map does for a change. A new generation and a saved route's selection refit the camera to the routes.
 * Every change that draws a route in animates it, unless reduced motion is on.
 */
export function presentationFor(presentation: string, reducedMotion: boolean): PresentationOptions {
  return {
    animate: !reducedMotion,
    fit: presentation === 'generate' || presentation === 'saved',
    reveal: ['generate', 'restore', 'reverse', 'saved'].includes(presentation),
    deferAlternates: ['generate', 'restore'].includes(presentation),
  }
}
