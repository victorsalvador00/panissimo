// Subconjunto de Material Symbols: la fuente completa pesa ~4 MB; el SGO AR solo usa unas decenas de íconos.
//
//   npm run icons          Busca los íconos usados en src/app, actualiza la lista y regenera el woff2
//                          (requiere Python con `pip install fonttools brotli`).
//   npm run icons:check    Falla si se usa un ícono que no está en el subconjunto (corre en `npm run lint`).
//
// Se detectan los nombres escritos en <mat-icon>…</mat-icon> (incluidas las cadenas dentro de {{ }}) y los
// asignados a propiedades `icon` en TypeScript (menú, tarjetas del tablero). Un ícono armado de otra forma
// (concatenando cadenas, por ejemplo) no se detecta: escríbelo completo.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = join(root, 'src', 'app');
const listFile = join(root, 'src', 'styles', 'fonts', 'material-symbols.icons.json');
const fontFile = join(root, 'src', 'styles', 'fonts', 'material-symbols-outlined.subset.woff2');
const fullFont = join(root, 'node_modules', 'material-symbols', 'material-symbols-outlined.woff2');

const ICON_NAME = /^[a-z0-9_]+$/;
const QUOTED = /'([^']*)'/g;

const { icons, problems } = collectIcons();
if (problems.length > 0) {
  fail(['No se pudo leer el nombre de estos íconos:', ...problems]);
}

if (process.argv.includes('--check')) {
  const subset = new Set(JSON.parse(readFileSync(listFile, 'utf8')));
  const missing = [...icons.keys()].filter((name) => !subset.has(name));
  if (missing.length > 0) {
    fail([
      'Íconos usados que no están en el subconjunto de Material Symbols (ejecuta `npm run icons`):',
      ...missing.map((name) => `  ${name} (${icons.get(name).join(', ')})`),
    ]);
  }
  console.log(`Íconos: ${icons.size} usados, todos en el subconjunto.`);
} else {
  const names = [...icons.keys()].sort();
  writeFileSync(listFile, JSON.stringify(names, null, 2) + '\n');
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  execFileSync(
    python,
    [join(root, 'scripts', 'subset-material-symbols.py'), fullFont, listFile, fontFile],
    {
      stdio: 'inherit',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    },
  );
  console.log(`Subconjunto generado con ${names.length} íconos en ${relative(root, fontFile)}.`);
}

/** @returns {{ icons: Map<string, string[]>, problems: string[] }} nombre → archivos donde aparece. */
function collectIcons() {
  const found = new Map();
  const problems = [];
  const add = (name, file) => {
    if (!ICON_NAME.test(name)) {
      problems.push(`  "${name}" en ${file}`);
      return;
    }
    const files = found.get(name) ?? [];
    if (!files.includes(file)) files.push(file);
    found.set(name, files);
  };

  for (const path of sourceFiles(sourceDir)) {
    const file = relative(root, path).replaceAll('\\', '/');
    // Sin comentarios HTML: uno que mencione "<mat-icon>" haría que el regex se tragara el ícono siguiente.
    const text = readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->/g, '');

    for (const [, content] of text.matchAll(/<mat-icon\b[^>]*>([\s\S]*?)<\/mat-icon>/g)) {
      const trimmed = content.trim();
      if (trimmed.includes('{{')) {
        // Interpolación: o es un ternario de literales, o una propiedad `icon` que se revisa abajo.
        for (const [, name] of trimmed.matchAll(QUOTED)) add(name, file);
      } else if (trimmed) {
        add(trimmed, file);
      }
    }
    for (const [, value] of text.matchAll(/\bicon\s*[:=]\s*([^,;\n}]+)/g)) {
      for (const [, name] of value.matchAll(QUOTED)) add(name, file);
    }
  }
  return { icons: found, problems };
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
      yield path;
    }
  }
}

function fail(lines) {
  console.error(lines.join('\n'));
  process.exit(1);
}
