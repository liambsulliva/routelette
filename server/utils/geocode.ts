export interface CensusMatch {
  matchedAddress: string
  coordinates: { x: number; y: number }
  addressComponents: { fromAddress: string; preDirection: string; streetName: string; suffixType: string; suffixDirection: string; city: string }
}

// Census writes street parts in capitals and abbreviations. Photon spells them out, so the labels match.
const CENSUS_WORDS: Record<string, string> = {
  N: 'North', S: 'South', E: 'East', W: 'West', NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest',
  AVE: 'Avenue', ST: 'Street', BLVD: 'Boulevard', RD: 'Road', DR: 'Drive', LN: 'Lane', CT: 'Court', PL: 'Place', PKWY: 'Parkway', TER: 'Terrace', HWY: 'Highway', WAY: 'Way', CIR: 'Circle', SQ: 'Square',
}

/** Title case for Census output, which arrives in capitals. */
function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())
}

/**
 * Labels a Census match with the house number it matched, which is the number the user typed.
 * fromAddress is where the block's address range starts, so it can differ from the typed number.
 */
export function censusPlace(match: CensusMatch): { id: string; label: string; coordinates: [number, number] } {
  const a = match.addressComponents
  const street = [a.preDirection, a.streetName, a.suffixType, a.suffixDirection].filter(Boolean)
    .map(part => CENSUS_WORDS[part] ?? titleCase(part)).join(' ')
  const house = match.matchedAddress.split(' ')[0]!
  const x = match.coordinates.x, y = match.coordinates.y
  return { id: `census-${x},${y}`, label: `${house} ${street}, ${titleCase(a.city)}`, coordinates: [x, y] }
}
