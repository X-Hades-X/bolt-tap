import {MSAT_PER_SAT, msatToSats, satsToMsat} from './units';

describe('units', () => {
  it('converts msat to sats', () => {
    expect(msatToSats(5000)).toBe(5);
    expect(msatToSats(250000)).toBe(250);
    expect(msatToSats(0)).toBe(0);
  });

  it('converts sats to msat', () => {
    expect(satsToMsat(5)).toBe(5000);
    expect(satsToMsat(250)).toBe(250000);
    expect(satsToMsat(0)).toBe(0);
  });

  it('round-trips whole-sat values', () => {
    expect(satsToMsat(msatToSats(123 * MSAT_PER_SAT))).toBe(123 * MSAT_PER_SAT);
  });
});
