# Build and run the Prelegal container. The database inside the container
# is created from scratch on every start, so re-running this script always
# gives a fresh, empty database.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$ImageTag = "prelegal:latest"
$ContainerName = "prelegal-app"

docker build -t $ImageTag .
# $ErrorActionPreference doesn't apply to native-executable exit codes, so
# a failed `docker build` wouldn't otherwise stop the script here.
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker rm -f $ContainerName 2>$null | Out-Null

$EnvFileArgs = @()
if (Test-Path ".env") {
    $EnvFileArgs = @("--env-file", ".env")
}

docker run -d --name $ContainerName -p 8000:8000 @EnvFileArgs $ImageTag
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Prelegal is starting at http://localhost:8000"
Write-Host "Run scripts/stop-windows.ps1 to stop it."
