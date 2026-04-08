'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { showToast } from '@/components/ui/toast';
import { getZodFieldErrors, loginRequestSchema } from '@/lib/validation/auth';
import { useAuthStore } from '@/stores/auth-store';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginWithEmail = useAuthStore((state) => state.loginWithEmail);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const clearError = useAuthStore((state) => state.clearError);
  const isLoading = useAuthStore((state) => state.isLoading);
  const serverError = useAuthStore((state) => state.error);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const nextTarget = searchParams.get('next') || '/';
  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(getZodFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});

    const ok = await loginWithEmail(parsed.data.email, parsed.data.password);
    if (ok) {
      router.replace(nextTarget);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)]/80 p-8 shadow-[0_24px_50px_-36px_rgba(15,28,43,0.72)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">
            HVAC Platform Access
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-[color:var(--foreground)] sm:text-4xl">
            Sign in to continue your engineering workflow.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[color:var(--muted-foreground)]">
            Access project calculations, equipment sizing, BOQ generation, and reporting in one controlled workspace.
          </p>
        </section>

        <Card className="bg-[color:var(--card)]/95">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Use your work account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldErrors.email}
                placeholder="engineer@company.com"
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
                placeholder="Enter your password"
              />

              {serverError && (
                <p className="rounded-lg border border-[rgba(211,91,91,0.35)] bg-[rgba(211,91,91,0.1)] px-3 py-2 text-sm font-medium text-[color:var(--destructive)]">
                  {serverError}
                </p>
              )}

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Sign In
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[color:var(--border)]" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                or
              </span>
              <div className="h-px flex-1 bg-[color:var(--border)]" />
            </div>

            {googleEnabled ? (
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    if (!credentialResponse.credential) {
                      showToast('error', 'Google sign-in failed', 'No credential received from Google.');
                      return;
                    }

                    clearError();
                    const ok = await loginWithGoogle(credentialResponse.credential);
                    if (ok) {
                      router.replace(nextTarget);
                    }
                  }}
                  onError={() => showToast('error', 'Google sign-in failed', 'Please try again.')}
                  text="signin_with"
                  shape="pill"
                />
              </div>
            ) : (
              <p className="text-center text-xs text-[color:var(--muted-foreground)]">
                Google sign-in is not configured yet. Set NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID.
              </p>
            )}

            <p className="mt-6 text-center text-sm text-[color:var(--muted-foreground)]">
              Need an account?{' '}
              <Link className="font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-dark)]" href="/auth/register">
                Register
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={<div className="flex min-h-screen items-center justify-center text-sm text-[color:var(--muted-foreground)]">Loading sign-in screen...</div>}
    >
      <LoginPageContent />
    </React.Suspense>
  );
}
