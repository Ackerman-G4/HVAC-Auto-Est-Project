# Dual-Control Smoke Checklist

Scope: Suggested -> Override -> Final behavior across pricing, room loads, equipment, and BOQ.

## Pre-checks
- [ ] App is running locally on http://127.0.0.1:3000
- [ ] Firebase credentials are configured and Firestore is reachable

## Flow
- [ ] Create a new project
- [ ] Add a room with area > 0 and confirm cooling load exists
- [ ] Auto-size equipment and confirm at least one selection
- [ ] Generate BOQ and confirm grand total > 0
- [ ] Save project pricing overrides (labor, overhead, contingency, VAT) and confirm BOQ becomes stale
- [ ] Save room TR/BTU override and confirm room load is marked overridden
- [ ] Save equipment quantity/unit-price override and confirm selection is marked overridden
- [ ] Regenerate BOQ after stale state
- [ ] Save BOQ item unit-price override and confirm item is marked overridden
- [ ] Reset BOQ item to suggested and confirm override clears
- [ ] Reset room load to suggested and confirm overrides clear
- [ ] Reset equipment to suggested and confirm overrides clear
- [ ] Confirm BOQ API still reports pricing policy override state
- [ ] Cleanup test project

## Automated Runner
Use the script at scripts/smoke-dual-control.ps1 to execute the same checks against local API endpoints.
