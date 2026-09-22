$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDir
$localPort = 3005

$cloudflared = Join-Path $projectDir 'tools\cloudflared.exe'
$addressFile = Join-Path $projectDir 'PUBLIC-ADDRESS.txt'
$logDir = Join-Path $projectDir 'work\public-launcher'
$serverOut = Join-Path $logDir 'server-out.log'
$serverErr = Join-Path $logDir 'server-err.log'
$tunnelOut = Join-Path $logDir 'tunnel-out.log'
$tunnelErr = Join-Path $logDir 'tunnel-err.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Remove-Item -LiteralPath $serverOut,$serverErr,$tunnelOut,$tunnelErr -Force -ErrorAction SilentlyContinue

function Find-Node {
    $normalNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($normalNode) { return $normalNode.Source }

    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { return $bundledNode }
    throw 'Node.js was not found. Install Node.js 18 or newer: https://nodejs.org/'
}

function Test-LocalServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/" -f $localPort) -TimeoutSec 2
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

$serverProcess = $null
$tunnelProcess = $null
$launcherFailed = $false

try {
    if (-not (Test-Path -LiteralPath $cloudflared)) {
        throw 'cloudflared.exe is missing. Please run start-public.bat again while connected to the Internet.'
    }
    & $cloudflared --version | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'cloudflared.exe is incomplete or cannot run.' }

    if (-not (Test-LocalServer)) {
        $node = Find-Node
        Write-Host 'Starting Mahjong server...'
        $env:PORT = [string]$localPort
        $serverProcess = Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru
        $serverReady = $false
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 1
            if (Test-LocalServer) { $serverReady = $true; break }
            if ($serverProcess.HasExited) { break }
        }
        if (-not $serverReady) {
            $details = Get-Content -LiteralPath $serverErr -Raw -ErrorAction SilentlyContinue
            throw "Mahjong server failed to start. $details"
        }
    } else {
        Write-Host 'Mahjong server is already running.'
    }

    Write-Host 'Creating a public address. This normally takes 5-30 seconds...'
    $arguments = @('tunnel','--url',("http://localhost:{0}" -f $localPort),'--protocol','http2','--no-autoupdate')
    $tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList $arguments -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru

    $publicUrl = $null
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 1
        $text = (Get-Content -LiteralPath $tunnelOut -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content -LiteralPath $tunnelErr -Raw -ErrorAction SilentlyContinue)
        $match = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { $publicUrl = $match.Value; break }
        if ($tunnelProcess.HasExited) { break }
        if (($i + 1) % 10 -eq 0) { Write-Host ("Still connecting... {0} seconds" -f ($i + 1)) }
    }

    if (-not $publicUrl) {
        Write-Host ''
        Write-Host 'Cloudflare output:' -ForegroundColor Yellow
        Get-Content -LiteralPath $tunnelErr -Tail 30 -ErrorAction SilentlyContinue | Out-Host
        throw 'No public address was received within 90 seconds. Check the network and try again.'
    }

    Set-Content -LiteralPath $addressFile -Value $publicUrl -Encoding UTF8
    try { Set-Clipboard -Value $publicUrl } catch {}

    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host 'PUBLIC ADDRESS (send this to your friends):' -ForegroundColor Green
    Write-Host $publicUrl -ForegroundColor Cyan
    Write-Host 'The address has been copied and saved to PUBLIC-ADDRESS.txt.' -ForegroundColor Green
    Write-Host 'Keep this window open while playing. Press Ctrl+C to stop.' -ForegroundColor Yellow
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ''

    Start-Sleep -Seconds 3
    if ($env:TAIPAO_NO_BROWSER -ne '1') {
        try { Start-Process $publicUrl } catch {}
    }
    if ($env:TAIPAO_SELFTEST -eq '1') {
        $testResponse = Invoke-WebRequest -UseBasicParsing -Uri $publicUrl -TimeoutSec 25
        Write-Host ("SELFTEST HTTP STATUS: {0}" -f $testResponse.StatusCode)
        return
    }
    # The homepage can stop the local server. Close its public tunnel as well.
    while (-not $tunnelProcess.HasExited) {
        Start-Sleep -Seconds 1
        if (-not (Test-LocalServer)) {
            Write-Host 'Mahjong server stopped. Closing the public tunnel.'
            break
        }
    }
} catch {
    $launcherFailed = $true
    Write-Host ''
    Write-Host ('START FAILED: ' + $_.Exception.Message) -ForegroundColor Red
} finally {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
        Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($publicUrl -and (Test-Path -LiteralPath $addressFile)) {
        if ((Get-Content -LiteralPath $addressFile -Raw).Trim() -eq $publicUrl) {
            Remove-Item -LiteralPath $addressFile -Force -ErrorAction SilentlyContinue
        }
    }
    Set-Location -LiteralPath $env:TEMP
}
if ($launcherFailed) { exit 1 }
