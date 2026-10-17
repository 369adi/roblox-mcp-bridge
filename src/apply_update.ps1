param([Parameter(Mandatory=$true)][string]$JobPath, [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$job = Get-Content -LiteralPath $JobPath -Raw | ConvertFrom-Json
$root = [IO.Path]::GetFullPath($job.root).TrimEnd('\')
$payload = [IO.Path]::GetFullPath($job.payload).TrimEnd('\')
$backup = Join-Path ([IO.Path]::GetDirectoryName($JobPath)) 'backup'
$exe = Join-Path $root 'PC-MCP-Bridge.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Installed bridge not found' }
$sourceProcess = Get-Process -Id $job.pid -ErrorAction SilentlyContinue
if ($sourceProcess) {
    if ($sourceProcess.Path -ne $exe) { throw 'Bridge PID does not match install target' }
    if (-not $sourceProcess.WaitForExit(45000)) { throw 'Bridge still running; update cancelled' }
}
$changed = [Collections.Generic.List[string]]::new()
$created = [Collections.Generic.List[string]]::new()
try {
    foreach ($file in $job.files.PSObject.Properties) {
        $name = $file.Name
        if ($name -ne 'PC-MCP-Bridge.exe' -and -not $name.StartsWith('_internal/')) { throw 'Unexpected update path' }
        $source = [IO.Path]::GetFullPath((Join-Path $payload $name))
        $target = [IO.Path]::GetFullPath((Join-Path $root $name))
        if (-not $source.StartsWith($payload+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $target.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes update root' }
        $probe = $target
        while ($probe -and $probe.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) {
            if (Test-Path -LiteralPath $probe) {
                if ((Get-Item -LiteralPath $probe -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point in install target' }
            }
            if ($probe -eq $root) { break }
            $probe = [IO.Path]::GetDirectoryName($probe)
        }
        $hashStream = [IO.File]::OpenRead($source)
        $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
        try { $fileHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($hashStream)).Replace('-','').ToLowerInvariant() }
        finally { $hashStream.Dispose(); $hashAlgorithm.Dispose() }
        if ($fileHash -ne $file.Value) { throw 'Staged update changed' }
    }
    foreach ($file in $job.files.PSObject.Properties) {
        $target = Join-Path $root $file.Name
        $saved = Join-Path $backup $file.Name
        if (Test-Path -LiteralPath $target) {
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($saved)) -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination $saved -Force
            $changed.Add($file.Name)
        } else { $created.Add($file.Name) }
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $payload $file.Name) -Destination $target -Force
    }
    if (-not $NoRestart) { Start-Process -FilePath $exe -WindowStyle Normal }
} catch {
    foreach ($name in $changed) { Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $root $name) -Force }
    foreach ($name in $created) { Remove-Item -LiteralPath (Join-Path $root $name) -Force -ErrorAction SilentlyContinue }
    $_ | Out-String | Set-Content -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($JobPath)) 'update-error.txt')
    if (-not $NoRestart) { Start-Process -FilePath $exe -WindowStyle Normal }
    exit 1
}
