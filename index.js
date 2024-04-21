const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let browser, page;

app.post('/api/user', async (req, res) => {
    console.log(`Request received: ${req.body.url}`);
    const url = req.body.url;
    if (!url) return res.status(404).send('URL not found');

    const data = await main(url);
    console.log(data);
    if (!data) return res.status(500).json({ error: 'Failed to fetch data' });

    res.json(data);
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupBrowser() {
    const { connect } = await import('puppeteer-real-browser');
    const connection = await connect({ headless: false, turnstile: true });
    browser = connection.browser;
}

async function main(url) {
    try {
        page = await browser.newPage();
        console.log(url)
        await page.goto(url);
        await sleep(7000);

        const html = await page.content();
        const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
        const match = scriptRegex.exec(html);
        
        if (match && match[1]) {
            return JSON.parse(match[1]);
        } else {
            console.error('Profile data not found');
            return null;
        }
    } catch (error) {
        console.error('Error in fetching or processing page:', error);
        return null;
    } finally {
        await page.close();
    }
}

(async () => {
    await setupBrowser();
    app.listen(9999, () => console.log('Server running on port 9999'));
})();