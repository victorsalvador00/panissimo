import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { XlsxImport, XlsxPreview, canImport } from './xlsx-import';

const clean: XlsxPreview = { rowCount: 2, errors: [], warnings: [] };
const withErrors: XlsxPreview = {
  rowCount: 2,
  errors: [{ row: 2, column: 'cantidad', message: 'Debe ser mayor que cero.' }],
  warnings: [],
};
const withWarnings: XlsxPreview = {
  rowCount: 2,
  errors: [],
  warnings: [{ row: null, message: 'Este archivo ya se importó.' }],
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [XlsxImport],
  template: `
    <app-xlsx-import
      templateName="plantilla.xlsx"
      [template]="template"
      [validate]="validate"
      [submit]="submit"
      (imported)="imported.set($event)"
    >
      <p preview>Vista previa</p>
      <p result>Importado</p>
    </app-xlsx-import>
  `,
})
class Host {
  preview: XlsxPreview = clean;
  readonly imported = signal<string | null>(null);
  readonly submitted: boolean[] = [];
  readonly template = () => of(new Blob());
  readonly validate = () => of(this.preview);
  readonly submit = (_file: File, confirmWarnings: boolean) => {
    this.submitted.push(confirmWarnings);
    return of('ok');
  };
}

function xlsx(): File {
  return new File(['x'], 'ordenes.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

async function choose(preview: XlsxPreview) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.preview = preview;
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [xlsx()] });
  input.dispatchEvent(new Event('change'));
  await fixture.whenStable();
  fixture.detectChanges();
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(label),
    );
  return { fixture, element, button };
}

describe('canImport (RN-91, RN-93)', () => {
  it('errors block; warnings need the acknowledgement', () => {
    expect(canImport(null, true)).toBe(false);
    expect(canImport(withErrors, true)).toBe(false);
    expect(canImport(withWarnings, false)).toBe(false);
    expect(canImport(withWarnings, true)).toBe(true);
    expect(canImport(clean, false)).toBe(true);
  });
});

describe('XlsxImport', () => {
  it('with errors shows them and offers only another file', async () => {
    const { element, button } = await choose(withErrors);
    expect(element.textContent).toContain('Debe ser mayor que cero.');
    expect(element.textContent).not.toContain('Vista previa');
    expect(button('Importar')).toBeUndefined();
    expect(button('Elegir otro archivo')).toBeDefined();
  });

  it('with warnings imports only after checking "Entiendo los avisos"', async () => {
    const { fixture, element, button } = await choose(withWarnings);
    expect(element.textContent).toContain('Este archivo ya se importó.');
    expect(button('Importar')!.disabled).toBe(true);

    element.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button('Importar')!.disabled).toBe(false);

    button('Importar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.submitted).toEqual([true]);
    expect(element.textContent).toContain('Importado');
  });

  it('rejects a file that is not .xlsx without sending it', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'ordenes.csv')] });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Elige un archivo de Excel (.xlsx).');
  });
});
