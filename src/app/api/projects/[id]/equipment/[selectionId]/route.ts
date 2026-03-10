/**
 * Individual Equipment Selection API — Delete
 * DELETE /api/projects/[id]/equipment/[selectionId] — Remove equipment selection
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string; selectionId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId, selectionId } = await context.params;

    const existing = await neon.selectedEquipment.findUnique({
      where: { id: selectionId },
      include: { room: { include: { floor: true } } },
    });
    if (!existing || existing.room.floor.projectId !== projectId) {
      return errorResponse(404, 'Equipment selection not found', 'The selection does not exist in this project.', 'SELECTION_NOT_FOUND');
    }

    await neon.selectedEquipment.delete({ where: { id: selectionId } });

    return NextResponse.json({ message: 'Equipment selection removed' });
  } catch (error) {
    console.error('DELETE equipment selection error:', error);
    const d = getErrorDetails(error, 'Failed to delete equipment selection');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
