<#
  Roda o app em modo de produção: o app compilado, com o banco em storage/,
  acessível por quem estiver no Tailscale.

    .\scripts\start-production.ps1            # build + migrations + inicia o servidor
    .\scripts\start-production.ps1 -Import    # idem, importando antes os dados mais recentes do jogo
    .\scripts\start-production.ps1 -NoBuild   # só inicia o último build (mais rápido)

  Precisa do arquivo .env.production na raiz (copie de .env.production.example).
#>
param(
  [switch]$Import,
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
# Node writes UTF-8. Windows PowerShell 5.1 decodes it with the console code
# page (850 in pt-BR), which garbles accents and box characters ("Ôöé").
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step([string]$Description, [scriptblock]$Command) {
  Write-Host "==> $Description" -ForegroundColor Cyan
  # Warnings that tools print on stderr (Vite, npm) are not failures: only the exit code counts
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command 2>&1 | ForEach-Object { "$_" } }
  finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $Description" }
}

if (-not (Test-Path '.env.production')) {
  throw 'Crie o .env.production a partir do .env.production.example (veja o README).'
}
New-Item -ItemType Directory -Force 'storage' | Out-Null

if (-not $NoBuild) {
  Invoke-Step 'Build de produção' { node ace build }
}
if (-not (Test-Path 'build\bin\server.js')) {
  throw 'Não existe build ainda. Rode sem -NoBuild.'
}

Copy-Item '.env.production' 'build\.env' -Force

Push-Location 'build'
try {
  if (-not $NoBuild) {
    # --ignore-scripts: better-sqlite3 ships prebuilt binaries; without it npm tries node-gyp
    Invoke-Step 'Dependências de produção' { npm ci --omit=dev --ignore-scripts --no-audit --no-fund }
  }
  Invoke-Step 'Migrations' { node ace migration:run --force }
  if ($Import) {
    Invoke-Step 'Importando dados do jogo' { node ace bitcraft:import }
  }
  Write-Host '==> Servidor no ar. Ctrl+C para parar.' -ForegroundColor Green
  $ErrorActionPreference = 'Continue'
  node bin/server.js
}
finally {
  Pop-Location
}
