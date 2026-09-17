// Picture maps, as equirectangular world images the map reprojects as it draws.
//   maps/nightlights.jpg  NASA Black Marble 2016 (city lights at night)
//   maps/grey.jpg         Natural Earth Gray Earth with shaded relief and ocean bottom
// Downloads are cached in cache/raster; outputs go to dist/maps.
import fs from 'node:fs'; import { execSync } from 'node:child_process'; import sharp from 'sharp';
const UA = 'StopoverGeographyGame/2.0 (personal non-commercial geography game; contact: luka.beradze.mail@gmail.com)';
fs.mkdirSync('cache/raster', { recursive: true }); fs.mkdirSync('dist/maps', { recursive: true });
async function get(url, file) {
  const out = 'cache/raster/' + file;
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return out;
  console.log('downloading', url);
  // curl resumes and retries: NASA's big images often drop mid-transfer
  execSync(`curl -sSfL --retry 8 --retry-all-errors -C - -A "${UA}" -o ${out}.part "${url}" && mv ${out}.part ${out}`, { stdio: 'inherit' });
  return out;
}
const W = 8192, H = 4096;
sharp.cache(false);
const big = { limitInputPixels: false };

// ---- picture maps
{
  const src = await get('https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg', 'BlackMarble_2016_3km.jpg');
  await sharp(src, big).resize(W, H, { fit: 'fill' }).jpeg({ quality: 82, mozjpeg: true }).toFile('dist/maps/nightlights.jpg');
  console.log('nightlights');
}
{
  const zip = await get('https://naciscdn.org/naturalearth/50m/raster/GRAY_50M_SR_OB.zip', 'GRAY_50M_SR_OB.zip');
  if (!fs.existsSync('cache/raster/GRAY_50M_SR_OB/GRAY_50M_SR_OB.tif')) execSync(`unzip -o -q ${zip} -d cache/raster/GRAY_50M_SR_OB`);
  const tif = fs.readdirSync('cache/raster/GRAY_50M_SR_OB', { recursive: true }).find(f => f.endsWith('.tif'));
  await sharp('cache/raster/GRAY_50M_SR_OB/' + tif, big).resize(W, H, { fit: 'fill' }).toColourspace('srgb').jpeg({ quality: 82, mozjpeg: true }).toFile('dist/maps/grey.jpg');
  console.log('grey');
}

for (const f of fs.readdirSync('dist/maps')) console.log(f, (fs.statSync('dist/maps/' + f).size / 1e6).toFixed(2) + 'MB');
