$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $RootDir 'scripts/serve-dist.mjs') @args
exit $LASTEXITCODE
