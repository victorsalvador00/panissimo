// Material Symbols subset (frontend §4.1).
//   node scripts/icons.mjs          → finds the icons used in src/ and rebuilds public/fonts/material-symbols.woff2
//   node scripts/icons.mjs --check  → fails if src/ uses an icon that is not in the subset (part of `npm run lint`)
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const src = join(root, 'src');
const listPath = join(root, 'scripts', 'icons.json');
const fontSource = join(root, 'node_modules', 'material-symbols', 'material-symbols-outlined.woff2');
const fontOutput = join(root, 'public', 'fonts', 'material-symbols.woff2');

const name = '([a-z0-9_]+)';
const patterns = [
  new RegExp(`<mat-icon[^>]*>\\s*${name}\\s*</mat-icon>`, 'g'), // <mat-icon>home</mat-icon>
  new RegExp(`fontIcon="${name}"`, 'g'), // <mat-icon fontIcon="home" />
  new RegExp(`\\bicon:\\s*'${name}'`, 'g'), // { icon: 'home' } in menus and tables
];

/** Removes HTML, block and line comments, so commented-out icons are not counted. */
function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    // A block comment starts a line or follows a space: accept="image/*" is not one.
    .replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

// <mat-icon>{{ open ? 'expand_less' : 'expand_more' }}</mat-icon>: every quoted name of the interpolation.
const interpolated = /<mat-icon[^>]*>\s*\{\{([\s\S]*?)\}\}\s*<\/mat-icon>/g;
const quoted = new RegExp(`'${name}'`, 'g');

function usedIcons() {
  const used = new Map();
  const add = (icon, file) => {
    if (!used.has(icon)) used.set(icon, relative(root, file));
  };
  for (const file of walk(src)) {
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) add(match[1], file);
    for (const match of text.matchAll(interpolated))
      for (const icon of match[1].matchAll(quoted)) add(icon[1], file);
  }
  return used;
}

const used = usedIcons();
const listed = new Set(JSON.parse(readFileSync(listPath, 'utf8')));

if (process.argv.includes('--check')) {
  const missing = [...used.keys()].filter((icon) => !listed.has(icon));
  if (missing.length > 0) {
    console.error(`Íconos fuera del subconjunto: ${missing.map((i) => `${i} (${used.get(i)})`).join(', ')}`);
    console.error('Ejecuta `npm run icons` para regenerarlo.');
    process.exit(1);
  }
  console.log(`icons:check: ${used.size} íconos en uso, todos en el subconjunto.`);
} else {
  const icons = [...new Set([...used.keys()])].sort();
  writeFileSync(listPath, JSON.stringify(icons, null, 2) + '\n');
  execFileSync('python', [join(root, 'scripts', 'subset-material-symbols.py'), fontSource, listPath, fontOutput], {
    stdio: 'inherit',
  });
}
