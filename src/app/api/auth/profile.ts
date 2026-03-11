import { NextRequest, NextResponse } from 'next/server';
import { getNeon } from '@/lib/db/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid token' }, { status: 401 });
  }
  const token = auth.split(' ')[1];
  try {
    if (!JWT_SECRET) throw new Error('JWT_SECRET is missing');
    const decoded = jwt.verify(token, JWT_SECRET as string) as { id: string };
    const neon = getNeon();
    const user = await neon.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}
