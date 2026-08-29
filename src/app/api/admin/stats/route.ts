/**
 * Admin Dashboard Stats API
 * GET /api/admin/stats — aggregate portal metrics (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { getFirebaseDb } from '@/lib/firebase/server';
import { listAdminUsers } from '@/lib/firebase/admin-users-store';
import {
  countLoginFailuresSince,
  getRecentAuditLogs,
} from '@/lib/firebase/audit-log-store';
import { listProjectsForApi } from '@/lib/firebase/projects-store';
import { toNumberValue, toStringValue } from '@/lib/firebase/value-utils';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

const ADMIN_STATS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

interface SecurityAlert {
  id: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
}

async function summarizeBoqSnapshots(): Promise<{ totalPhp: number; count: number }> {
  try {
    const snapshot = await getFirebaseDb().collection('boqSnapshots').get();
    const latestPerProject = new Map<string, { createdAt: string; grandTotalPhp: number }>();

    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;
      const projectId = toStringValue(data.projectId, '');
      if (!projectId) continue;
      const createdAt = toStringValue(data.createdAt, '');
      const grandTotalPhp = toNumberValue(data.grandTotalPhp, 0);
      const existing = latestPerProject.get(projectId);
      if (!existing || createdAt > existing.createdAt) {
        latestPerProject.set(projectId, { createdAt, grandTotalPhp });
      }
    }

    let totalPhp = 0;
    for (const entry of latestPerProject.values()) {
      totalPhp += entry.grandTotalPhp;
    }
    return { totalPhp: Math.round(totalPhp), count: snapshot.size };
  } catch {
    return { totalPhp: 0, count: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-stats-get', ADMIN_STATS_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [userResult, allProjects, boqSummary, loginFailures24h, recentActivity] =
      await Promise.all([
        listAdminUsers(),
        listProjectsForApi({ status: 'all' }),
        summarizeBoqSnapshots(),
        countLoginFailuresSince(since24h),
        getRecentAuditLogs(20),
      ]);

    const totalProjects = allProjects.length;
    const activeProjects = allProjects.filter(
      (project) => project.status === 'active' || project.status === 'draft',
    ).length;
    const archivedProjects = allProjects.filter(
      (project) => project.status === 'archived' || project.status === 'deleted',
    ).length;

    const adminsWithoutMfa = userResult.users.filter(
      (user) => user.role === 'admin' && !user.mfaEnabled && !user.disabled,
    ).length;

    const securityAlerts: SecurityAlert[] = [];
    if (loginFailures24h > 10) {
      securityAlerts.push({
        id: 'failed-logins',
        severity: 'warning',
        label: `${loginFailures24h} failed login attempts in the last 24 hours`,
      });
    }
    if (adminsWithoutMfa > 0 && userResult.mode === 'firebase') {
      securityAlerts.push({
        id: 'admin-mfa',
        severity: 'warning',
        label: `${adminsWithoutMfa} admin account${adminsWithoutMfa === 1 ? '' : 's'} without MFA enabled`,
      });
    }
    if (securityAlerts.length === 0) {
      securityAlerts.push({
        id: 'all-clear',
        severity: 'info',
        label: 'No active security alerts',
      });
    }

    return NextResponse.json({
      stats: {
        totalUsers: userResult.users.length,
        totalProjects,
        activeProjects,
        archivedProjects,
        totalBoqValuePhp: boqSummary.totalPhp,
        boqSnapshotCount: boqSummary.count,
        loginFailures24h,
        recentActivity,
        securityAlerts,
      },
    });
  } catch (error) {
    logger.error('GET /api/admin/stats error', error);
    const d = getErrorDetails(error, 'Failed to load admin stats');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
