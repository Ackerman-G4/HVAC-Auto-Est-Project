function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isBuildingSimulationEnabled(): boolean {
  return parseBooleanFlag(
    process.env.ENABLE_BUILDING_SIMULATION
      ?? process.env.NEXT_PUBLIC_ENABLE_BUILDING_SIMULATION,
  );
}
