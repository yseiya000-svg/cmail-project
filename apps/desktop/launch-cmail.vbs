' Cmail launcher (dev mode).
'
' Runs `npm run app` in a hidden window so no console flashes onto the
' desktop. Before launching, it sweeps any stale processes from a previous
' run (stranded electron, or a node server still holding port 3000) — this
' is the #1 cause of "I clicked the icon but nothing happened".
'
' Keep comments in ASCII only: Japanese-only Windows runs VBScript under
' the system ANSI code page (Shift-JIS) and a stray multibyte byte here
' has historically broken the script with cryptic "object required" errors.

Set WshShell = CreateObject("WScript.Shell")
' Post-monorepo: the desktop app lives under apps/desktop/. The Next.js
' server, Electron config, and package.json all expect this as cwd.
WshShell.CurrentDirectory = "E:\Claude Projects\Cmail Project\apps\desktop"

' 1) Kill anything still listening on :3000 (stale Next.js dev server).
'    netstat shows the PID in the 5th whitespace-separated column.
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr "":3000"" ^| findstr LISTENING') do @taskkill /F /PID %a >nul 2>&1", 0, True

' 2) Kill any leftover electron windows from a previous crash.
WshShell.Run "cmd /c taskkill /F /IM electron.exe /T >nul 2>&1", 0, True

' 3) Tiny pause so the OS releases the port before we try to bind it again.
WScript.Sleep 500

' 4) Launch fresh. We DO NOT wait here — Electron will run for a long time.
WshShell.Run "cmd /c npm run app", 0, False

Set WshShell = Nothing
