import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import { detectDelimiter, parseCsv, toCsv } from '../../shared/data-access/csv';
import { headerProblems } from '../../shared/components/csv-import/csv-import';
import { ItemImportPage } from './pages/item-import-page';
import { ITEM_IMPORT_COLUMNS, ITEM_IMPORT_REQUIRED } from './ui/item-import-template';
import { settingRow, toSettingInputs } from './ui/item-location-settings';
import { minMaxMessage, purchaseFactorValidator } from './ui/item-validators';

const BOM = String.fromCharCode(0xfeff);

describe('CSV', () => {
  it('lee comas, comillas, comillas dobles y acentos, con el número de línea', () => {
    const table = parseCsv(
      `${BOM}SKU,Nombre,Categoria\r\nHAR-001,"Harina, de trigo",Secos\r\n\r\nLEC-1,"Leche ""entera""",Lácteos\r\n`,
    );

    expect(table.headers).toEqual(['sku', 'nombre', 'categoria']);
    expect(table.delimiter).toBe(',');
    expect(table.rows).toEqual([
      { line: 2, cells: ['HAR-001', 'Harina, de trigo', 'Secos'] },
      { line: 4, cells: ['LEC-1', 'Leche "entera"', 'Lácteos'] },
    ]);
  });

  it('detecta punto y coma (Excel en español) y saltos de línea dentro de comillas', () => {
    expect(detectDelimiter('sku;nombre;tipo')).toBe(';');
    const table = parseCsv('sku;nombre\nA;"dos\nlíneas"\nB;otro');
    expect(table.rows.map((r) => [r.line, r.cells[1]])).toEqual([
      [2, 'dos\nlíneas'],
      [4, 'otro'],
    ]);
  });

  it('la plantilla lleva BOM y se puede volver a leer', () => {
    const csv = toCsv(['sku', 'nombre'], [['A-1', 'Pan, dulce']]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(parseCsv(csv).rows[0].cells).toEqual(['A-1', 'Pan, dulce']);
  });

  it('revisa el encabezado contra las columnas del backend', () => {
    expect(
      headerProblems([...ITEM_IMPORT_COLUMNS], ITEM_IMPORT_COLUMNS, ITEM_IMPORT_REQUIRED),
    ).toEqual([]);
    expect(
      headerProblems(['sku', 'nombre', 'precio'], ITEM_IMPORT_COLUMNS, ITEM_IMPORT_REQUIRED),
    ).toEqual([
      'Faltan columnas obligatorias: tipo, categoria, unidad_base.',
      'Columnas desconocidas: precio.',
    ]);
  });
});

describe('artículo: factor de compra', () => {
  const form = (purchaseUomId: string | null, factor: number | null) => {
    const group = new FormGroup({
      purchaseUomId: new FormControl(purchaseUomId),
      purchaseToBaseFactor: new FormControl(factor, purchaseFactorValidator),
    });
    group.controls.purchaseToBaseFactor.updateValueAndValidity();
    return group.controls.purchaseToBaseFactor;
  };

  it('es obligatorio y > 0 con unidad de compra; hasta 4 decimales', () => {
    expect(form('caja', null).errors).toEqual({ factorRequired: true });
    expect(form('caja', 0).errors).toEqual({ factorPositive: true });
    expect(form('caja', 12.12345).errors).toEqual({ factorDecimals: true });
    expect(form('caja', 12.5).valid).toBe(true);
    expect(form(null, null).valid).toBe(true);
  });
});

describe('mín/máx por ubicación', () => {
  const row = (minQty: number | null, maxQty: number | null) =>
    settingRow({
      locationId: 'suc1',
      locationCode: 'SUC-01',
      locationName: 'Sucursal 01',
      minQty,
      maxQty,
    });

  it('ambos o ninguno, ≥ 0, máximo ≥ mínimo y 4 decimales', () => {
    expect(row(null, null).valid).toBe(true);
    expect(row(5, 10).valid).toBe(true);
    expect(row(0, 0).valid).toBe(true);
    expect(minMaxMessage(row(5, null).errors)).toBe(
      'Captura mínimo y máximo, o deja ambos vacíos.',
    );
    expect(minMaxMessage(row(10, 5).errors)).toBe(
      'El máximo debe ser mayor o igual que el mínimo.',
    );
    expect(minMaxMessage(row(-1, 5).errors)).toBe('No pueden ser negativos.');
    expect(minMaxMessage(row(1.12345, 5).errors)).toBe('Máximo 4 decimales.');
  });

  it('vacío en ambos se envía como null (quita la configuración)', () => {
    expect(toSettingInputs([row(null, null), row(2, 8)])).toEqual([
      { locationId: 'suc1', minQty: null, maxQty: null },
      { locationId: 'suc1', minQty: 2, maxQty: 8 },
    ]);
  });
});

describe('ItemImportPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['catalog.view', 'catalog.manage'] });
  });

  afterEach(() => http.verify());

  async function chooseFile(csv: string) {
    const fixture = TestBed.createComponent(ItemImportPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = new File([csv], 'articulos.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return { fixture, el };
  }

  it('muestra la vista previa y, si el backend rechaza el archivo, la tabla de errores por fila', async () => {
    const csv = `${ITEM_IMPORT_COLUMNS.join(',')}\nHAR-9,Harina,materia_prima,Secos,kg,,,no,,,0\nX 1,Mal,otro,Secos,kg,,,no,,,0\n`;
    const { fixture, el } = await chooseFile(csv);

    expect(el.textContent).toContain('articulos.csv');
    expect(el.querySelectorAll('table.preview tbody tr')).toHaveLength(2);

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Importar 2 filas'))!
      .click();
    const req = http.expectOne('/api/v1/imports/items');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush(
      {
        status: 400,
        code: 'import_invalid',
        rowErrors: [
          {
            row: 3,
            column: 'sku',
            message: 'El SKU solo admite letras, números, punto, guion y guion bajo, sin espacios.',
          },
          { row: 3, column: 'tipo', message: "Tipo 'otro' no válido." },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    const rows = Array.from(el.querySelectorAll('[data-testid=import-errors] tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['3', 'sku', 'El SKU solo admite letras, números, punto, guion y guion bajo, sin espacios.'],
      ['3', 'tipo', "Tipo 'otro' no válido."],
    ]);
    expect(el.textContent).toContain('No se importó nada');
    // La fila con error se marca en la vista previa.
    expect(el.querySelectorAll('table.preview tr.has-error')).toHaveLength(1);
  });

  it('importación correcta muestra creados y actualizados', async () => {
    const { fixture, el } = await chooseFile(
      `sku,nombre,tipo,categoria,unidad_base\nA,B,terminado,Secos,kg\n`,
    );
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Importar 1 filas'))!
      .click();
    http.expectOne('/api/v1/imports/items').flush({ created: 1, updated: 0 });
    await fixture.whenStable();

    expect(el.textContent).toContain('1 artículos creados y 0 actualizados');
    expect(el.textContent).toContain('Importación terminada.');
  });

  it('sin archivo no muestra avisos de columnas', async () => {
    const fixture = TestBed.createComponent(ItemImportPage);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.notice-error')).toBeNull();
  });

  it('rechaza archivos vacíos sin llamar al backend', async () => {
    const { el } = await chooseFile('sku,nombre\n');
    expect(el.textContent).toContain('El archivo está vacío');
  });
});
