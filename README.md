# 日本御神籤探索

靜態搜尋站。把這個資料夾的內容放到 GitHub 儲存庫根目錄，再用 GitHub Pages 發布。

## 這次修正

- 空資料庫、沒有收藏、沒有符合結果，分成三種提示。
- 搜尋條件寫進網址（`q`、`pref`、`motif`、`material`、`status`、`max`、`sort`、`fav`），可以複製分享。
- 卡片顯示狀態，以及核實日或「未再核實現貨」。
- `schema.json` 只強制 `id`、`name_jp`、`shrine_temple_jp`、`prefecture`、`status`、`source_url`。其餘可留空。
- 最愛可匯出、匯入 JSON。
- 超過 24 筆時分頁顯示。
- `data/omikuji.json` 放入首批「曾確認」紀錄。價格與授予狀況來自公開收集頁，不是現場現貨確認。沒有圖片，避免外連他人照片。

## 注意

`previously_confirmed` 表示來源曾經記載，不代表今天仍在授予。升成 `current_confirmed` 之前，請向官方或現場再核對，並填上 `last_verified_date`。
