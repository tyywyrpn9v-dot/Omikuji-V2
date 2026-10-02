# 全国ゆるみくじ・おみくじ検索 (Omikuji Searcher)

GitHub Pages で公開できる静的なおみくじ（ゆるみくじ）検索サイトです。

都道府県・モチーフ（うさぎ・きつね・龍・鯛など）・キーワードで、全国の神社・寺院のかわいいおみくじを横断検索できます。

## デモ構成

```
omikuji-searcher/
├── index.html          # メインページ
├── style.css           # スタイル
├── app.js              # 検索ロジック
├── data/
│   └── omikuji.json    # データ（ここを編集・追加）
└── README.md
```

## GitHub Pages での公開手順

1. 新しいリポジトリを作成（例: `omikuji-searcher`）
2. このフォルダの中身をすべてアップロード（または `git push`）
3. リポジトリの **Settings → Pages** へ
4. Source を **Deploy from a branch** に設定
5. Branch を `main`（または `master`）、Folder を `/ (root)` に選択して Save
6. 数分後に `https://<username>.github.io/omikuji-searcher/` で公開されます

> リポジトリ名を `username.github.io` にした場合はルートで公開されます。

## データの追加・編集

`data/omikuji.json` を編集してください。1件の例：

```json
{
  "prefecture": "東京都",
  "city": "新宿区",
  "shrine_name": "赤城神社",
  "omikuji_name": "うさぎみくじ",
  "price": "500円",
  "material": "セラミック",
  "motifs": ["うさぎ", "動物"],
  "features": "かわいいうさぎの人形型。手書きの表情で一つひとつ異なる。",
  "source_url": "https://example.com/"
}
```

- `motifs` は配列（複数タグ可）
- 価格・在庫は変動するため「要確認」でも可
- 新しいモチーフを追加すると、検索フィルタに自動で現れます

## 主な情報源（参考）

- [GajaLife 全国ゆるみくじ](https://gajalife.com/zenkoku-yurumikuji/)
- [おみくじ図鑑（都道府県別）](https://omikujizukan.cocolog-nifty.com/blog/cat76050564/index.html)
- [社これくしょん ゆるみくじ](https://yashirocollection.com/omikuji-gallery/yurumikuji/)
- [おみくじ好き](https://omikujisuki.com/)
- [ホトカミ おみくじ写真](https://hotokami.jp/photos/omikuji/)

## 注意

本サイトは公開情報を基にした**非公式の参考用**です。  
実際の授与状況・価格は各神社・寺院の公式情報を必ず確認してください。

## ライセンス

データは各サイトの公開情報を参考にしたサンプルです。  
コード部分は自由に改変・再利用して構いません。
