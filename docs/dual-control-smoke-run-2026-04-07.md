# Dual-Control Smoke Run Report (2026-04-07)

Runner: scripts/smoke-dual-control.ps1
Target: http://127.0.0.1:3000

## Result
- Status: Passed
- Completed steps: 14 / 14
- Final output: `DUAL-CONTROL SMOKE: ALL CHECKS PASSED`
- Cleanup: Test project deleted successfully

## Runtime Context
- Next.js dev server running on `http://localhost:3000`
- Firestore Emulator running on `127.0.0.1:9080`
- Emulator project: `demo-hvac-auto`

## Evidence
- `[1/14]` Create project: PASS
- `[2/14]` Add room + cooling load: PASS
- `[3/14]` Auto-size equipment: PASS
- `[4/14]` Generate BOQ: PASS
- `[5/14]` Capture first BOQ item: PASS
- `[6/14]` Save pricing overrides: PASS
- `[7/14]` Save room load overrides: PASS
- `[8/14]` Save equipment overrides: PASS
- `[9/14]` Regenerate BOQ: PASS
- `[10/14]` Override BOQ item: PASS
- `[11/14]` Reset BOQ item: PASS
- `[12/14]` Reset room load: PASS
- `[13/14]` Reset equipment: PASS
- `[14/14]` Verify pricing policy override state: PASS

## Notes
- This successful run used the local Firestore emulator path (no production Firebase credentials required).
