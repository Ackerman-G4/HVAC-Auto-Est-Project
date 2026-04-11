/**
 * Local development auth provider.
 * Activates automatically when FIREBASE_WEB_API_KEY is not configured.
 * Stores user accounts in a local JSON file (.local-users.json) at the workspace root.
 * Uses bcryptjs for password hashing and jsonwebtoken for token generation.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const USERS_FILE = join(process.cwd(), '.local-users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'hvac-local-dev-secret-change-in-production';
const TOKEN_EXPIRY = '1h';
const REFRESH_EXPIRY = '7d';

interface LocalUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'engineer';
  createdAt: string;
}

interface LocalUsersStore {
  users: LocalUser[];
}

function readUsers(): LocalUsersStore {
  if (!existsSync(USERS_FILE)) {
    return { users: [] };
  }
  try {
    const raw = readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as LocalUsersStore;
  } catch {
    return { users: [] };
  }
}

function writeUsers(store: LocalUsersStore): void {
  writeFileSync(USERS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function generateId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function signTokens(user: LocalUser) {
  const payload = { uid: user.id, email: user.email, name: user.name, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ uid: user.id, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
  return { token, refreshToken };
}

export function isLocalAuthMode(): boolean {
  const key = process.env.FIREBASE_WEB_API_KEY;
  return !key || !key.trim();
}

export async function localSignUp(email: string, password: string, name?: string, role?: string) {
  const store = readUsers();
  const normalizedEmail = email.trim().toLowerCase();

  if (store.users.some((u) => u.email === normalizedEmail)) {
    throw new Error('Email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const safeRole: 'admin' | 'engineer' = role === 'admin' ? 'admin' : 'engineer';

  const user: LocalUser = {
    id: generateId(),
    email: normalizedEmail,
    name: name?.trim() || '',
    passwordHash,
    role: safeRole,
    createdAt: new Date().toISOString(),
  };

  store.users.push(user);
  writeUsers(store);

  const tokens = signTokens(user);
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function localSignIn(email: string, password: string) {
  const store = readUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const user = store.users.find((u) => u.email === normalizedEmail);

  if (!user) {
    throw new Error('Account not found');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Email or password is invalid');
  }

  const tokens = signTokens(user);
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export function localVerifyToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      uid: string;
      email: string;
      name: string;
      role: string;
    };
    return {
      id: decoded.uid,
      email: decoded.email,
      name: decoded.name || '',
      role: (decoded.role === 'admin' ? 'admin' : 'engineer') as 'admin' | 'engineer',
    };
  } catch {
    throw new Error('Invalid token');
  }
}

export function localRefreshToken(refreshTokenStr: string) {
  try {
    const decoded = jwt.verify(refreshTokenStr, JWT_SECRET) as {
      uid: string;
      type: string;
    };

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    const store = readUsers();
    const user = store.users.find((u) => u.id === decoded.uid);
    if (!user) {
      throw new Error('User not found');
    }

    const tokens = signTokens(user);
    return {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  } catch (err) {
    if (err instanceof Error && (err.message === 'Invalid refresh token' || err.message === 'User not found')) {
      throw err;
    }
    throw new Error('Token refresh failed');
  }
}
