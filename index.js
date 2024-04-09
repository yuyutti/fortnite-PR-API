const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

process.on('uncaughtException', function(err) {
    console.log(err);
});

const sleep = ms => new Promise(res => setTimeout(res, ms));

app.post('/api/user', async (req, res) => {
    const url = req.body.url;
    if (!url) return res.status(404).send('url not found');
    const data = await main(0,url);
    if (!data) return res.status(404).json({ Error: 'データが正しく取得できませんでした'});
    res.json(data);
});

app.listen(9999);

async function main(retryCount = 0,url) {
    if (!url) return false;
    const { connect } = await import('puppeteer-real-browser');
    const { page, browser } = await connect({ headless: false, turnstile: true});
    console.log('connected Fortnitetracker page');
    await page.goto(url);
    await sleep(7000);

    const html = await page.content();
    const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
    const match = scriptRegex.exec(html);
    
    if (match && match[1]) {
        const profileData = JSON.parse(match[1]);
        
        const season = profileData.currentSeason;
        const powerRankData = profileData.powerRank;
        const prSegments = profileData.prSegments;

        const data = {
            season: season,
            accountID: powerRankData.accountId,
            region: powerRankData.region,
            name: powerRankData.name,
            platform: powerRankData.platform,
            powerRank: powerRankData.statRank,
            points: powerRankData.points,
            yearPointsRank: powerRankData.yearPointsRank,
            yearPoints: powerRankData.yearPoints,
            seasonPoints: prSegments.find(segment => segment.segment === `season-${season}`).points || 0,
        }
        await browser.close();
        return data;
    } else {
        console.log('retry...');
        if (retryCount < 3) {
            await browser.close();
            await sleep(5000);
            await main(retryCount + 1,url);
        } else {
            await browser.close();
            console.log('retry over 3 times.')
            return null;
        }
    }
}