// ââ State âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
let gmvChart   = null;
let impChart   = null;
let currentTab = 'weekly';
let dashData   = null;

// ââ Rank badge colors ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const RANK_BG  = ['#eab308','#94a3b8','#cd7f32','#4f46e5','#4f46e5'];
const RANK_FG  = ['#000',   '#000',   '#fff',   '#fff',   '#fff'   ];

// ââ Formatting helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââ
function fmtK(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

// ââ Tab switching ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (dashData) renderAll();
}

// ââ Main render dispatcher âââââââââââââââââââââââââââââââââââââââââââââââââ
function renderAll() {
  const isWeekly = currentTab === 'weekly';

  const gmvRecs = isWeekly
    ? dashData.gmvRecords
    : (dashData.monthlyGmvRecords || dashData.gmvRecords);

  const impRecs = isWeekly
    ? dashData.impRecords
    : (dashData.monthlyImpRecords || dashData.impRecords);

  const period = isWeekly
    ? dashData.period
    : (dashData.month || dashData.period);

  const badge = document.getElementById('period-badge');
  badge.textContent   = period || '';
  badge.style.display = period ? 'inline-block' : 'none';

  renderCards(gmvRecs, impRecs);
  renderTopCreators(gmvRecs, impRecs);
  renderGmvChart(gmvRecs);
  renderImpChart(impRecs);
  renderTable(gmvRecs, impRecs);

  document.getElementById('last-updated').textContent =
    'ë§ì§ë§ ìë°ì´í¸: ' + (dashData.updatedAt || new Date().toLocaleDateString('ko-KR'));
}

// ââ Load data ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function loadData() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled    = true;
  btn.textContent = 'â³ ë¡ë© ì¤...';
  document.getElementById('status-msg').style.display = 'none';

  try {
    const res  = await fetch('performance-data.json?t=' + Date.now());
    if (!res.ok) throw new Error('íì¼ì ë¶ë¬ì¬ ì ììµëë¤.');
    const data = await res.json();

    if (!data.gmvRecords?.length && !data.impRecords?.length)
      throw new Error('ë ì½ëê° ììµëë¤.');

    dashData = data;
    renderAll();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('status-msg');
    el.textContent   = 'â ï¸ ë°ì´í° ë¡ë ì¤í¨: ' + err.message;
    el.style.display = 'block';
  }

  btn.disabled    = false;
  btn.textContent = 'â» ìë¡ê³ ì¹¨';
}

// ââ KPI Cards ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function renderCards(gmvRecords, impRecords) {
  const totalGmv  = gmvRecords.reduce((s, r) => s + r.affGmv, 0);
  const totalSales = gmvRecords.reduce((s, r) => s + r.sales, 0);
  const totalImpr  = impRecords.reduce((s, r) => s + r.impressions, 0);
  const avgCtr     = gmvRecords.reduce((s, r) => s + r.ctr, 0) / (gmvRecords.length || 1);
  const totalComm  = gmvRecords.reduce((s, r) => s + r.commission, 0);
  const uniqueCreators = new Set([
    ...gmvRecords.map(r => r.creator),
    ...impRecords.map(r => r.creator),
  ]);

  document.getElementById('total-gmv').textContent         = '$' + totalGmv.toFixed(2);
  document.getElementById('total-sales').textContent       = totalSales.toLocaleString() + 'ê°';
  document.getElementById('total-impressions').textContent = fmtK(totalImpr);
  document.getElementById('avg-ctr').textContent           = avgCtr.toFixed(2) + '%';
  document.getElementById('total-creators').textContent    = uniqueCreators.size + 'ëª';
  document.getElementById('total-commission').textContent  = '$' + totalComm.toFixed(2);
}

// ââ Top 5 Creator Spotlights âââââââââââââââââââââââââââââââââââââââââââââââ
function renderTopCreators(gmvRecords, impRecords) {
  const gmvTop5 = [...gmvRecords].sort((a, b) => b.affGmv - a.affGmv).slice(0, 5);
  const impTop5 = [...impRecords].sort((a, b) => b.impressions - a.impressions).slice(0, 5);

  document.getElementById('gmv-top5-row').innerHTML =
    gmvTop5.map((r, i) => creatorCardHTML(r, i + 1, 'gmv')).join('');

  document.getElementById('imp-top5-row').innerHTML =
    impTop5.map((r, i) => creatorCardHTML(r, i + 1, 'imp')).join('');

  // Async: try to load real thumbnails
  loadThumbnails(gmvTop5, 'gmv');
  loadThumbnails(impTop5, 'imp');
}

function creatorCardHTML(r, rank, metric) {
  const bg      = RANK_BG[rank - 1];
  const fg      = RANK_FG[rank - 1];
  const thumbId = `thumb-${metric}-${rank}`;
  const initial = r.creator.replace('@', '').charAt(0).toUpperCase();

  const primaryVal   = metric === 'gmv' ? `$${r.affGmv.toFixed(2)}` : fmtK(r.impressions);
  const secondaryVal = metric === 'gmv'
    ? `ð ${fmtK(r.impressions)} ë¸ì¶`
    : `ð° $${r.affGmv.toFixed(2)} GMV`;

  return `
<div class="creator-card">
  <div class="creator-thumb" id="${thumbId}"
       onclick="window.open('${r.link}', '_blank', 'noopener,noreferrer')">
    <span class="creator-thumb-placeholder">${initial}</span>
    <span class="creator-rank" style="background:${bg};color:${fg}">#${rank}</span>
    <div class="creator-thumb-overlay">â¶</div>
  </div>
  <div class="creator-info">
    <div class="creator-handle">${r.creator}</div>
    <div class="creator-primary ${metric === 'gmv' ? 'gmv-color' : 'imp-color'}">${primaryVal}</div>
    <div class="creator-stats-row">
      <span class="stat-pill">ð¦ ${r.sales}ê°</span>
      <span class="stat-pill">CTR ${r.ctr.toFixed(1)}%</span>
    </div>
    <div class="creator-secondary">${secondaryVal}</div>
  </div>
  <a class="creator-watch-btn" href="${r.link}" target="_blank" rel="noopener noreferrer">â¶ ìì ë³´ê¸°</a>
</div>`;
}

// ââ Thumbnail loading (oEmbed fallback) ââââââââââââââââââââââââââââââââââââ
async function loadThumbnails(records, metric) {
  for (let i = 0; i < records.length; i++) {
    const r     = records[i];
    const rank  = i + 1;
    const el    = document.getElementById(`thumb-${metric}-${rank}`);
    if (!el) continue;

    // Use stored thumbnail if already available in JSON
    if (r.thumbnail) {
      applyThumbnail(el, r.thumbnail, r.creator, rank);
      continue;
    }

    // Attempt TikTok oEmbed (CORS-enabled public API)
    try {
      const res = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(r.link)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.thumbnail_url) {
          applyThumbnail(el, data.thumbnail_url, r.creator, rank);
        }
      }
    } catch (_) {
      // Keep placeholder â no action needed
    }
  }
}

function applyThumbnail(container, url, creator, rank) {
  const bg  = RANK_BG[rank - 1];
  const fg  = RANK_FG[rank - 1];
  const img = new Image();
  img.onload = () => {
    container.innerHTML = `
      <img src="${url}" alt="${creator}">
      <span class="creator-rank" style="background:${bg};color:${fg}">#${rank}</span>
      <div class="creator-thumb-overlay">â¶</div>
    `;
  };
  img.onerror = () => { /* keep placeholder */ };
  img.src = url;
}

// ââ GMV Bar Chart ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
        tooltip: { callbacks: { label: ctx => `GMV: $${ctx.raw.toFixed(2)}` } },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 35, font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: { color: '#94a3b8', callback: v => `$${v}` },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}

// ââ Impression Bar Chart âââââââââââââââââââââââââââââââââââââââââââââââââââ
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
        tooltip: { callbacks: { label: ctx => `ë¸ì¶ì: ${fmtK(ctx.raw)}` } },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 35, font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          ticks: { color: '#94a3b8', callback: v => fmtK(v) },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
      },
    },
  });
}

// ââ Full Performance Table âââââââââââââââââââââââââââââââââââââââââââââââââ
function renderTable(gmvRecords, impRecords) {
  const gmvLinks = new Set(gmvRecords.map(r => r.link));
  const impOnly  = impRecords.filter(r => !gmvLinks.has(r.link));
  const rows     = [...gmvRecords, ...impOnly];

  document.getElementById('table-body').innerHTML = rows.map((r, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td class="creator">${r.creator}</td>
      <td>${r.date || 'â'}</td>
      <td class="gmv">$${r.affGmv.toFixed(2)}</td>
      <td>$${r.videoGmv.toFixed(2)}</td>
      <td>${r.sales}ê°</td>
      <td>${r.impressions ? fmtK(r.impressions) : 'â'}</td>
      <td>${r.ctr.toFixed(2)}%</td>
      <td>$${r.commission.toFixed(2)}</td>
      <td>${r.link
        ? `<a class="video-link" href="${r.link}" target="_blank" rel="noopener">â¶ ë³´ê¸°</a>`
        : 'â'
      }</td>
    </tr>
  `).join('');
}

// ââ Init âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
loadData();
