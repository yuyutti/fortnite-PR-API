# Fortnite RP API

## 概要

このAPIは、指定された **Epic ID** のFortniteプレイヤーのPR大会、すなわちPower Ranking対象大会の結果を取得するものです。  
ヘッドレスブラウザを使用して [Fortnite Tracker](https://fortnitetracker.com/) にアクセスし、ウェブスクレイピングを行い、データを取得します。

---

## エンドポイント

### `GET /api/profile/:epicId`

**パラメータ:**

* `:epicId` – Epic Games のユーザーID（プレイヤー名）
* `id`（クエリパラメータ） – Epic アカウントのUUID形式のアカウントID（例: `4118f5eb-c387-40ae-b7d9-2af3ae92c5ef`）
  

この `id` は、`epicId` でアクセスした際に 404 になる場合に、内部で Epic ID の再検索に使われます。  
通常は指定しなくても動作しますが、特殊文字を含む名前や複雑なEpic ID、または定期クロール中にプレイヤーがEpic IDを変更したケースなどでは、補助的にこの id を指定することで、データ取得の成功率が向上します。  

**レスポンス例:**

![image](https://github.com/user-attachments/assets/d1f5915e-b43a-4e3a-8101-7d2fa8c260ee)
![image](https://github.com/user-attachments/assets/7bb30869-1214-4b2c-980f-4fc06323a2c4)

※ **PR【Power Ranking】対象外の大会は返されません。**

---

## 環境

* Node.js v22.13.1
* npm v10.4.0
* `.env` に `FORTNITE_API_KEY` を設定する必要があります（`fortniteapi.io` のAPIキー）
* 初期ポートは 9999 です（3000ではないので注意）
  
---

## 実行に関する注意  

⚠️ Linuxでは正常に動作しません。Windowsで実行してください。  

・起動時にWindowsのタスクスケジューラ等で自動起動設定しておくと便利です（常駐型運用向け）。  
・Fortnite Trackerのページ自体がかなり重いため、低スペック環境では正常に動作しない場合があります。  
　タイムアウトや、正しくデータが取れない原因になります。

---

## 注意事項

* レスポンスはウェブスクレイピングに依存するため、**取得に時間がかかる**場合があります。
* Fortnite Tracker の仕様変更などにより、突然動作しなくなる可能性があります。
* スクレイピングに伴うリスク（ブロック・法的問題など）を理解し、**使用は自己責任でお願いします**。
* 何か問題が発生しても、**一切責任は負いません。**

---

## ライセンス

このソフトウェアは **[Creative Commons BY-NC 4.0 International](https://creativecommons.org/licenses/by-nc/4.0/deed.ja)** ライセンスのもとで提供されています。

- 🎓 非営利目的であれば、自由に利用・複製・改変・再配布が可能です。
- 💰 商用利用（有料サービスへの組み込み、再販など）は**禁止されています**。
- ✍️ 作者クレジット（yuyutti）の表示が必要です。
- ⚠️ 本ソフトウェアを使用したことによって発生した損害等について、作者は一切の責任を負いません。

© 2025 yuyutti
