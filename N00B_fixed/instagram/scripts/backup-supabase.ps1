# One-command backup of the NOOB data (every table + every photo/video/audio file) onto this computer.
# Read-only: it never changes or deletes anything in Supabase. Run it from the app folder:
#     powershell -ExecutionPolicy Bypass -File scripts\backup-supabase.ps1
# It asks for the Supabase SECRET key with the typing hidden, uses it only for this run, and then forgets it.
# (Supabase dashboard -> Settings -> API Keys -> "Secret keys" -> copy the key.)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# the project address is public; take it from the app's own settings file
$url = $null
if (Test-Path '.env.production') { $url = (Get-Content '.env.production' | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_URL=', '' }
if (-not $url) { $url = 'https://abffssydapumuhwgzeck.supabase.co' }
$env:SUPABASE_URL = $url.Trim()

$secure = Read-Host "Paste the Supabase SECRET key here (nothing will show as you paste), then press Enter" -AsSecureString
$key = [System.Net.NetworkCredential]::new('', $secure).Password
if (-not $key -or $key.Length -lt 20) { Write-Host "That does not look like a key - nothing was done."; exit 1 }
if ($key -notmatch '^sb_secret_') { Write-Host "Careful: a secret key normally starts with sb_secret_ . Continuing anyway."; }
$env:SUPABASE_SERVICE_ROLE_KEY = $key

try {
  node scripts/backup-supabase.mjs
  $code = $LASTEXITCODE
} finally {
  Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $key = $null
}
if ($code -eq 0) { Write-Host "`nDone. Keep this backup folder somewhere safe (a second drive or your cloud storage)." -ForegroundColor Green }
else { Write-Host "`nThe backup reported a problem - please send a screenshot of the lines above." -ForegroundColor Yellow }
exit $code
