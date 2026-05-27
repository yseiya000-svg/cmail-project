# Cmail デスクトップショートカットを再生成する。
#
# 背景: モノレポ移行時にランチャースクリプト (.vbs) と
# アイコンファイル (.ico) のパスが変わったため、
# 既存の Cmail.lnk のアイコンが破損して見える状態になった。
# このスクリプトは Cmail.lnk を作り直し、正しい .ico を関連付ける。
#
# 使い方:
#   1. PowerShell を開く
#   2. このファイルを実行:
#      & "E:\Claude Projects\Cmail Project\apps\desktop\scripts\install-desktop-shortcut.ps1"
#   3. デスクトップに「Cmail」ショートカットが紫アイコンで表示される

$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\Claude Projects\Cmail Project"
$ShortcutPath = Join-Path $env:USERPROFILE "Desktop\Cmail.lnk"
$LauncherVbs = Join-Path $ProjectRoot "launch-cmail.vbs"
$IconFile = Join-Path $ProjectRoot "apps\desktop\public\icons\cmail.ico"

# 前提ファイルの存在確認
if (-not (Test-Path $LauncherVbs)) {
    Write-Error "Launcher VBS not found: $LauncherVbs"
    exit 1
}
if (-not (Test-Path $IconFile)) {
    Write-Error "Icon file not found: $IconFile"
    exit 1
}

# 既存ショートカットがあれば上書き
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($ShortcutPath)
$lnk.TargetPath = "wscript.exe"
$lnk.Arguments = '"' + $LauncherVbs + '"'
$lnk.WorkingDirectory = $ProjectRoot
$lnk.IconLocation = $IconFile + ",0"
$lnk.WindowStyle = 7  # Minimized (wscript は非表示なので実質関係ないが念のため)
$lnk.Description = "Cmail - Gmail x Claude AI"
$lnk.Save()

Write-Host "[OK] Created shortcut: $ShortcutPath"
Write-Host "     Target : wscript.exe ""$LauncherVbs"""
Write-Host "     Icon   : $IconFile"

# Windows のアイコンキャッシュをリフレッシュ (キャッシュにより古いアイコンが残る場合がある)
try {
    & ie4uinit.exe -show 2>$null
    Write-Host "[OK] Icon cache refreshed"
} catch {
    Write-Host "[!] Could not refresh icon cache; if the icon still looks broken, sign out and back in."
}
