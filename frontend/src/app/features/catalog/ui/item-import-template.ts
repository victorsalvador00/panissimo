/**
 * Columnas del CSV de artículos que espera el backend (`ItemImportService.Columns`) y la guía de
 * valores válidos que se muestra en pantalla.
 */
export const ITEM_IMPORT_COLUMNS = [
  'sku',
  'nombre',
  'tipo',
  'categoria',
  'unidad_base',
  'unidad_compra',
  'factor_compra',
  'maneja_lotes',
  'vida_util_dias',
  'almacenamiento',
  'iva',
] as const;

export const ITEM_IMPORT_REQUIRED = ['sku', 'nombre', 'tipo', 'categoria', 'unidad_base'];

export const ITEM_IMPORT_GUIDE: { column: string; values: string }[] = [
  {
    column: 'sku',
    values: 'Obligatorio. Letras, números, punto, guion y guion bajo. Si ya existe, se actualiza.',
  },
  { column: 'nombre', values: 'Obligatorio.' },
  { column: 'tipo', values: 'Obligatorio: materia_prima, intermedio o terminado.' },
  { column: 'categoria', values: 'Obligatorio: nombre de una categoría existente.' },
  { column: 'unidad_base', values: 'Obligatorio: código de una unidad existente (ej. kg).' },
  { column: 'unidad_compra', values: 'Opcional: código de unidad (ej. caja).' },
  {
    column: 'factor_compra',
    values: 'Obligatorio si hay unidad de compra. Punto decimal (ej. 12.5).',
  },
  { column: 'maneja_lotes', values: 'si o no (vacío = no).' },
  { column: 'vida_util_dias', values: 'Opcional: número entero de días.' },
  { column: 'almacenamiento', values: 'ambiente, refrigerado o congelado (vacío = ambiente).' },
  { column: 'iva', values: '0 o 16 (vacío = 0).' },
];

export const ITEM_IMPORT_EXAMPLE_ROWS: string[][] = [
  [
    'HAR-002',
    'Harina integral',
    'materia_prima',
    'Secos',
    'kg',
    '',
    '',
    'si',
    '180',
    'ambiente',
    '0',
  ],
  [
    'AZU-002',
    'Azúcar mascabado',
    'materia_prima',
    'Secos',
    'kg',
    'caja',
    '25',
    'no',
    '',
    'ambiente',
    '0',
  ],
];
