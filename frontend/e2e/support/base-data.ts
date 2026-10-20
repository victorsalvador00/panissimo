/**
 * The base catalogs the E2E tests work on: deploy/seed/sample-data.json, which the backend loads at start in development
 * and in the demo (PAN__Seed__SampleDataFile). The tests never create catalog records; if one is missing they fail and
 * say so (see AdminApi.itemId, locationId…). They do leave documents and stock on these records at every run.
 */
export const base = {
  plant: 'PLANTA',
  /** Sub-warehouses of the plant. */
  rawMaterials: 'PLANTA-MP',
  supplies: 'PLANTA-INS',
  finishedGoods: 'PLANTA-PT',
  /** RN-49: factory of the dough recipes. */
  factory: 'FABRICA-PT',
  branch: 'SUC-001',
  branchName: 'Sucursal 1',

  /** Raw material, kg, with lots (180 days) and purchase unit "bulto" of 25 kg; sold by Materias Primas Veracruz. */
  flour: 'MP-001',
  flourName: 'Harina de trigo',
  /** Raw material, kg, without lots; sold by ABARROTES VERACRUZ. */
  salt: 'MP-002',
  saltName: 'Sal',
  /** Supply, pza, without lots (purchase unit "paq" of 100). */
  bag: 'IN-002',
  bagName: 'Bolsa Empaquetado',
  /** Finished good, bulk, pza, with lots (2 days), recipe v1 of 20 pza made at FABRICA-PT. */
  donut: 'PT-020-DONA',
  donutName: 'Dona a granel',
  /** Finished good, packaged version of the donut. */
  packagedDonut: 'PT-020-DONA-EMP',
  packagedDonutName: 'Dona a granel empaquetado',
  category: 'Harinas',

  supplierName: 'Materias Primas Veracruz',
  customer: 'OXXO-001',
  customerName: 'OXXO 01',
  deliveryPoint: 'La Fragua',
  vehicle: 'PRB-001-A',
  driver: 'Juan Pérez (prueba)',
} as const;
