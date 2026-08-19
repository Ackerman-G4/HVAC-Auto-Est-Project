import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseJsonBody,
  parseValue,
  VALIDATION_ERROR_CODE,
  INVALID_JSON_CODE,
  type ValidationErrorBody,
} from '../http';

/**
 * The boundary helper is the only thing standing between an arbitrary HTTP
 * payload and the domain, because `request.json()` returns `any` and the
 * compiler cannot object.
 *
 * These drive the four cases the plan names — valid body, malformed JSON,
 * missing required field, wrong scalar type — plus the two properties that make
 * the helper safe to hand to 36 handlers: it never throws, and a failure always
 * carries machine-readable per-field detail.
 */

const roomSchema = z.object({
  name: z.string().min(1),
  areaM2: z.number().positive(),
  floorNumber: z.number().int().default(1),
});

/** A Request whose body is exactly `body`, without going through JSON.stringify. */
function rawRequest(body: string): Request {
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function jsonRequest(body: unknown): Request {
  return rawRequest(JSON.stringify(body));
}

async function bodyOf(response: Response): Promise<ValidationErrorBody> {
  return (await response.json()) as ValidationErrorBody;
}

describe('parseJsonBody accepts a valid body', () => {
  it('returns the parsed data', async () => {
    const parsed = await parseJsonBody(
      jsonRequest({ name: 'Server Room', areaM2: 42.5, floorNumber: 3 }),
      roomSchema,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({ name: 'Server Room', areaM2: 42.5, floorNumber: 3 });
  });

  it('applies schema defaults, so handlers do not need their own', async () => {
    // The defensive `body.floorNumber || 1` this replaces would rewrite a
    // legitimate 0; a schema default only fills a genuinely absent field.
    const parsed = await parseJsonBody(
      jsonRequest({ name: 'Lobby', areaM2: 10 }),
      roomSchema,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.floorNumber).toBe(1);
  });

  it('keeps a zero that was actually supplied', async () => {
    const parsed = await parseJsonBody(
      jsonRequest({ name: 'Basement', areaM2: 10, floorNumber: 0 }),
      roomSchema,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.floorNumber).toBe(0);
  });
});

describe('parseJsonBody rejects malformed JSON', () => {
  it('returns 400 rather than throwing', async () => {
    // request.json() throws here. If that escaped the helper it would surface
    // as a 500 — a server fault for what is a client mistake.
    const parsed = await parseJsonBody(rawRequest('{ not json'), roomSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);
    expect((await bodyOf(parsed.response)).code).toBe(INVALID_JSON_CODE);
  });

  it('treats an empty body as malformed, not as an empty object', async () => {
    const parsed = await parseJsonBody(rawRequest(''), roomSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect((await bodyOf(parsed.response)).code).toBe(INVALID_JSON_CODE);
  });
});

describe('parseJsonBody rejects an invalid body', () => {
  it('names the missing required field', async () => {
    const parsed = await parseJsonBody(jsonRequest({ areaM2: 10 }), roomSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    const body = await bodyOf(parsed.response);
    expect(parsed.response.status).toBe(400);
    expect(body.code).toBe(VALIDATION_ERROR_CODE);
    expect(body.details.map((d) => d.path)).toContain('name');
  });

  it('names the field whose scalar type is wrong', async () => {
    const parsed = await parseJsonBody(
      jsonRequest({ name: 'Server Room', areaM2: 'forty-two' }),
      roomSchema,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    const body = await bodyOf(parsed.response);
    expect(body.details).toHaveLength(1);
    expect(body.details[0].path).toBe('areaM2');
    expect(body.details[0].code).toBe('invalid_type');
  });

  it('reports every failing field, not just the first', async () => {
    // The previous helper returned `error.issues[0].message` alone, so a form
    // with three bad fields surfaced one at a time.
    const parsed = await parseJsonBody(jsonRequest({ areaM2: -5 }), roomSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    const paths = (await bodyOf(parsed.response)).details.map((d) => d.path);
    expect(paths).toContain('name');
    expect(paths).toContain('areaM2');
  });

  it('renders nested and array paths so a client can map them to fields', async () => {
    const nested = z.object({
      floors: z.array(z.object({ roomCount: z.number().int() })),
    });

    const parsed = await parseJsonBody(
      jsonRequest({ floors: [{ roomCount: 2 }, { roomCount: 'many' }] }),
      nested,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect((await bodyOf(parsed.response)).details[0].path).toBe('floors[1].roomCount');
  });

  it('rejects a body that is not an object at all', async () => {
    const parsed = await parseJsonBody(jsonRequest('a bare string'), roomSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect((await bodyOf(parsed.response)).code).toBe(VALIDATION_ERROR_CODE);
  });
});

describe('parseValue', () => {
  it('validates a value that did not arrive as a JSON body', async () => {
    const parsed = parseValue({ name: 'Lobby', areaM2: 10 }, roomSchema);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.name).toBe('Lobby');
  });

  it('fails with the same shape as the body parser', async () => {
    const parsed = parseValue({ areaM2: 10 }, roomSchema);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    const body = await bodyOf(parsed.response);
    expect(body.code).toBe(VALIDATION_ERROR_CODE);
    expect(body.details.map((d) => d.path)).toContain('name');
  });
});
