import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', '..', 'dist');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const SUBPATH = '/starlight_v2';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function sendNotFound(res, method, pathname) {
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(`404 Not Found: ${pathname}\n`);
}

function resolveStaticFile(rawPathname) {
  let pathname = rawPathname;
  if (pathname.startsWith(`${SUBPATH}/`)) {
    pathname = pathname.slice(SUBPATH.length);
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // Strip leading slashes so path.resolve joins strictly beneath DIST_DIR
  const relPath = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(DIST_DIR, relPath || 'index.html');

  // Strict directory traversal guard
  const relativeCheck = path.relative(DIST_DIR, candidate);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    return null;
  }

  try {
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) {
      const indexCandidate = path.join(candidate, 'index.html');
      const idxStat = fs.statSync(indexCandidate);
      if (idxStat.isFile()) {
        return { filePath: indexCandidate, size: idxStat.size };
      }
      return null;
    }
    if (stat.isFile()) {
      return { filePath: candidate, size: stat.size };
    }
  } catch {
    return null;
  }

  return null;
}

const server = http.createServer((req, res) => {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed\n');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request\n');
    return;
  }

  const { pathname, search } = parsedUrl;

  // Match GitHub Pages behavior: redirect /starlight_v2 (no trailing slash) -> /starlight_v2/
  if (pathname === SUBPATH) {
    res.writeHead(301, {
      Location: `${SUBPATH}/${search}`,
      'Cache-Control': 'no-cache',
    });
    res.end();
    return;
  }

  const resolved = resolveStaticFile(pathname);
  if (!resolved) {
    sendNotFound(res, method, pathname);
    return;
  }

  const mimeType = getMimeType(resolved.filePath);
  const headers = {
    'Content-Type': mimeType,
    'Content-Length': String(resolved.size),
    'Cache-Control': 'no-cache',
  };

  // Allow Service Worker scoping cleanly under both / and /starlight_v2/
  if (path.basename(resolved.filePath) === 'sw.js') {
    headers['Service-Worker-Allowed'] = '/';
  }

  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(resolved.filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end();
  });
  stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[starlight-subpath-server] serving ${DIST_DIR} at http://${HOST}:${PORT}/ and http://${HOST}:${PORT}${SUBPATH}/`,
  );
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
