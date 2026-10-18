import { safeReturnUrl } from './guards';

describe('safeReturnUrl', () => {
  it('keeps paths of the app', () => {
    expect(safeReturnUrl('/inventario/existencias?tab=2')).toBe('/inventario/existencias?tab=2');
  });

  it('falls back to the home for other sites, the login or nothing', () => {
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl('/login?returnUrl=%2F')).toBe('/');
    expect(safeReturnUrl(undefined)).toBe('/');
  });
});
