'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Label + control + hint + error, wired for accessibility.
 *
 * `Input`, `Select` and `Textarea` already derive an id, wire `htmlFor` and
 * manage `aria-describedby` correctly. The ~49 unassociated labels in the app
 * are all hand-rolled markup that bypassed those primitives — usually because
 * the control needed different styling, or was a native `<select>`, or had a
 * unit suffix the primitive did not offer. So the fix is not "use Input more",
 * it is a wrapper that works with *any* control.
 *
 * The wiring is handed to the child explicitly rather than cloned onto it.
 * Cloning fails silently when the child forwards no props or is a fragment,
 * which is exactly how labels come unassociated in the first place; a render
 * prop cannot be ignored by accident.
 *
 * @example
 * <Field label="Room area" unit="m²" hint="Gross internal area">
 *   {(f) => <input {...f} value={area} onChange={…} />}
 * </Field>
 *
 * @example react-hook-form
 * <Field label="Email" error={errors.email?.message}>
 *   {(f) => <input {...f} {...register('email')} />}
 * </Field>
 */

export interface FieldControlProps {
  /** Put on the control so the label's `htmlFor` resolves. */
  id: string;
  /** Points at the hint and/or error text. */
  'aria-describedby': string | undefined;
  /** Set when the field is in error, so it is announced as invalid. */
  'aria-invalid': true | undefined;
  /** Mirrors the visible required marker for assistive tech. */
  'aria-required': true | undefined;
}

export interface FieldProps {
  label: string;
  children: (control: FieldControlProps) => React.ReactNode;
  /** Guidance shown under the control. Hidden while an error is showing. */
  hint?: string;
  /** Validation message. Replaces the hint and marks the control invalid. */
  error?: string;
  /** Unit suffix rendered beside the label (m², kW, CFM). */
  unit?: string;
  required?: boolean;
  className?: string;
  /** Visually hide the label while keeping it available to screen readers. */
  labelHidden?: boolean;
}

export function Field({
  label,
  children,
  hint,
  error,
  unit,
  required,
  className,
  labelHidden,
}: FieldProps) {
  const reactId = useId();
  const id = `field-${reactId}`;
  const errorId = error ? `${id}-error` : undefined;
  // The hint is not described when an error is showing, because it is not
  // rendered — announcing text that is not on screen is worse than silence.
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('w-full', className)}>
      <label
        htmlFor={id}
        className={cn(
          'mb-1.5 block text-xs font-medium font-display text-muted-foreground',
          labelHidden && 'sr-only',
        )}
      >
        {label}
        {unit ? <span className="ml-1 text-muted-foreground/70">({unit})</span> : null}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}

      {error ? (
        // role="alert" so a validation failure is announced when it appears,
        // not only when the control is next focused.
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
