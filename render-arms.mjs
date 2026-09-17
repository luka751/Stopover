// renders one coat of arms as a gold emblem; run in its own process so a file that crashes the image library is just skipped
import sharp from 'sharp';
const [src, out] = process.argv.slice(2);
await sharp(src, { density: 200 }).resize(150, 150, { fit: 'inside' }).greyscale().tint('#E3BD5A').webp({ quality: 80 }).toFile(out);
