@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==========================================
echo   dsh-desktop - dsh 一键部署
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [install-dsh] 未检测到 Node.js。请先安装：https://nodejs.org
  echo.
  pause
  exit /b 1
)

node "%~dp0scripts\install-dsh.mjs" %*
if errorlevel 1 (
  echo.
  echo [install-dsh] 部署失败，请查看上方输出。需要管理员权限时，请右键本脚本「以管理员身份运行」。
  echo.
  pause
)
