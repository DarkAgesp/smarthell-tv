param(
  [int]$Port = 8090,
  [switch]$OpenBrowser = $true,
  [string]$StartPath = '/?tv=1&fullscreen=1'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $projectRoot 'smartshell-display'
$prefix = "http://127.0.0.1:$Port/"
$indexFile = Join-Path $webRoot 'index.html'

if (-not (Test-Path $indexFile)) {
  throw "Не найден index.html по пути $indexFile"
}

function Get-ContentType {
  param([string]$FilePath)

  switch ([System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.css' { 'text/css; charset=utf-8' }
    '.js' { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.png' { 'image/png' }
    '.jpg' { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.svg' { 'image/svg+xml' }
    '.ico' { 'image/x-icon' }
    '.woff' { 'font/woff' }
    '.woff2' { 'font/woff2' }
    default { 'application/octet-stream' }
  }
}

function Start-KioskBrowser {
  param([string]$Url)

  $edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  if (-not (Test-Path $edgePath)) {
    $edgePath = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
  }

  if (Test-Path $edgePath) {
    Start-Process -FilePath $edgePath -ArgumentList @('--kiosk', $Url, '--edge-kiosk-type=fullscreen') | Out-Null
    return
  }

  $chromePath = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
  if (-not (Test-Path $chromePath)) {
    $chromePath = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
  }

  if (Test-Path $chromePath) {
    Start-Process -FilePath $chromePath -ArgumentList @('--kiosk', $Url) | Out-Null
    return
  }

  Start-Process $Url | Out-Null
}

function Resolve-LocalFile {
  param([string]$RequestPath)

  $cleanPath = [Uri]::UnescapeDataString(($RequestPath -split '\?')[0]).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($cleanPath)) {
    return $indexFile
  }

  $candidate = Join-Path $webRoot ($cleanPath -replace '/', '\')
  if ((Test-Path $candidate) -and -not (Get-Item $candidate).PSIsContainer) {
    return $candidate
  }

  return $null
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

try {
  if ($OpenBrowser) {
    Start-Sleep -Milliseconds 500
    Start-KioskBrowser -Url ("$prefix" + $StartPath.TrimStart('/'))
  }

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response

    try {
      $localFile = Resolve-LocalFile -RequestPath $context.Request.RawUrl

      if (-not $localFile) {
        $response.StatusCode = 404
        $buffer = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $response.ContentType = 'text/plain; charset=utf-8'
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($localFile)
      $response.StatusCode = 200
      $response.ContentType = Get-ContentType -FilePath $localFile
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $response.StatusCode = 500
      $buffer = [System.Text.Encoding]::UTF8.GetBytes("500 Server Error`n$($_.Exception.Message)")
      $response.ContentType = 'text/plain; charset=utf-8'
      $response.OutputStream.Write($buffer, 0, $buffer.Length)
    } finally {
      $response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
