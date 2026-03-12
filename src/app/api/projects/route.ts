/**
 * Projects API — Firebase RTDB implementation
 * GET  /api/projects — List user projects
 * POST /api/projects — Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import {
  toNumber,
  toInt,
  errorResponse,
  getErrorDetails,
  getUserId,
} from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access projects.', 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.toLowerCase();

    const projectsRef = adminDb.ref(`projects`);
    const snapshot = await projectsRef.orderByChild('ownerId').equalTo(uid).once('value');
    const projectsData = snapshot.val() || {};

    let projects = Object.keys(projectsData).map(id => ({
      id,
      ...projectsData[id]
    }));

    // Filter
    if (status && status !== 'all') {
      projects = projects.filter(p => p.status === status);
    } else {
      projects = projects.filter(p => p.status !== 'archived' && p.status !== 'deleted');
    }

    if (search) {
      projects = projects.filter(p => 
        p.name?.toLowerCase().includes(search) || 
        p.clientName?.toLowerCase().includes(search) ||
        p.location?.toLowerCase().includes(search)
      );
    }

    // Sort
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    
    projects.sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      if (sortOrder === 'desc') {
        return valA < valB ? 1 : -1;
      }
      return valA > valB ? 1 : -1;
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to fetch projects');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to create projects.', 'UNAUTHORIZED');
    }

    if (!process.env.FIREBASE_PRIVATE_KEY) {
       console.error("Missing FIREBASE_PRIVATE_KEY. Cannot write to Realtime Database.");
       return errorResponse(500, 'Server Configuration Error', 'Missing Firebase Admin credentials (.env.local). Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.', 'MISSING_ENV');
    }

    const body = await request.json();

    if (!body.name) {
      return errorResponse(400, 'Project name is required', 'Enter a project name before creating the project.', 'MISSING_NAME');
    }

    const finalDB = toNumber(body.outdoorDB, 35);
    const finalRH = toNumber(body.outdoorRH, 50);
    const computedWB = Number.isFinite(toNumber(body.outdoorWB, NaN))
      ? toNumber(body.outdoorWB, 0)
      : calcWetBulb(finalDB, finalRH);

    const now = new Date().toISOString();
    const newProjectRef = adminDb.ref(`projects`).push();
    const projectId = newProjectRef.key;

    const projectData = {
      name: body.name,
      clientName: body.clientName || '',
      buildingType: body.buildingType || 'commercial',
      location: body.location || '',
      city: body.city || 'Manila',
      totalFloorArea: toNumber(body.totalFloorArea, 0),
      floorsAboveGrade: toInt(body.floorsAboveGrade, 1),
      floorsBelowGrade: toInt(body.floorsBelowGrade, 0),
      outdoorDB: finalDB,
      outdoorWB: computedWB,
      outdoorRH: finalRH,
      indoorDB: toNumber(body.indoorDB, 24),
      indoorRH: toNumber(body.indoorRH, 50),
      notes: body.notes || '',
      status: 'draft',
      ownerId: uid,
      createdAt: now,
      updatedAt: now,
    };

    await newProjectRef.set(projectData);

    // Add to projectOwners for admin lookup and cross-referencing
    await adminDb.ref(`projectOwners/${projectId}`).set(uid);

    await adminDb.ref(`auditLogs/${uid}`).push({
      projectId,
      action: 'created',
      entity: 'project',
      entityId: projectId,
      details: { name: body.name },
      timestamp: now
    });

    return NextResponse.json({ project: { id: projectId, ...projectData } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    const d = getErrorDetails(error, 'Failed to create project');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
