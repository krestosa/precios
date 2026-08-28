import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const defaultOutput = path.join(rootDir, 'handoff-output');

function readOutputArgument() {
  const index = process.argv.indexOf('--output');
  if (index === -1) return defaultOutput;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('Falta el valor de --output.');
  }
  return path.resolve(rootDir, value);
}

async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function copyDirectory(source, destination) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`No se permiten enlaces simbólicos: ${sourcePath}`);
    }
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function requireFile(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  const stat = await fs.stat(fullPath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Falta un archivo requerido: ${relativePath}`);
  }
  return fullPath;
}

async function requireDirectory(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  const stat = await fs.stat(fullPath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Falta un directorio requerido: ${relativePath}`);
  }
  return fullPath;
}

async function main() {
  const outputDir = readOutputArgument();
  const relativeOutput = path.relative(rootDir, outputDir);
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error('La salida debe estar dentro del working tree actual.');
  }

  const testsSource = await requireDirectory('tests');

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const rootFiles = [
    'package.json',
    'index.html',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'vitest.config.ts',
  ];

  for (const relativePath of rootFiles) {
    const source = await requireFile(relativePath);
    await copyFile(source, path.join(outputDir, relativePath));
  }

  const lockSource = path.join(rootDir, 'package-lock.json');
  const lockStat = await fs.stat(lockSource).catch(() => null);
  if (lockStat?.isFile()) {
    await copyFile(lockSource, path.join(outputDir, 'package-lock.json'));
  }

  await copyDirectory(path.join(rootDir, 'src'), path.join(outputDir, 'src'));
  await copyDirectory(testsSource, path.join(outputDir, 'tests'));

  const portableScripts = ['portable-pipeline.mjs', 'serve-dist.mjs'];
  for (const fileName of portableScripts) {
    const source = await requireFile(path.join('scripts', fileName));
    await copyFile(source, path.join(outputDir, 'scripts', fileName));
  }

  const handoffFiles = ['README.md', 'install-build.ps1', 'install-build.sh', 'run.ps1', 'run.sh'];
  for (const fileName of handoffFiles) {
    const source = await requireFile(path.join('handoff', fileName));
    await copyFile(source, path.join(outputDir, fileName));
  }

  const forbiddenRoots = ['.git', '.github'];
  for (const name of forbiddenRoots) {
    const forbidden = path.join(outputDir, name);
    const stat = await fs.stat(forbidden).catch(() => null);
    if (stat) {
      throw new Error(`La entrega contiene una ruta prohibida: ${name}`);
    }
  }

  const textPatterns = ['github.com', 'git clone', 'git pull', '.github/', '.git/'];
  const stack = [outputDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const buffer = await fs.readFile(fullPath);
      if (buffer.includes(0)) continue;
      const text = buffer.toString('utf8').toLowerCase();
      const match = textPatterns.find((pattern) => text.includes(pattern));
      if (match) {
        throw new Error(`La entrega contiene una referencia de control de versiones no permitida en ${path.relative(outputDir, fullPath)}.`);
      }
    }
  }

  console.log(`Entrega ensamblada en ${path.relative(rootDir, outputDir)}`);
}

await main();
