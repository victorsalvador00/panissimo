// Genera src/app/core/api/schema.d.ts desde el OpenAPI del backend en ejecución.
// Uso: npm run api:types   (SGO_API_URL cambia el origen; por defecto http://localhost:8090)
import { writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const apiUrl = process.env.SGO_API_URL ?? 'http://localhost:8090';
const source = new URL('/openapi/v1.json', apiUrl);
const output = new URL('../src/app/core/api/schema.d.ts', import.meta.url);

const ast = await openapiTS(source, {
  // Los campos marcados como requeridos en .NET pueden ser null; los opcionales no existen.
  exportType: false,
  alphabetize: true,
});

const header =
  '/**\n * Generado por `npm run api:types` desde ' +
  source.pathname +
  '. No editar a mano.\n */\n\n';
await writeFile(output, header + astToString(ast));
console.log(`Tipos generados en src/app/core/api/schema.d.ts desde ${source}`);
