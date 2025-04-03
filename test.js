require('dotenv').config();
const fs = require('fs');

const url = [
    "http://localhost:9999/api/profile/ECS ありすbot",
    "http://localhost:9999/api/profile/ECS 森のととろYouTube",
    "http://localhost:9999/api/profile/ECS YKKN877",
    "http://localhost:9999/api/profile/ECSけんじーふぃっしーで検索",
    "http://localhost:9999/api/profile/ECS勝利宣言れくしー",
    "http://localhost:9999/api/profile/uc asxyfnbr",
    "http://localhost:9999/api/profile/あしゅ んちんち 凸",
]

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

// fsにresponseを記載
async function writeSeasons() {
    const seasonsData = await seasons(34); // seasons関数の結果を待つ
    fs.writeFileSync('./res.json', JSON.stringify(seasonsData, null, 2)); // データをJSON形式でファイルに書き込む
}

writeSeasons(); // 関数を実行