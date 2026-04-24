import { NextRequest } from 'next/server';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

type BucketStore = Map<string, Bucket>;

const RATE_LIMIT_STORE_KEY = '__hvacAuthRateLimitStore';

function isAuthRateLimitDisabled(): boolean {
  const raw = process.env.AUTH_RATE_LIMIT_DISABLED;
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getBucketStore(): BucketStore {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_KEY]?: BucketStore;
  };

  if (!globalScope[RATE_LIMIT_STORE_KEY]) {
    globalScope[RATE_LIMIT_STORE_KEY] = new Map<string, Bucket>();
  }

  return globalScope[RATE_LIMIT_STORE_KEY]!;
}

function getClientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return request.headers.get('cf-connecting-ip') || 'unknown';
}

function cleanupExpiredBuckets(store: BucketStore, now: number) {
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function evaluateRateLimit(
  request: NextRequest,
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  if (isAuthRateLimitDisabled()) {
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: options.maxRequests,
    };
  }

  const now = Date.now();
  const store = getBucketStore();

  cleanupExpiredBuckets(store, now);

  const clientKey = `${key}:${getClientAddress(request)}`;
  const bucket = store.get(clientKey);

  if (!bucket) {
    store.set(clientKey, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, options.maxRequests - 1),
    };
  }

  if (bucket.resetAt <= now) {
    store.set(clientKey, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, options.maxRequests - 1),
    };
  }

  bucket.count += 1;
  store.set(clientKey, bucket);

  if (bucket.count > options.maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, options.maxRequests - bucket.count),
  };
}
