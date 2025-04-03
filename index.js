const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const fs = require('fs');

let BROWSER;
const taskQueue = [];

const maxConcurrentTasks = 5; // 最大同時処理数
let currentConcurrentTasks = 0;

async function processQueue() {
    if (taskQueue.length === 0 || currentConcurrentTasks >= maxConcurrentTasks) return;

    // キューにタスクがあれば、並列処理を始める
    const task = taskQueue.shift();
    currentConcurrentTasks++;

    try {
        await task();
    } catch (error) {
        console.error('Error processing task:', error);
    } finally {
        currentConcurrentTasks--;
        processQueue(); // 次のタスクを処理
    }
}

app.get('/api/profile/:epicId', async (req, res) => {
    const epicId = req.params.epicId;
    if (!epicId) return res.status(404).send('Epic ID not found');

    taskQueue.push(async () => {
        console.log('Processing Epic ID:', epicId);
        try {
            const data = await processEpicId(epicId);
            if (!data) {
                return res.status(404).json({ error: 'Failed to fetch data' });
            }
            // 本番用にoutputデータを組み立て
            const output = await processPowerRankData(data);
            res.json(output);
        } catch (error) {
            console.error('Error while processing Epic ID:', error);
            res.status(500).json({ error: `Error processing data EpicId: ${epicId}` });
        }
    });

    processQueue(); // キューを処理
});

async function processEpicId(epicId, retryCount = 3) { // retryCount は最大再試行回数
    try {
        const url1 = `https://fortnitetracker.com/profile/kbm/${epicId}/events?competitive=pr&region=ASIA`;
        const { page, browser } = BROWSER;

        const page2 = await browser.newPage();
        await page2.goto(url1, { waitUntil: 'domcontentloaded' });

        await sleep(5000);
        const html1 = await page2.content();

        if (!html1.includes('404 Not Found.')) {
            console.log(`Found profile for ${epicId}:`);
            const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
            const match = scriptRegex.exec(html1);
            const powerRankData = JSON.parse(match[1]);
            await page2.close();
            return powerRankData || null;
        }

        const url2 = `https://fortnitetracker.com/profile/search?q=${epicId}`;
        await page2.goto(url2, { waitUntil: 'domcontentloaded' });
        await sleep(6000);

        const html2 = await page2.content();

        if (html2.includes('404 Not Found.')) {
            console.log(`Profile not found for ${epicId}.`);
            await page2.close();
            return null;
        } else {
            await page2.goto(url1, { waitUntil: 'domcontentloaded' });

            await sleep(6000);
            const html3 = await page2.content();

            if (!html3.includes('404 Not Found.')) {
                console.log(`Found profile for ${epicId}:`);
                const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
                const match = scriptRegex.exec(html3);
                const powerRankData = JSON.parse(match[1]);
                await page2.close();
                return powerRankData || null;
            }

            console.log(`Profile not found for ${epicId} after retry.`);
            await page2.close();
            return null;
        }
    } catch (error) {
        console.error(`Error processing Epic ID ${epicId}:`, error);

        if (retryCount > 0) {
            console.log(`Retrying ${epicId}... (${3 - retryCount} attempts remaining)`);
            return await processEpicId(epicId, retryCount - 1); // 再帰的にリトライ
        }

        console.error(`Max retries reached for ${epicId}. Could not fetch the data.`);
        return null;
    }
}

async function setupBrowser() {
    const { connect } = await import('puppeteer-real-browser');
    const connection = await connect({ tf: true, turnstile: true, fingerprint: true, headless: 'auto', connectOption: { defaultViewport: null } });
    const { page, browser } = connection;
    await page.goto('https://google.com');
    BROWSER = { page, browser };
}

// powerRankDataを基にoutputを作成
async function processPowerRankData(data) {
    const output = {
        currentSeason: data.currentSeason,
        EpicId: data.platformInfo.platformUserHandle,
        accountId: data.powerRank.accountId,
        powerRanking: {
            region: data.powerRank.region,
            platform: data.powerRank.platform,
            statRank: data.powerRank.statRank,
            points: data.powerRank.points,
            pr: data.powerRank.pr,
            prRank: data.powerRank.prRank,
            powerRank: data.powerRank.powerRank,
            lifetimePRRank: data.powerRank.lifetimePRRank,
            yearlyPr: data.powerRank.yearlyPr,
            yearlyPRRank: data.powerRank.yearlyPRRank,
            events: data.powerRank.events,
            lastUpdated: data.powerRank.lastUpdated,
        },
        eventRegion: data.eventRegion,
        eventPlatform: data.eventPlatform,
        seasonsPR: {},
        seasonsData: await seasons(data.currentSeason),
    };

    // myEvent配列の各イベントに対して処理を行う
    data.myEvents.forEach(event => {
        event.windows.forEach(window => {
            // `powerRankingData` が存在する場合のみ処理
            if (window && window.powerRankingData) {
                const season = window.uniqueWindowId.replace('epicgames_', '').slice(0, 3); // "S33"や"S34"など

                // seasonsPRにシーズンが存在しない場合は初期化
                if (!output.seasonsPR[season]) {
                    output.seasonsPR[season] = {
                        point: 0,
                        events: [],
                    };
                }

                // `powerRankingData`のポイントを加算
                let points = window.powerRankingData.points;
                output.seasonsPR[season].point += points;
                output.seasonsPR[season].point = parseFloat(output.seasonsPR[season].point.toFixed(1));

                // イベント情報を`events`に追加
                output.seasonsPR[season].events.push({
                    windowId: window.uniqueWindowId,
                    sessionName: window.sessionName,
                    eventTitle: window.eventDisplayOverride.title_line_1,
                    eventName: window.windowId,
                    point: points,
                    eventRank: window.powerRankingData.eventRank,
                    eventDate: window.powerRankingData.eventDate,
                });
            }
        });
    });

    return output;
}

async function seasons(currentSeason) {
    const url = "https://fortniteapi.io/v1/seasons/list?lang=ja";

    let seasonsData = null;
    if (fs.existsSync('./seasons.json')) {
        try {
            seasonsData = JSON.parse(fs.readFileSync('./seasons.json'));
        } catch (error) {
            console.error('seasons.json の解析に失敗しました:', error);
        }
    }
    const lastSeason = (seasonsData && Array.isArray(seasonsData.seasons) && seasonsData.seasons.length > 0)
        ? seasonsData.seasons[seasonsData.seasons.length - 1]
        : null;

    if (lastSeason && lastSeason.season === currentSeason) {
        return seasonsData.seasons.map(season => {
            const { patchList, ...seasonWithoutPatchList } = season;
            return seasonWithoutPatchList;
        });
    }

    const response = await fetch(url, {
        headers: {
            Authorization: process.env.FORTNITE_API_KEY,
        }
    });

    const data = await response.json();

    const seasonsWithoutPatchList = data.seasons.map(season => {
        const { patchList, ...seasonWithoutPatchList } = season;
        return seasonWithoutPatchList;
    });

    fs.writeFileSync('./seasons.json', JSON.stringify(data, null, 2));
    return seasonsWithoutPatchList;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    await setupBrowser();
    app.listen(9999, () => console.log('Server running on port 9999'));
})();