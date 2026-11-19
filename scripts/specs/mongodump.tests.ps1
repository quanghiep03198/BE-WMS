param([switch]$LargeFile)

$ErrorActionPreference = "Stop"

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("mongodump-test-" + [guid]::NewGuid())
$scriptDir = Join-Path $testRoot "scripts"
$toolsDir = Join-Path $testRoot "tools"
$backupRoot = Join-Path $testRoot "backups"
New-Item -ItemType Directory -Path $scriptDir, $toolsDir, $backupRoot -Force | Out-Null

try {
    Copy-Item (Join-Path $PSScriptRoot "..\mongodump.ps1") $scriptDir
    $fakeDump = @'
$index = [array]::IndexOf($args, "--out")
if ($index -lt 0) { throw "Missing --out" }
$db = Join-Path $args[$index + 1] "test_db"
New-Item -ItemType Directory -Path $db -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $db "sample.bson"), "test data")
if ($env:FAKE_LARGE_DUMP -eq "1") {
    $stream = [System.IO.File]::OpenWrite((Join-Path $db "sample.bson"))
    try { $stream.SetLength(2147483649) } finally { $stream.Dispose() }
}
$global:LASTEXITCODE = 0
'@
    Set-Content -Path (Join-Path $toolsDir "mongodump.ps1") -Value $fakeDump
    $wrapper = @'
param($BackupRoot)
function Get-Command {
    param($Name)
    if ($Name -eq "mongodump") {
        return [pscustomobject]@{ Source = $env:FAKE_MONGODUMP }
    }
    Microsoft.PowerShell.Core\Get-Command @PSBoundParameters
}
function Get-Date {
    param([string]$Format)
    if ($Format -eq "yyyy-MM-dd_HH-mm") { return $env:TEST_TIMESTAMP }
    Microsoft.PowerShell.Utility\Get-Date @PSBoundParameters
}
& $env:BACKUP_SCRIPT -BackupRoot $BackupRoot -DbName "test_db"
exit $LASTEXITCODE
'@
    $wrapperPath = Join-Path $testRoot "run.ps1"
    Set-Content -Path $wrapperPath -Value $wrapper
    $env:FAKE_MONGODUMP = Join-Path $toolsDir "mongodump.ps1"
    $env:BACKUP_SCRIPT = Join-Path $scriptDir "mongodump.ps1"

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $env:TEST_TIMESTAMP = $timestamp
    $dumpPath = Join-Path $backupRoot $timestamp
    $dbPath = Join-Path $dumpPath "test_db"
    New-Item -ItemType Directory -Path $dbPath -Force | Out-Null
    $oldZip = Join-Path $backupRoot "old.zip"
    Set-Content -Path $oldZip -Value "previous backup"
    $locked = [System.IO.File]::Open((Join-Path $dbPath "locked.bson"), "Create", "ReadWrite", "None")
    try {
        $ErrorActionPreference = "Continue"
        $output = & powershell.exe -NoProfile -File $wrapperPath -BackupRoot $backupRoot 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
    } finally {
        $locked.Dispose()
    }

    if ($exitCode -eq 0 -or -not (Test-Path $oldZip) -or
        -not (Test-Path (Join-Path $dbPath "sample.bson"))) {
        throw "Compression failure must return an error and preserve both the dump and previous backup. Output: $output"
    }

    Remove-Item (Join-Path $dbPath "locked.bson") -Force
    if ($LargeFile) { $env:FAKE_LARGE_DUMP = "1" }
    $output = & powershell.exe -NoProfile -File $wrapperPath -BackupRoot $backupRoot 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Successful backup failed: $output"
    }
    $zip = Get-ChildItem -Path $backupRoot -Filter "*.zip" -File
    if (@($zip).Count -ne 1 -or (Test-Path $dumpPath)) {
        throw "Successful backup must leave one ZIP and remove the dump directory."
    }
    if ($LargeFile) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
        try {
            $entry = $archive.GetEntry("$timestamp\test_db\sample.bson")
            if (-not $entry -or $entry.Length -ne 2147483649) {
                $entries = $archive.Entries | ForEach-Object { "$($_.FullName): $($_.Length)" }
                throw "Backup ZIP must contain the entire file larger than 2 GiB. Entries: $entries"
            }
            $stream = $entry.Open()
            try { $stream.CopyTo([System.IO.Stream]::Null) } finally { $stream.Dispose() }
        } finally {
            $archive.Dispose()
        }
        $extract = Join-Path $testRoot "extracted"
        Expand-Archive -LiteralPath $zip.FullName -DestinationPath $extract -ErrorAction Stop
        $sample = Get-Item -LiteralPath (Join-Path $extract "$timestamp\test_db\sample.bson")
        if ($sample.Length -ne 2147483649) {
            throw "Expand-Archive must restore the entire file larger than 2 GiB."
        }
    } else {
        $extract = Join-Path $testRoot "extracted"
        Expand-Archive -LiteralPath $zip.FullName -DestinationPath $extract
        $sample = Join-Path $extract "$timestamp\test_db\sample.bson"
        if (-not (Test-Path $sample) -or (Get-Content $sample -Raw) -ne "test data") {
            throw "Backup ZIP must contain the original dump and be readable by Expand-Archive."
        }
        $originalHash = (Get-FileHash -LiteralPath $zip.FullName).Hash
        $env:FAKE_LARGE_DUMP = "0"
        $ErrorActionPreference = "Continue"
        $output = & powershell.exe -NoProfile -File $wrapperPath -BackupRoot $backupRoot 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"
        if ($exitCode -eq 0 -or (Get-FileHash -LiteralPath $zip.FullName).Hash -ne $originalHash -or
            -not (Test-Path (Join-Path $dbPath "sample.bson"))) {
            throw "An existing ZIP must not be overwritten when a backup shares its timestamp. Output: $output"
        }
    }
    Write-Host "mongodump tests passed"
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
