' Cmail launcher (root proxy).
'
' Post-monorepo, the real launcher lives at apps/desktop/launch-cmail.vbs.
' This proxy exists so that pre-existing desktop shortcuts (which point to
' this root path) keep working without manual rewrite.
'
' Keep comments ASCII only: Japanese-only Windows runs VBScript under
' the system ANSI code page (Shift-JIS) and a stray multibyte byte here
' has historically broken the script with cryptic "object required" errors.

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "wscript.exe ""E:\Claude Projects\Cmail Project\apps\desktop\launch-cmail.vbs""", 0, False
Set WshShell = Nothing
