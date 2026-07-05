param(
  [string]$ShortcutName = 'SmartShell Display'
)

$ErrorActionPreference = 'Stop'

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "$ShortcutName.lnk"
$targetPath = Join-Path $PSScriptRoot 'run-display-hidden.vbs'

if (-not (Test-Path $targetPath)) {
  throw "Не найден файл запуска: $targetPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = 'shell32.dll,13'
$shortcut.Description = 'Автозапуск SmartShell Display'
$shortcut.Save()

Write-Host "Автозапуск установлен: $shortcutPath"
