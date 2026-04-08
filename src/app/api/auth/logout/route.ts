import { createLogoutResponse } from '@/lib/auth/session';

export async function POST() {
  return createLogoutResponse();
}
