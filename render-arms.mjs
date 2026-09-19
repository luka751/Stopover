// renders one coat of arms in its own colours for a passport cover; run in its own process so a file that
// crashes the image library is just skipped
import sharp from 'sharp';
const [src, out] = process.argv.slice(2);
await sharp(src, { density: 200 }).resize(150, 150, { fit: 'inside' }).webp({ quality: 82, alphaQuality: 90 }).toFile(out);
