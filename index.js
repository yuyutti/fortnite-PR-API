const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let BROWSER;
const taskQueue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        try {
            await task();
        } catch (error) {
            console.error('Error processing task:', error);
        }
    }

    isProcessing = false;
}

app.post('/api/user', (req, res) => {
    const url = req.body.url;
    if (!url) return res.status(404).send('URL not found');

    taskQueue.push(async () => {
        console.log('Processing URL:', url);
        const data = await processUrl(url);
        if (!data) {
            res.status(500).json({ error: 'Failed to fetch data' });
        } else {
            res.json(data);
        }
    });

    processQueue();
});

async function processUrl(url) {
    try {
        const { page, browser, setTarget } = BROWSER;
        setTarget({ status: false });
        const page2 = await browser.newPage();
        setTarget({ status: true });
        await page2.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(7000);
        const html = await page2.content();
        await page2.close();
        const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
        const match = scriptRegex.exec(html);
        return match && match[1] ? JSON.parse(match[1]) : null;
    } catch (error) {
        console.error('Error in fetching or processing page:', error);
        throw error;
    }
}

async function setupBrowser() {
    const { connect } = await import('puppeteer-real-browser');
    const connection = await connect({ tf: true, turnstile: true, fingerprint: true, headless: 'auto', });
    const { page, browser, setTarget} = connection;
    await page.goto('https://google.com');
    BROWSER = { page, browser, setTarget };
    
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    await setupBrowser();
    app.listen(9999, () => console.log('Server running on port 9999'));
})();