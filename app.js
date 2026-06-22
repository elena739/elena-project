const SHEET_ID = '156_G9dj52ZVRLth8H1gI4Af5xQCaRIEYtp-nPiUtDEI';

let gmvChart = null;
let scatterChart = null;

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

async function loadData() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 로딩 중...';
  document.getElementById('status-msg').style.display = 'none';

  try {
    // headers=0 으로 전체 rows를 가져온 뒤, row[2]에서 컬럼명을 직접 읽음
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    const gviz = JSON.parse(text.slice(start, end));
    const { rows } = gviz.table;

    // Row 2 (index 2) = 실제 컬럼 헤더행
    const headerRow = rows[2];
    const colIdx = {};
    headerRow.c.forEach((cell, i) => {
      if (cell && cell.v != null) colIdx[String(cell.v).trim()] = i;
    });

    function getVal(row, label) {
      const i = colIdx[label];
      if (i === undefined) return null;
      const cell = row.c[i];
      if (!cell) return null;
      if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) return cell.f || cell.v;
      return cell.v;
    }

    // 실제 데이터는 row 3(index 3)부터
    const records = rows.slice(3)
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
      .filter(r => r.creator && r.affGmv > 0);

    if (!records.length) throw new Error('데이터를 찾을 수 없습니다.');

    renderCards(records);
    renderGmvChart(records);
    renderScatterChart(records);
    renderTable(records);

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

function renderScatterChart(records) {
  if (scatterChart) scatterChart.destroy();

  const points = records.map(r => ({
    x: r.impressions / 1000,
    y: r.affGmv,
    r: Math.max(4, Math.sqrt(r.sales) * 3),
    creator: r.creator,
    sales: r.sales,
  }));

  scatterChart = new Chart(document.getElementById('scatter-chart'), {
    type: 'bubble',
    data: {
      datasets: [{
        data: points,
        backgroundColor: 'rgba(234,179,8,0.45)',
        borderColor: 'rgba(234,179,8,0.9)',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return [d.creator, `노출수: ${ctx.parsed.x.toFixed(1)}K`, `GMV: $${ctx.parsed.y.toFixed(2)}`, `판매량: ${d.sales}개`];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '노출수 (K)', color: '#64748b' },
          ticks: { color: '#94a3b8', callback: v => `${v}K` },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          title: { display: true, text: 'Aff. GMV ($)', color: '#64748b' },
          ticks: { color: '#94a3b8', callback: v => `$${v}` },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function renderTable(records) {
  const sorted = [...records].sort((a, b) => b.affGmv - a.affGmv);
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
