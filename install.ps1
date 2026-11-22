# dx.bi installer for Stremio Enhanced (Windows)
#   irm https://github.com/notdxbi/dxbi-stremio/releases/latest/download/install.ps1 | iex
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$baseUrl = if ($env:DXBI_BASE_URL) { $env:DXBI_BASE_URL } else { 'https://github.com/notdxbi/dxbi-stremio/releases/latest/download' }
$data = Join-Path $env:APPDATA 'stremio-enhanced'

Write-Host "DX.BI - installing into: $data" -ForegroundColor White
$plugins = Join-Path $data 'plugins'
New-Item -ItemType Directory -Force -Path $plugins | Out-Null

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("dxbi-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null

function Get-DxbiFile($name, $dest) {
    Write-Host ("  downloading {0,-18}" -f $name) -NoNewline
    $file = Join-Path $tmp $name
    # a brief network hiccup shouldn't end the install: up to 4 tries, a few seconds apart
    for ($try = 1; ; $try++) {
        try {
            Invoke-WebRequest -Uri "$baseUrl/$name" -OutFile $file -UseBasicParsing
            break
        } catch {
            if ($try -ge 4) { Write-Host ''; throw }
            Start-Sleep -Seconds (2 * $try)
        }
    }
    # sanity check: the file must be the real dx.bi mod, not an error page
    # (-Raw can't be combined with -TotalCount in Windows PowerShell 5.1, so join the lines instead)
    $head = (Get-Content -Path $file -TotalCount 6) -join "`n"
    if ($head -notmatch '@name dx\.bi') {
        Write-Host ''
        throw "Download of $name looks wrong - aborting, nothing was changed."
    }
    Move-Item -Force -Path $file -Destination (Join-Path $dest $name)
    Write-Host ' ok' -ForegroundColor Green
}

try {
    Get-DxbiFile 'dxbi.plugin.js' $plugins
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Done. Now in Stremio Enhanced:' -ForegroundColor White
Write-Host '  1. Restart the app'
Write-Host '  2. Settings -> Enhanced -> Plugins -> switch "dx.bi" on (the theme is built in)'
Write-Host ''
Write-Host 'Made for Stremio Enhanced 1.2.0 (the latest full release, not a preview build).'
Write-Host 'Tip: turn off Dynamic Hero, Horizontal Navigation, Enhanced Covers and Enhanced Title Bar if you use them.'
