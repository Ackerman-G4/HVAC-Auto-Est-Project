$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/smoke-snapshot-playback.ps1'
& $target @args
exit $LASTEXITCODE
