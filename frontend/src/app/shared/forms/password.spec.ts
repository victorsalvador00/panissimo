import { FormControl } from '@angular/forms';
import { generatePassword, passwordPolicy } from './password';

describe('password', () => {
  it('generates passwords that meet the backend policy, without confusable characters', () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(14);
      expect(passwordPolicy(new FormControl(password, { nonNullable: true }))).toBeNull();
      expect(password).not.toMatch(/[0O1lI]/);
    }
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it('checks length, uppercase, lowercase and digit', () => {
    const check = (value: string) => passwordPolicy(new FormControl(value, { nonNullable: true }));
    expect(check('Corta1')).toEqual({ passwordPolicy: true });
    expect(check('sinmayusculas1')).toEqual({ passwordPolicy: true });
    expect(check('SINMINUSCULAS1')).toEqual({ passwordPolicy: true });
    expect(check('SinNumerosAqui')).toEqual({ passwordPolicy: true });
    expect(check('Valida2026x')).toBeNull();
    expect(check('')).toBeNull();
  });
});
