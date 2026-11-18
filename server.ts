import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { startScheduledJobs } from './src/server/cronJobs.ts';
import { bootstrapEnvironmentFiles } from './src/server/envManager.ts';
import { log } from './src/server/logger.ts';
import { apiRouter } from './src/server/routes/api.ts';
import { healthRouter } from './src/server/routes/health.ts';
import { oauthRouter } from './src/server/routes/oauth.ts';
import { webhooksRouter } from './src/server/routes/webhooks.ts';

async function bootstrap() {
  bootstrapEnvironmentFiles();
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Security headers (allow AI Studio preview iframe & Google Auth popups)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      xFrameOptions: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Rate limit API endpoints (exempt webhook receiver so Meta bursts aren't blocked)
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Capture raw body for Meta X-Hub-Signature-256 verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // Routes
  app.use(healthRouter);
  app.use('/webhooks', webhooksRouter);
  app.use(oauthRouter);
  app.use('/api', apiRouter);

  // Frontend serving: Vite dev middleware in dev, dist/ in production
  if (!isProd) {
    // When HMR/WebSocket is disabled in cloud iframe previews, serve a clean @vite/client stub
    // providing style injection and no-op HMR context without opening failing WebSockets.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output missing. Run npm run build.');
      }
    });
  }

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log('error', 'unhandled_express_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(port, '0.0.0.0', () => {
    log('info', 'replyflow_server_started', { port, env: process.env.NODE_ENV || 'development' });
    startScheduledJobs();
  });
}

bootstrap().catch((err) => {
  log('error', 'server_bootstrap_failed', { error: String(err) });
  process.exit(1);
});
