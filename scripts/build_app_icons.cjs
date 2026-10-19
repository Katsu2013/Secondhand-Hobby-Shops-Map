/** @file 承認されたSVGから各サイズのアイコンを生成し、配信ファイル間の図柄のずれを防ぎます。 */
const fs = require('node:fs/promises');
/** 実行ディレクトリに依存せず公開アセットを更新するためのパス操作。 */
const path = require('node:path');
/** 手動生成時だけ利用するSVGレンダラー。CIとブラウザでは生成済みファイルを使います。 */
const sharp = require('sharp');
/** SVGを含む公開ディレクトリ。 */
const publicDir = path.resolve(__dirname, '../public');

/**
 * PNGと、PNG形式の画像を3サイズ格納したICOを単一のSVGから生成します。
 * @returns 生成ファイルの保存完了を表すPromise
 */
async function buildAppIcons() {
  /** タブ・タッチアイコン・プレビューで必要なサイズと保存先。 */
  const outputs = new Map([
    [16, 'favicon-16x16.png'], [32, 'favicon-32x32.png'], [48, null],
    [180, 'apple-touch-icon.png'], [512, 'app-icon-512.png'],
  ]);
  /** ICO内の画像データ。ブラウザ側で適切なサイズを選択できるようにします。 */
  const frames = [];
  for (const [size, filename] of outputs) {
    /** 大きく描画してから縮小し、小サイズの輪郭を滑らかにします。 */
    const png = await sharp(path.join(publicDir, 'favicon.svg'), { density: 384 })
      .resize(size, size).png().toBuffer();
    if (filename) await fs.writeFile(path.join(publicDir, filename), png);
    if (size <= 48) frames.push({ size, png });
  }
  /** ICOのヘッダーと画像ディレクトリ。各画像は透過を保つPNGとして格納します。 */
  const directory = Buffer.alloc(6 + frames.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  /** 各PNGのファイル先頭からの格納位置。 */
  let offset = directory.length;
  frames.forEach(({ size, png }, index) => {
    /** サイズごとのディレクトリエントリ位置。 */
    const entry = 6 + index * 16;
    directory[entry] = size;
    directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([directory, ...frames.map(frame => frame.png)]));
  console.log('Generated favicon.ico (16/32/48), PNG (16/32/180/512) from public/favicon.svg');
}

buildAppIcons().catch(error => { console.error(error); process.exitCode = 1; });
