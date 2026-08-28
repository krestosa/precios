import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const qaDir = path.join(rootDir, 'qa');
const logsDir = path.join(qaDir, 'logs');
const distDir = path.join(rootDir, 'dist');
const lockPath = path.join(rootDir, 'package-lock.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

await fs.mkdir(logsDir, { recursive: true });

function normalizeOutput(value) {
  return value.replace(/\r\n/g, '\n');
}

async function runCommand(label, command, args, { allowFailure = false } = {}) {
  const logPath = path.join(logsDir, `${label}.log`);
  let stdout = '';
  let stderr = '';

  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  const output = `${stdout}${stderr}`;
  await fs.writeFile(logPath, normalizeOutput(output), 'utf8');

  if (exitCode !== 0 && !allowFailure) {
    throw new Error(`El comando ${label} terminó con código ${exitCode}.`);
  }

  return {
    exitCode,
    output: normalizeOutput(output),
    stdout: normalizeOutput(stdout),
    stderr: normalizeOutput(stderr),
    logPath,
  };
}

async function readLockInfo() {
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw);
    const valid = Number.isInteger(parsed.lockfileVersion) && parsed.lockfileVersion > 0 && typeof parsed.packages === 'object' && parsed.packages !== null;
    return { exists: true, valid, parsed, raw };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, valid: false, parsed: null, raw: null };
    }
    return { exists: true, valid: false, parsed: null, raw: null };
  }
}

async function listFiles(directory) {
  const result = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`No se permiten enlaces simbólicos en la entrega: ${fullPath}`);
    }
    if (entry.isDirectory()) {
      result.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }

  return result;
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await fs.readFile(filePath));
  return hash.digest('hex');
}

async function ensureDist() {
  const stat = await fs.stat(distDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('La compilación no produjo el directorio dist.');
  }

  const files = await listFiles(distDir);
  if (files.length === 0) {
    throw new Error('La compilación produjo un directorio dist vacío.');
  }

  return files;
}

async function collectHashTargets(distFiles) {
  const fixed = [
    'package.json',
    'package-lock.json',
    'index.html',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'vitest.config.ts',
    'install-build.ps1',
    'install-build.sh',
    'run.ps1',
    'run.sh',
    'README.md',
    path.join('scripts', 'portable-pipeline.mjs'),
    path.join('scripts', 'serve-dist.mjs'),
  ];

  const existing = [];
  for (const relativePath of fixed) {
    const fullPath = path.join(rootDir, relativePath);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isFile()) {
      existing.push(fullPath);
    }
  }

  const sourceFiles = await listFiles(path.join(rootDir, 'src'));
  return [...distFiles, ...sourceFiles, ...existing].sort((a, b) => path.relative(rootDir, a).localeCompare(path.relative(rootDir, b), 'en'));
}

async function main() {
  const versions = [];
  const nodeVersion = await runCommand('node-version', process.execPath, ['--version']);
  versions.push(`node ${nodeVersion.output.trim()}`);
  const npmVersion = await runCommand('npm-version', npmCommand, ['--version']);
  versions.push(`npm ${npmVersion.output.trim()}`);
  await fs.writeFile(path.join(logsDir, 'versions.log'), `${versions.join('\n')}\n`, 'utf8');

  const initialLock = await readLockInfo();
  const installMethod = initialLock.valid ? 'ci' : 'install';
  const installArgs = initialLock.valid
    ? ['ci', '--no-audit', '--no-fund']
    : ['install', '--no-audit', '--no-fund'];

  console.log(`Método de instalación: ${installMethod}`);
  await runCommand('install', npmCommand, installArgs);

  const effectiveLock = await readLockInfo();
  if (!effectiveLock.valid) {
    throw new Error('npm no dejó un package-lock.json válido después de instalar dependencias.');
  }

  await runCommand('typecheck', npmCommand, ['run', 'typecheck']);
  await runCommand('tests', npmCommand, ['run', 'test:run']);
  await runCommand('build', npmCommand, ['run', 'build']);

  const distFiles = await ensureDist();
  const dependencyTree = await runCommand('dependency-tree', npmCommand, ['ls', '--all', '--json'], { allowFailure: true });
  await fs.writeFile(path.join(qaDir, 'dependency-tree.json'), dependencyTree.stdout || '{}\n', 'utf8');

  const hashTargets = await collectHashTargets(distFiles);
  const sums = [];
  for (const filePath of hashTargets) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/');
    sums.push(`${await sha256(filePath)}  ${relativePath}`);
  }
  await fs.writeFile(path.join(qaDir, 'sha256sums.txt'), `${sums.join('\n')}\n`, 'utf8');

  const lockHash = await sha256(lockPath);
  const metadata = {
    schemaVersion: 1,
    inputSha: process.env.BUILD_INPUT_SHA || null,
    runId: process.env.BUILD_RUN_ID || null,
    generatedAt: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    platform: process.platform,
    osRelease: os.release(),
    architecture: process.arch,
    nodeVersion: nodeVersion.output.trim(),
    npmVersion: npmVersion.output.trim(),
    installMethod,
    lockfile: {
      lockfileVersion: effectiveLock.parsed.lockfileVersion,
      sha256: lockHash,
    },
    commands: {
      install: 'passed',
      typecheck: 'passed',
      tests: 'passed',
      build: 'passed',
      dependencyTreeExitCode: dependencyTree.exitCode,
    },
    dist: {
      fileCount: distFiles.length,
    },
  };
  await fs.writeFile(path.join(qaDir, 'build-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  await fs.rm(path.join(rootDir, 'node_modules'), { recursive: true, force: true });
  console.log(`Pipeline completado. dist contiene ${distFiles.length} archivo(s).`);
}

await main();
