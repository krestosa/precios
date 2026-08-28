import process from 'node:process';

const target = new URL(process.env.PRECIOS_PAGES_URL || 'https://krestosa.github.io/precios/');

function fail(message) {
  throw new Error(`[pages-http-smoke] ${message}`);
}

async function fetchOk(url, label) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) fail(`${label} respondió HTTP ${response.status}: ${url}`);
  const body = await response.text();
  if (body.length === 0) fail(`${label} devolvió un cuerpo vacío: ${url}`);
  return { response, body };
}

function discoverAssets(html, base) {
  const refs = new Set();
  const patterns = [
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1];
      if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:')) continue;
      refs.add(new URL(raw, base).href);
    }
  }
  return [...refs];
}

const { body: html } = await fetchOk(target, 'HTML principal');
if (!/\bid=["']app["']/u.test(html)) fail('El HTML no contiene el root #app.');
if (!/<script\b[^>]*\btype=["']module["']/u.test(html)) fail('El HTML no contiene entrypoint type=module.');

const assets = discoverAssets(html, target);
if (assets.length === 0) fail('No se descubrieron assets cargables desde el HTML.');
for (const asset of assets) await fetchOk(asset, 'Asset');

console.log(JSON.stringify({
  ok: true,
  url: target.href,
  assetCount: assets.length,
  assets,
}, null, 2));
