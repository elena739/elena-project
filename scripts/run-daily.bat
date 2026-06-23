@echo off
cd /d "C:\Users\elena\elena-project"

echo [%date% %time%] 재고 업데이트 시작

:: Node.js로 스크래핑 실행
node scripts\scrape-inventory.js
if errorlevel 1 (
  echo [오류] 스크래핑 실패 — 로그 확인
  exit /b 1
)

:: Git push
git add inventory-data.json
git diff --staged --quiet && (
  echo 변경 없음, 푸시 생략
) || (
  git commit -m "chore: 재고 자동 업데이트 %date%"
  git push
  echo [완료] GitHub Pages 업데이트됨
)
