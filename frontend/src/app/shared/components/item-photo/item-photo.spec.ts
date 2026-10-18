import { describe, expect, it } from 'vitest';
import { photoInitials } from './item-photo';

describe('photoInitials', () => {
  it('takes two initials of the name, skipping connectors', () => {
    expect(photoInitials('Concha de vainilla', 'CONCHA-V')).toBe('CV');
    expect(photoInitials('Bolillo', 'BOL')).toBe('B');
  });

  it('falls back to the SKU', () => {
    expect(photoInitials(null, 'E2E-PAN')).toBe('EP');
    expect(photoInitials('', '')).toBe('?');
  });
});
