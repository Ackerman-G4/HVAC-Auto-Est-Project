'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { showToast } from '@/components/ui/toast';
import { getZodFieldErrors, registerFormSchema } from '@/lib/validation/auth';
import { useAuthStore } from '@/stores/auth-store';

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registerWithEmail = useAuthStore((state) => state.registerWithEmail);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const clearError = useAuthStore((state) => state.clearError);
  const isLoading = useAuthStore((state) => state.isLoading);
  const serverError = useAuthStore((state) => state.error);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const nextTarget = searchParams.get('next') || '/';
  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();

    const parsed = registerFormSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
      role: 'engineer',
    });

    if (!parsed.success) {
      setFieldErrors(getZodFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});

    const ok = await registerWithEmail({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      role: parsed.data.role,
    });

    if (ok) {
      router.replace(nextTarget);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-115">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            HVAC Studio
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Create your account
          </h1>
        </div>

        <Card className="rounded-xl p-10 shadow-sm">
          <CardContent className="p-0">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <Input
                label="Full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={fieldErrors.name}
                placeholder="Juan Dela Cruz"
              />
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
                label="Company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Optional"
              />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
                hint="At least 8 characters with uppercase, lowercase, and number"
                placeholder="Create a secure password"
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                error={fieldErrors.confirmPassword}
                placeholder="Re-enter your password"
              />

              {serverError && (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {serverError}
                </p>
              )}

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Create Account
              </Button>
            </form>

            {googleEnabled && (
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {googleEnabled ? (
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    if (!credentialResponse.credential) {
                      showToast('error', 'Google sign-up failed', 'No credential received from Google.');
                      return;
                    }

                    clearError();
                    const ok = await loginWithGoogle(credentialResponse.credential);
                    if (ok) {
                      router.replace(nextTarget);
                    }
                  }}
                  onError={() => showToast('error', 'Google sign-up failed', 'Please try again.')}
                  text="signup_with"
                  shape="pill"
                />
              </div>
            ) : null}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link className="font-semibold text-primary hover:text-primary/80" href="/auth/login">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense
      fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading registration screen...</div>}
    >
      <RegisterPageContent />
    </React.Suspense>
  );
}
