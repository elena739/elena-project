// TikTok Seller Center 재고 자동 스크래퍼 (Playwright + 기존 Chrome 세션)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── 설정 ────────────────────────────────────────────────────────────────────
const SELLER_URL   = process.env.TIKTOK_SELLER_URL || 'https://seller-us.tiktok.com';
const CHROME_PROFILE = process.env.CHROME_PROFILE ||
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
const OUTPUT = path.join(__dirname, '..', 'inventory-data.json');

// inventory.html 의 CAT_MAP 과 동일하게 유지
const CAT_MAP = {
  'charm tint': 'lip', 'tulle gloss': 'lip', 'charm tint duo': 'lip', 'lip duo': 'lip',
  'dough cheek': 'face', 'foundation': 'face', 'spatula': 'face',
  'eyebrow': 'brow', 'brow finisher': 'brow', 'brow sculpture': 'brow', 'tough brow': 'brow',
  'glow serum': 'body', 'body highlight': 'body', 'cool stick': 'body',
};

function inferCategory(name) {
  const n = name.toLowerCase();
  for (const [k, v] of Object.entries(CAT_MAP)) {
    if (n.includes(k)) return v;
  }
  return 'lip';
}

// ─── API 응답 → inventory-data.json 형식 변환 ────────────────────────────────
function transformProduct(p) {
  const name = p.title || p.name || p.product_name || '';
  if (!name) return null;

  const skuList = p.sku_list || p.skus || p.variants || [];
  const skus = skuList.map(sku => {
    const specs = sku.sku_spec_list || sku.spec_list || sku.options || [];
    const color = specs.map(s => s.spec_value || s.value || s.name).join(' / ')
                  || sku.sku_name || sku.name || 'Default';

    const si        = sku.stock_info || sku.inventory || {};
    const available = si.available_stock    ?? si.available_quantity    ?? sku.available_stock ?? sku.stock ?? 0;
    const locked    = si.reserved_stock     ?? si.locked_quantity       ?? sku.reserved        ?? 0;
    const total     = available + locked;

    return {
      color,
      total,
      available,
      locked,
      status: total === 0 ? 'out' : available <= 10 ? 'low' : 'ok',
    };
  });

  if (skus.length === 0) return null;
  return { name, category: inferCategory(name), skus };
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Chrome 프로필 경로:', CHROME_PROFILE);

  // 기존 Chrome 로그인 세션을 그대로 사용 (launchPersistentContext)
  // Chrome이 실행 중이면 충돌날 수 있으므로 headless로 별도 실행
  const context = await chromium.launchPersistentContext(CHROME_PROFILE, {
    channel: 'chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--profile-directory=Default',
    ],
  });

  const captured = [];
  context.on('response', async (res) => {
    if (res.status() !== 200) return;
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;
    const url = res.url();
    if (!url.includes('/product') && !url.includes('/inventory')) return;
    try {
      const json = await res.json();
      const products =
        json?.data?.products     ||
        json?.data?.product_list ||
        json?.result?.products   ||
        json?.products;
      if (Array.isArray(products) && products.length > 0) {
        captured.push(...products);
        console.log(`  [API 캡처] 상품 ${products.length}개`);
      }
    } catch {}
  });

  const page = await context.newPage();

  try {
    // ── 상품 목록 로딩 (로그인 불필요 — 기존 세션 사용) ─────────────────────
    console.log('상품 목록 불러오는 중...');
    await page.goto(`${SELLER_URL}/en/product/list?status=2`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 로그인 페이지로 리다이렉트됐는지 확인
    if (page.url().includes('login') || page.url().includes('account')) {
      console.error([
        '',
        '❌ 세션 만료 — TikTok Seller Center에 다시 로그인되어있지 않습니다.',
        '   Chrome에서 ' + SELLER_URL + ' 접속 후 로그인 상태 확인해주세요.',
        '',
      ].join('\n'));
      process.exit(1);
    }

    await page.waitForTimeout(5000);

    // 페이지네이션: 다음 페이지가 있는 동안 반복 (최대 10페이지)
    for (let pg = 2; pg <= 10; pg++) {
      const nextBtn = page.locator([
        'button[aria-label="next page"]',
        'button[aria-label="Next"]',
        '.arco-pagination-item-next:not([disabled])',
        'li.next:not(.disabled)',
      ].join(', ')).first();

      if (!(await nextBtn.isVisible().catch(() => false))) break;
      if (await nextBtn.isDisabled().catch(() => true)) break;

      console.log(`   페이지 ${pg}...`);
      await nextBtn.click();
      await page.waitForTimeout(3000);
    }

    // ── 데이터 처리 ───────────────────────────────────────────────────────────
    let products = [];

    if (captured.length > 0) {
      console.log(`API 데이터 변환 중 (${captured.length}개 상품)...`);
      products = captured.map(transformProduct).filter(Boolean);
    } else {
      console.log('DOM 파싱으로 대체 중...');
      products = await page.evaluate((catMap) => {
        const rows = document.querySelectorAll(
          '[class*="product-item"], [class*="product-row"], [data-testid*="product"]'
        );
        const result = [];
        rows.forEach(row => {
          const nameEl = row.querySelector('[class*="product-name"], [class*="title"], h3, h4');
          if (!nameEl) return;
          const name    = nameEl.textContent.trim();
          const stockEl = row.querySelector('[class*="stock"], [class*="inventory"]');
          const stock   = parseInt(stockEl?.textContent) || 0;
          result.push({
            name,
            category: Object.entries(catMap).find(([k]) => name.toLowerCase().includes(k))?.[1] || 'lip',
            skus: [{ color: 'Default', total: stock, available: stock, locked: 0,
                     status: stock === 0 ? 'out' : stock <= 10 ? 'low' : 'ok' }],
          });
        });
        return result;
      }, CAT_MAP);
    }

    if (products.length === 0) {
      console.error('❌ 상품 데이터 없음. TIKTOK_SELLER_URL 또는 셀렉터 확인 필요.');
      process.exit(1);
    }

    // ── 저장 ─────────────────────────────────────────────────────────────────
    const output = {
      updatedAt: new Date().toISOString().slice(0, 10),
      products,
    };
    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n✅ 완료: ${products.length}개 상품 → inventory-data.json`);

  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
