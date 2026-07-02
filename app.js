// State
var gmvChart   = null;
var currentTab = 'weekly';
var dashData   = null;

// -- Formatters --
function fmtKPI(n) {
  if (n == null) return '--';
  return '
function fmtDollar(n) {
  if (n == null) return null;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  if (n == null) return '--';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}
function fmtViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// -- Tab switch --
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (dashData) renderAll();
}

// -- Render all --
function renderAll() {
  var d = dashData[currentTab];
  if (!d) return;

  var periodEl = document.getElementById('period-label');
  if (periodEl) periodEl.textContent = d.period;

  document.getElementById('kpi-gmv').textContent        = fmtKPI(d.kpi.affiliateGmv);
  document.getElementById('kpi-items').textContent      = fmtNum(d.kpi.itemsSold);
  document.getElementById('kpi-commission').textContent = fmtKPI(d.kpi.estCommission);
  document.getElementById('kpi-affiliates').textContent = fmtNum(d.kpi.activeAffiliates);

  renderChart(d.creators);
  renderVideos(d.topVideos);
  renderTable(d.creators);
}

// -- Bar chart --
function renderChart(creators) {
  var top5    = creators.slice(0, 5);
  var labels  = top5.map(function(c) { return c.name.replace('@', ''); });
  var values  = top5.map(function(c) { return c.gmv; });
  var colors  = ['#ec4899','#f472b6','#fb923c','#facc15','#a3e635'];
  var canvas  = document.getElementById('gmv-chart');
  if (!canvas) return;

  if (gmvChart) { gmvChart.destroy(); gmvChart = null; }

  gmvChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'GMV',
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ' ' + fmtDollar(ctx.raw);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#9ca3af' }
        },
        y: {
          grid: { color: '#f3f4f6' },
          ticks: {
            font: { size: 11 }, color: '#9ca3af',
            callback: function(v) {
              if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
              return '$' + v;
            }
          }
        }
      }
    }
  });

  var sub = document.getElementById('chart-sub');
  if (sub) sub.textContent = 'Top 5';
}

// -- Thumbnail loader (TikTok oEmbed) --
var thumbCache = {};
function loadThumbnails() {
  var thumbEls = document.querySelectorAll('.video-thumb[data-url]');
  thumbEls.forEach(function(el) {
    var url = el.getAttribute('data-url');
    if (!url) return;
    if (thumbCache[url]) {
      applyThumb(el, thumbCache[url]);
      return;
    }
    fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.thumbnail_url) {
          thumbCache[url] = d.thumbnail_url;
          applyThumb(el, d.thumbnail_url);
        }
      })
      .catch(function() {});
  });
}
function applyThumb(el, imgUrl) {
  var img = new Image();
  img.onload = function() {
    el.style.backgroundImage = 'url(' + imgUrl + ')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center top';
    el.classList.add('has-thumb');
  };
  img.src = imgUrl;
}

// -- Top videos (thumbnail cards) --
function renderVideos(videos) {
  var el = document.getElementById('video-list');
  if (!el) return;
  var gradients = ['vt-g1','vt-g2','vt-g3','vt-g4','vt-g5'];
  var html = '';
  for (var i = 0; i < videos.length; i++) {
    var v  = videos[i];
    var g  = gradients[i] || 'vt-g1';
    var url = v.url || '';
    var tag    = url ? 'a' : 'div';
    var attrs  = url ? ' href="' + url + '" target="_blank" rel="noopener"' : '';
    var dataUrl = url ? ' data-url="' + url + '"' : '';
    html += '<' + tag + ' class="video-card"' + attrs + '>';
    html += '<div class="video-thumb ' + g + '"' + dataUrl + '>';
    html += '<div class="video-thumb-rank">' + (i + 1) + '</div>';
    html += '<div class="video-thumb-play"></div>';
    html += '</div>';
    html += '<div class="video-card-body">';
    html += '<div class="video-card-title" title="' + v.title + '">' + v.title + '</div>';
    html += '<div class="video-card-meta">' + v.creator + ' \u00B7 ' + fmtViews(v.viewers) + ' views</div>';
    html += '<div class="video-card-gmv">' + fmtDollar(v.gmv) + '</div>';
    html += '</div>';
    html += '</' + tag + '>';
  }
  el.innerHTML = html;
  loadThumbnails();
}

// -- Creator table --
function renderTable(creators) {
  var tbody = document.getElementById('creator-tbody');
  if (!tbody) return;
  var rankClass = ['r1','r2','r3'];
  var html = '';
  for (var i = 0; i < creators.length; i++) {
    var c   = creators[i];
    var rc  = rankClass[i] || '';
    var commHtml = c.commission != null
      ? fmtDollar(c.commission)
      : '<span class="null-val">--</span>';
    html += '<tr>';
    html += '<td><span class="rank-num ' + rc + '">' + (i + 1) + '</span></td>';
    html += '<td>';
    html += '<div class="creator-name">' + c.name + '</div>';
    html += '<div class="creator-followers">' + c.followers + ' followers</div>';
    html += '</td>';
    html += '<td class="col-num gmv-val">' + fmtDollar(c.gmv) + '</td>';
    html += '<td class="col-num">' + fmtNum(c.orders) + '</td>';
    html += '<td class="col-num">' + commHtml + '</td>';
    html += '<td class="col-num"><span class="ctr-badge">' + c.ctr + '%</span></td>';
    html += '<td class="col-num">' + c.followers + '</td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;

  var countEl = document.getElementById('creator-count');
  if (countEl) countEl.textContent = 'Top ' + creators.length;
}

// -- Load data --
function loadData() {
  fetch('performance-data.json?t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(json) {
      dashData = json;
      var upEl   = document.getElementById('updated-at');
      var footEl = document.getElementById('footer-date');
      if (upEl)   upEl.textContent   = 'Updated: ' + json.updatedAt;
      if (footEl) footEl.textContent = json.updatedAt;
      renderAll();
    })
    .catch(function(err) {
      console.error('Failed to load data:', err);
      var upEl = document.getElementById('updated-at');
      if (upEl) upEl.textContent = 'Error loading data';
    });
}

document.addEventListener('DOMContentLoaded', loadData);
 + n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtDollar(n) {
  if (n == null) return null;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  if (n == null) return '--';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}
function fmtViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// -- Tab switch --
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (dashData) renderAll();
}

// -- Render all --
function renderAll() {
  var d = dashData[currentTab];
  if (!d) return;

  var periodEl = document.getElementById('period-label');
  if (periodEl) periodEl.textContent = d.period;

  document.getElementById('kpi-gmv').textContent        = fmtKPI(d.kpi.affiliateGmv);
  document.getElementById('kpi-items').textContent      = fmtNum(d.kpi.itemsSold);
  document.getElementById('kpi-commission').textContent = fmtKPI(d.kpi.estCommission);
  document.getElementById('kpi-affiliates').textContent = fmtNum(d.kpi.activeAffiliates);

  renderChart(d.creators);
  renderVideos(d.topVideos);
  renderTable(d.creators);
}

// -- Bar chart --
function renderChart(creators) {
  var top5    = creators.slice(0, 5);
  var labels  = top5.map(function(c) { return c.name.replace('@', ''); });
  var values  = top5.map(function(c) { return c.gmv; });
  var colors  = ['#ec4899','#f472b6','#fb923c','#facc15','#a3e635'];
  var canvas  = document.getElementById('gmv-chart');
  if (!canvas) return;

  if (gmvChart) { gmvChart.destroy(); gmvChart = null; }

  gmvChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'GMV',
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ' ' + fmtDollar(ctx.raw);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#9ca3af' }
        },
        y: {
          grid: { color: '#f3f4f6' },
          ticks: {
            font: { size: 11 }, color: '#9ca3af',
            callback: function(v) {
              if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
              return '$' + v;
            }
          }
        }
      }
    }
  });

  var sub = document.getElementById('chart-sub');
  if (sub) sub.textContent = 'Top 5';
}

// -- Thumbnail loader (TikTok oEmbed) --
var thumbCache = {};
function loadThumbnails() {
  var thumbEls = document.querySelectorAll('.video-thumb[data-url]');
  thumbEls.forEach(function(el) {
    var url = el.getAttribute('data-url');
    if (!url) return;
    if (thumbCache[url]) {
      applyThumb(el, thumbCache[url]);
      return;
    }
    fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.thumbnail_url) {
          thumbCache[url] = d.thumbnail_url;
          applyThumb(el, d.thumbnail_url);
        }
      })
      .catch(function() {});
  });
}
function applyThumb(el, imgUrl) {
  var img = new Image();
  img.onload = function() {
    el.style.backgroundImage = 'url(' + imgUrl + ')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center top';
    el.classList.add('has-thumb');
  };
  img.src = imgUrl;
}

// -- Top videos (thumbnail cards) --
function renderVideos(videos) {
  var el = document.getElementById('video-list');
  if (!el) return;
  var gradients = ['vt-g1','vt-g2','vt-g3','vt-g4','vt-g5'];
  var html = '';
  for (var i = 0; i < videos.length; i++) {
    var v  = videos[i];
    var g  = gradients[i] || 'vt-g1';
    var url = v.url || '';
    var tag    = url ? 'a' : 'div';
    var attrs  = url ? ' href="' + url + '" target="_blank" rel="noopener"' : '';
    var dataUrl = url ? ' data-url="' + url + '"' : '';
    html += '<' + tag + ' class="video-card"' + attrs + '>';
    html += '<div class="video-thumb ' + g + '"' + dataUrl + '>';
    html += '<div class="video-thumb-rank">' + (i + 1) + '</div>';
    html += '<div class="video-thumb-play"></div>';
    html += '</div>';
    html += '<div class="video-card-body">';
    html += '<div class="video-card-title" title="' + v.title + '">' + v.title + '</div>';
    html += '<div class="video-card-meta">' + v.creator + ' \u00B7 ' + fmtViews(v.viewers) + ' views</div>';
    html += '<div class="video-card-gmv">' + fmtDollar(v.gmv) + '</div>';
    html += '</div>';
    html += '</' + tag + '>';
  }
  el.innerHTML = html;
  loadThumbnails();
}

// -- Creator table --
function renderTable(creators) {
  var tbody = document.getElementById('creator-tbody');
  if (!tbody) return;
  var rankClass = ['r1','r2','r3'];
  var html = '';
  for (var i = 0; i < creators.length; i++) {
    var c   = creators[i];
    var rc  = rankClass[i] || '';
    var commHtml = c.commission != null
      ? fmtDollar(c.commission)
      : '<span class="null-val">--</span>';
    html += '<tr>';
    html += '<td><span class="rank-num ' + rc + '">' + (i + 1) + '</span></td>';
    html += '<td>';
    html += '<div class="creator-name">' + c.name + '</div>';
    html += '<div class="creator-followers">' + c.followers + ' followers</div>';
    html += '</td>';
    html += '<td class="col-num gmv-val">' + fmtDollar(c.gmv) + '</td>';
    html += '<td class="col-num">' + fmtNum(c.orders) + '</td>';
    html += '<td class="col-num">' + commHtml + '</td>';
    html += '<td class="col-num"><span class="ctr-badge">' + c.ctr + '%</span></td>';
    html += '<td class="col-num">' + c.followers + '</td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;

  var countEl = document.getElementById('creator-count');
  if (countEl) countEl.textContent = 'Top ' + creators.length;
}

// -- Load data --
function loadData() {
  fetch('performance-data.json?t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(json) {
      dashData = json;
      var upEl   = document.getElementById('updated-at');
      var footEl = document.getElementById('footer-date');
      if (upEl)   upEl.textContent   = 'Updated: ' + json.updatedAt;
      if (footEl) footEl.textContent = json.updatedAt;
      renderAll();
    })
    .catch(function(err) {
      console.error('Failed to load data:', err);
      var upEl = document.getElementById('updated-at');
      if (upEl) upEl.textContent = 'Error loading data';
    });
}

document.addEventListener('DOMContentLoaded', loadData);
