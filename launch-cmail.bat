@echo off
REM Cmail を無表示で起動（VBSラッパー経由）
cd /d "E:\Claude Projects\Cmail Project"
start "" wscript.exe "launch-cmail.vbs"
