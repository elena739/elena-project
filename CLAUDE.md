# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TikTok Shop Affiliate 성과 분석 대시보드 — Entropy Makeup 브랜드의 어필리에이트 크리에이터 주간 성과를 시각화하는 정적 웹앱. 빌드 도구 없이 순수 HTML/CSS/JS로 구성되어 GitHub Pages에 배포됨.

- **라이브 URL**: https://elena739.github.io/elena-project/
- **데이터 소스**: Google Sheets (ID: `156_G9dj52ZVRLth8H1gI4Af5xQCaRIEYtp-nPiUtDEI`)

## 로컬 개발

빌드 단계 없음. 브라우저로 `index.html`을 직접 열거나 로컬 서버 사용:

```bash
# Node.js가 설치된 경우
npx serve .

# Python이 설치된 경우
python -m http.server 8080
```

> `file://`으로 직접 열면 gviz API fetch가 CORS 오류 없이 작동하지 않을 수 있음. 로컬 서버 권장.

## 배포

`main` 브랜치에 push하면 GitHub Pages에 자동 반영됨 (1~2분 소요).

```bash
git add .
git commit -m "변경 내용"
git push
```

## 데이터 연동 구조

Google Sheets gviz API를 사용해 브라우저에서 직접 데이터를 fetch함 (백엔드 없음).

```
GET https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:json&headers=0
```

**시트 구조 주의사항**: 시트 상단에 제목행 2줄이 있어 실제 컬럼 헤더는 row index 2, 데이터는 row index 3부터 시작함. `headers=0` 파라미터로 전체 rows를 가져온 후 `app.js`에서 직접 파싱.

컬럼 필드명: `크리에이터`, `게시일`, `Aff. GMV ($)`, `Video GMV ($)`, `판매량`, `Impressions`, `CTR (%)`, `Est. Comm ($)`, `영상 링크`

## 코드 구조

| 파일 | 역할 |
|------|------|
| `index.html` | 레이아웃 (카드 6개, 차트 2개, 테이블) |
| `style.css` | 다크 테마, CSS 변수 기반 (`--bg`, `--surface`, `--accent` 등) |
| `app.js` | 데이터 fetch → 파싱 → 렌더링 전 과정 |

`app.js` 주요 함수 흐름: `loadData()` → `renderCards()` / `renderGmvChart()` / `renderScatterChart()` / `renderTable()`

외부 라이브러리는 CDN으로만 사용 (Chart.js 4.4, Google Fonts Inter). `package.json` 없음.
