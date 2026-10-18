import { FormControl } from '@angular/forms';
import { GENERIC_RFCS, isValidRfc, rfcValidator } from './rfc';

describe('RFC (RN-35)', () => {
  it('accepts companies (12) and persons (13) with a valid date', () => {
    expect(isValidRfc('ABC010203XY1')).toBe(true);
    expect(isValidRfc('GODE561231GR8')).toBe(true);
    expect(isValidRfc('ÑAB991231AB1')).toBe(true);
    for (const generic of GENERIC_RFCS) expect(isValidRfc(generic)).toBe(true);
  });

  it('rejects other lengths, impossible dates and lowercase', () => {
    expect(isValidRfc('AB0102031X')).toBe(false);
    expect(isValidRfc('ABC011303XY1')).toBe(false);
    expect(isValidRfc('ABC010230XY1')).toBe(false);
    expect(isValidRfc('ABC010229XY1')).toBe(false);
    expect(isValidRfc('ABC000229XY1')).toBe(true);
    expect(isValidRfc('abc010203xy1')).toBe(false);
  });

  it('the validator compares in capitals and leaves the empty value to required', () => {
    expect(rfcValidator(new FormControl('abc010203xy1'))).toBeNull();
    expect(rfcValidator(new FormControl(''))).toBeNull();
    expect(rfcValidator(new FormControl('ABC'))?.['message']).toContain('El RFC no es válido');
  });
});
