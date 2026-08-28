import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const PRODUCT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html']);
const FORBIDDEN_PRODUCT_LITERALS = [
  'Tres Tiempos',
  'Campaña Todos Incompletos 2031',
  'Campaña General Inédita',
  'Especial Palermo Nocturno',
  'LOCAL FUTURO 2030',
  'PALERMO',
  'RECOVA',
  'Story 1',
  'Story 7',
  'Feed 1',
  'Feed 7',
  'Mailing.svg',
] as const;

async function productFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await productFiles(path));
      continue;
    }
    if (!entry.isFile() || !PRODUCT_EXTENSIONS.has(extname(entry.name))) continue;
    if (/\.(?:test|spec)\.[^.]+$/iu.test(entry.name)) continue;
    files.push(path);
  }
  return files;
}

describe('W11 hardcode audit productivo', () => {
  it('mantiene nombres de acción/campaña, taxonomías e índices observados fuera de src productivo', async () => {
    const violations: string[] = [];
    for (const file of await productFiles(SRC_ROOT)) {
      const content = await readFile(file, 'utf8');
      for (const literal of FORBIDDEN_PRODUCT_LITERALS) {
        if (!content.toLocaleLowerCase('es').includes(literal.toLocaleLowerCase('es'))) continue;
        violations.push(`${relative(SRC_ROOT, file)} :: ${literal}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
