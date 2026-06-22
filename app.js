const SHEET_ID = '156_G9dj52ZVRLth8H1gI4Af5xQCaRIEYtp-nPiUtDEI';

let gmvChart = null;
let impChart = null;

function parseNum(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/,/g, '').trim();
  if (!s) return 0;
  if (s.toUpperCase().endsWith('K')) return parseFloat(s) * 1000;
  if (s.toUpperCase().endsWith('M')) return parseFloat(s) * 1_000_000;
  return parseFloat(s) || 0;
}

function fmtK(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fetchGviz() {
  return new Promise((resolve, reject) => {
    const cb = '__gvizCb';
    document.getElementById('__gvizScript')?.remove();
    delete window[cb];
    const timer = setTimeout(() => {
      delete window[cb];
      document.getElementById('__gvizScript')?.remove();
      reject(new Error('요청 시간 초과'));
    }, 15000);
    window[cb] = function(data) {
      clearTimeout(timer);
      delete window[cb];
      document.getElementById('__gvizScript')?.remove();
      resolve(data);
    };
    const script = document.createElement('script');
    script.id = '__gvizScript';
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?headers=0&tqx=out:json;responseHandler:${cb}`;
    script.onerror = () => {
      clearTimeout(timer);
      delete window[cb];
      reject(new Error('Google Sheets 스크립트 로드 실패'));
    };
    document.head.appendChild(script);
  });
}

// 헤더 레이블 → 컬럼 인덱스 맵
function buildColIdx(headerRow) {
  const colIdx = {};
  headerRow.c.forEach((cell, i) => {
    if (cell && cell.v != null && String(cell.v).trim()) {
      colIdx[String(cell.v).trim()] = i;
    }
  });
  return colIdx;
}

// 셀 값 읽기 (날짜 포맷 처리 포함)
function cellVal(row, idx) {
  if (idx < 0) return null;
  const cell = row.c[idx];
  if (!cell || cell.v == null) return null;
  if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) return cell.f || cell.v;
  return cell.v;
}

// GMV 표 행 파싱 (위치 기반)
// col: 0=순위 1=영상설명 2=크리에이터 3=게시일 4=Aff.GMV 5=Video GMV 6=판매량 7=Impressions(일부) 8=CTR 9=Est.Comm 10=링크
function parseGmvRows(rows, startIdx, endIdx) {
  return rows.slice(startIdx, endIdx).map(row => {
    const creator = cellVal(row, 2);
    if (!creator || typeof creator !== 'string' || creator === '크리에이터') return null;
    return {
      creator,
      date:        cellVal(row, 3),
      affGmv:      parseNum(cellVal(row, 4)),
      videoGmv:    parseNum(cellVal(row, 5)),
      sales:       parseNum(cellVal(row, 6)),
      impressions: parseNum(cellVal(row, 7)),
      ctr:         parseNum(cellVal(row, 8)),
      commission:  parseNum(cellVal(row, 9)),
      link:        cellVal(row, 10),
    };
  }).filter(Boolean);
}

// Impression 표 행 파싱 (위치 기반)
// col: 0=순위 1=영상설명 2=크리에이터 3=게시일 4=Impressions 5=Aff.GMV 6=판매량 7=CTR 8=Est.Comm 9=링크 10=empty
function parseImpRows(rows, startIdx, endIdx) {
  return rows.slice(startIdx, endIdx).map(row => {
    const creator = cellVal(row, 2);
    if (!creator || typeof creator !== 'string' || creator === '크리에이터') return null;
    return {
      creator,
      date:        cellVal(row, 3),
      impressions: parseNum(cellVal(row, 4)),
      affGmv:      parseNum(cellVal(row, 5)),
      videoGmv:    0,
      sales:       parseNum(cellVal(row, 6)),
      ctr:         parseNum(cellVal(row, 7)),
      commission:  parseNum(cellVal(row, 8)),
      link:        cellVal(row, 9),
    };
  }).filter(Boolean);
}

async function loadData() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 로딩 중...';
  document.getElementById('status-msg').style.display = 'none';

  try {
    const gviz = await fetchGviz();
    const { rows } = gviz.table;

    // 기간 추출: 헤더 이전 행에서 "~"가 포함된 셀 탐색
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const periodCell = rows[i].c.find(cell => cell && typeof cell.v === 'string' && cell.v.includes('~'));
      if (periodCell) {
        const badge = document.getElementById('period-badge');
        badge.textContent = periodCell.v.trim();
        badge.style.display = 'inline-block';
        break;
      }
    }

    // '크리에이터' 헤더 행 두 개 찾기
    const headerIdxs = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].c.some(cell => cell && String(cell.v) === '크리에이터')) {
        headerIdxs.push(i);
      }
    }
    if (headerIdxs.length < 2) {
      throw new Error(`헤더 행이 2개 필요합니다. 감지: ${headerIdxs.length}개`);
    }

    // col4 레이블로 GMV 표 vs Impression 표 구분
    // GMV 표: col4 헤더 = 'Aff. GMV ($)'  /  Impression 표: col4 헤더 = 'Impressions'
    const idx0ColIdx = buildColIdx(rows[headerIdxs[0]]);
    const isFirstGmv = idx0ColIdx['Aff. GMV ($)'] === 4;

    const gmvHeaderIdx = isFirstGmv ? headerIdxs[0] : headerIdxs[1];
    const impHeaderIdx = isFirstGmv ? headerIdxs[1] : headerIdxs[0];

    // 각 표의 데이터 범위 계산
    let gmvStart, gmvEnd, impStart, impEnd;
    if (gmvHeaderIdx < impHeaderIdx) {
      gmvStart = gmvHeaderIdx + 1; gmvEnd = impHeaderIdx;
      impStart = impHeaderIdx + 1; impEnd = rows.length;
    } else {
      impStart = impHeaderIdx + 1; impEnd = gmvHeaderIdx;
      gmvStart = gmvHeaderIdx + 1; gmvEnd = rows.length;
    }

    const gmvRecords = parseGmvRows(rows, gmvStart, gmvEnd);
    const impRecords = parseImpRows(rows, impStart, impEnd);

    if (!gmvRecords.length && !impRecords.length) {
      throw new Error('레코드가 없습니다.');
    }

    renderCards(gmvRecords, impRecords);
    renderGmvChart(gmvRecords);
    renderImpChart(impRecords);
    renderTable(gmvRecords, impRecords);

    document.getElementById('last-updated').textContent =
      '마지막 업데이트: ' + new Date().toLocaleString('ko-KR');

  } catch (err) {
    console.error(err);
    const el = document.getElementById('status-msg');
    el.textContent = '⚠️ 데이터 로드 실패: ' + err.message + ' — Google Sheets가 "링크가 있는 모든 사용자" 공개 설정인지 확인해주세요.';
    el.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = '↻ 새로고침';
}

function renderCards(gmvRecords, impRecords) {
  const totalGmv   = gmvRecords.reduce((s, r) => s + r.affGmv, 0);
  const totalSales = gmvRecords.reduce((s, r) => s + r.sales, 0);
  const totalImpr  = impRecords.reduce((s, r) => s + r.impressions, 0);
  const allForCtr  = [...gmvRecords];
  const avgCtr     = allForCtr.reduce((s, r) => s + r.ctr, 0) / (allForCtr.length || 1);
  const totalComm  = gmvRecords.reduce((s, r) => s + r.commission, 0);

  // 중복 제거한 크리에이터 수
  const uniqueCreators = new Set([...gmvRecords.map(r => r.creator), ...impRecords.map(r => r.creator)]);

  document.getElementById('total-gmv').textContent         = '$' + totalGmv.toFixed(2);
  document.getElementById('total-sales').textContent       = totalSales.toLocaleString() + '개';
  document.getElementById('total-impressions').textContent = fmtK(totalImpr);
  document.getElementById('avg-ctr').textContent           = avgCtr.toFixed(2) + '%';
  document.getElementById('total-creators').textContent    = uniqueCreators.size + '명';
  document.getElementById('total-commission').textContent  = '$' + totalComm.toFixed(2);
}

function renderGmvChart(records) {
  const top = [...records].sort((a, b) => b.affGmv - a.affGmv).slice(0, 10);
  if (gmvChart) gmvChart.destroy();
  gmvChart = new Chart(document.getElementById('gmv-chart'), {
    type: 'bar',
    data: {
      labels: top.map(r => r.creator),
      datasets: [{
        data: top.map(r => r.affGmv),
        backgroundColor: top.map((_, i) => i === 0 ? 'rgba(99,102,241,1)' : 'rgba(99,102,241,0.5)'),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `GMV: $${ctx.raw.toFixed(2)}` } } },
      scales: {
        x: { ticks: { color: '#94a3b8', maxRotation: 35, font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94a3b8', callback: v => `$${v}` }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

function renderImpChart(records) {
  const top = [...records].sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  if (impChart) impChart.destroy();
  impChart = new Chart(document.getElementById('scatter-chart'), {
    type: 'bar',
    data: {
      labels: top.map(r => r.creator),
      datasets: [{
        data: top.map(r => r.impressions),
        backgroundColor: top.map((_, i) => i === 0 ? 'rgba(234,179,8,1)' : 'rgba(234,179,8,0.5)'),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `노출수: ${fmtK(ctx.raw)}` } } },
      scales: {
        x: { ticks: { color: '#94a3b8', maxRotation: 35, font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94a3b8', callback: v => fmtK(v) }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

function renderTable(gmvRecords, impRecords) {
  // GMV Top 10 먼저, 그 다음 Impression 전용 크리에이터
  const gmvSet = new Set(gmvRecords.map(r => r.creator));
  const impOnly = impRecords.filter(r => !gmvSet.has(r.creator));
  const sorted = [...gmvRecords, ...impOnly];

  document.getElementById('table-body').innerHTML = sorted.map((r, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="creator">${r.creator}</td>
      <td>${r.date || '—'}</td>
      <td class="gmv">$${r.affGmv.toFixed(2)}</td>
      <td>$${r.videoGmv.toFixed(2)}</td>
      <td>${r.sales}개</td>
      <td>${r.impressions ? fmtK(r.impressions) : '—'}</td>
      <td>${r.ctr.toFixed(2)}%</td>
      <td>$${r.commission.toFixed(2)}</td>
      <td>${r.link ? `<a class="video-link" href="${r.link}" target="_blank">▶ 보기</a>` : '—'}</td>
    </tr>
  `).join('');
}

loadData();
