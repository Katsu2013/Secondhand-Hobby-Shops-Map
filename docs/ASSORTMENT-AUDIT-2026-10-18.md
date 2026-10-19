# 店舗別取扱商品・ロゴ確認記録（2026-10-18）

本書の店舗数・テスト数はPC専門4チェーン追加前の調査時点の記録です。現在の収録数・仕様は[SPECIFICATION.md](../SPECIFICATION.md)の4.1・11・12章を参照してください。

2026-10-19追記：通常ゲオの取得元がモバイル部門に限定される問題を再点検しました。最新の制限・取得処理・残作業は[再点検記録](GEO-ASSORTMENT-REVIEW-2026-10-19.md)を参照してください。


元データの系列共通タグを廃止し、店舗別の公式販売情報へ置換した。対象は2,514ピン。既存のピンIDは維持した。

- 公式掲載情報あり（confirmed）: 1,551ピン
- 一部分野・構成店・フロア等を確認（partial）: 817ピン
- 未確認（unverified）: 146ピン

confirmedでも全詳細商品・実在庫の保証ではない。公表されていない分類を推測で追加しない。未確認は「取扱なし」や「情報が公表されていない」という断定ではなく、現在の取得・検証方式で根拠を記録できていない状態。独自サイト・画像・個別記事等で公表している店舗もあるため、残りを確認済みとは報告しない。

## 主な修正

- ゲオモバイルを通常ゲオから分離。スマホだけと断定せず、公式に中古PCも掲載される店舗はPCを含める。[札幌狸小路4丁目店の公式情報](https://geo-mobile.jp/store/03607.html)
- ブックオフの「買いたい」販売欄を使用し、非取扱の項目と業態別の標準保証を除外。
- 古本市場の買取・レンタル列、お宝創庫の買取のみ欄を販売品目に混入させない。
- 「ゲーム」「ホビー」の公表からレトロ/現行や全ホビー詳細へ拡大しない。
- 併設ピンでも、OFFにした系列の商品が別系列の取扱いとして残らないよう構成店別に絞り込み。
- 各出典に構成店舗名・確認日を残し、カードから公式情報を開ける。
- ゲオオンラインは確認時点でメンテナンス中のページがある。通常ゲオはモバイル部門の公開情報だけならpartialとし、ゲーム等を補完しない。[公式メンテナンスページ](https://geo-online.co.jp/maintenance/index.html)

## ブランド別の反映範囲

複合ピンは複数のブランドに数えるため、列の合計は総ピン数と一致しない。確認状態はピン全体の状態。

| ブランドID | 掲載情報あり | 一部確認 | 未確認 | 看板 |
| --- | ---: | ---: | ---: | --- |
| animate | 0 | 105 | 14 | 公式画像 |
| bookoff | 553 | 21 | 3 | 公式画像 |
| bookoff_plus | 74 | 0 | 0 | 公式画像 |
| bookoff_sb | 55 | 3 | 0 | 公式画像 |
| ecotool | 7 | 0 | 0 | 公式画像 |
| furuichi | 78 | 1 | 0 | 公式画像 |
| furuiti | 91 | 2 | 0 | 公式画像 |
| garageoff | 17 | 0 | 0 | 公式画像 |
| geo | 0 | 681 | 1 | 公式画像 |
| geo_mobile | 124 | 6 | 0 | 公式画像 |
| hardoff | 433 | 14 | 1 | 公式画像 |
| hobbyoff | 183 | 14 | 2 | 公式画像 |
| kanteidan | 0 | 0 | 22 | 名称表記 |
| lashinbang | 37 | 28 | 0 | 公式画像 |
| liquoroff | 3 | 1 | 0 | 公式画像 |
| mandai | 0 | 0 | 5 | 公式画像 |
| mandaishoten | 0 | 0 | 3 | 名称表記 |
| mandarake | 0 | 5 | 7 | 公式画像 |
| mangasouko | 0 | 0 | 15 | 名称表記 |
| medio | 3 | 0 | 0 | 公式画像 |
| melonbooks | 13 | 13 | 0 | 公式画像 |
| modeoff | 16 | 0 | 0 | 公式画像 |
| offhouse | 320 | 15 | 0 | 公式画像 |
| ojamakan | 9 | 1 | 0 | 公式画像 |
| otakarasouko | 15 | 1 | 1 | 公式画像 |
| preyz | 13 | 1 | 0 | 公式画像 |
| surugaya | 62 | 22 | 75 | 公式画像 |
| torekapark | 4 | 1 | 0 | 公式画像 |

## ロゴ

25業態の公式画像を保存し、無加工で表示する。ゲオモバイルは黄緑色。アニメイトの綴り・ロゴ、お宝創庫系列、ふるいち等も公式画像へ置換。白抜きロゴの可読性と画像の読み込みをブラウザで確認した。万代書店・マンガ倉庫・鑑定団は地域差・運営差を一律のマークに置換せず名称表記とした。

出典・確認日・ファイルハッシュ: [ブランド画像一覧](../public/brands/sources.json)。[表示確認画像](brand-preview-2026-10-18.png)。

## 未確認店舗

以下は推測タグを除去し、全選択ORのときは地図に残す。個別品目の検索には使わない。

| ピンID | 店舗名 |
| --- | --- |
| geo_off_418 | ゲオ名古屋守山店 |
| ho_201474 | ハードオフ大垣店 / ホビーオフ大垣店 |
| ho_202024 | ブックオフ札幌伏古店 |
| ho_202030 | ブックオフ札幌川下店 |
| ho_202039 | ブックオフ菊水ロジ店（ネット販売） |
| ho_208167 | ホビーオフ清水岡町店 |
| kanteidan_off_1 | 千葉鑑定団 酒々井店 |
| kanteidan_off_10 | 水戸鑑定団 本店 |
| kanteidan_off_11 | 静岡鑑定団 八幡店 |
| kanteidan_off_12 | 新清水鑑定団 |
| kanteidan_off_13 | 藤枝鑑定団 |
| kanteidan_off_14 | 富士鑑定団 |
| kanteidan_off_15 | 浜松鑑定団 |
| kanteidan_off_16 | 浜北鑑定団 |
| kanteidan_off_17 | ガラクタ鑑定団 小山総本店 |
| kanteidan_off_18 | ガラクタ鑑定団 白沢店 |
| kanteidan_off_19 | 宇都宮鑑定団 江曽島店 |
| kanteidan_off_2 | 千葉鑑定団 八千代店 |
| kanteidan_off_20 | ガラクタ鑑定団 スーパーモールカンケンプラザ店 |
| kanteidan_off_21 | ハーマン高根沢鑑定団 |
| kanteidan_off_22 | ハーマン今市鑑定団 |
| kanteidan_off_3 | 千葉鑑定団 東金店 |
| kanteidan_off_4 | 千葉鑑定団 千葉中央店 |
| kanteidan_off_5 | 千葉鑑定団 船橋店 |
| kanteidan_off_6 | 千葉鑑定団 松戸店 |
| kanteidan_off_7 | 千葉鑑定団アウトレット まちの中古屋さん 八街店 |
| kanteidan_off_8 | 茨城鑑定団 神栖店 |
| kanteidan_off_9 | 茨城鑑定団 佐原東店 |
| osm_n_10296757364 | まんだらけ |
| osm_n_11733015904 | アニメイト |
| osm_n_11807315959 | まんだらけ 京都店 |
| osm_n_12189241805 | 万代 新青森店 |
| osm_n_13028137058 | アニメイト |
| osm_n_13060991057 | アニメイト |
| osm_n_13788623359 | アニメイト |
| osm_n_14091699600 | アニメイト |
| osm_n_3166174419 | まんだらけ ラララ 池袋店 |
| osm_n_3947488761 | まんだらけ グランドカオス |
| osm_n_3948030738 | まんだらけ うめだ店 |
| osm_n_4496692190 | 万代 仙台泉店 |
| osm_n_4757163392 | マンガ倉庫 都城店 |
| osm_n_4800530722 | まんだらけ 福岡店 |
| osm_n_4931781523 | 万代 多賀城店 |
| osm_n_4931790421 | 万代 仙台南店 |
| osm_n_4932414621 | マンガ倉庫泡瀬店 |
| osm_n_5090809623 | マンガ倉庫 鹿児島店 |
| osm_n_5858764589 | まんだらけ SAHRA |
| osm_n_5875758786 | アニメイト 池袋本店 / ACOS 秋葉原 |
| osm_n_5888142104 | アニメイト イオンいわき |
| osm_n_5888147365 | アニメイト 新千歳空港 |
| osm_n_5899709782 | アニメイト 柏 |
| osm_n_5913920603 | ACOS 名古屋 |
| osm_n_5913920897 | アニメイト |
| osm_n_6586943205 | アニメイト ホンデ店 홍대점 |
| osm_n_7159278515 | 万代書店岩槻店 |
| osm_w_104520924 | マンガ倉庫 |
| osm_w_1136697826 | マンガ倉庫 |
| osm_w_1155142793 | マンガ倉庫 太宰府店 |
| osm_w_1296720544 | マンガ倉庫 佐々店 |
| osm_w_1298281216 | マンガ倉庫 |
| osm_w_1298325975 | マンガ倉庫 |
| osm_w_1376964001 | マンガ倉庫 |
| osm_w_279933012 | 万代書店 川越店 |
| osm_w_477511526 | 万代 北見店 |
| osm_w_479222022 | 万代書店 |
| osm_w_503151546 | マンガ倉庫 |
| osm_w_538577683 | マンガ倉庫 浦添店 |
| osm_w_540661445 | マンガ倉庫　富山店 |
| osm_w_552657455 | マンガ倉庫 大分東店 |
| osm_w_555898105 | マンガ倉庫 別館 |
| ota_off_32 | ジモティースポット半田 |
| surugaya_off_102 | ブックマーケット田辺店 / ブックマーケット田辺店 (駿河屋FS) |
| surugaya_off_103 | ブックマーケット打田店 / ブックマーケット打田店 (駿河屋FS) |
| surugaya_off_107 | 駿河屋 梅田ロフト店 / アニメイト |
| surugaya_off_108 | 駿河屋 梅田茶屋町店 |
| surugaya_off_109 | 駿河屋 オタロードアニメ・ホビー館 |
| surugaya_off_114 | 駿河屋 高槻店 |
| surugaya_off_115 | 駿河屋 高槻店トレカ館 |
| surugaya_off_119 | 駿河屋 甲府店 |
| surugaya_off_121 | ブックマーケット・エーツー三河安城店 (駿河屋FS) |
| surugaya_off_122 | ブックマーケット・エーツー豊川店 (駿河屋FS) |
| surugaya_off_123 | エンターキング 南行徳店 Supported by 駿河屋・買取センター |
| surugaya_off_124 | 桃太郎王国 松戸五香店 Supported by 駿河屋 |
| surugaya_off_125 | 桃太郎王国 習志野店 Supported by 駿河屋 |
| surugaya_off_126 | 桃太郎王国 西船橋店 Supported by 駿河屋 |
| surugaya_off_127 | 桃太郎王国 新松戸店 Supported by 駿河屋 |
| surugaya_off_128 | 桃太郎王国 市原店 Supported by 駿河屋 |
| surugaya_off_129 | ゼストｘ桃太郎王国 木更津店 Supported by 駿河屋 |
| surugaya_off_130 | ブックス エーツー中山店 (駿河屋FS) |
| surugaya_off_132 | ブックマーケット いわき平店 Supported by 駿河屋・買取センター |
| surugaya_off_133 | ブックマーケット うねめ通り店 Supported by 駿河屋・買取センター |
| surugaya_off_134 | ブックマーケット原町店 (駿河屋FS) |
| surugaya_off_135 | バンダレコード 福島西道路店 Supported by 駿河屋 |
| surugaya_off_136 | ブックマーケット 函館美原店 Supported by 駿河屋・買取センター |
| surugaya_off_138 | 玉光堂 小樽本店 Supported by 駿河屋 |
| surugaya_off_140 | 本の森 垂水店 Supported by 駿河屋 |
| surugaya_off_141 | バリQ 古河ホビー館 Supported by 駿河屋 |
| surugaya_off_142 | ブックマーケット東金沢店 (駿河屋FS) |
| surugaya_off_143 | ブックマーケット野々市新庄店 (駿河屋FS) |
| surugaya_off_144 | バンダレコード 矢巾店 Supported by 駿河屋 |
| surugaya_off_145 | ゲームステーション 本厚木店 Supported by 駿河屋 |
| surugaya_off_146 | ゲームステーション 上大岡店 Supported by 駿河屋 |
| surugaya_off_147 | 桃太郎王国 本厚木店 Supported by 駿河屋 / アニメイト 本厚木 |
| surugaya_off_148 | ゼスト 相模原店 Supported by 駿河屋 |
| surugaya_off_149 | ゼスト 横浜戸塚店 Supported by 駿河屋 |
| surugaya_off_150 | ワットマンホビー サクラス戸塚店 Supported by 駿河屋 |
| surugaya_off_152 | ワットマンホビー OSC湘南シティ店 Supported by 駿河屋 |
| surugaya_off_153 | 桃太郎王国 相模原橋本店 Supported by 駿河屋 |
| surugaya_off_154 | バンダレコード イオン金沢八景店 Supported by 駿河屋 |
| surugaya_off_155 | エーツー金閣寺店 (駿河屋FS) |
| surugaya_off_156 | ブックマーケット天理店 (駿河屋FS) |
| surugaya_off_157 | ブックマーケット別府店 (駿河屋FS) |
| surugaya_off_158 | ブックマーケット・エーツー住之江店 (駿河屋FS) |
| surugaya_off_159 | 買取りまっくす松原店 Supported by 駿河屋 |
| surugaya_off_161 | 桃太郎王国 草加バイパス店 Supported by 駿河屋 |
| surugaya_off_162 | 桃太郎王国 大宮宮原店 Supported by 駿河屋 |
| surugaya_off_163 | 桃太郎王国 所沢店 Supported by 駿河屋 |
| surugaya_off_164 | ブックマーケット・エーツー坂戸店 (駿河屋FS) |
| surugaya_off_165 | ブックマーケット・エーツー大沢店 (駿河屋FS) |
| surugaya_off_166 | バンダレコード 本川越ぺぺ店 Supported by 駿河屋 |
| surugaya_off_167 | バリQ 沼津店 Supported by 駿河屋 |
| surugaya_off_168 | ブックマーケット・エーツー 南瀬名店 Supported by 駿河屋・買取センター |
| surugaya_off_169 | ブックマーケット・エーツー 袖師店 Supported by 駿河屋・買取センター |
| surugaya_off_170 | エンターキング 西新井店 Supported by 駿河屋・買取センター |
| surugaya_off_171 | ブックマーケット昭島店 (駿河屋FS) |
| surugaya_off_173 | ブックマーケット 高岡店 Supported by 駿河屋 |
| surugaya_off_174 | ブックマーケット上飯野店 (駿河屋FS) |
| surugaya_off_175 | ブックマーケット砺波店 (駿河屋FS) |
| surugaya_off_19 | 駿河屋 GIGA福岡春日店 |
| surugaya_off_26 | 駿河屋 香久山店 |
| surugaya_off_27 | 駿河屋 東海荒尾店 |
| surugaya_off_32 | 駿河屋 イオンタウン郡山店 |
| surugaya_off_35 | 駿河屋 MEGA中筋店 |
| surugaya_off_39 | 駿河屋 溝ノ口店（旧名 駿河屋 文教堂溝ノ口買取センター）｜12/10(木)オープン予定 |
| surugaya_off_4 | 駿河屋 津田沼ビート店 |
| surugaya_off_41 | 駿河屋 小山店 |
| surugaya_off_46 | 駿河屋 神戸兵庫駅前店・兵庫トレカ館/ 駿河屋神戸兵庫買取センター / 駿河屋 兵庫店 知恵蔵書店サイド |
| surugaya_off_53 | 駿河屋 京都寺町店 |
| surugaya_off_66 | 駿河屋 本庄店 |
| surugaya_off_77 | 駿河屋 ＭＥＧＡドン・キホーテ ラパーク宇都宮店 |
| surugaya_off_83 | 駿河屋 馬渕店 |
| surugaya_off_84 | 駿河屋 藤枝店 |
| surugaya_off_86 | 駿河屋 池袋乙女館 Supported by 明輝堂 / 駿河屋 池袋買取センター |
| surugaya_off_89 | 駿河屋 新宿マルイアネックス店 |
| surugaya_off_9 | 駿河屋 大垣店 |
| surugaya_off_98 | 駿河屋
 リブロ南砂町ショッピングセンターSUNAMO店 |

## 検証

販売・買取の分離、非取扱マーク、親分類と詳細分類、未確認店、併設店の系列OFF、既存ID、クリーン環境からの再生成、ルートの回帰を自動テストで確認する。本番ビルド、JSON2ファイルの一致、公式画像のハッシュも検証した。Python 12件・Node 17件（計29件）に成功。ブラウザでゲオモバイルのスマホ販売のみ/中古PC併売の表示と、全28ブランドの表示を確認した。
