/** Lectura y escritura mínima de CSV (RFC 4180) para vistas previas y plantillas. */

/** Marca de orden de bytes: Excel la necesita para abrir los acentos de un CSV en UTF-8. */
const BOM = String.fromCharCode(0xfeff);

export interface CsvTable {
  headers: string[];
  /** Filas de datos (sin encabezado), con el número de línea del archivo para ubicar errores. */
  rows: { line: number; cells: string[] }[];
  delimiter: ',' | ';';
}

/** Separador del archivo: el que más aparece en la primera línea (fuera de comillas), como el backend. */
export function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      commas++;
    } else if (!quoted && char === ';') {
      semicolons++;
    }
  }
  return semicolons > commas ? ';' : ',';
}

/** Interpreta el CSV respetando comillas (`"a, b"`, `"dijo ""hola"""`) y saltos de línea dentro de ellas. */
export function parseCsv(input: string): CsvTable {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: { line: number; cells: string[] }[] = [];

  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell.trim());
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (cells.some((c) => c !== '')) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') {
          line++;
        }
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || cells.length) {
    endRecord();
  }

  const [header, ...rows] = records;
  return {
    headers: (header?.cells ?? []).map((h) => h.toLowerCase()),
    rows,
    delimiter,
  };
}

function escape(value: string): string {
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV con BOM (Excel abre bien los acentos) y fin de línea de Windows. */
export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escape).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Descarga un archivo generado en el navegador. */
export function downloadText(
  fileName: string,
  content: string,
  type = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
