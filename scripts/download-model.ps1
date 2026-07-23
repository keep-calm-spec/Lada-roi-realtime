$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$modelDirectory = Join-Path $projectRoot "models"
$modelPath = Join-Path $modelDirectory "lada_mosaic_restoration_model_generic_v1.2.pth"
$temporaryPath = "$modelPath.download"
$modelUrl = "https://huggingface.co/ladaapp/lada/resolve/main/lada_mosaic_restoration_model_generic_v1.2.pth?download=true"
$expectedSha256 = "D404152576CE64FB5B2F315C03062709DAC4F5F8548934866CD01C823C8104EE"

New-Item -ItemType Directory -Path $modelDirectory -Force | Out-Null

if (Test-Path -LiteralPath $modelPath -PathType Leaf) {
    $existingHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash
    if ($existingHash -eq $expectedSha256) {
        Write-Host "[Demask ROI] Model already exists and passed SHA-256 verification."
        exit 0
    }
    throw "Existing model failed SHA-256 verification: $existingHash"
}

try {
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }

    Write-Host "[Demask ROI] Downloading Lada BasicVSR++ v1.2..."
    Invoke-WebRequest -Uri $modelUrl -OutFile $temporaryPath -UseBasicParsing

    $downloadedHash = (Get-FileHash -LiteralPath $temporaryPath -Algorithm SHA256).Hash
    if ($downloadedHash -ne $expectedSha256) {
        throw "Downloaded model failed SHA-256 verification: $downloadedHash"
    }

    Move-Item -LiteralPath $temporaryPath -Destination $modelPath
    Write-Host "[Demask ROI] Model download and verification completed."
}
finally {
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}
