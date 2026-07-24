$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/dev-stack.ps1'
& $target @args
exit $LASTEXITCODE

