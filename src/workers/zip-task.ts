import { zipSync } from 'fflate';
import type { Zippable } from 'fflate';

export interface ZipTaskEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface ZipTaskInput {
  readonly entries: readonly ZipTaskEntry[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSafeZipName(name: string): void {
  if (name === '' || name.startsWith('/') || name.includes('\\')) {
    throw new Error(`Nombre de archivo ZIP inseguro: ${name}`);
  }
  const segments = name.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Nombre de archivo ZIP inseguro: ${name}`);
  }
}

export function runZipTask(input: ZipTaskInput): Uint8Array {
  const ordered = [...input.entries].sort((left, right) => compareText(left.name, right.name));
  const seen = new Set<string>();
  const payload: Zippable = {};

  for (const entry of ordered) {
    assertSafeZipName(entry.name);
    if (seen.has(entry.name)) throw new Error(`Nombre de archivo ZIP duplicado: ${entry.name}`);
    seen.add(entry.name);
    payload[entry.name] = [
      entry.bytes,
      {
        level: 9,
        mtime: new Date(1980, 0, 1, 0, 0, 0, 0),
        os: 0,
      },
    ];
  }

  return zipSync(payload, { level: 9 });
}
