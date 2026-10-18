import { fieldLabel, formatChanges, formatValue } from './audit';

describe('audit formatting', () => {
  it('shows an update as before and after per field', () => {
    expect(
      formatChanges('Updated', {
        FullName: { old: 'Ana', new: 'Ana López' },
        IsActive: { old: true, new: false },
      }),
    ).toEqual([
      { field: 'Nombre', before: 'Ana', after: 'Ana López' },
      { field: 'Activo', before: 'Sí', after: 'No' },
    ]);
  });

  it('shows a create with the new values and a delete with the old ones', () => {
    expect(formatChanges('Created', { RoleId: 'r1', Notes: null })).toEqual([
      { field: 'Rol', before: '', after: 'r1' },
      { field: 'Notas', before: '', after: '—' },
    ]);
    expect(formatChanges('Deleted', { LocationId: 'l1' })).toEqual([
      { field: 'Ubicación', before: 'l1', after: '' },
    ]);
  });

  it('hides internal fields', () => {
    expect(
      formatChanges('Created', {
        Id: 'u1',
        NormalizedEmail: 'A@B',
        Email: 'a@b',
        TwoFactorEnabled: false,
      }),
    ).toEqual([{ field: 'Correo', before: '', after: 'a@b' }]);
  });

  it('keeps unknown fields and values readable', () => {
    expect(fieldLabel('shelfLifeDays')).toBe('ShelfLifeDays');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
    expect(formatChanges('Updated', null)).toEqual([]);
  });
});
