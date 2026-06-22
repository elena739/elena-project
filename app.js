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

// fetch() 대신 script 태그 JSONP 방식 — CORS 우회
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

function buildColIdx(headerRow) {
  const colIdx = {};
  headerRow.c.forEach((cell, i) => {
    if (cell && cell.v != null) colIdx[String(cell.v).trim()] = i;
  });
  return colIdx;
}

function parseTableRows(rows, startIdx, endIdx, colIdx) {
  function getVal(row, label) {
    const i = colIdx[label];
    if (i === undefined) return null;
    const cell = row.c[i];
    if (!cell) return null;
    if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) return cell.f || cell.v;
    return cell.v;
  }
  return rows.slice(startIdx, endIdx)
    .map(row => ({
      creator:     getVal(row, '크리에이터'),
      date:        getVal(row, '게시일'),
      affGmv:      parseNum(getVal(row, 'Aff. GMV ($)')),
      videoGmv:    parseNum(getVal(row, 'Video GMV ($)')),
      sales:       parseNum(getVal(row, '판매량')),
      impressions: parseNum(getVal(row, 'Impressions')),
      ctr:         parseNum(getVal(row, 'CTR (%)')),
      commission:  parseNum(getVal(row, 'Est. Comm ($)')),
      link:        getVal(row, '영상 링크'),
    }))
    .filter(r => r.creator && typeof r.creator === 'string' && r.creator !== '크리에이터');
}

async function loadData() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 로딩 중...';
  document.getElementById('status-msg').style.display = 'none';

  try {
    const gviz = await fetchGviz();
    const { rows } = gviz.table;

    // 시트 내 두 테이블의 헤더 행을 모두 찾음 (각각 컬럼 순서가 다름)
    const headerIdxs = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].c.some(cell => cell && String(cell.v) === '크리에이터')) {
        headerIdxs.push(i);
      }
    }

    if (headerIdxs.length < 2) {
      throw new Error(`헤더 행이 2개 필요합니다. 감지된 개수: ${headerIdxs.length}`);
    }

    const [impHeaderIdx, gmvHeaderIdx] = headerIdxs;

    // Table 1 (Impression Top 10): impHeaderIdx+1 ~ gmvHeaderIdx
    const impColIdx = buildColIdx(rows[impHeaderIdx]);
    const impRecords = parseTableRows(rows, impHeaderIdx + 1, gmvHeaderIdx, impColIdx);

    // Table 2 (GMV Top 10): gmvHeaderIdx+1 ~ end
    const gmvColIdx = buildColIdx(rows[gmvHeaderIdx]);
    const gmvRecords = parseTableRows(rows, gmvHeaderIdx + 1, rows.length, gmvColIdx);

    if (!gmvRecords.length && !impRecords.length) {
      throw new Error('레코드가 없습니다.');
    }

    // KPI 카드용: 두 테이블 합산, 중복 크리에이터는 GMV 테이블 우선
    const creatorMap = new Map();
    for (const r of impRecords) creatorMap.set(r.creator, r);
    for (const r of gmvRecords) creatorMap.set(r.creator, r);
    const allRecords = [...creatorMap.values()];

    renderCards(allRecords);
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

function renderCards(records) {
  const totalGmv   = records.reduce((s, r) => s + r.affGmv, 0);
  const totalSales = records.reduce((s, r) => s + r.sales, 0);
  const totalImpr  = records.reduce((s, r) => s + r.impressions, 0);
  const avgCtr     = records.reduce((s, r) => s + r.ctr, 0) / records.length;
  const totalComm  = records.reduce((s, r) => s + r.commission, 0);

  document.getElementById('total-gmv').textContent        = '$' + totalGmv.toFixed(2);
  document.getElementById('total-sales').textContent      = totalSales.toLocaleString() + '개';
  document.getElementById('total-impressions').textContent = fmtK(totalImpr);
  document.getElementById('avg-ctr').textContent          = avgCtr.toFixed(2) + '%';
  document.getElementById('total-creators').textContent   = records.length + '명';
  document.getElementById('total-commission').textContent = '$' + totalComm.toFixed(2);
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
        backgroundColor: top.map((_, i) =>
          i === 0 ? 'rgba(99,102,241,1)' : 'rgba(99,102,241,0.5)'
        ),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `GMV: $${ctx.raw.toFixed(2)}` } }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 35, font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#94a3b8', callback: v => `$${v}` },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
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
        backgroundColor: top.map((_, i) =>
          i === 0 ? 'rgba(234,179,8,1)' : 'rgba(234,179,8,0.5)'
        ),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `노출수: ${fmtK(ctx.raw)}` } }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 35, font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#94a3b8', callback: v => fmtK(v) },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function renderTable(gmvRecords, impRecords) {
  // GMV Top 10 먼저, 이후 Impression Top 10에만 있는 크리에이터 추가
  const gmvCreators = new Set(gmvRecords.map(r => r.creator));
  const impOnly = impRecords.filter(r => !gmvCreators.has(r.creator));
  const sorted = [...gmvRecords, ...impOnly];
  document.getElementById('table-body').innerHTML = sorted.map((r, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="creator">${r.creator}</td>
      <td>${r.date || '—'}</td>
      <td class="gmv">$${r.affGmv.toFixed(2)}</td>
      <td>$${r.videoGmv.toFixed(2)}</td>
      <td>${r.sales}개</td>
      <td>${fmtK(r.impressions)}</td>
      <td>${r.ctr.toFixed(2)}%</td>
      <td>$${r.commission.toFixed(2)}</td>
      <td>${r.link ? `<a class="video-link" href="${r.link}" target="_blank">▶ 보기</a>` : '—'}</td>
    </tr>
  `).join('');
}

loadData();
