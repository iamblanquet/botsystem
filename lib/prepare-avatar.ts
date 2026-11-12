import { MAX_AVATAR_BYTES, MAX_AVATAR_SIDE } from './avatar-image';
import { avatarDrawRect, type AvatarCrop } from './avatar-crop';
export async function readAvatar(file: File): Promise<ImageBitmap> {
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error('Elige una imagen de hasta 2 MB.');
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) throw new Error('Formatos admitidos: PNG, JPG y WebP.');
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); } catch { throw new Error('No se pudo abrir la imagen. Prueba con otro archivo PNG, JPG o WebP.'); }
  try {
    if (!image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > 32_000_000) throw new Error('La imagen es demasiado grande. Usa una de hasta 8192 píxeles por lado y 32 megapíxeles.');
    return image;
  } catch (e) { image.close(); throw e; }
}
export function drawAvatar(canvas: HTMLCanvasElement, image: ImageBitmap, crop: AvatarCrop) {
  canvas.width = MAX_AVATAR_SIDE; canvas.height = MAX_AVATAR_SIDE;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('El navegador no pudo preparar la imagen.');
  const rect = avatarDrawRect(image.width, image.height, crop, MAX_AVATAR_SIDE);
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, rect.left, rect.top, rect.width, rect.height);
}
export async function prepareAvatar(image: ImageBitmap, name: string, crop: AvatarCrop): Promise<File> {
  const canvas = document.createElement('canvas'); drawAvatar(canvas, image, crop);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo preparar la imagen.')), 'image/png'));
  if (blob.size > MAX_AVATAR_BYTES) throw new Error('La imagen optimizada supera 2 MB. Prueba con una imagen más pequeña.');
  return new File([blob], name.replace(/\.[^.]+$/, '').slice(0, 130) + '-avatar.png', { type: 'image/png' });
}
