// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Field } from '../field';

/**
 * Field exists to stop labels coming unassociated.
 *
 * The app has ~49 `<label>` elements with no `htmlFor`, all in hand-rolled
 * markup that bypassed the Input/Select primitives. Clicking such a label does
 * not focus its control and a screen reader announces the field unnamed.
 *
 * So the tests that matter are the association ones: they assert the thing that
 * was actually broken, through the same query a user of assistive tech relies
 * on (`getByLabelText`), rather than checking that an attribute exists.
 */

afterEach(cleanup);

describe('Field label association', () => {
  it('associates the label with the control', () => {
    render(
      <Field label="Room area">{(f) => <input {...f} defaultValue="42" />}</Field>,
    );

    const input = screen.getByLabelText('Room area') as HTMLInputElement;
    expect(input.value).toBe('42');
  });

  it('points htmlFor at the control, which is what makes clicking the label focus it', () => {
    // Asserting focus directly would be testing the browser: jsdom forwards a
    // label click to the control but does not move focus the way a real one
    // does. The htmlFor/id pair is the part this component is responsible for.
    render(<Field label="Ceiling height">{(f) => <input {...f} />}</Field>);

    const label = screen.getByText('Ceiling height') as HTMLLabelElement;
    expect(label.htmlFor).toBe(screen.getByLabelText('Ceiling height').id);
    expect(label.htmlFor).not.toBe('');
  });

  it('gives each instance a distinct id', () => {
    render(
      <>
        <Field label="Width">{(f) => <input {...f} />}</Field>
        <Field label="Height">{(f) => <input {...f} />}</Field>
      </>,
    );

    // Duplicate ids would silently point both labels at the same control.
    expect(screen.getByLabelText('Width').id).not.toBe(screen.getByLabelText('Height').id);
  });

  it('keeps the label available to screen readers when visually hidden', () => {
    render(
      <Field label="Filter" labelHidden>{(f) => <input {...f} />}</Field>,
    );
    expect(screen.getByLabelText('Filter')).toBeDefined();
  });

  it('works with a native select, not only an input', () => {
    // Most of the unassociated labels sit on hand-rolled selects.
    render(
      <Field label="Space type">
        {(f) => (
          <select {...f}>
            <option>Office</option>
          </select>
        )}
      </Field>,
    );
    expect(screen.getByLabelText('Space type').tagName).toBe('SELECT');
  });
});

describe('Field hint and error', () => {
  it('describes the control with its hint', () => {
    render(
      <Field label="Area" hint="Gross internal area">{(f) => <input {...f} />}</Field>,
    );

    const input = screen.getByLabelText('Area');
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe('Gross internal area');
  });

  it('marks the control invalid and points at the error', () => {
    render(
      <Field label="Area" error="Must be greater than 0">{(f) => <input {...f} />}</Field>,
    );

    const input = screen.getByLabelText('Area');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe('Must be greater than 0');
  });

  it('announces the error as an alert', () => {
    render(<Field label="Area" error="Required">{(f) => <input {...f} />}</Field>);
    // Without role=alert the message is only heard if the control is refocused.
    expect(screen.getByRole('alert').textContent).toBe('Required');
  });

  it('does not describe the control with a hint it is no longer showing', () => {
    render(
      <Field label="Area" hint="Gross internal area" error="Required">
        {(f) => <input {...f} />}
      </Field>,
    );

    expect(screen.queryByText('Gross internal area')).toBeNull();
    const describedBy = screen.getByLabelText('Area').getAttribute('aria-describedby')!;
    // Pointing at removed text would announce nothing at all.
    expect(document.getElementById(describedBy)?.textContent).toBe('Required');
  });

  it('is neither invalid nor described when clean', () => {
    render(<Field label="Area">{(f) => <input {...f} />}</Field>);

    const input = screen.getByLabelText('Area');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('marks a required field for assistive tech, not just visually', () => {
    render(<Field label="Area" required>{(f) => <input {...f} />}</Field>);
    // Matched loosely because the visual asterisk lives inside the label.
    expect(screen.getByLabelText(/Area/).getAttribute('aria-required')).toBe('true');
  });

  it('hides the required asterisk from the accessible name', () => {
    // Otherwise the field is announced as "Area star".
    render(<Field label="Area" required>{(f) => <input {...f} />}</Field>);
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
  });

  it('includes the unit in the accessible name', () => {
    // "Area" alone is ambiguous when the form mixes m² and ft².
    render(<Field label="Area" unit="m²">{(f) => <input {...f} />}</Field>);
    expect(screen.getByLabelText(/Area.*m²/)).toBeDefined();
  });
});
