import { NextRequest, NextResponse } from 'next/server';
import { getNeon } from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

export async function POST(req: NextRequest) {
  const { email, password, name, role } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  const neon = getNeon();
  const existing = await neon.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'User already exists' }, { status: 409 });
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = await neon.user.create({
    data: { email, password: hashed, name: name || '', role: role || 'engineer' },
  });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  return NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}
