/**
 * Unit conversions. LNURL/bolt11 protocol fields are millisatoshis (msat);
 * users enter and see whole sats. These are the only two directions the app
 * ever converts — never multiply/divide by 1000 inline.
 */
export const MSAT_PER_SAT = 1000;

/** Protocol (msat) → user-facing value (sats). */
export function msatToSats(msat: number): number {
  return msat / MSAT_PER_SAT;
}

/** User-facing value (sats) → protocol (msat). */
export function satsToMsat(sats: number): number {
  return sats * MSAT_PER_SAT;
}
