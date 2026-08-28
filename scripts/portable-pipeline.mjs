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
const testsDir = path.join(rootDir, 'tests');
const lockPath = path.join(rootDir, 'package-lock.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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

async function ensureTests() {
  const stat = await fs.stat(testsDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('Falta la suite tests requerida para ejecutar QA.');
  }

  const files = await listFiles(testsDir);
  const testFiles = files.filter((filePath) => /\.(test|spec)\.ts$/u.test(filePath));
  if (testFiles.length === 0) {
    throw new Error('La suite tests no contiene archivos de prueba detectables.');
  }

  return testFiles;
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

async function collectHashTargets(distFiles, testFiles) {
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
    path.join('scripts', 'upload-feedback-probe.mjs'),
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
  return [...distFiles, ...sourceFiles, ...testFiles, ...existing].sort((a, b) => path.relative(rootDir, a).localeCompare(path.relative(rootDir, b), 'en'));
}

async function fetchRequired(url, label, accept) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept,
      'user-agent': 'precios-deployment-smoke/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`${label} respondió HTTP ${response.status} en ${response.url}.`);
  }

  return response;
}

function assetSource(tag) {
  return tag.match(/\bsrc=(['"])([^'"]+)\1/iu)?.[2];
}

function assetHref(tag) {
  return tag.match(/\bhref=(['"])([^'"]+)\1/iu)?.[2];
}

async function runDeploymentSmoke(urlValue) {
  if (typeof urlValue !== 'string' || urlValue.trim() === '') {
    throw new Error('El smoke de deployment requiere una URL HTTP(S).');
  }

  const requestedUrl = new URL(urlValue);
  if (requestedUrl.protocol !== 'https:' && requestedUrl.protocol !== 'http:') {
    throw new Error(`El smoke no admite el protocolo ${requestedUrl.protocol}.`);
  }

  const pageResponse = await fetchRequired(requestedUrl, 'La página desplegada', 'text/html,*/*;q=0.8');
  const html = await pageResponse.text();
  if (!/<main\b[^>]*\bid=(['"])app\1[^>]*>/iu.test(html)) {
    throw new Error('La página desplegada no contiene el root #app esperado.');
  }

  const scriptTags = html.match(/<script\b[^>]*>/giu) ?? [];
  const moduleTag = scriptTags.find((tag) => /\btype=(['"])module\1/iu.test(tag) && assetSource(tag) !== undefined);
  const moduleSource = moduleTag === undefined ? undefined : assetSource(moduleTag);
  if (moduleSource === undefined) {
    throw new Error('La página desplegada no referencia un entrypoint de módulo.');
  }

  const moduleUrl = new URL(moduleSource, pageResponse.url);
  const moduleResponse = await fetchRequired(moduleUrl, 'El módulo principal desplegado', '*/*');
  const moduleBytes = await moduleResponse.arrayBuffer();
  if (moduleBytes.byteLength === 0) {
    throw new Error('El módulo principal desplegado está vacío.');
  }

  const styleTags = html.match(/<link\b[^>]*>/giu) ?? [];
  const stylesheetTag = styleTags.find((tag) => /\brel=(['"])stylesheet\1/iu.test(tag) && assetHref(tag) !== undefined);
  const stylesheetHref = stylesheetTag === undefined ? undefined : assetHref(stylesheetTag);
  let stylesheetStatus = null;
  if (stylesheetHref !== undefined) {
    const stylesheetUrl = new URL(stylesheetHref, pageResponse.url);
    const stylesheetResponse = await fetchRequired(stylesheetUrl, 'La hoja de estilos desplegada', 'text/css,*/*;q=0.8');
    const stylesheetBytes = await stylesheetResponse.arrayBuffer();
    if (stylesheetBytes.byteLength === 0) {
      throw new Error('La hoja de estilos desplegada está vacía.');
    }
    stylesheetStatus = stylesheetResponse.status;
  }

  console.log(JSON.stringify({
    smoke: 'passed',
    requestedUrl: requestedUrl.href,
    finalUrl: pageResponse.url,
    pageStatus: pageResponse.status,
    moduleUrl: moduleResponse.url,
    moduleStatus: moduleResponse.status,
    stylesheetStatus,
  }));
}

async function main() {
  await fs.mkdir(logsDir, { recursive: true });

  const versions = [];
  const nodeVersion = await runCommand('node-version', process.execPath, ['--version']);
  versions.push(`node ${nodeVersion.output.trim()}`);
  const npmVersion = await runCommand('npm-version', npmCommand, ['--version']);
  versions.push(`npm ${npmVersion.output.trim()}`);
  await fs.writeFile(path.join(logsDir, 'versions.log'), `${versions.join('\n')}\n`, 'utf8');

  const testFiles = await ensureTests();
  console.log(`Suite QA detectada: ${testFiles.length} archivo(s).`);

  const initialLock = await readLockInfo();
  if (initialLock.exists && !initialLock.valid) {
    throw new Error('Existe package-lock.json pero no es válido; no se reemplaza automáticamente.');
  }

  const installMethod = initialLock.exists ? 'ci' : 'install';
  const installArgs = initialLock.exists
    ? ['ci', '--no-audit', '--no-fund']
    : ['install', '--package-lock', '--no-audit', '--no-fund'];

  console.log(`Método de instalación: ${installMethod}`);
  await runCommand('install', npmCommand, installArgs);

  const effectiveLock = await readLockInfo();
  if (!effectiveLock.valid) {
    throw new Error('npm no dejó un package-lock.json válido después de instalar dependencias.');
  }

  await runCommand('typecheck', npmCommand, ['run', 'typecheck']);
  await runCommand('tests', npmCommand, ['run', 'test:run']);
  await runCommand('build', npmCommand, ['run', 'build']);
  await runCommand('upload-feedback-probe', process.execPath, [path.join('scripts', 'upload-feedback-probe.mjs')]);

  const distFiles = await ensureDist();
  const dependencyTree = await runCommand('dependency-tree', npmCommand, ['ls', '--all', '--json'], { allowFailure: true });
  await fs.writeFile(path.join(qaDir, 'dependency-tree.json'), dependencyTree.stdout || '{}\n', 'utf8');

  const hashTargets = await collectHashTargets(distFiles, testFiles);
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
      uploadFeedbackProbe: 'passed',
      dependencyTreeExitCode: dependencyTree.exitCode,
    },
    tests: {
      fileCount: testFiles.length,
    },
    dist: {
      fileCount: distFiles.length,
    },
  };
  await fs.writeFile(path.join(qaDir, 'build-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  await fs.rm(path.join(rootDir, 'node_modules'), { recursive: true, force: true });
  console.log(`Pipeline completado. dist contiene ${distFiles.length} archivo(s).`);
}

const smokeIndex = process.argv.indexOf('--smoke-url');
if (smokeIndex >= 0) {
  await runDeploymentSmoke(process.argv[smokeIndex + 1]);
} else {
  await main();
}
