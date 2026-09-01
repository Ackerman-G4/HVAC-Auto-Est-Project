import { describe, expect, it } from 'vitest';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '../pipe-sizing';

/**
 * Refrigerant and condensate pipe sizing.
 *
 * These feed the bill of quantities directly — pipe diameter sets the material
 * line, braze joint count sets the labour line, and the additional refrigerant
 * charge is priced by the kilogram. Surfaced as untested when the BOQ
 * decomposition (TASK 3.2) pulled the module into the coverage denominator at
 * 4 of 15 branches.
 *
 * These assert the selection rules and the boundaries between sizes rather
 * than pinning today's table, so a legitimate table revision does not fail the
 * suite while a broken lookup does.
 */

const base = {
  capacityBTU: 36000,
  refrigerantType: 'R410A' as const,
  lineLength: 10,
  elevationDiff: 3,
};

describe('refrigerant pipe selection', () => {
  it('rejects a non-positive capacity rather than sizing a pipe for nothing', () => {
    expect(() => sizeRefrigerantPipe({ ...base, capacityBTU: 0 })).toThrow();
    expect(() => sizeRefrigerantPipe({ ...base, capacityBTU: -36000 })).toThrow();
  });

  it('rejects a negative line length', () => {
    expect(() => sizeRefrigerantPipe({ ...base, lineLength: -5 })).toThrow();
  });

  it('selects a larger suction line for a larger capacity', () => {
    const small = sizeRefrigerantPipe({ ...base, capacityBTU: 12000 });
    const large = sizeRefrigerantPipe({ ...base, capacityBTU: 60000 });
    expect(large.suctionLine.odMM).toBeGreaterThan(small.suctionLine.odMM);
  });

  it('keeps the suction line larger than the liquid line', () => {
    // Suction carries low-pressure vapour and needs the greater area; a liquid
    // line sized above it would be a table transcription error.
    const result = sizeRefrigerantPipe(base);
    expect(result.suctionLine.odMM).toBeGreaterThan(result.liquidLine.odMM);
  });

  it('falls back to the R410A table for an unrecognised refrigerant', () => {
    const known = sizeRefrigerantPipe(base);
    const unknown = sizeRefrigerantPipe({
      ...base,
      refrigerantType: 'R600a' as unknown as typeof base.refrigerantType,
    });
    expect(unknown.suctionLine.odMM).toBe(known.suctionLine.odMM);
  });

  it('uses the largest tabulated size for a capacity beyond the table', () => {
    const huge = sizeRefrigerantPipe({ ...base, capacityBTU: 10_000_000 });
    expect(huge.suctionLine.odMM).toBeGreaterThan(0);
    expect(Number.isFinite(huge.suctionLine.odMM)).toBe(true);
  });
});

describe('line length limits', () => {
  it('allows a longer run for a VRF system than for a split', () => {
    expect(sizeRefrigerantPipe({ ...base, isVRF: true }).maxLineLength).toBe(100);
    expect(sizeRefrigerantPipe({ ...base, isVRF: false }).maxLineLength).toBe(30);
  });

  it('warns when a split run exceeds its limit', () => {
    const result = sizeRefrigerantPipe({ ...base, lineLength: 45 });
    expect(result.notes.join(' ')).toMatch(/exceeds max/);
  });

  it('stays silent when the same run is within a VRF limit', () => {
    const result = sizeRefrigerantPipe({ ...base, lineLength: 45, isVRF: true });
    expect(result.notes.join(' ')).not.toMatch(/exceeds max/);
  });

  it('calls for an oil return loop above twenty metres of lift', () => {
    // Oil will not return up a tall riser on vapour velocity alone.
    expect(sizeRefrigerantPipe({ ...base, elevationDiff: 25 }).notes.join(' ')).toMatch(/Oil return/);
    expect(sizeRefrigerantPipe({ ...base, elevationDiff: 15 }).notes.join(' ')).not.toMatch(/Oil return/);
  });
});

describe('quantities the bill prices', () => {
  it('charges no additional refrigerant for a run within the precharge', () => {
    // Units ship precharged for about five metres; billing extra for a shorter
    // run would overstate the material line.
    expect(sizeRefrigerantPipe({ ...base, lineLength: 5 }).refrigerantCharge).toBe(0);
    expect(sizeRefrigerantPipe({ ...base, lineLength: 3 }).refrigerantCharge).toBe(0);
  });

  it('charges additional refrigerant in proportion to the run beyond it', () => {
    const ten = sizeRefrigerantPipe({ ...base, lineLength: 10 }).refrigerantCharge;
    const fifteen = sizeRefrigerantPipe({ ...base, lineLength: 15 }).refrigerantCharge;
    expect(ten).toBeGreaterThan(0);
    expect(fifteen).toBeCloseTo(ten * 2, 0);
  });

  it('counts more braze joints for a longer run', () => {
    const short = sizeRefrigerantPipe({ ...base, lineLength: 4 }).braze.joints;
    const long = sizeRefrigerantPipe({ ...base, lineLength: 40 }).braze.joints;
    expect(long).toBeGreaterThan(short);
  });

  it('derives brazing rod from the joint count', () => {
    const result = sizeRefrigerantPipe(base);
    expect(result.braze.rodKg).toBeGreaterThan(0);
    expect(result.braze.rodKg).toBeCloseTo(result.braze.joints * 0.015, 2);
  });

  it('insulates the suction line at least as thickly as the liquid line', () => {
    // The suction line runs colder and is the one that sweats.
    const result = sizeRefrigerantPipe({ ...base, capacityBTU: 60000 });
    expect(result.suctionLine.insulationMM).toBeGreaterThanOrEqual(result.liquidLine.insulationMM);
  });
});

describe('condensate pipe selection', () => {
  it('steps up the diameter as capacity rises', () => {
    const sizes = [3, 8, 15, 30].map((tr) => sizeCondensatePipe(tr).pipeDiameter);
    expect(new Set(sizes).size).toBe(4);
  });

  it('selects on the boundary rather than just past it', () => {
    // Five tons is the top of the smallest size, not the bottom of the next.
    expect(sizeCondensatePipe(5).pipeDiameter).toBe(sizeCondensatePipe(3).pipeDiameter);
    expect(sizeCondensatePipe(5.1).pipeDiameter).not.toBe(sizeCondensatePipe(5).pipeDiameter);
  });

  it('always calls for a trap and a fall', () => {
    // Without a trap the drain pan siphons or blows back on negative pressure.
    const result = sizeCondensatePipe(10);
    expect(result.trapRequired).toBe(true);
    expect(result.slopePercent).toBeGreaterThan(0);
  });

  it('sizes the largest tabulated pipe for a capacity beyond the table', () => {
    expect(sizeCondensatePipe(500).pipeDiameter).toBe(sizeCondensatePipe(30).pipeDiameter);
  });
});
