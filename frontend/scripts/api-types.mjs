// Regenerates src/app/core/api/schema.d.ts from the OpenAPI of the running backend (frontend §3).
// PAN_API_URL overrides the default http://localhost:8090.
import { execFileSync } from 'node:child_process';

const api = process.env.PAN_API_URL ?? 'http://localhost:8090';
const output = 'src/app/core/api/schema.d.ts';
const run = (bin, args) => execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit' });

run('node_modules/openapi-typescript/bin/cli.js', [`${api}/openapi/v1.json`, '-o', output]);
run('node_modules/prettier/bin/prettier.cjs', ['--write', '--log-level', 'warn', output]);
