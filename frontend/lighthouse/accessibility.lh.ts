import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdminApi, signIn } from '../e2e/support/api';
import { adminCredentials } from '../e2e/support/env';

/**
 * Lighthouse (frontend §9, `npm run lighthouse`): accessibility with mobile emulation, at least 90, on the login, the
 * dashboard, the transfer receipt and the production close. Runs on a Chrome with a debugging port where the session is
 * already open; Lighthouse keeps it (`disableStorageReset`). Nothing is saved: the order it needs is cancelled.
 */

const PORT = 9333;
const MIN_SCORE = 90;

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

test('accesibilidad con Lighthouse ≥ 90', async ({ baseURL }) => {
  test.setTimeout(300_000);
  const { default: lighthouse } = await import('lighthouse');
  const profile = mkdtempSync(join(tmpdir(), 'pan-lighthouse-'));
  const browser = await chromium.launchPersistentContext(profile, {
    channel: 'chrome',
    headless: true,
    args: [`--remote-debugging-port=${PORT}`],
    baseURL,
  });
  const api = await AdminApi.create(baseURL!);
  let orderToCancel: { id: string; version: number } | null = null;
  const results: { page: string; score: number }[] = [];

  async function audit(name: string, path: string): Promise<void> {
    const result = await lighthouse(`${baseURL}${path}`, {
      port: PORT,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['accessibility'],
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false },
      disableStorageReset: true,
    });
    const category = result!.lhr.categories['accessibility'];
    const score = Math.round((category.score ?? 0) * 100);
    const failed = Object.values(result!.lhr.audits)
      .filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary')
      .map((a) => `${a.id}: ${a.title}`);
    // A screen behind the login must not have been audited as the login.
    const finalUrl = new URL(result!.lhr.finalDisplayedUrl).pathname;
    if (path !== '/login') expect(finalUrl, `${name} terminó en ${finalUrl}`).not.toBe('/login');
    results.push({ page: `${name} (${finalUrl})${failed.length ? ` — falla: ${failed.join('; ')}` : ''}`, score });
  }

  try {
    // The login first: with a session it redirects to the dashboard.
    await audit('Inicio de sesión', '/login');

    const page = browser.pages()[0] ?? (await browser.newPage());
    await signIn(page, adminCredentials());
    await audit('Tablero', '/');

    // Transfer receipt: one in transit, if there is any (receiving it would move inventory, so none is created).
    const inTransit = await api.get<{ items: { id: string }[] }>('transfers?tab=InTransit&pageSize=1');
    if (inTransit.items[0]) await audit('Recepción de traspaso', `/logistica/traspasos/${inTransit.items[0].id}/recibir`);
    else results.push({ page: 'Recepción de traspaso (sin traspasos en tránsito: no se midió)', score: -1 });

    // Production close: a released order of E2E-MASA, cancelled at the end.
    await api.ensureCategory('E2E');
    await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
    await api.ensureItem('E2E-MASA', 'Masa E2E', 'E2E', 'kg', 'SemiFinished');
    const order = await api.post<{ id: string; version: number }>('production-orders', {
      locationId: await api.locationId('PLANTA'),
      outputItemId: await api.itemId('E2E-MASA'),
      plannedQty: 10,
      scheduledDate: today(),
      productionAreaId: null,
      shift: null,
      notes: 'Lighthouse',
    });
    orderToCancel = await api.post<{ id: string; version: number }>(`production-orders/${order.id}/release`, {
      version: order.version,
    });
    orderToCancel = { id: order.id, version: orderToCancel.version };
    await audit('Cierre de producción', `/produccion/ordenes/${order.id}/cerrar`);
  } finally {
    if (orderToCancel) await api.post(`production-orders/${orderToCancel.id}/cancel`, { version: orderToCancel.version });
    await api.dispose();
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }

  const report = results.map((r) => `${r.score < 0 ? '—' : r.score}\t${r.page}`).join('\n');
  writeFileSync(join(__dirname, '..', 'test-results', 'lighthouse.txt'), report + '\n');
  console.log(`Lighthouse, accesibilidad (móvil):\n${report}`);
  for (const r of results.filter((r) => r.score >= 0)) expect(r.score, r.page).toBeGreaterThanOrEqual(MIN_SCORE);
});
