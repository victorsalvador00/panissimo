import { buildCsv, parseCsv } from './csv';

describe('csv', () => {
  it('reads commas, quotes with commas and escaped quotes, CRLF and BOM', () => {
    const doc = parseCsv(
      String.fromCharCode(0xfeff) +
        'SKU,Nombre\r\nA1,"Concha, paquete de 4"\r\nB2,"Dice ""hola"""\r\n',
    );
    expect(doc.headers).toEqual(['sku', 'nombre']);
    expect(doc.rows).toEqual([
      ['A1', 'Concha, paquete de 4'],
      ['B2', 'Dice "hola"'],
    ]);
  });

  it('detects the semicolon of Excel in Spanish and keeps empty fields', () => {
    const doc = parseCsv('sku;area;nombre\nX;;Sin área\n');
    expect(doc.rows).toEqual([['X', '', 'Sin área']]);
  });

  it('accepts line breaks inside quotes and ignores blank lines', () => {
    const doc = parseCsv('a,b\n"uno\ndos",3\n\n,\n');
    expect(doc.rows).toEqual([['uno\ndos', '3']]);
  });

  it('builds a template with BOM that reads back the same', () => {
    const text = buildCsv(
      ['sku', 'nombre'],
      [
        ['A1', 'Pan, dulce'],
        ['B2', 'Dice "hola"'],
      ],
    );
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(text).rows).toEqual([
      ['A1', 'Pan, dulce'],
      ['B2', 'Dice "hola"'],
    ]);
  });
});
