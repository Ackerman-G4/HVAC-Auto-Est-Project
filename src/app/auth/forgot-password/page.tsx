'use client';

import React from 'react';
import Link from 'next/link';
import { AuthSplitHero } from '@/components/auth/auth-split-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { HvacLogo } from '@/components/ui/hvac-logo';
import { forgotPasswordRequestSchema, getZodFieldErrors } from '@/lib/validation/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors(getZodFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsed.data.email }),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.12fr_minmax(0,0.88fr)]">
      <AuthSplitHero
        heading="Reset your access, keep your momentum"
        subtitle="Request a secure password reset link and get back to your HVAC engineering workspace."
      />

      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_78%_80%,rgba(34,197,94,0.16),transparent_42%)]" />
        <div className="pointer-events-none absolute inset-0 system-grid-bg opacity-45" />

        <div className="relative z-10 w-full max-w-115">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <HvacLogo variant="color" size={16} />
              Precision Cooling Workspace
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Forgot your password?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your email and we&apos;ll send a reset link if the account exists.
            </p>
          </div>

          <Card className="rounded-lg border-border/75 p-8 shadow-(--panel-shadow-strong) sm:p-10">
            <CardContent className="p-0">
              {sent ? (
                <div className="space-y-5 text-center">
                  <p className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                    If an account exists for that email, a password reset link has been sent. Check
                    your inbox and spam folder.
                  </p>
                  <Link
                    href="/auth/login"
                    className="inline-block text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    error={fieldErrors.email}
                    placeholder="engineer@company.com"
                  />

                  <Button type="submit" className="w-full" isLoading={isLoading}>
                    Send Reset Link
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Remembered it?{' '}
                    <Link className="font-semibold text-primary hover:text-primary/80" href="/auth/login">
                      Back to sign in
                    </Link>
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
