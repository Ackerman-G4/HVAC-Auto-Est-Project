/**
 * The HTTP trust boundary.
 *
 * `Request.json()` is declared as returning `any`, so nothing in the type system
 * objects when an unvalidated payload flows into persistence or into the
 * calculation engine. The type gate stays green while the boundary is wide open
 * — which is exactly why 36 handlers could accept arbitrary input without a
 * single compiler complaint.
 *
 * `safeParse` reintroduces the check at runtime and `z.infer` derives the static
 * type from the same schema, so the runtime shape and the compile-time shape
 * cannot drift apart.
 *
 * The failure branch returns a ready-made response rather than throwing.
 * Throwing across the boundary means every handler needs a try/catch that maps
 * the error back to a status, and the one that forgets returns a 500 for what
 * is a client mistake. Returning a discriminated union makes the narrowing
 * mandatory: `data` is unreachable until `ok` has been checked.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

/** Machine-readable code on a rejected body. Clients branch on this, not prose. */
export const VALIDATION_ERROR_CODE = 'VALIDATION_FAILED' as const;
/** Machine-readable code when the body is not JSON at all. */
export const INVALID_JSON_CODE = 'INVALID_JSON' as const;

/** One rejected field. `path` is dotted, with array indices in brackets. */
export interface ValidationIssue {
  /** e.g. `floors[0].roomCount`. Empty string when the whole body is wrong. */
  path: string;
  message: string;
  /** Zod's issue code, e.g. `invalid_type` / `too_small`. */
  code: string;
}

export interface ValidationErrorBody {
  error: string;
  description: string;
  code: typeof VALIDATION_ERROR_CODE | typeof INVALID_JSON_CODE;
  /** Always present on a validation failure, so clients can render per-field. */
  details: ValidationIssue[];
}

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<ValidationErrorBody> };

/**
 * Render a Zod path as something a client can map back to a form field.
 * `['floors', 0, 'roomCount']` becomes `floors[0].roomCount`.
 */
function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else {
      out += out ? `.${String(segment)}` : String(segment);
    }
  }
  return out;
}

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
    code: issue.code,
  }));
}

function validationResponse(
  description: string,
  code: ValidationErrorBody['code'],
  details: ValidationIssue[],
): NextResponse<ValidationErrorBody> {
  return NextResponse.json<ValidationErrorBody>(
    { error: 'Invalid request payload', description, code, details },
    { status: 400 },
  );
}

/**
 * Parse and validate a JSON request body.
 *
 * @example
 * const parsed = await parseJsonBody(request, createRoomSchema);
 * if (!parsed.ok) return parsed.response;
 * // parsed.data is typed from the schema from here on.
 *
 * Defaults belong in the schema (`z.number().default(1)`), not in the handler.
 * A `body.floorNumber || 1` after this call is a second source of truth and
 * silently rewrites a legitimate 0.
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParsedBody<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    // Malformed JSON, or no body at all. This is a client error, not a 500.
    return {
      ok: false,
      response: validationResponse(
        'Request body is not valid JSON.',
        INVALID_JSON_CODE,
        [],
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = toIssues(result.error);
    return {
      ok: false,
      response: validationResponse(
        details.length === 1 && details[0].path
          ? `${details[0].path}: ${details[0].message}`
          : `Request body failed validation (${details.length} ${details.length === 1 ? 'issue' : 'issues'}).`,
        VALIDATION_ERROR_CODE,
        details,
      ),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Validate an already-obtained value against a schema.
 *
 * For inputs that do not arrive as a JSON body — query strings, route params,
 * or a payload a handler has already read for another reason.
 */
export function parseValue<S extends z.ZodType>(
  value: unknown,
  schema: S,
): ParsedBody<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  const details = toIssues(result.error);
  return {
    ok: false,
    response: validationResponse(
      details.length === 1 && details[0]?.path
        ? `${details[0].path}: ${details[0].message}`
        : `Request failed validation (${details.length} ${details.length === 1 ? 'issue' : 'issues'}).`,
      VALIDATION_ERROR_CODE,
      details,
    ),
  };
}
