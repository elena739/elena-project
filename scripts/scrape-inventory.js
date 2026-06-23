// TikTok Seller Center 재고 자동 스크래퍼 (Playwright)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── 설정 ────────────────────────────────────────────────────────────────────
// GitHub Secrets 또는 로컬 .env에서 읽음
const SELLER_URL = process.env.TIKTOK_SELLER_URL || 'https://seller-us.tiktok.com';
const EMAIL      = process.env.TIKTOK_EMAIL;
const PASSWORD   = process.env.TIKTOK_PASSWORD;
const OUTPUT     = path.join(__dirname, '..', 'inventory-data.json');

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
    // 컬러/옵션명 추출
    const specs = sku.sku_spec_list || sku.spec_list || sku.options || [];
    const color = specs.map(s => s.spec_value || s.value || s.name).join(' / ')
                  || sku.sku_name || sku.name || 'Default';

    // 재고 수량 추출 (TikTok API 응답 구조 여러 형태 대응)
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
  if (!EMAIL || !PASSWORD) {
    console.error('오류: TIKTOK_EMAIL, TIKTOK_PASSWORD 환경 변수를 설정해주세요');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  // TikTok Seller Center 내부 API 응답 자동 캡처
  const captured = [];
  context.on('response', async (res) => {
    if (res.status() !== 200) return;
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;
    const url = res.url();
    // 상품/재고 관련 API 엔드포인트 패턴
    if (!url.includes('/product') && !url.includes('/inventory')) return;
    try {
      const json = await res.json();
      const products =
        json?.data?.products        ||
        json?.data?.product_list    ||
        json?.result?.products      ||
        json?.products;
      if (Array.isArray(products) && products.length > 0) {
        captured.push(...products);
        console.log(`  [API 캡처] 상품 ${products.length}개`);
      }
    } catch { /* non-JSON 응답 무시 */ }
  });

  const page = await context.newPage();

  try {
    // ── 1. 로그인 ─────────────────────────────────────────────────────────────
    console.log('1. 로그인 중...');
    await page.goto(`${SELLER_URL}/account/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 이메일 입력
    // ⚠️ TikTok UI가 업데이트되면 셀렉터 수정 필요
    const emailSel = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="Email"]',
      'input[type="text"]',
    ].join(', ');
    await page.waitForSelector(emailSel, { timeout: 15000 });
    await page.fill(emailSel, EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);

    // 2FA / 이메일 인증 감지
    const currentUrl = page.url();
    if (currentUrl.includes('verify') || currentUrl.includes('otp') || currentUrl.includes('2fa')) {
      console.error([
        '',
        '❌ 2단계 인증(2FA) 또는 이메일 인증 필요',
        '',
        '해결 방법:',
        '  1. 로컬 PC에서 node scripts/login-and-save.js 실행 (추후 추가)',
        '  2. 생성된 session.json 내용을 GitHub Secret TIKTOK_SESSION 에 등록',
        '  3. 이후 자동 실행 시 세션 쿠키 재사용',
        '',
      ].join('\n'));
      process.exit(1);
    }

    console.log('   로그인 완료 ✓');

    // ── 2. 상품 목록 로딩 ────────────────────────────────────────────────────
    console.log('2. 상품 목록 불러오는 중...');
    // status=2: 판매 중인 상품만
    await page.goto(`${SELLER_URL}/en/product/list?status=2`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // 페이지네이션: 다음 페이지 버튼이 있는 동안 클릭 (최대 10페이지)
    for (let pg = 2; pg <= 10; pg++) {
      const nextBtn = page.locator([
        'button[aria-label="next page"]',
        'button[aria-label="Next"]',
        '.arco-pagination-item-next:not([disabled])',
        'li.next:not(.disabled)',
      ].join(', ')).first();

      if (!(await nextBtn.isVisible().catch(() => false))) break;
      const isDisabled = await nextBtn.isDisabled().catch(() => true);
      if (isDisabled) break;

      console.log(`   페이지 ${pg} 로딩...`);
      await nextBtn.click();
      await page.waitForTimeout(3000);
    }

    // ── 3. 데이터 처리 ────────────────────────────────────────────────────────
    let products = [];

    if (captured.length > 0) {
      console.log(`3. API 캡처 데이터 변환 중 (${captured.length}개)...`);
      products = captured.map(transformProduct).filter(Boolean);
    } else {
      // API 캡처 실패 시 DOM 파싱 fallback
      console.log('3. DOM 파싱 방식으로 시도 중...');
      products = await page.evaluate((catMap) => {
        // ⚠️ 셀렉터는 실제 TikTok Seller Center 페이지 검사 후 수정
        const rows = document.querySelectorAll(
          '[class*="product-item"], [class*="product-row"], [data-testid*="product"]'
        );
        const result = [];
        rows.forEach(row => {
          const nameEl  = row.querySelector('[class*="product-name"], [class*="title"], h3, h4');
          if (!nameEl) return;
          const name    = nameEl.textContent.trim();
          const stockEl = row.querySelector('[class*="stock"], [class*="inventory"], [class*="qty"]');
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
      console.error([
        '❌ 상품 데이터를 가져오지 못했습니다.',
        '다음을 확인해주세요:',
        '  - TikTok Seller Center 로그인 성공 여부',
        '  - TIKTOK_SELLER_URL 값 (예: https://seller-us.tiktok.com)',
        '  - scripts/scrape-inventory.js 내 DOM 셀렉터 수정 필요 여부',
      ].join('\n'));
      process.exit(1);
    }

    // ── 4. 저장 ───────────────────────────────────────────────────────────────
    const output = {
      updatedAt: new Date().toISOString().slice(0, 10),
      products,
    };
    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n✅ 완료: ${products.length}개 상품 저장 → inventory-data.json`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('실행 오류:', err.message);
  process.exit(1);
});
