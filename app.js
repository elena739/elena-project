let gmvChart = null;
let impChart = null;

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
    const res  = await fetch('performance-data.json?t=' + Date.now());
    if (!res.ok) throw new Error('파일을 불러올 수 없습니다.');
    const data = await res.json();

    const { period, updatedAt, gmvRecords, impRecords } = data;

    if (!gmvRecords?.length && !impRecords?.length) throw new Error('레코드가 없습니다.');

    if (period) {
      const badge = document.getElementById('period-badge');
      badge.textContent = period;
      badge.style.display = 'inline-block';
    }

    renderCards(gmvRecords, impRecords);
    renderGmvChart(gmvRecords);
    renderImpChart(impRecords);
    renderTable(gmvRecords, impRecords);

    document.getElementById('last-updated').textContent =
      '마지막 업데이트: ' + (updatedAt || new Date().toLocaleDateString('ko-KR'));

  } catch (err) {
    console.error(err);
    const el = document.getElementById('status-msg');
    el.textContent = '⚠️ 데이터 로드 실패: ' + err.message;
    el.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = '↻ 새로고침';
}

function renderCards(gmvRecords, impRecords) {
  const totalGmv  = gmvRecords.reduce((s, r) => s + r.affGmv, 0);
  const totalSales = gmvRecords.reduce((s, r) => s + r.sales, 0);
  const totalImpr  = impRecords.reduce((s, r) => s + r.impressions, 0);
  const avgCtr     = gmvRecords.reduce((s, r) => s + r.ctr, 0) / (gmvRecords.length || 1);
  const totalComm  = gmvRecords.reduce((s, r) => s + r.commission, 0);
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
  const gmvSet  = new Set(gmvRecords.map(r => r.creator));
  const impOnly = impRecords.filter(r => !gmvSet.has(r.creator));
  const sorted  = [...gmvRecords, ...impOnly];

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
