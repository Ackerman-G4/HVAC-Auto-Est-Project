import { describe, expect, it } from 'vitest';
import {
  electricalInputPowerKw,
  groupByFloor,
  requiresDuctwork,
  type SelectedEquipmentInput,
} from '../boq-inputs';
import { CalculationError } from '@/lib/engine/numeric-guards';
import { btuPerHourToKilowatts } from '@/lib/engine/units';

/**
 * Turning equipment selections into cost-engine inputs.
 *
 * Extracted from the BOQ route (TASK 3.2). The electrical sizing in particular
 * carried two defects the route had inlined; both are covered below.
 */

function selection(overrides: Partial<SelectedEquipmentInput> = {}): SelectedEquipmentInput {
  return {
    equipment: {
      manufacturer: 'Daikin',
      model: 'FDMF100',
      type: 'ducted_split',
      capacityTR: 3,
      capacityBTU: 36000,
      capacityKW: 10.5,
      refrigerant: 'R32',
      eer: 11,
      unitPricePHP: 100_000,
    },
    quantity: 1,
    floorName: 'Ground Floor',
    ...overrides,
  };
}

describe('electrical input power from capacity and efficiency', () => {
  it('divides capacity in kilowatts by the efficiency ratio', () => {
    // EER is Btu/h per watt, so input power is capacity / EER.
    const expected = btuPerHourToKilowatts(36000) / 11;
    expect(electricalInputPowerKw(36000, 11)).toBeCloseTo(expected, 12);
  });

  it('uses the exact Btu/h-to-kW conversion, not the inline 0.000293', () => {
    // The route wrote `capacityBTU * 0.000293`, which drifts 0.024% from the
    // exact value. On a 36,000 Btu/h unit that is a real, if small, error in
    // the sizing input that picks a breaker.
    const inlineApproximation = (36000 * 0.000293) / 11;
    const exact = electricalInputPowerKw(36000, 11);
    expect(exact).not.toBeCloseTo(inlineApproximation, 9);
    expect(Math.abs(exact - inlineApproximation) / exact).toBeLessThan(0.001);
  });

  it('rejects a zero efficiency rather than substituting a plausible one', () => {
    // The route wrote `/ (eer || 10)`. A catalogue record with eer: 0 silently
    // produced a wrong input power, and from there a wrong breaker and cable
    // size, with nothing reported anywhere.
    expect(() => electricalInputPowerKw(36000, 0)).toThrow(CalculationError);
  });

  it('rejects a negative efficiency, which has no physical meaning', () => {
    expect(() => electricalInputPowerKw(36000, -11)).toThrow(CalculationError);
  });

  it('rejects a non-finite efficiency', () => {
    expect(() => electricalInputPowerKw(36000, Number.NaN)).toThrow(CalculationError);
  });

  it('names the equipment record as the cause', () => {
    try {
      electricalInputPowerKw(36000, 0);
      expect.unreachable('expected the EER guard to throw');
    } catch (error) {
      expect((error as CalculationError).code).toBe('INVALID_EQUIPMENT_EER');
    }
  });

  it('falls as efficiency rises, holding capacity', () => {
    expect(electricalInputPowerKw(36000, 22)).toBeCloseTo(electricalInputPowerKw(36000, 11) / 2, 12);
  });
});

describe('which equipment carries sheet-metal ductwork', () => {
  it('recognises the catalogued ducted types', () => {
    for (const type of ['ducted_split', 'ducted', 'ahu', 'fcu', 'concealed']) {
      expect(requiresDuctwork(type)).toBe(true);
    }
  });

  it('excludes ductless types', () => {
    expect(requiresDuctwork('wall_mounted')).toBe(false);
    expect(requiresDuctwork('cassette')).toBe(false);
  });

  it('catches an uncatalogued type whose name contains duct', () => {
    expect(requiresDuctwork('High Static DUCTED Unit')).toBe(true);
  });
});

describe('grouping selections by floor', () => {
  it('collects selections that share a floor', () => {
    const groups = groupByFloor([
      selection({ floorName: 'Ground Floor' }),
      selection({ floorName: 'Second Floor' }),
      selection({ floorName: 'Ground Floor' }),
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get('Ground Floor')).toHaveLength(2);
    expect(groups.get('Second Floor')).toHaveLength(1);
  });

  it('preserves encounter order, so the bill is stable between runs', () => {
    const groups = groupByFloor([
      selection({ floorName: 'Second Floor' }),
      selection({ floorName: 'Ground Floor' }),
    ]);
    expect([...groups.keys()]).toEqual(['Second Floor', 'Ground Floor']);
  });

  it('returns nothing for no selections', () => {
    expect(groupByFloor([]).size).toBe(0);
  });
});

describe('assembling the cost-engine inputs', () => {
  it('sizes ductwork only for equipment that carries it', async () => {
    const { buildBoqInputs } = await import('../boq-inputs');
    const inputs = buildBoqInputs([
      selection({ equipment: { ...selection().equipment, type: 'ducted_split' } }),
      selection({ equipment: { ...selection().equipment, type: 'wall_mounted' } }),
    ]);

    expect(inputs.ducts).toHaveLength(1);
  });

  it('sizes one duct for the whole selection, not one per unit', async () => {
    // A floor with four identical units gets one riser sized for four, which
    // is how the duct is actually run.
    const { buildBoqInputs } = await import('../boq-inputs');
    const single = buildBoqInputs([selection({ quantity: 1 })]);
    const quadruple = buildBoqInputs([selection({ quantity: 4 })]);

    expect(quadruple.ducts).toHaveLength(1);
    expect(quadruple.ducts[0]!.runLengthM).toBe(single.ducts[0]!.runLengthM * 4);
  });

  it('counts one control zone per unit, not per selection', async () => {
    const { buildBoqInputs } = await import('../boq-inputs');
    const inputs = buildBoqInputs([selection({ quantity: 3 }), selection({ quantity: 2 })]);

    expect(inputs.controls.zones).toBe(5);
    expect(inputs.controls.co2Sensors).toBe(2);
    expect(inputs.controls.bmsPoints).toBe(15);
  });

  it('brackets the catalogue price rather than quoting it exactly', async () => {
    // The bill carries a supplier spread; a single figure would imply a
    // firm quotation the estimator has not obtained.
    const { buildBoqInputs } = await import('../boq-inputs');
    const [line] = buildBoqInputs([selection()]).equipment;

    expect(line!.unitPriceMin).toBeCloseTo(90_000, 6);
    expect(line!.unitPriceMax).toBeCloseTo(110_000, 6);
  });

  it('sizes refrigerant, condensate and electrical once per selection', async () => {
    const { buildBoqInputs } = await import('../boq-inputs');
    const inputs = buildBoqInputs([selection(), selection()]);

    expect(inputs.refrigerantPipes).toHaveLength(2);
    expect(inputs.condensate).toHaveLength(2);
    expect(inputs.electrical).toHaveLength(2);
  });

  it('puts a unit above the three-ton threshold on three-phase 380 V', async () => {
    const { buildBoqInputs } = await import('../boq-inputs');
    const large = buildBoqInputs([
      selection({ equipment: { ...selection().equipment, capacityTR: 5 } }),
    ]);
    const small = buildBoqInputs([
      selection({ equipment: { ...selection().equipment, capacityTR: 2 } }),
    ]);

    expect(large.electrical[0]).toBeTruthy();
    expect(small.electrical[0]).toBeTruthy();
  });

  it('defaults an unrecognised refrigerant to R32 rather than failing the bill', async () => {
    const { buildBoqInputs } = await import('../boq-inputs');
    const inputs = buildBoqInputs([
      selection({ equipment: { ...selection().equipment, refrigerant: '' } }),
    ]);

    expect(inputs.refrigerantPipes).toHaveLength(1);
  });

  it('produces empty inputs for no selections rather than throwing', async () => {
    const { buildBoqInputs } = await import('../boq-inputs');
    const inputs = buildBoqInputs([]);

    expect(inputs.ducts).toEqual([]);
    expect(inputs.equipment).toEqual([]);
    expect(inputs.controls.zones).toBe(0);
  });

  it('refuses to build inputs for equipment with a zero EER', async () => {
    // The guard fires inside the electrical pass, so a corrupt catalogue row
    // fails the bill rather than pricing a wrong cable into it.
    const { buildBoqInputs } = await import('../boq-inputs');
    expect(() =>
      buildBoqInputs([selection({ equipment: { ...selection().equipment, eer: 0 } })]),
    ).toThrow(CalculationError);
  });
});
