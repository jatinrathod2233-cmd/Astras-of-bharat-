import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectileAuthorityService } from './src/server/projectileAuthority.ts';
import { PROJECTILE_PHYSICS_REGISTRY } from './src/shared/projectilePhysics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export function createApp(): express.Express {
  const app = express();
  const authority = new ProjectileAuthorityService();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  // Graceful handling for malformed JSON bodies without exposing stack traces
  app.use(
    (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if (
        err &&
        typeof err === 'object' &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.parse.failed'
      ) {
        res.status(400).json({ ok: false, error: 'INVALID_JSON' });
        return;
      }
      next(err);
    }
  );

  app.get('/api/health', (_req: Request, res: Response): void => {
    res.json({
      ok: true,
      service: 'astras-projectile-authority',
      timestampMs: Date.now(),
    });
  });

  app.get('/api/projectiles/registry', (_req: Request, res: Response): void => {
    res.json({
      ok: true,
      registry: PROJECTILE_PHYSICS_REGISTRY,
    });
  });

  app.get(
    '/api/projectiles/session/:sessionId',
    (req: Request, res: Response): void => {
      const sessionId = String(req.params.sessionId ?? '');
      if (!SESSION_ID_PATTERN.test(sessionId)) {
        res.status(400).json({ ok: false, error: 'INVALID_SESSION_ID' });
        return;
      }
      res.json({
        ok: true,
        ...authority.getSessionStats(sessionId),
      });
    }
  );

  app.post('/api/projectiles/sync-actors', (req: Request, res: Response): void => {
    const result = authority.syncActors(req.body);
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/projectiles/register', (req: Request, res: Response): void => {
    const { status, payload } = authority.registerProjectile(req.body);
    res.status(status).json(payload);
  });

  app.post(
    '/api/projectiles/validate-impact',
    (req: Request, res: Response): void => {
      const { status, payload } = authority.validateImpact(req.body);
      res.status(status).json(payload);
    }
  );

  app.post(
    '/api/projectiles/validate-zone-tick',
    (req: Request, res: Response): void => {
      const { status, payload } = authority.validateZoneTick(req.body);
      res.status(status).json(payload);
    }
  );

  return app;
}

async function startServer(): Promise<void> {
  const app = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req: Request, res: Response): void => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Astras of Bharat server listening on http://0.0.0.0:${PORT}`);
  });
}

// Start server only when executed as entry module
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
