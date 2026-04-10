const IDENTITY_TOOLKIT_BASE_URL = 'https://identitytoolkit.googleapis.com/v1';

interface IdentityToolkitSuccess {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  displayName?: string;
}

interface IdentityToolkitErrorPayload {
  error?: {
    message?: string;
  };
}

interface IdentityToolkitLookupUser {
  localId?: string;
  email?: string;
  displayName?: string;
}

interface IdentityToolkitLookupResponse {
  users?: IdentityToolkitLookupUser[];
}

function getFirebaseWebApiKey(): string {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key || !key.trim()) {
    throw new Error('Missing Firebase Web API key. Set FIREBASE_WEB_API_KEY.');
  }
  return key;
}

function mapAuthError(code: string): string {
  if (code === 'EMAIL_EXISTS') return 'Email already exists';
  if (code === 'EMAIL_NOT_FOUND') return 'Account not found';
  if (code === 'INVALID_PASSWORD' || code === 'INVALID_LOGIN_CREDENTIALS') {
    return 'Email or password is invalid';
  }
  if (code === 'INVALID_IDP_RESPONSE' || code === 'INVALID_PENDING_TOKEN') {
    return 'Google credential is invalid';
  }
  if (code === 'FEDERATED_USER_ID_ALREADY_LINKED') {
    return 'Google account is already linked to another profile';
  }
  if (code === 'INVALID_ID_TOKEN' || code === 'USER_NOT_FOUND') return 'Invalid token';
  if (code === 'USER_DISABLED') return 'Account is disabled';
  if (code.startsWith('WEAK_PASSWORD')) return 'Password is too weak';
  if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') return 'Too many attempts. Please try again later';
  if (code === 'OPERATION_NOT_ALLOWED') return 'Sign-in method is disabled in Firebase Auth';
  return code || 'Authentication request failed';
}

async function postIdentityToolkit<TResponse>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const apiKey = getFirebaseWebApiKey();
  const response = await fetch(`${IDENTITY_TOOLKIT_BASE_URL}/${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as IdentityToolkitErrorPayload;
    const message = mapAuthError(data.error?.message || response.statusText);
    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}

export function signUpWithEmailPassword(email: string, password: string) {
  return postIdentityToolkit<IdentityToolkitSuccess>('accounts:signUp', {
    email,
    password,
    returnSecureToken: true,
  });
}

export function signInWithEmailPassword(email: string, password: string) {
  return postIdentityToolkit<IdentityToolkitSuccess>('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
}

export function signInWithGoogleCredential(
  credential: string,
  requestUri = 'http://localhost',
) {
  const postBody = new URLSearchParams({
    id_token: credential,
    providerId: 'google.com',
  }).toString();

  return postIdentityToolkit<IdentityToolkitSuccess>('accounts:signInWithIdp', {
    postBody,
    requestUri,
    returnSecureToken: true,
    returnIdpCredential: false,
  });
}

export async function lookupAccountByIdToken(idToken: string) {
  const data = await postIdentityToolkit<IdentityToolkitLookupResponse>('accounts:lookup', {
    idToken,
  });

  const user = data.users?.[0];
  if (!user?.localId) {
    throw new Error('Invalid token');
  }

  return {
    id: user.localId,
    email: user.email || '',
    name: user.displayName || '',
  };
}
