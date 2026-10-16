import { registerLocaleData } from '@angular/common';
import localeEsMx from '@angular/common/locales/es-MX';
import { formatMxn } from './mxn.pipe';
import { formatQty } from './qty.pipe';
import { enumLabel, ENUM_LABELS } from './status-label.pipe';

registerLocaleData(localeEsMx, 'es-MX');

describe('qty', () => {
  it('muestra hasta 4 decimales sin ceros sobrantes y con la unidad', () => {
    expect(formatQty(12.5, 'es-MX', 'kg')).toBe('12.5 kg');
    expect(formatQty(12.5, 'es-MX')).toBe('12.5');
    expect(formatQty(3, 'es-MX', 'pz')).toBe('3 pz');
    expect(formatQty(0.12345, 'es-MX', 'l')).toBe('0.1235 l');
    expect(formatQty(1234.1, 'es-MX', 'kg')).toBe('1,234.1 kg');
    expect(formatQty(-2.25, 'es-MX', 'kg')).toBe('-2.25 kg');
  });

  it('vacío para null o NaN', () => {
    expect(formatQty(null, 'es-MX', 'kg')).toBe('');
    expect(formatQty(Number.NaN, 'es-MX')).toBe('');
  });
});

describe('mxn', () => {
  it('formatea pesos con 2 decimales', () => {
    expect(formatMxn(1234.56, 'es-MX')).toBe('$1,234.56');
    expect(formatMxn(0, 'es-MX')).toBe('$0.00');
    expect(formatMxn(1234.5, 'es-MX')).toBe('$1,234.50');
    expect(formatMxn(-15, 'es-MX')).toBe('-$15.00');
  });

  it('permite más decimales para costos unitarios', () => {
    expect(formatMxn(12.3456, 'es-MX', '1.2-4')).toBe('$12.3456');
  });

  it('vacío para null', () => {
    expect(formatMxn(undefined, 'es-MX')).toBe('');
  });
});

describe('statusLabel', () => {
  it('traduce estados según el documento', () => {
    expect(enumLabel('PurchaseOrderStatus', 'PendingApproval')).toBe('Por aprobar');
    expect(enumLabel('TransferStatus', 'Dispatched')).toBe('En tránsito');
    expect(enumLabel('BranchOrderStatus', 'Approved')).toBe('Aprobado');
    expect(enumLabel('RequisitionStatus', 'Approved')).toBe('Aprobada');
  });

  it('ninguna etiqueta queda vacía ni en inglés igual al valor', () => {
    for (const labels of Object.values(ENUM_LABELS)) {
      for (const [value, label] of Object.entries(labels)) {
        expect(label, value).not.toBe('');
        expect(label, value).not.toBe(value);
      }
    }
  });

  it('valor desconocido se muestra tal cual', () => {
    expect(enumLabel('TransferStatus', 'Nuevo')).toBe('Nuevo');
    expect(enumLabel('TransferStatus', null)).toBe('');
  });
});
