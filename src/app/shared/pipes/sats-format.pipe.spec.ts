import {SatsFormatPipe} from './sats-format.pipe';

describe('SatsFormatPipe', () => {
  let pipe: SatsFormatPipe;

  beforeEach(() => {
    pipe = new SatsFormatPipe();
  });

  it('formats thousands with spaces', () => {
    expect(pipe.transform(5000)).toBe('5 000');
    expect(pipe.transform(2500)).toBe('2 500');
    expect(pipe.transform(1000000)).toBe('1 000 000');
  });

  it('leaves small numbers untouched', () => {
    expect(pipe.transform(21)).toBe('21');
    expect(pipe.transform(999)).toBe('999');
  });

  it('handles null/undefined/NaN', () => {
    expect(pipe.transform(null)).toBe('0');
    expect(pipe.transform(undefined)).toBe('0');
    expect(pipe.transform(NaN)).toBe('0');
  });

  it('floors fractional values', () => {
    expect(pipe.transform(1234.9)).toBe('1 234');
  });
});
