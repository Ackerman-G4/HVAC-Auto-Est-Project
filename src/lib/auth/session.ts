import { NextRequest, NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'hvac_auth_token';
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthUserRole = 'admin' | 'engineer';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthUserRole;
}

export interface AuthSuccessPayload {
  token: string;
  user: AuthUser;
}

function applyAuthCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function createAuthResponse(payload: AuthSuccessPayload, status = 200) {
  const response = NextResponse.json(payload, { status });
  applyAuthCookie(response, payload.token);
  return response;
}

export function createLogoutResponse() {
  const response = NextResponse.json({ message: 'Logged out' });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const tokenFromHeader = authHeader.slice('Bearer '.length).trim();
    if (tokenFromHeader) {
      return tokenFromHeader;
    }
  }

  const tokenFromCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  return tokenFromCookie || null;
}
