$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  node .\scripts\cleanup-r7-leftovers.mjs
  Write-Host 'R6.6.1 stale R7 cleanup complete.' -ForegroundColor Green
} finally {
  Pop-Location
}
