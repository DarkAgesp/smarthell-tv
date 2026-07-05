param(
  [string]$ShortcutName = 'SmartShell Display'
)

$ErrorActionPreference = 'Stop'

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "$ShortcutName.lnk"

if (Test-Path $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath -Force
  Write-Host "Автозапуск удалён: $shortcutPath"
} else {
  Write-Host "Ярлык автозапуска не найден: $shortcutPath"
}
