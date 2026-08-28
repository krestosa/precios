import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const distDir = path.join(rootDir, 'dist');

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Falta el valor de ${name}.`);
  }
  return value;
}

const host = readOption('--host', process.env.HOST || '127.0.0.1');
const portText = readOption('--port', process.env.PORT || '4173');
const port = Number.parseInt(portText, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('El puerto debe ser un entero entre 1 y 65535.');
}

const distStat = await fs.stat(distDir).catch(() => null);
if (!distStat?.isDirectory()) {
  throw new Error('No existe dist. Ejecutá install-build antes de iniciar el servidor.');
}

async function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.posix.normalize(`/${decoded}`).replace(/^\/+/, '');
  const candidate = path.resolve(distDir, normalized || 'index.html');
  const relative = path.relative(distDir, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  const stat = await fs.stat(candidate).catch(() => null);
  if (stat?.isFile()) return candidate;
  if (stat?.isDirectory()) {
    const indexFile = path.join(candidate, 'index.html');
    const indexStat = await fs.stat(indexFile).catch(() => null);
    if (indexStat?.isFile()) return indexFile;
  }

  if (!path.extname(normalized)) {
    const fallback = path.join(distDir, 'index.html');
    const fallbackStat = await fs.stat(fallback).catch(() => null);
    if (fallbackStat?.isFile()) return fallback;
  }

  return null;
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const filePath = await resolveRequestPath(request.url || '/');
    if (!filePath) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('No encontrado.');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes.get(extension) || 'application/octet-stream';
    const stat = await fs.stat(filePath);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Error interno.');
    console.error(error);
  }
});

server.listen(port, host, () => {
  console.log(`Servidor local en ${host}:${port}`);
});
