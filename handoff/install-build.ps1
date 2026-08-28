$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $RootDir 'scripts/portable-pipeline.mjs') @args
exit $LASTEXITCODE
