# 全国中古ショップ巡礼マップ 設計仕様書 (SPECIFICATION.md)

## 1. アプリケーション概要・目的
- **目的**: Googleマップをベースに、ハードオフ、ホビーオフ、駿河屋などの中古ショップまでどのくらいの時間で行けるかが一目でわかり、**毎回検索ワードを入力しなくても地図を動かしながら全国の中古ショップを巡れるウェブアプリ**。
- **基本コンセプト**:
  - 通常のGoogleマップと同様の操作感で扱えること。
  - オプション画面から **「店舗チェーンのオン・オフ」「扱っているカテゴリリストのオン・オフ」「アクセス手段の選択」** ができること。
  - 画面内に表示されている全店舗への「おおよその所要時間」を常時一括表示し、クリック時には正確なルート・所要時間を表示できること。
  - 地図上の店舗ピンは、ハードオフ公式アプリの店舗検索のように **「どの位置にどの店舗があるか白い吹き出しバルーンの中に各店舗のブランドロゴ看板を縦積み（スタック）表示する形式」** とすること。

---

## 2. 対象店舗チェーンとロゴマーク・カラー仕様

### 2.1 対象チェーン一覧
1. **ハードオフ (HARD OFF)**（楽器館・工具館・PC館・カメラ館含む）
2. **オフハウス (OFF HOUSE) / モードオフ (MODE OFF) / ガレージオフ (GARAGE OFF) / リカーオフ (LIQUOR OFF)**（アウトドア専門店含む）
3. **ホビーオフ (HOBBY OFF)**（トレカ専門館含む）
4. **ブックオフ (BOOKOFF / BOOKOFF SUPER BAZAAR / BOOKOFF PLUS)**
5. **駿河屋 (SURUGAYA)**（リアルストア / フレンドリーショップ）
6. **らしんばん / まんだらけ / メロンブックス / アニメイト**（アニメ・同人系）
7. **ゲオ (GEO) / 古本市場 (ふるいち) / お宝創庫 / 万代・マンガ倉庫**（総合リユース・ゲーム系）
8. **鑑定団**（千葉鑑定団・茨城鑑定団・静岡鑑定団・富士鑑定団・酒々井鑑定団など）

### 2.2 各社ロゴプレート（バルーン内表示）の配色・デザイン指定
ハードオフ公式アプリのバルーン表示に準拠し、同一敷地・同一ビル内の複合店舗は1つの白い吹き出しバルーン内に縦並びでスタック表示する。各ブランドのカラーコードおよびデザイン仕様は以下の通り：

| ブランド名 | 背景色 | 文字色・アクセント仕様 | 参考ロゴ画像URL・備考 |
| :--- | :--- | :--- | :--- |
| **ハードオフ (`HARD・OFF`)** | 青 `#004098` | 黄色文字 `#fff000` / 中点 `・` および上部3連アーチドットも黄色 `#fff000` | `https://www.hardoff.co.jp/assets/img/gyotai_panel/gyotai_only_reuse_square_2024-f5610d5f4c.png` |
| **オフハウス (`OFF HOUSE`)** | 緑 `#007440` | 白文字 `#ffffff` / 上部3連アーチドットも白 `#ffffff` | ハードオフ公式業態パネル準拠 |
| **ホビーオフ (`Hobby OFF`)** | 赤 `#e50012` | 黄色文字 `#fff100` / 上部3連アーチドットも黄色 `#fff100` | ハードオフ公式業態パネル準拠 |
| **モードオフ (`MODE OFF`)** | 赤 `#e50012` | 白文字 `#ffffff` | ハードオフ公式業態パネル準拠 |
| **リカーオフ (`Liquor OFF`)** | ワインレッド `#a72642` | 白文字 `#ffffff` | ハードオフ公式業態パネル準拠 |
| **ガレージオフ (`Garage OFF`)** | 青 `#004098` | 黄色文字 `#fff000` / 上部3連アーチドットも黄色 `#fff000` | ハードオフ公式業態パネル準拠 |
| **ブックオフ通常店 (`BOOK・OFF`)** | 黄色 `#fff000` | 青文字 `#003894` / **中点 `・` も青 `#003894`**（取扱：古本・CD・ゲーム・トレカ・ホビー） | `https://play-lh.googleusercontent.com/KfIGHDr3bpaRmB_xXwGA0b5tO6gt5ryID8OXuDiT71jJCWPw6bo6zQKcloJGMKsC8VLdeSwu0Fkklt12ESb5GT4` |
| **ブックオフ スーパーバザール (`BOOK・OFF SUPER BAZAAR`)** | オレンジ `#ee7a00` | 濃紺文字・中点 `#043459` / 下部左に濃紺帯 `#043459`＋オレンジ文字 `SUPER`、右に濃紺文字 `BAZAAR`（取扱：本・ゲーム・トレカ・ホビーに加えPC・家電・楽器・オーディオ・服飾等フルラインナップ） | `https://mitsui-shopping-park.com/lalaport/tokyo-bay/shopguide/3140178/image1.png` |
| **ブックオフ プラス (`BOOK・OFF PLUS+`)** | オレンジ `#ee7a00` | 濃紺文字・中点 `#043459` / 下部に濃紺帯 `#043459`＋オレンジ文字 `#ee7a00` で `PLUS+`（取扱：通常店＋アパレル・家電等の中型複合） | `https://hotkochi.co.jp/files/bookoff.jpg` |
| **駿河屋 (`駿河屋`)** | 青 `#1d2089` | 白文字 `#ffffff` | `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTKdsPYbGWxI8ZKia9S-S7b8jD4KZjVHqWFOvEVoRaHxA&s=10` |
| **らしんばん (`らしんばん`)** | 水色 `#00b8ee` | 白文字 `#ffffff` | `https://www.tocotocosquare.com/img/lg_406.png` |
| **まんだらけ (`まんだらけ`)** | 白 `#ffffff` | 赤いロゴマーク `#fe0000` ＋ 黒文字 `#000000`（メイン）<br>※白背景に赤文字の場合もあり | 公式ロゴ仕様準拠 |
| **メロンブックス (`メロンブックス`)** | 白 `#ffffff` | 緑文字 `#18bd67` | `https://upload.wikimedia.org/wikipedia/commons/e/e9/Melonbooks_logo.svg` |
| **アニメイト (`animate`)** | 青 `#335eac` | 白文字 `#ffffff` / **`i` だけ黄色 `#fcc900`** | `https://sevenpark-kashiwa.ario.jp/app/23/img/tenant/2300000004/a_animate.jpg` |
| **ゲオ (`GEO`)** | 黄色 `#fed600` | 青（濃紺）文字・幾何学ロゴマーク `#192a59` | `https://play-lh.googleusercontent.com/g0N7z8YQ6kU6Yo-Ii1GQuKal738KcdVxOAwzTQlKdwK6PR6K_9aHnV0FajoCDPmoyKAlyfJMN9sfv7UcGADNs3Y` |
| **古本市場 (`古本市場`)** | 黄色 `#f6b020` | 赤文字 `#e50024` | 公式看板配色準拠 |
| **お宝創庫 (`お宝創庫`)** | 白 `#ffffff` | 黒文字 `#000000` | 公式ロゴ配色準拠 |
| **鑑定団 (`鑑定団`)** | 黒 `#000000` | 白文字 `#ffffff` | 公式看板配色準拠 |
| **万代 / マンガ倉庫** | 黒 `#111827` | 黄色文字 `#facc15` | 看板配色準拠 |

---

## 3. 機能要件・オプション仕様

### 3.1 扱っているカテゴリリスト（ON/OFF 切り替え）
- `retro_game`: **レトロゲーム・TVゲーム**
- `figure_hobby`: **フィギュア・プラモデル・ホビー**
- `tcg`: **トレーディングカード（トレカ）**
- `pc_junk`: **PCパーツ・ジャンク品・家電**
- `audio_inst`: **オーディオ・楽器**
- `book_media`: **古本・CD・DVD・アニメグッズ**
- **絞り込み条件**: 「いずれかを含む (OR)」と「すべて含む (AND)」を切り替え可能。

### 3.2 アクセス手段の選択（所要時間＆ルート計算）
- `DRIVING_TOLL`: **車（有料道路優先）**
- `DRIVING_NO_TOLL`: **車（一般道優先 / 有料道路回避）**
- `TRANSIT`: **公共交通機関（電車・バス）**
- `BICYCLING`: **自転車**
- `WALKING`: **徒歩**

### 3.3 所要時間の表示方式
- **常時一括表示（概算）**:
  - 画面内に表示されている全店舗への「おおよその所要時間」を、地図上のバルーン上部および右側の店舗一覧リストに常時表示する（API通信量を抑えるため、直線距離×道路迂回係数×移動手段別速度モデルから即時算出）。
  - オプションでバルーン上の時間表示のON/OFF、および出発地からの到達時間目安サークル（15分/30分/60分圏）のON/OFFが可能。
- **正確ルート表示（クリック時 & 巡回ハシゴルート）**:
  - 店舗バルーンまたはリストの「ルート表示」をクリックした際、Google Maps Directions API（またはOSRM）を用いて実際のルートを描画し、正確な所要時間・距離を表示する。
  - 複数店舗を選択して巡回（ハシゴ）ルートを作成し、本家Googleマップナビへ経由地付きで連携できる。

---

## 4. 店舗データベースと位置情報の精度仕様
- **基本方針**:
  - 単なるOpenStreetMapの未検証データでは「含まれていない店舗」や「位置ズレ（特に駿河屋など）」が発生するため、**各チェーン公式サイトの店舗一覧（一次情報）から取得した正確な住所データを、国土地理院の公式アドレス検索API（`https://msearch.gsi.go.jp/address-search/AddressSearch`）で番地レベルまでジオコーディングしたデータ** をプリセットデータベース（`data/shops.json`）として収録する。
- **公式データ収録元（合計 2,504 拠点、複合店統合済み）**:
  - **駿河屋**: `https://www.suruga-ya.jp/feature/shoplist/index.html`（リアルストア全119店）および `shoplist-friendly/index.html`（フレンドリーショップ全58店）
  - **ハードオフグループ**: `https://www.hardoff.co.jp/shop/`（ハードオフ・オフハウス・ホビーオフ・ブックオフFC・モードオフ・ガレージオフ・リカーオフ等の営業中全1,098店舗、閉店済み除外）
  - **ブックオフ直営・全店（BOOKOFF / BOOKOFF PLUS / BOOKOFF SUPER BAZAAR）**: 公式店舗検索API `https://as.blue.asp.appirits.com/bookoff2/search.json`（現役706店舗：通常店572店 / PLUS 74店 / SUPER BAZAAR 60店、閉店済み除外、各店の実際の取扱商品コード `product_parents_sell` に基づくカテゴリ自動マッピング済）
  - **ゲオ (GEO)**: ゲオ公式店舗一覧 `https://geo-mobile.jp/store/`（現役816店舗、閉店済み除外）
  - **らしんばん**: `https://api.lashinbang.com/api/get_store`（国内全73店舗）
  - **古本市場・ふるいち**: `https://www.furu1.net/shop/`（国内全181店舗）
  - **お宝創庫グループ**: `https://www.otakarasouko.com/store/`（国内全52店舗）
- **Google Maps Platform 連携**:
  - ユーザーが Google Maps APIキーを設定した場合は、本家 `google.maps.Map` 上にカスタム `OverlayView` で同じブランド看板スタック型バルーンを描画し、`DirectionsService`（ルート検索）および `PlacesService`（周辺店舗リアルタイム自動探索）を利用可能にする。

---

## 5. 技術スタック・本番デプロイ構成およびコーディング規約（必須事項）

### 5.1 技術スタック・GitHub Pages 本番運用構成
- **言語**: **TypeScript**（Strictモード有効）
- **フレームワーク**: **React 18 + Vite**（`vite.config.ts` にて `base: './'` 相対パスビルド設定済）
- **ドキュメント生成**: **TypeDoc** 対応コメント形式（`npm run docs` で `docs/typedoc/` にAPI仕様書HTMLを自動生成）
- **GitHub Pages 自動デプロイ**:
  - `.github/workflows/deploy.yml` を同梱。GitHubへそのままコミット＆プッシュし、リポジトリの **Settings > Pages > Source** を **「GitHub Actions」** に設定するだけで、TypeScriptのビルドから `dist/` の公開まで全自動で行われる。
  - **APIキーのセキュリティ**: ソースコードやリポジトリ内には Google Maps APIキーを一切含めない。APIキー未設定でも内蔵マップ＋OSRMルート計算で100%機能し、本家Googleマップを利用する場合は各ユーザーのブラウザの `localStorage` にのみ保存される（さらに Google Cloud Console 側で HTTPリファラー制限を設定することで第三者による不正利用を完全に防止可能）。

### 5.2 コーディング規約（絶対遵守）
1. **TypeDocコメント（`/** ... */`）の完全徹底**
   - すべての **インターフェース (`interface`)、型エイリアス (`type`)、クラス (`class`)、関数 (`function` / アロー関数)、Reactコンポーネント、Propsのプロパティ、変数、定数、引数 (`@param`)、戻り値 (`@returns`)** に対して、省略せず必ずTypeDoc形式のコメントを記述すること。
2. **処理内容と背景理由（What / Why）のコメント記述**
   - 単なるコードの言い換えではなく、「ここで何をしているか（What）」「なぜこの処理・分岐・補正が必要なのか（Why）」を、後からコードを確認・保守する際に追いやすいよう詳細な日本語コメントとして必ず記載すること。
