/** Written when the usual-pace setup is confirmed. Until it exists, the setup opens on load. */
export const PACE_SETUP_KEY = 'routelette:pace-setup:v1'

/** True on first open. Storage that can't be read keeps the setup closed rather than asking every time. */
export function needsPaceSetup(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(PACE_SETUP_KEY) === null } catch { return false }
}
