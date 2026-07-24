$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/sync-firebase-web-key.ps1'
& $target @args
exit $LASTEXITCODE

