# Inicia la aplicación desde cualquier carpeta sin activar el entorno virtual.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'

if (-not (Test-Path -LiteralPath $projectPython)) {
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if ($pythonLauncher) {
        & $pythonLauncher.Source -3 -m venv .venv
    } elseif ($pythonCommand) {
        & $pythonCommand.Source -m venv .venv
    } elseif (Test-Path -LiteralPath $bundledPython) {
        & $bundledPython -m venv .venv
    } else {
        throw 'Instala Python 3.10 o superior y vuelve a ejecutar este archivo.'
    }
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno virtual.' }
}

& $projectPython -c "import importlib.util, sys; sys.exit(not importlib.util.find_spec('flask'))"
if ($LASTEXITCODE -ne 0) {
    & $projectPython -m pip install -r requirements.txt --disable-pip-version-check
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias. Revisa la conexión.' }
}

Write-Host 'Siman Delivery: http://127.0.0.1:5000 (Ctrl+C para detener)' -ForegroundColor Cyan
& $projectPython app.py
