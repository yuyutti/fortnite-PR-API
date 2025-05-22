const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
require('dotenv').config();

const fs = require('fs');

class PagePool {
    constructor(browser, poolSize = 5, idleTimeout = 5 * 60 * 1000) {
        this.browser = browser;
        this.poolSize = poolSize;
        this.idleTimeout = idleTimeout;
        this.pool = [];
        this.available = [];
        this.waiters = [];

        // ブラウザがクラッシュした時などのイベント
        this.browser.on('disconnected', () => {
            console.error('Browser disconnected. Clearing all pages.');
            this.pool.forEach(page => page.close().catch(() => {}));
            this.pool = [];
            this.available = [];
            this.waiters.forEach(resolve => resolve(this._recreatePage()));
            this.waiters = [];
        });
    }

    async _recreatePage() {
        const page = await this.browser.newPage();
        this.pool.push(page);
        this._attachPageErrorHandler(page);
        return page;
    }

    _attachPageErrorHandler(page) {
        page.on('error', error => {
            console.error(`Page error: ${error.message}. Removing page from pool.`);
            this._removePage(page);
        });
        page.on('close', () => {
            console.warn('Page closed unexpectedly. Removing from pool.');
            this._removePage(page);
        });
    }

    _removePage(page) {
        const idxPool = this.pool.indexOf(page);
        if (idxPool >= 0) this.pool.splice(idxPool, 1);
        const idxAvail = this.available.findIndex(info => info.page === page);
        if (idxAvail >= 0) {
            clearTimeout(this.available[idxAvail].timer);
            this.available.splice(idxAvail, 1);
        }
    }

    async getPage() {
        // 利用可能なページがあれば再利用
        while (this.available.length > 0) {
            const info = this.available.shift();
            clearTimeout(info.timer);
            if (info.page.isClosed()) continue;
            return info.page;
        }
        // プールに余裕があれば新規作成
        if (this.pool.length < this.poolSize) {
            const page = await this.browser.newPage();
            this.pool.push(page);
            this._attachPageErrorHandler(page);
            return page;
        }
        // 空き待ちキューに入る
        return new Promise(resolve => this.waiters.push(resolve));
    }

    releasePage(page) {
        if (page.isClosed()) return;
        // 待ちがあればすぐ渡す
        if (this.waiters.length > 0) {
            const resolve = this.waiters.shift();
            resolve(page);
            return;
        }
        // アイドルタイマーをセットして保持
        const timer = setTimeout(async () => {
            try { await page.close(); }
            catch (e) { console.error('Failed to close idle page:', e); }
            this._removePage(page);
        }, this.idleTimeout);
        this.available.push({ page, timer });
    }
}

let BROWSER;
let pagePool;

async function setupBrowser() {
    const { connect } = await import('puppeteer-real-browser');
    const connection = await connect({ tf: true, turnstile: true, fingerprint: true, headless: 'auto', connectOption: { defaultViewport: null } });
    const { page, browser } = connection;
    await page.goto('https://google.com');
    BROWSER = { page, browser };
    pagePool = new PagePool(browser, 5, 5 * 60 * 1000);
}

// タスクキュー制御
const taskQueue = [];
let activeTasks = 0;

async function processQueue() {
    if (taskQueue.length === 0 || activeTasks >= pagePool.poolSize) return;
    const task = taskQueue.shift();
    activeTasks++;
    try { await task(); } catch (e) { console.error(e); }
    activeTasks--;
    processQueue();
}

app.get('/api/profile/:epicId', async (req, res) => {
    const epicId = req.params.epicId;
    const id = req.query.id;
    if (!epicId) return res.status(404).send('Epic ID not found');

    taskQueue.push(async () => {
        console.log(`リクエストの処理を開始します: ${epicId}`);
        try {
            const data = await processEpicId(epicId, id);
            if (!data) return res.status(404).json({ error: 'Failed to fetch data' });
            const output = await processPowerRankData(data);
            console.log(`リクエストの処理が完了しました: ${epicId}`);
            res.json(output);
        } catch (error) {
            console.error('Error while processing Epic ID:', error);
            res.status(500).json({ error: `Error processing data EpicId: ${epicId}` });
        }
    });
    processQueue();
});

    async function processEpicId(epicId, id, retryCount = 3, startTime = Date.now()) {
        const page = await pagePool.getPage();
        try {
            // 共通のfetch関数
            async function fetchContent(url, wait = true) {
                logWithTime(`${url}にアクセスしています...`);
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                let challenge = false;
                if (wait) {
                    // チャレンジ文があれば即true、なければスキップ
                    const bodyText = await page.evaluate(() => document.body.innerText);
                    if (bodyText.includes('Verifying you are human.') || bodyText.includes('あなたが人間であることを確認します。これには数秒かかる場合があります。')) {
                        challenge = true;
                        logWithTime('Cloudflare チャレンジ検出！');

                        try {
                            await page.waitForFunction(() =>
                                document.body.innerText.includes('Verification successful') ||
                                document.body.innerText.includes('検証成功'),
                                { timeout: 8000 }
                            );
                            logWithTime('Verification successful になった！');
                        } catch {
                            logWithTime('Verification 成功の文字が出なかったけど、通過したかも？');
                        }
                    } else {
                        logWithTime('チャレンジ不要やったみたいやな');
                    }
                }

                if (challenge) {
                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
                    } catch {
                        logWithTime('追加のナビゲーションはなかったみたいやな');
                    }
                }
                return page.content();
            }

            function parsePowerRank(html, url) {
                logWithTime(`${url}のコンテンツにaccessしました`);
                const scriptRegex = /const profile = (\{[\s\S]*?"powerRank":\s*(\{[\s\S]*?\})[\s\S]*?\});/m;
                const match = scriptRegex.exec(html);
                if (!match) {
                    logWithTime(`${url}からデータをパースできませんでした`);
                    return null;
                }
                const data = JSON.parse(match[1]);
                logWithTime(`${url}のデータ解析が完了しました`);
                return data;
            }

            function logWithTime(message) {
                const now = Date.now();
                const elapsed = ((now - startTime) / 1000).toFixed(2);
                console.log(`[${elapsed}s] ${message}`);
            }

            // 1. 直接取得
            const url1 = `https://fortnitetracker.com/profile/kbm/${epicId}/events?competitive=pr&region=ASIA`;
            const html1 = await fetchContent(url1);
            if (!html1.includes('404 Not Found.')) {
                return parsePowerRank(html1, url1);
            }
            logWithTime(`${url1}に404エラーが発生しました`);

            // 2. 検索ページでID修正
            const url2 = `https://fortnitetracker.com/profile/search?q=${id}`;
            const html2 = await fetchContent(url2, false);
            logWithTime(`${url2}にアクセスしました`);
            if (html2.includes('404 Not Found.')) {
                logWithTime(`${url2}に404エラーが発生しました\n処理を終了します`);
                return null;
            }
            logWithTime(`${url2}のデータを取得しました`);
            const fixedEpicId = await page.$eval('.profile-header-user__nickname', el => el.textContent.trim());
            logWithTime(`${url2}のIDを取得しました: ${fixedEpicId}`);

            // 3. 修正IDで再取得
            const url3 = `https://fortnitetracker.com/profile/kbm/${fixedEpicId}/events?competitive=pr&region=ASIA`;
            const html3 = await fetchContent(url3);
            if (!html3.includes('404 Not Found.')) {
                return parsePowerRank(html3, url3);
            }
            logWithTime(`${url3}に404エラーが発生しました\n処理を終了します`);
            return null;

        } catch (error) {
            console.error(`Error processing Epic ID ${epicId}:`, error);
            if (retryCount > 0) {
                logWithTime(`Retrying ${epicId}... (残り ${retryCount - 1} 回)`);
                return await processEpicId(epicId, id, retryCount - 1);
            }
            console.error(`Max retries reached for ${epicId}. Could not fetch the data.`);
            return null;
        } finally {
            pagePool.releasePage(page);
        }
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

(async () => {
    await setupBrowser();
    app.listen(9999, () => console.log('Server running on port 9999'));
})();