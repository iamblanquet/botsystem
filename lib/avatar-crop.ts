export type AvatarCrop = { mode: 'contain' | 'cover'; zoom: number; x: number; y: number };
export const defaultAvatarCrop = (): AvatarCrop => ({ mode: 'contain', zoom: 100, x: 0, y: 0 });
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function avatarDrawRect(width: number, height: number, crop: AvatarCrop, side = 512) {
  if (![width, height, side].every(n => Number.isFinite(n) && n > 0) || ![crop.zoom, crop.x, crop.y].every(Number.isFinite) || !['contain', 'cover'].includes(crop.mode)) throw new Error('El encuadre no es válido. Restablece los ajustes.');
  const fit = crop.mode === 'cover' ? Math.max(side / width, side / height) : Math.min(side / width, side / height);
  const scale = fit * clamp(crop.zoom, 25, 400) / 100, drawWidth = width * scale, drawHeight = height * scale;
  // Keep part of the image inside the canvas, including when it is reduced with transparent padding.
  const visibleX = Math.min(side * .1, drawWidth * .25), visibleY = Math.min(side * .1, drawHeight * .25);
  const left = clamp((side - drawWidth) / 2 + clamp(crop.x, -100, 100) / 100 * side, -drawWidth + visibleX, side - visibleX);
  const top = clamp((side - drawHeight) / 2 + clamp(crop.y, -100, 100) / 100 * side, -drawHeight + visibleY, side - visibleY);
  return { left, top, width: drawWidth, height: drawHeight };
}
