import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import {
  clearTranscriptCache,
  readAntigravityUsage,
} from './antigravityReader';
import {
  ConfigValidationError,
  readDataSourceConfig,
  validateAndSaveDataSourceConfig,
} from './configStore';
import {
  PricingValidationError,
  readPricing,
  validateAndSavePricing,
} from './pricingStore';

export interface ViteApiPluginOptions {
  dataRoot?: string;
  pricingFilePath?: string;
  configFilePath?: string;
  env?: NodeJS.ProcessEnv;
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown
): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        reject(new PricingValidationError('Request body exceeds 1 MB limit.'));
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        reject(new PricingValidationError('Request body cannot be empty.'));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new PricingValidationError('Invalid JSON request body.'));
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

export function createApiMiddleware(
  options: ViteApiPluginOptions = {}
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const pathname = (req.url ?? '').split('?')[0];

    if (
      pathname !== '/api/usage' &&
      pathname !== '/api/pricing' &&
      pathname !== '/api/config'
    ) {
      next();
      return;
    }

    const method = (req.method ?? 'GET').toUpperCase();

    if (pathname === '/api/usage') {
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      try {
        if (options.dataRoot) {
          const usage = await readAntigravityUsage(options.dataRoot, 'config');
          sendJson(res, 200, usage);
        } else {
          const cfg = await readDataSourceConfig({
            configFilePath: options.configFilePath,
            env: options.env,
          });
          const usage = await readAntigravityUsage(
            cfg.effectiveDataRoot,
            cfg.source
          );
          sendJson(res, 200, usage);
        }
      } catch (err) {
        sendJson(res, 500, {
          error:
            err instanceof Error ? err.message : 'Failed to read usage data.',
        });
      }
      return;
    }

    if (pathname === '/api/config') {
      if (method === 'GET') {
        try {
          const cfg = await readDataSourceConfig({
            configFilePath: options.configFilePath,
            env: options.env,
          });
          sendJson(res, 200, cfg);
        } catch (err) {
          sendJson(res, 500, {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to read data source configuration.',
          });
        }
        return;
      }

      if (method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          const saved = await validateAndSaveDataSourceConfig(payload, {
            configFilePath: options.configFilePath,
            env: options.env,
          });
          clearTranscriptCache();
          sendJson(res, 200, saved);
        } catch (err) {
          if (
            err instanceof ConfigValidationError ||
            err instanceof PricingValidationError
          ) {
            sendJson(res, 400, { error: err.message });
            return;
          }
          sendJson(res, 500, {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to save data source configuration.',
          });
        }
        return;
      }

      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    // pathname === '/api/pricing'
    if (method === 'GET') {
      try {
        const pricing = await readPricing(options.pricingFilePath);
        sendJson(res, 200, pricing);
      } catch (err) {
        sendJson(res, 500, {
          error:
            err instanceof Error
              ? err.message
              : 'Failed to read pricing configuration.',
        });
      }
      return;
    }

    if (method === 'POST') {
      try {
        const payload = await readJsonBody(req);
        const saved = await validateAndSavePricing(
          payload,
          options.pricingFilePath
        );
        sendJson(res, 200, saved);
      } catch (err) {
        if (err instanceof PricingValidationError) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        sendJson(res, 500, {
          error:
            err instanceof Error
              ? err.message
              : 'Failed to save pricing configuration.',
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Method Not Allowed' });
  };
}

export function viteApiPlugin(options: ViteApiPluginOptions = {}): Plugin {
  const middleware = createApiMiddleware(options);

  return {
    name: 'antigravity-local-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
