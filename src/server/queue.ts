import { log } from './logger.ts';

export interface QueuedJob {
  id: string;
  userId: string;
  description: string;
  minDelaySec: number;
  maxDelaySec: number;
  hourlyLimit: number;
  attempts: number;
  maxAttempts: number;
  run: () => Promise<void>;
  onPermanentFailure?: (err: ClassifiedApiError) => Promise<void>;
}

export interface ClassifiedApiError {
  kind: 'token_expired' | 'permission_error' | 'rate_limit' | 'dm_restricted' | 'unknown';
  code?: string;
  message: string;
  retryable: boolean;
}

export function classifyApiError(err: unknown): ClassifiedApiError {
  const anyErr = err as { code?: string | number; message?: string; subcode?: number };
  const msg = anyErr?.message || String(err);
  const codeStr = anyErr?.code !== undefined ? String(anyErr.code) : '';

  // Meta Graph API Error Codes
  if (codeStr === '190' || /access token|session has expired|oauth/i.test(msg)) {
    return { kind: 'token_expired', code: codeStr || '190', message: msg, retryable: false };
  }
  if (codeStr === '10' || codeStr === '200' || codeStr === '230' || /permission/i.test(msg)) {
    return { kind: 'permission_error', code: codeStr || '200', message: msg, retryable: false };
  }
  if (codeStr === '4' || codeStr === '17' || codeStr === '32' || codeStr === '613' || /rate limit|too many calls|quota/i.test(msg)) {
    return { kind: 'rate_limit', code: codeStr || '4', message: msg, retryable: true };
  }
  if (
    codeStr === '551' ||
    codeStr === '10900' ||
    codeStr === '10903' ||
    /outside of allowed window|cannot message|restricted|user cannot receive/i.test(msg)
  ) {
    return { kind: 'dm_restricted', code: codeStr || '551', message: msg, retryable: false };
  }

  return { kind: 'unknown', code: codeStr || undefined, message: msg, retryable: true };
}

class AutomationQueue {
  private hourlyTimestamps = new Map<string, number[]>();
  private pendingCount = 0;

  public getStats() {
    return {
      pendingJobs: this.pendingCount,
    };
  }

  private getDelayMs(minSec: number, maxSec: number): number {
    const safeMin = Math.max(1, Math.min(minSec, 60));
    const safeMax = Math.max(safeMin, Math.min(maxSec, 120));
    const sec = safeMin + Math.random() * (safeMax - safeMin);
    return Math.round(sec * 1000);
  }

  private checkAndReserveHourlyQuota(userId: string, limit: number): { allowed: boolean; waitMs: number } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const list = (this.hourlyTimestamps.get(userId) || []).filter((ts) => ts > oneHourAgo);

    if (list.length >= limit) {
      const oldest = list[0];
      const waitMs = Math.max(5000, oldest + 60 * 60 * 1000 - now + 1000);
      this.hourlyTimestamps.set(userId, list);
      return { allowed: false, waitMs };
    }

    list.push(now);
    this.hourlyTimestamps.set(userId, list);
    return { allowed: true, waitMs: 0 };
  }

  public enqueue(job: QueuedJob): void {
    this.pendingCount++;
    const initialDelay = this.getDelayMs(job.minDelaySec, job.maxDelaySec);
    setTimeout(() => {
      void this.execute(job);
    }, initialDelay);
  }

  private async execute(job: QueuedJob): Promise<void> {
    const quota = this.checkAndReserveHourlyQuota(job.userId, job.hourlyLimit);
    if (!quota.allowed) {
      log('warn', 'hourly_dm_rate_limit_requeue', {
        jobId: job.id,
        userId: job.userId,
        waitMs: quota.waitMs,
      });
      setTimeout(() => {
        void this.execute(job);
      }, quota.waitMs);
      return;
    }

    try {
      job.attempts += 1;
      await job.run();
      this.pendingCount = Math.max(0, this.pendingCount - 1);
    } catch (err) {
      const classified = classifyApiError(err);
      log('warn', 'queue_job_error', {
        jobId: job.id,
        attempt: job.attempts,
        kind: classified.kind,
        code: classified.code,
        message: classified.message,
      });

      if (classified.retryable && job.attempts < job.maxAttempts) {
        const backoffMs = Math.pow(2, job.attempts) * 5000; // 10s, 20s, 40s
        setTimeout(() => {
          void this.execute(job);
        }, backoffMs);
        return;
      }

      this.pendingCount = Math.max(0, this.pendingCount - 1);
      if (job.onPermanentFailure) {
        try {
          await job.onPermanentFailure(classified);
        } catch (cbErr) {
          log('error', 'queue_failure_callback_error', { error: String(cbErr) });
        }
      }
    }
  }
}

export const automationQueue = new AutomationQueue();
