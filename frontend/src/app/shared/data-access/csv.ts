/**
 * CSV in the browser (frontend §8, `app-csv-import`): RFC 4180 reader with `,` or `;` (Excel in Spanish saves with `;`),
 * and templates with a BOM so Excel opens accents correctly. Only for the preview and the templates: the backend parses
 * and validates the file it receives.
 */

/** Byte order mark: tells Excel the file is UTF-8 (accents). */
const BOM = String.fromCharCode(0xfeff);

export interface CsvDocument {
  headers: string[];
  rows: string[][];
}

/** Parses the text; the delimiter is the one (`,` or `;`) that appears more in the header line. */
export function parseCsv(text: string): CsvDocument {
  const clean = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  const delimiter = count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((value) => value.trim() !== ''));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim().toLowerCase()), rows };
}

/** CSV text with a BOM, `,` as delimiter and quotes where needed. */
export function buildCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (values: readonly string[]) => values.map(escape).join(',');
  return BOM + [line(headers), ...rows.map(line)].join('\r\n') + '\r\n';
}

/** Offers the text as a download (the template), without going through the server. */
export function downloadText(
  fileName: string,
  text: string,
  type = 'text/csv;charset=utf-8',
): void {
  downloadBlob(fileName, new Blob([text], { type }));
}

/** Saves a file the backend generated (an Excel template…). */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function escape(value: string): string {
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}
