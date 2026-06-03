param(
	[string]$BackupRoot = "",
	[string]$MongoHost = "rs0/localhost:27017,localhost:27018,localhost:27019",
	[switch]$Drop
)

$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
	$BackupRoot = Join-Path $projectRoot "backup\mongodb"
}

$logFile = Join-Path $projectRoot "logs\restore.log"

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $logFile) -Force | Out-Null

function Log($msg) {
	$line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
	Write-Host $line
	Add-Content -Path $logFile -Value $line
}

function Resolve-MongorestorePath {
	$cmd = Get-Command mongorestore -ErrorAction SilentlyContinue
	if ($cmd -and $cmd.Source) {
		return $cmd.Source
	}

	$candidates = @()
	if (-not [string]::IsNullOrWhiteSpace($env:MONGO_TOOLS_HOME)) {
		$candidates += (Join-Path $env:MONGO_TOOLS_HOME "mongorestore.exe")
	}
	if (-not [string]::IsNullOrWhiteSpace($env:MONGODB_TOOLS_HOME)) {
		$candidates += (Join-Path $env:MONGODB_TOOLS_HOME "mongorestore.exe")
	}
	$candidates += "C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe"

	foreach ($path in $candidates) {
		if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path $path)) {
			return $path
		}
	}

	return $null
}

$mongorestorePath = Resolve-MongorestorePath
if ([string]::IsNullOrWhiteSpace($mongorestorePath)) {
	Log "ERROR: mongorestore not found. Check PATH, MONGO_TOOLS_HOME, or MONGODB_TOOLS_HOME."
	exit 1
}

$latestZip = Get-ChildItem -Path $BackupRoot -Filter "*.zip" -File |
	Sort-Object LastWriteTime -Descending |
	Select-Object -First 1

if (-not $latestZip) {
	Log "ERROR: no backup zip found in $BackupRoot"
	exit 1
}

$extractRoot = Join-Path $BackupRoot ("_restore_tmp_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

try {
	Log "START restore from: $($latestZip.FullName)"
	Expand-Archive -Path $latestZip.FullName -DestinationPath $extractRoot -Force

	$sampleBson = Get-ChildItem -Path $extractRoot -Recurse -Filter "*.bson" -File |
		Select-Object -First 1

	if (-not $sampleBson) {
		Log "ERROR: invalid backup zip. No .bson file found after unzip."
		exit 1
	}

	$dbFolder = Split-Path -Parent $sampleBson.FullName
	$dumpRoot = Split-Path -Parent $dbFolder

	Log "Using mongorestore: $mongorestorePath"
	Log "Restore source dir: $dumpRoot"

	if ($Drop.IsPresent) {
		& $mongorestorePath `
			--host $MongoHost `
			--drop `
			--dir $dumpRoot
	} else {
		& $mongorestorePath `
			--host $MongoHost `
			--dir $dumpRoot
	}

	if ($LASTEXITCODE -eq 0) {
		Log "SUCCESS: restore completed"
	} else {
		Log "ERROR: mongorestore failed (exit code $LASTEXITCODE)"
		exit 1
	}
}
catch {
	Log "ERROR: $($_.Exception.Message)"
	exit 1
}
finally {
	if (Test-Path $extractRoot) {
		Remove-Item -Path $extractRoot -Recurse -Force
		Log "CLEANUP: removed temp folder $extractRoot"
	}
}

Log "DONE"
