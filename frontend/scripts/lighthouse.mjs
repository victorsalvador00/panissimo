// Lighthouse (categoría accesibilidad, emulación de celular) del login, el tablero y la recepción de
// traspaso; falla si alguna queda por debajo de 90 (criterio de F-16).
//
//   npm run lighthouse     Requiere la API y el frontend en marcha (como `npm run e2e`).
//                          SGO_E2E_BASE_URL cambia el origen (por defecto http://localhost:4200).
//
// Usa el Chromium de Playwright con un perfil temporal: audita el login sin sesión y luego inicia sesión
// por API (la cookie de refresh queda en el perfil). Para la recepción usa un traspaso en tránsito; si no
// hay ninguno, lo crea por API (entrada de 1 kg de HAR-001 en COM y traspaso COM → SUC-01 despachado), así
// que esa corrida **mueve inventario** y deja el traspaso en tránsito para las siguientes.
// Reportes HTML en lighthouse-report/.
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_SCORE = 90;
const PORT = 9333;
const root = fileURLToPath(new URL('..', import.meta.url));
const baseURL = process.env.SGO_E2E_BASE_URL ?? 'http://localhost:4200';
const reportDir = join(root, 'lighthouse-report');
const profile = mkdtempSync(join(tmpdir(), 'sgo-lighthouse-'));

const context = await chromium.launchPersistentContext(profile, {
  args: [`--remote-debugging-port=${PORT}`],
});
const results = [];
try {
  results.push(await audit('Login', '/login'));

  const { email, password } = adminCredentials();
  const login = await context.request.post(`${baseURL}/api/v1/auth/login`, {
    data: { email, password },
  });
  if (!login.ok()) {
    throw new Error(`No se pudo iniciar sesión como administrador (${login.status()}).`);
  }
  const { accessToken } = await login.json();
  const api = (method, path, data) =>
    context.request[method](`${baseURL}/api/v1${path}`, {
      data,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

  results.push(await audit('Tablero', '/'));
  const transferId = await transferInTransit(api);
  results.push(await audit('Recepción de traspaso', `/logistica/traspasos/${transferId}/recibir`));
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

console.log('\nLighthouse, accesibilidad (celular):');
for (const result of results) {
  console.log(`  ${result.score >= MIN_SCORE ? '✔' : '✘'} ${result.name}: ${result.score}`);
  for (const failure of result.failures) console.log(`      - ${failure}`);
}
console.log(`Reportes en ${reportDir}`);
if (results.some((result) => result.score < MIN_SCORE)) {
  console.error(`\nAlguna pantalla quedó por debajo de ${MIN_SCORE}.`);
  process.exit(1);
}

async function audit(name, path) {
  const runner = await lighthouse(`${baseURL}${path}`, {
    port: PORT,
    output: 'html',
    onlyCategories: ['accessibility'],
    disableStorageReset: true, // conserva la cookie de sesión
    logLevel: 'error',
  });
  if (!runner) throw new Error(`Lighthouse no devolvió resultado para ${path}`);
  const { lhr, report } = runner;
  mkdirSync(reportDir, { recursive: true });
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]+/g, '-');
  writeFileSync(join(reportDir, `${slug}.html`), report);
  const category = lhr.categories.accessibility;
  const failures = category.auditRefs
    .map((ref) => lhr.audits[ref.id])
    .filter((item) => item.score !== null && item.score < 1)
    .map((item) => item.title);
  // Sin sesión, una ruta protegida termina en /login: se avisa en lugar de auditar lo que no es.
  if (!lhr.finalDisplayedUrl.includes(path)) {
    throw new Error(
      `${name}: se esperaba ${path} y Lighthouse terminó en ${lhr.finalDisplayedUrl}`,
    );
  }
  return { name, score: Math.round(category.score * 100), failures };
}

async function transferInTransit(api) {
  const page = await (await api('get', '/transfers?status=Dispatched&pageSize=1')).json();
  if (page.items.length > 0) return page.items[0].id;

  const locations = await (await api('get', '/locations/lookup')).json();
  const com = locations.find((location) => location.code === 'COM');
  const branch = locations.find((location) => location.code === 'SUC-01');
  const [flour] = await (await api('get', '/items/lookup?q=HAR-001')).json();
  await ok(
    api('post', '/adjustments', {
      locationId: com.id,
      reason: 'Correction',
      notes: 'Lighthouse: traspaso en tránsito',
      lines: [
        {
          itemId: flour.id,
          lotId: null,
          lotNumber: 'LH-2099',
          expirationDate: '2099-12-31',
          quantity: 1,
          unitCost: 10,
          notes: null,
        },
      ],
    }),
  );
  const transfer = await ok(
    api('post', '/transfers', {
      fromLocationId: com.id,
      toLocationId: branch.id,
      notes: 'Lighthouse',
      lines: [{ itemId: flour.id, lotId: null, quantity: 1 }],
    }),
  );
  await ok(
    api('post', `/transfers/${transfer.id}/dispatch`, {
      vehicleDescription: 'Lighthouse',
      driverName: 'Lighthouse',
      lines: null,
      version: transfer.version,
    }),
  );
  return transfer.id;
}

async function ok(pending) {
  const response = await pending;
  if (!response.ok()) {
    throw new Error(`${response.url()} respondió ${response.status()}: ${await response.text()}`);
  }
  return response.json();
}

/** Igual que playwright.config.ts: variables de entorno o el deploy/.env local. */
function adminCredentials() {
  let email = process.env.SGO_E2E_ADMIN_EMAIL;
  let password = process.env.SGO_E2E_ADMIN_PASSWORD;
  const envFile = join(root, '..', 'deploy', '.env');
  if ((!email || !password) && existsSync(envFile)) {
    const values = Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
        .map((line) => [
          line.slice(0, line.indexOf('=')).trim(),
          line.slice(line.indexOf('=') + 1).trim(),
        ]),
    );
    email ??= values.SGO__Seed__AdminEmail;
    password ??= values.SGO__Seed__AdminPassword;
  }
  if (!email || !password) {
    throw new Error(
      'Faltan SGO_E2E_ADMIN_EMAIL y SGO_E2E_ADMIN_PASSWORD (o el archivo deploy/.env local).',
    );
  }
  return { email, password };
}
