const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const SEARCH_QUERY = process.argv[2] || 'ремонт квартир';
const REGION_URL = process.argv[3] || 'https://www.avito.ru/moskva';
const OUTPUT_FILE = process.argv[4];

async function run() {
    console.log(`🚀 Запуск парсера Avito [${REGION_URL}]...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        const searchUrl = REGION_URL.includes('?q=') ? REGION_URL : `${REGION_URL}?q=${encodeURIComponent(SEARCH_QUERY)}`;
        console.log(`🔍 Переход: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('[data-marker="item"]', { timeout: 30000 });

        const items = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('[data-marker="item"]').forEach(el => {
                const titleEl = el.querySelector('[data-marker="item-title"]');
                const priceEl = el.querySelector('[data-marker="item-price"]');
                if (titleEl && priceEl) {
                    const priceText = priceEl.textContent.trim().replace(/[^0-9]/g, '');
                    results.push({
                        title: titleEl.textContent.trim(),
                        price: parseInt(priceText) || 0,
                        url: titleEl.href
                    });
                }
            });
            return results;
        });

        console.log(`✅ Найдено: ${items.length}`);

        const finalOutput = OUTPUT_FILE || `avito_results_${Date.now()}.json`;
        fs.writeFileSync(finalOutput, JSON.stringify(items, null, 2));
        console.log(`💾 Сохранено в: ${finalOutput}`);

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        await browser.close();
    }
}

run();
