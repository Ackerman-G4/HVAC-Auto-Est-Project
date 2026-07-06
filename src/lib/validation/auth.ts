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
  .min(8, 'Password must be at least 8 characters')
  .max(PASSWORD_MAX_LENGTH, 'Password is too long')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

const roleSchema = z.enum(['engineer', 'admin']);

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .strict();

export const registerRequestSchema = z
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

export const registerFormSchema = registerRequestSchema
  .extend({
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .superRefine((value, ctx) => {
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

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterFormRequest = z.infer<typeof registerFormSchema>;
export type GoogleLoginRequest = z.infer<typeof googleLoginRequestSchema>;

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
