# backup-mongo.ps1
param(
    [string]$BackupRoot = ""
)

$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
    $BackupRoot = Join-Path $projectRoot "backup\mongodb"
}

$timestamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$backupPath = Join-Path $BackupRoot $timestamp
$logFile    = Join-Path $projectRoot "logs\backup.log"

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $logFile) -Force | Out-Null

$mongohost  = "rs0/localhost:27017,localhost:27018,localhost:27019"
$db         = "data_warehouse"

function Resolve-MongodumpPath {
    $cmd = Get-Command mongodump -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        return $cmd.Source
    }

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:MONGO_TOOLS_HOME)) {
        $candidates += (Join-Path $env:MONGO_TOOLS_HOME "mongodump.exe")
    }
    if (-not [string]::IsNullOrWhiteSpace($env:MONGODB_TOOLS_HOME)) {
        $candidates += (Join-Path $env:MONGODB_TOOLS_HOME "mongodump.exe")
    }
    $candidates += "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe"

    foreach ($path in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path $path)) {
            return $path
        }
    }

    return $null
}

function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

# --- Dump ---
Log "START backup database: $db"
$mongodumpPath = Resolve-MongodumpPath
if ([string]::IsNullOrWhiteSpace($mongodumpPath)) {
    Log "ERROR: mongodump not found. Check PATH, MONGO_TOOLS_HOME, or MONGODB_TOOLS_HOME."
    exit 1
}

Log "Using mongodump: $mongodumpPath"
& $mongodumpPath `
    --host        $mongohost `
    --db          $db `
    --out         $backupPath `
    --readPreference "secondaryPreferred"

if ($LASTEXITCODE -eq 0) {
    Log "SUCCESS: $backupPath"
} else {
    Log "ERROR: mongodump failed (exit code $LASTEXITCODE)"
    exit 1
}

# --- Nén folder backup vừa tạo ---
$zipPath = "$backupPath.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}
Compress-Archive -Path $backupPath -DestinationPath $zipPath
if ($LASTEXITCODE -eq 0) {
    Remove-Item $backupPath -Recurse -Force
    Log "COMPRESSED: $zipPath"
} else {
    Log "ERROR: compress backup failed"
    exit 1
}

# --- Chỉ giữ lại bản backup mới nhất ---
Get-ChildItem -Path $BackupRoot -Filter "*.zip" -File |
    Where-Object { $_.FullName -ne $zipPath } |
    ForEach-Object {
        Remove-Item $_.FullName -Force
        Log "DELETED old backup zip: $($_.Name)"
    }

Log "DONE"