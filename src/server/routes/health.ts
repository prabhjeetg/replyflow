import { Router } from 'express';
import { getAdminServices } from '../firebaseAdmin.ts';
import { automationQueue } from '../queue.ts';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const { configured } = getAdminServices();
  res.status(200).json({
    status: 'ok',
    service: 'replyflow-automation',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    firebaseConfigured: configured,
    queue: automationQueue.getStats(),
  });
});
