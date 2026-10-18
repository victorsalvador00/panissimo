import { columns, exampleRows } from './items-import-page';

describe('ItemsImportPage template', () => {
  it('has one value per column in every example row', () => {
    for (const row of exampleRows) expect(row).toHaveLength(columns.length);
  });

  it('has a single SKU column (D-07)', () => {
    expect(columns.filter((c) => c.startsWith('sku'))).toEqual(['sku', 'sku_granel']);
  });

  it('links the packaged example to a bulk SKU of the same template', () => {
    const sku = columns.indexOf('sku');
    const bulkSku = columns.indexOf('sku_granel');
    const skus = exampleRows.map((r) => r[sku]);
    for (const row of exampleRows.filter((r) => r[bulkSku] !== ''))
      expect(skus).toContain(row[bulkSku]);
  });
});
