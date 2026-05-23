@echo off
REM Cmail を無表示で起動（VBSラッパー経由）
REM Post-monorepo: ランチャー本体は apps/desktop/ に同梱
cd /d "E:\Claude Projects\Cmail Project\apps\desktop"
start "" wscript.exe "launch-cmail.vbs"
