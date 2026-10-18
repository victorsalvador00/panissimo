import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Admin credentials (frontend §9): PAN_E2E_ADMIN_EMAIL / PAN_E2E_ADMIN_PASSWORD, or the seed values of deploy/.env
 * (PAN__Seed__AdminEmail / PAN__Seed__AdminPassword). Never written in the tests.
 */
export function adminCredentials(): Credentials {
  const email = process.env['PAN_E2E_ADMIN_EMAIL'] ?? fromDeployEnv('PAN__Seed__AdminEmail');
  const password = process.env['PAN_E2E_ADMIN_PASSWORD'] ?? fromDeployEnv('PAN__Seed__AdminPassword');
  if (!email || !password)
    throw new Error(
      'Faltan credenciales del admin: define PAN_E2E_ADMIN_EMAIL y PAN_E2E_ADMIN_PASSWORD o deploy/.env.',
    );
  return { email, password };
}

function fromDeployEnv(key: string): string | undefined {
  try {
    const text = readFileSync(join(__dirname, '..', '..', '..', 'deploy', '.env'), 'utf8');
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}
