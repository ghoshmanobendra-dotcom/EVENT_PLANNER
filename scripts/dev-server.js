/**
 * scripts/dev-server.js
 *
 * Local development server. Mirrors the Vercel project config so you can run
 *   npm run dev
 * and get the same behaviour as `vercel dev`, without installing the Vercel CLI.
 *
 * What it does:
 *  - Reads the `headers` block from vercel.json and applies them to every response.
 *  - Serves public/ as static files with cleanUrls (/plan → public/plan.html).
 *  - Mounts every handler in api/ at POST /api/<name> by importing its `POST`
 *    export (a Web API Request → Response function) and bridging it into Express.
 *  - Returns JSON 404s for unknown /api routes.
 *  - Listens on $PORT (default 3000).
 */

import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import express from 'express';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const API_DIR    = path.join(ROOT, 'api');

// ---------------------------------------------------------------------------
// Read vercel.json once at startup
// ---------------------------------------------------------------------------
const vercelJson = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

/**
 * Collect the flat header list from the first `headers` rule in vercel.json.
 * (The project only has one catch-all rule `/(.*)`.)
 * @type {Array<{ key: string, value: string }>}
 */
const globalHeaders = vercelJson.headers?.flatMap((/** @type {{ headers?: Array<{ key: string, value: string }> }} */ rule) => rule.headers ?? []) ?? [];

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// Apply all headers from vercel.json to every response so CSP problems surface
// locally and vercel.json stays the single source of truth.
app.use((_req, res, next) => {
  for (const { key, value } of globalHeaders) {
    res.setHeader(key, value);
  }
  next();
});

// ---------------------------------------------------------------------------
// Bridge: Web-API handler (Request → Response) → Express route
//
// The api/ handlers receive a Web API `Request` object, run their logic, and
// return a Web API `Response`.  Express gives us `req` / `res`.
// This function:
//   1. Assembles a Web API Request from the Express req (raw body, headers).
//   2. Calls the handler.
//   3. Copies the Response status, headers and body back into Express res.
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 32 * 1024; // 32 KB — same limit as the handlers

/**
 * Reads the raw request body into a Buffer, capped at `max` bytes.
 * Resolves with null if the body is larger than the cap.
 * @param {import('express').Request} req
 * @param {number} max
 * @returns {Promise<Buffer | null>}
 */
function readRawBody(req, max) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        resolve(null); // signal oversized
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Creates an Express request handler that bridges to a Web-API-style handler.
 * @param {(request: Request) => Promise<Response>} webHandler
 */
function bridgeHandler(webHandler) {
  return async (/** @type {import('express').Request} */ req, /** @type {import('express').Response} */ res) => {
    try {
      // Build the full URL the handler would see on Vercel.
      const url = `http://localhost${req.originalUrl}`;

      // Forward all incoming headers verbatim.
      /** @type {Record<string, string>} */
      const headersObj = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (val !== undefined) headersObj[key] = Array.isArray(val) ? val.join(', ') : val;
      }

      // The handlers themselves check Content-Length and buffer size, but we
      // need to materialise the body for the Web Request constructor.
      // Check Content-Length header first (fast path for oversized requests).
      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength > MAX_BODY_BYTES) {
        // Let the handler produce the proper 413; just pass an empty body so
        // readJsonBody's header check fires the tooLarge error.
        headersObj['content-length'] = String(contentLength); // keep the value so handler sees it
      }

      const rawBody = await readRawBody(req, MAX_BODY_BYTES * 2); // read generously; handler enforces limit

      const webRequest = new Request(url, {
        method:  req.method,
        headers: headersObj,
        // GET/HEAD must not have a body.
        // Use rawBody directly (Buffer extends Uint8Array, which is a valid BodyInit).
        // Avoid rawBody.buffer because it returns ArrayBuffer | SharedArrayBuffer and
        // SharedArrayBuffer is not assignable to BodyInit in strict TypeScript.
        body:    req.method !== 'GET' && req.method !== 'HEAD' && rawBody != null
                   ? rawBody
                   : undefined,
        // Node 18+ fetch: prevent automatic redirect following inside handlers.
        redirect: 'manual',
      });

      const webResponse = await webHandler(webRequest);

      // Copy status
      res.status(webResponse.status);

      // Copy response headers (skip ones Express/Node manage automatically)
      for (const [key, value] of webResponse.headers.entries()) {
        if (key.toLowerCase() !== 'content-encoding') {
          res.setHeader(key, value);
        }
      }

      // Stream the body
      const bodyBuffer = Buffer.from(await webResponse.arrayBuffer());
      res.end(bodyBuffer);
    } catch (err) {
      console.error('dev-server bridge error', err);
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Dev server error.' } });
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Mount api/ handlers
// ---------------------------------------------------------------------------
const apiFiles = readdirSync(API_DIR).filter((f) => f.endsWith('.js'));

for (const file of apiFiles) {
  const name    = path.basename(file, '.js');          // e.g. "plan"
  const route   = `/api/${name}`;                       // e.g. "/api/plan"
  const fileUrl = pathToFileURL(path.join(API_DIR, file)).href;

  // Dynamic import so each module initialises with the env already loaded.
  const mod = await import(fileUrl);

  if (typeof mod.POST === 'function') {
    app.post(route, bridgeHandler(mod.POST));
    console.log(`  POST ${route}  →  api/${file}`);
  }
  if (typeof mod.GET === 'function') {
    app.get(route, bridgeHandler(mod.GET));
    console.log(`  GET  ${route}  →  api/${file}`);
  }
}

// Unknown /api/* — return JSON 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
});

// ---------------------------------------------------------------------------
// Serve public/ with cleanUrls
//
// vercel.json's `cleanUrls: true` makes /plan serve public/plan.html.
// We replicate that: if the request path has no extension and there is a
// matching .html file, serve it.  Otherwise fall through to a 404 page.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const pathname = req.path;

  // Already has an extension — let express.static handle it.
  if (path.extname(pathname)) return next();

  // Map /  → index.html, /plan → plan.html, /contact → contact.html, etc.
  const base     = pathname === '/' ? 'index' : pathname.slice(1);
  const htmlFile = path.join(PUBLIC_DIR, `${base}.html`);

  try {
    // Check existence without a stat — just try opening for streaming.
    const stream = createReadStream(htmlFile);
    stream.on('error', () => next()); // file not found → fall through
    res.setHeader('content-type', 'text/html; charset=utf-8');
    stream.pipe(res);
  } catch {
    next();
  }
});

// Serve all other static files (CSS, JS, images, fonts…)
app.use(express.static(PUBLIC_DIR));

// 404 for everything else (pages, not API)
app.use((_req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), (err) => {
    if (err) res.status(404).type('html').send('<h1>404 Not Found</h1>');
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
createServer(app).listen(PORT, () => {
  console.log(`\nEVENT PLANNER dev server running at http://localhost:${PORT}\n`);
});
