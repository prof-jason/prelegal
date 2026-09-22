$ErrorActionPreference = "Stop"

$ContainerName = "prelegal-app"

# `docker rm -f` exits 0 even for a container that doesn't exist, so check
# first to report an accurate message.
$existing = docker ps -aq -f "name=^$ContainerName`$"
if ($existing) {
    docker rm -f $ContainerName | Out-Null
    Write-Host "Prelegal stopped."
} else {
    Write-Host "Prelegal was not running."
}
