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

for (let i = 0; i < url.length; i++) {
    // responseをjsonでfsで/resに保存
    fetch(url[i])
        .then(response => response.json())
        .then(data => {
            fs.writeFile(`./res/${i}.json`, JSON.stringify(data, null, 2), (err) => {
                if (err) throw err;
                console.log('Data has been written to file');
            });
        })
}