import { z } from 'zod';

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 80;

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(EMAIL_MAX_LENGTH, 'Email is too long')
  .email('Enter a valid email address');

const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(PASSWORD_MAX_LENGTH, 'Password is too long');

const registerPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(PASSWORD_MAX_LENGTH, 'Password is too long')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^a-zA-Z0-9]/, 'Password must include a symbol');

const PASSWORD_BLOCKLIST = new Set([
  'password',
  'password1',
  'password123',
  'password1234',
  'password12345',
  'password123456',
  'password1234567',
  'passwordpassword',
  'password@123',
  'password@1234',
  'p@ssword1234',
  'p@ssw0rd1234',
  'passw0rd1234',
  'administrator',
  'administrator1',
  'administrator123',
  'admin1234567890',
  'adminpassword',
  'welcome12345',
  'welcome123456',
  'welcome@12345',
  'letmein12345',
  'letmein123456',
  'qwertyuiop12',
  'qwertyuiop123',
  'qwertyuiop1234',
  'qwertyuiopasdfghjkl',
  'qwerty123456',
  'qwerty1234567',
  'qwertyqwerty',
  '123456789012',
  '1234567890123',
  '12345678901234',
  '111111111111',
  '000000000000',
  'iloveyou1234',
  'sunshine1234',
  'football1234',
  'baseball1234',
  'dragon123456',
  'monkey123456',
  'superman1234',
  'batman123456',
  'trustno1trustno1',
  'changeme1234',
  'secret123456',
  'master123456',
  'default12345',
]);

const DATE_LIKE_PASSWORD_PATTERN = /^\D{0,2}(\d{8})\D{0,2}$/;

function isValidDateParts(year: number, month: number, day: number): boolean {
  return year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isDateLikePassword(password: string): boolean {
  const match = DATE_LIKE_PASSWORD_PATTERN.exec(password);
  if (!match) {
    return false;
  }

  const digits = match[1];
  const asYyyymmdd = isValidDateParts(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)),
    Number(digits.slice(6, 8)),
  );
  const asDdmmyyyy = isValidDateParts(
    Number(digits.slice(4, 8)),
    Number(digits.slice(2, 4)),
    Number(digits.slice(0, 2)),
  );

  return asYyyymmdd || asDdmmyyyy;
}

function addRegisterPasswordIssues(
  value: { email: string; password: string },
  ctx: z.RefinementCtx,
): void {
  const normalizedPassword = value.password.toLowerCase();
  const emailLocalPart = value.email.trim().toLowerCase().split('@')[0] ?? '';

  if (emailLocalPart.length >= 4 && normalizedPassword.includes(emailLocalPart)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: 'Password must not contain your email address',
    });
  }

  if (isDateLikePassword(value.password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: 'Password must not be a date',
    });
  }

  if (PASSWORD_BLOCKLIST.has(normalizedPassword)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: 'Password is too common and easily guessed',
    });
  }
}

const roleSchema = z.enum(['engineer', 'admin']);

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .strict();

const registerObjectSchema = z
  .object({
    email: emailSchema,
    password: registerPasswordSchema,
    name: z
      .string()
      .trim()
      .max(NAME_MAX_LENGTH, 'Name is too long')
      .optional(),
    role: roleSchema.optional(),
  })
  .strict();

export const registerRequestSchema = registerObjectSchema.superRefine((value, ctx) => {
  addRegisterPasswordIssues(value, ctx);
});

export const registerFormSchema = registerObjectSchema
  .extend({
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .superRefine((value, ctx) => {
    addRegisterPasswordIssues(value, ctx);

    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });

export const googleLoginRequestSchema = z
  .object({
    credential: z
      .string()
      .trim()
      .min(10, 'Google credential is required')
      .max(5000, 'Google credential is too long'),
  })
  .strict();

export const forgotPasswordRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

/**
 * Bounded because the value is forwarded verbatim to Google's securetoken
 * endpoint. This route is unauthenticated by construction — a refresh token is
 * the only credential it has — so an unbounded string from an anonymous caller
 * would otherwise become an outbound request body. Real tokens sit far below
 * this ceiling.
 */
const REFRESH_TOKEN_MAX_LENGTH = 4096;

export const refreshRequestSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(1, 'Refresh token is required')
      .max(REFRESH_TOKEN_MAX_LENGTH, 'Refresh token is too long'),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterFormRequest = z.infer<typeof registerFormSchema>;
export type GoogleLoginRequest = z.infer<typeof googleLoginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export function getFirstZodErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid request payload';
}

export function getZodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const fieldName = issue.path[0];
    if (typeof fieldName === 'string' && !fieldErrors[fieldName]) {
      fieldErrors[fieldName] = issue.message;
    }
  }

  return fieldErrors;
}
