export const MAX_AVATAR_BYTES = 2_000_000;
export const MAX_AVATAR_SIDE = 512;
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export async function validateAvatarPng(bytes: Uint8Array) {
  const fail = (): never => { throw new Error('La imagen no es un PNG optimizado válido. Vuelve a seleccionarla desde tu equipo.'); };
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) throw new Error('La imagen debe pesar hasta 2 MB.');
  if (bytes.length < 57 || !signature.every((v, i) => bytes[i] === v)) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), data: Uint8Array[] = [];
  let pos = 8, width = 0, height = 0, channels = 0, ended = false, chunks = 0, dataEnded = false;
  while (pos + 12 <= bytes.length) {
    if (++chunks > 1024) fail();
    const length = view.getUint32(pos), end = pos + 12 + length;
    if (end > bytes.length) fail();
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || crc(bytes.subarray(pos + 4, pos + 8 + length)) !== view.getUint32(pos + 8 + length)) fail();
    if (pos === 8 && type !== 'IHDR') fail();
    if (type === 'IHDR') {
      if (pos !== 8 || length !== 13) fail();
      width = view.getUint32(pos + 8); height = view.getUint32(pos + 12);
      if (!width || !height || width > MAX_AVATAR_SIDE || height > MAX_AVATAR_SIDE) throw new Error('La imagen optimizada debe medir hasta 512 × 512 píxeles.');
      const depth = bytes[pos + 16], color = bytes[pos + 17];
      if (depth !== 8 || ![2, 6].includes(color) || bytes[pos + 18] || bytes[pos + 19] || bytes[pos + 20]) fail();
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      if (dataEnded) fail(); data.push(bytes.subarray(pos + 8, pos + 8 + length));
    } else if (type === 'IEND') {
      if (length || !data.length || end !== bytes.length) fail(); ended = true; break;
    } else {
      if (data.length) dataEnded = true;
      // Canvas produces a static raster. Reject animation and unknown critical chunks.
      if (['acTL', 'fcTL', 'fdAT'].includes(type) || (type[0] === type[0].toUpperCase() && type !== 'PLTE')) fail();
    }
    pos = end;
  }
  if (!ended) fail();
  const rowBytes = width * channels + 1, expected = rowBytes * height;
  let decoded = 0;
  const compressed = new Uint8Array(data.reduce((n, b) => n + b.length, 0));
  let offset = 0; for (const part of data) { compressed.set(part, offset); offset += part.length; }
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      if (decoded + value.length > expected) fail();
      for (let i = (rowBytes - decoded % rowBytes) % rowBytes; i < value.length; i += rowBytes) if (value[i] > 4) fail();
      decoded += value.length;
    }
    if (decoded !== expected) fail();
  } catch { throw new Error('No se pudo validar la imagen. Selecciona un PNG, JPG o WebP válido desde el editor.'); }
  finally { await reader.cancel().catch(() => {}); }
  return { width, height, mime: 'image/png' as const };
}
