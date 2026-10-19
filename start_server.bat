@echo off
chcp 65001 > nul
echo ========================================================
echo ホビめぐ - 全国中古＆ホビーショップ巡りマップ (React + TypeScript + Vite)
echo http://localhost:8080 をブラウザで開きます...
echo ========================================================
start http://localhost:8080
call npm.cmd run dev
