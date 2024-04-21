const express = require('express');
const { connect } = require('puppeteer-real-browser');
const Queue = require('queue');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let browser;
const queue = new Queue({ concurrency: 1, autostart: true });

app.post('/api/user', (req, res) => {
    console.log(`Request received: ${req.body.url}`);
    const url = req.body.url;
    if (!url) return res.status(404).send('URL not found');

    queue.push(async cb => {
        const data = await processUrl(url);
        if (!data) {
            res.status(500).json({ error: 'Failed to fetch data' });
        } else {
            res.json(data);
        }
        cb();
    });
});

async function processUrl(url) {
    try {
        const page = await browser.newPage();
        console.log(url);
        await page.goto(url);
        await sleep(7000);
        const html = await page.content();
        const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
        const match = scriptRegex.exec(html);
        await page.close();
        return match && match[1] ? JSON.parse(match[1]) : null;
    } catch (error) {
        console.error('Error in fetching or processing page:', error);
        return null;
    }
}

async function setupBrowser() {
    const connection = await connect({ headless: false, turnstile: true });
    browser = connection.browser;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    await setupBrowser();
    app.listen(9999, () => console.log('Server running on port 9999'));
})();