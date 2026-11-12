// Downloads public reference assets into this checkout. Does not publish or modify remote sites.
import { mkdir, writeFile } from 'node:fs/promises';
const directory = 'public/demo-assets';
await mkdir(directory, { recursive: true });
async function download(url, filename) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Asset unavailable: ${filename}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 5_000_000) throw new Error(`Asset too large: ${filename}`);
  await writeFile(directory + '/' + filename, bytes);
  console.log(filename + ': ' + bytes.length + ' bytes');
}
for (const [path, filename] of [
  ['assets/images/manuelindex.png', 'manuel-portrait.png'],
  ['assets/images/logo-es.png', 'manuel-logo.png'],
  ['assets/images/books/la-historia-como-pacto.jpg', 'historia-como-pacto.jpg'],
  ['assets/images/books/los-ciclos-de-la-historia.jpg', 'ciclos-de-la-historia.jpg'],
]) await download(new URL(path, 'https://www.mmartinez1122.com/'), filename);
const response = await fetch('https://winetalia.vercel.app/api/catalog');
const data = await response.json();
const products = data.products.filter(p => p.available && p.kind === 'wine' && p.image_key).slice(0, 8);
const images = {};
for (let i = 0; i < products.length; i++) {
  const product = products[i], filename = `wine-${i + 1}.png`;
  await download(product.image_key, filename);
  images[product.id] = '/demo-assets/' + filename;
}
await writeFile('lib/demo-images.json', JSON.stringify(images, null, 2) + '\n');
