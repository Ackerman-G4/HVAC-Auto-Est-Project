$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/dev-with-emulator.ps1'
& $target @args
exit $LASTEXITCODE

