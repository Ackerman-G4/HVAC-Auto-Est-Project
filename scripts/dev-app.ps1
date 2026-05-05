$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/dev-app.ps1'
& $target @args
exit $LASTEXITCODE

