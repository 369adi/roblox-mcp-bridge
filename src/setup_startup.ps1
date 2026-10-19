param([Parameter(Mandatory=$true)][string]$BridgeExe)
$ErrorActionPreference='Stop'
$taskExe=(Resolve-Path -LiteralPath $BridgeExe).Path
if ([IO.Path]::GetFileName($taskExe) -ne 'PC-MCP-Bridge.exe') { throw 'Select the canonical bridge EXE' }
$taskRoot=Split-Path -Parent $taskExe
if (!(Test-Path -LiteralPath (Join-Path $taskRoot '_internal'))) { throw 'Bridge runtime missing' }
$taskData=Join-Path $env:LOCALAPPDATA 'PC-MCP-Bridge'
$taskExisting=Get-ScheduledTask -TaskName 'PC MCP Bridge Stable' -ErrorAction SilentlyContinue
if ($taskExisting -and $taskExisting.Actions[0].Execute -ne $taskExe -and (Test-Path -LiteralPath $taskExisting.Actions[0].Execute)) {
    $taskExe=(Resolve-Path -LiteralPath $taskExisting.Actions[0].Execute).Path
    $taskRoot=Split-Path -Parent $taskExe
}
$taskBackups=Join-Path $taskData 'startup-backups'
$null=New-Item -ItemType Directory -Path $taskBackups -Force
$taskLegacy=Join-Path ([Environment]::GetFolderPath('Startup')) 'mcp-bridge-start.bat'
if (Test-Path -LiteralPath $taskLegacy) {
    $taskLegacyText=Get-Content -LiteralPath $taskLegacy -Raw
    if ($taskLegacyText.Contains('mcp-bridge-fixed\mcp-bridge') -and $taskLegacyText.Contains('127.0.0.1:3747')) {
        $taskBackup=Join-Path $taskBackups ('legacy-startup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.bat')
        Move-Item -LiteralPath $taskLegacy -Destination $taskBackup
    } else { throw 'Unrecognized startup script; not modifying it' }
}
& 'C:\Program Files\Tailscale\tailscale.exe' set --unattended=true
if ($LASTEXITCODE -ne 0) { throw 'Tailscale unattended setup failed' }
$taskUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction=New-ScheduledTaskAction -Execute $taskExe -WorkingDirectory $taskRoot
$taskTrigger=New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$taskTrigger.Delay='PT10S'
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$taskRun='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
try {
    $null=Register-ScheduledTask -TaskName 'PC MCP Bridge Stable' -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Stable user-session MCP bridge; preserve identity, retry network in app, restart after crashes; no UAC elevation.' -Force
    $taskOld=(Get-Item -LiteralPath $taskRun).GetValue('PC MCP Bridge',$null)
    if ($taskOld -eq ('"'+$taskExe+'"')) { Remove-ItemProperty -LiteralPath $taskRun -Name 'PC MCP Bridge' }
    $taskMode='Scheduled user-logon task with crash restart'
} catch {
    # A standard account can lack Task Scheduler registration rights. Reliable visible fallback.
    $taskShell=New-Object -ComObject WScript.Shell
    $taskLink=$taskShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'PC MCP Bridge Stable.lnk'))
    $taskLink.TargetPath=$taskExe; $taskLink.WorkingDirectory=$taskRoot; $taskLink.Save()
    New-ItemProperty -LiteralPath $taskRun -Name 'PC MCP Bridge' -PropertyType String -Value ('"'+$taskExe+'"') -Force | Out-Null
    $taskMode='Current-user startup shortcut and Run fallback (singleton prevents duplicates)'
}
$taskPrefs=& 'C:\Program Files\Tailscale\tailscale.exe' debug prefs | ConvertFrom-Json
if (!$taskPrefs.ForceDaemon -or !$taskPrefs.WantRunning) { throw 'Tailscale is not ready for unattended startup' }
[IO.File]::WriteAllText((Join-Path $taskData 'startup-install.json'),(@{executable=$taskExe}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{Startup=$taskMode;Executable=$taskExe;TailscaleUnattended=$true;LegacyBackupFolder=$taskBackups;Starts='After this Windows user signs in; network retry handled by bridge'}
