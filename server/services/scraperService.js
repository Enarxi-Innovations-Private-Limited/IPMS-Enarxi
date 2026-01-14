const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Load Stock Mappings
const mappingPath = path.join(__dirname, '../data/stock_mappings.json');
let STOCK_MAPPINGS = [];
try {
    if (fs.existsSync(mappingPath)) {
        STOCK_MAPPINGS = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    }
} catch (e) {
    console.error('Failed to load stock mappings:', e);
}

const DEALERS = {
    'evelta': {
        name: 'Evelta',
        searchUrl: 'https://evelta.com/search.php?search_query={query}',
        selectors: {
            product: '.card',
            title: '.card-title a',
            price: '.price.price--withoutTax',
            link: '.card-title a',
            image: '.card-image'
        }
    },
    'ktron': {
        name: 'Ktron',
        searchUrl: 'https://www.ktron.in/search?q={query}',
        selectors: {
            product: '.product',
            title: '.mf-product-content h2 a',
            price: '.price',
            link: '.mf-product-thumbnail a',
            image: '.mf-product-thumbnail img'
        }
    },
    'robu': {
        name: 'Robu',
        searchUrl: 'https://robu.in/?s={query}&post_type=product',
        selectors: {
            product: '.product',
            title: 'h2.woocommerce-loop-product__title',
            price: '.price',
            link: 'a.woocommerce-LoopProduct-link',
            image: '.attachment-woocommerce_thumbnail'
        }
    },
    'sharvielectronics': {
        name: 'Sharvi Electronics',
        searchUrl: 'https://sharvielectronics.com/?s={query}&post_type=product',
        selectors: {
            product: '.product-small',
            title: '.name',
            price: '.price',
            link: '.name a',
            image: '.attachment-woocommerce_thumbnail'
        }
    }
};

class ScraperService {
    async scrapeDealer(dealerKey, query) {
        const dealer = DEALERS[dealerKey];
        if (!dealer) throw new Error('Unknown dealer');

        console.log(`Scraping ${dealer.name} for "${query}"...`);

        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            const page = await browser.newPage();
            // Block images/fonts for speed
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'font', 'stylesheet'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Navigate to search results
            const url = dealer.searchUrl.replace('{query}', encodeURIComponent(query));
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for selectors
            try {
                await page.waitForSelector(dealer.selectors.product, { timeout: 8000 });
            } catch (e) {
                console.log(`No results found on ${dealer.name} for ${query}`);
                return [];
            }

            // Extract data
            const results = await page.evaluate((selectors) => {
                const items = document.querySelectorAll(selectors.product);
                const data = [];

                items.forEach(item => {
                    const titleEl = item.querySelector(selectors.title);
                    const priceEl = item.querySelector(selectors.price);
                    const linkEl = item.querySelector(selectors.link) || item.closest('a');
                    const imgEl = item.querySelector(selectors.image);

                    if (titleEl && priceEl) {
                        data.push({
                            title: titleEl.innerText.trim(),
                            price: priceEl.innerText.trim(),
                            url: linkEl ? linkEl.href : null,
                            image: imgEl ? imgEl.src : null
                        });
                    }
                });

                return data.slice(0, 5); // Limit to top 5 results
            }, dealer.selectors);

            return results.map(r => ({ ...r, dealer: dealer.name }));

        } catch (error) {
            console.error(`Error scraping ${dealer.name}:`, error.message);
            return [];
        } finally {
            if (browser) await browser.close();
        }
    }

    async comparePrices(userQuery) {
        // 1. Look up userQuery in STOCK_MAPPINGS
        const normalizedQuery = userQuery.toLowerCase().trim();

        // Find exact match or partial match on "product" field (e.g. "10R" matches "10R")
        const mapping = STOCK_MAPPINGS.find(m => m.product.toLowerCase() === normalizedQuery);

        if (!mapping) {
            console.log(`Product "${userQuery}" not found in Stock List.`);
            // Throw error to be caught by controller and sent to UI
            // Or return empty with a special message
            throw new Error(`Product "${userQuery}" is not in the approved Stock List (R&D).`);
        }

        console.log(`Found mapping for "${userQuery}":`, mapping.skus);

        // 2. Scrape each dealer using the SPECIFIC SKU from mapping
        const promises = Object.keys(DEALERS).map(key => {
            const sku = mapping.skus[key];
            if (sku) {
                return this.scrapeDealer(key, sku);
            } else {
                console.log(`No SKU for ${key} in mapping.`);
                return Promise.resolve([]);
            }
        });

        const results = await Promise.all(promises);
        return results.flat();
    }
}

module.exports = new ScraperService();
