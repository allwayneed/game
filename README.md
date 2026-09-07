# game
マジで適当に作ったゲームたち、ついでに馬鹿適当。

## 🏛️ 近代史カードパック開封ゲーム（[game/cardgame/](game/cardgame/)）

近代史の人物151人が手に入るガチャカードゲーム。ログイン不要・ブラウザでそのまま遊べる。

- **SSR×10 / SR×38 / R×68 / N×47** の計151枚（ヒトラー、ナポレオン、坂本龍馬、アインシュタイン…）
- 肖像と紹介文は [Wikipedia（ja）API](https://www.mediawiki.org/wiki/API:Main_page) からリアルタイム取得（CC BY-SA）
- 10連はSR以上1枚保証、**50連天井でSSR確定**
- チケットは3分ごとに1枚回復（最大5枚）。重複でカードがレベルアップ（最大Lv5）
- コレクション（図鑑）とコンプ率、タグ絞り込み付き
- 進行状況はlocalStorageに保存。サウンド付き（ミュート可）

遊ぶ: `game/cardgame/index.html` を開くだけ。

## ライセンス表記
カードの肖像・紹介文は Wikipedia（ja）より、[CC BY-SA](https://creativecommons.org/licenses/by-sa/3.0/) のもとで使用しています。
