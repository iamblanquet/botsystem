import type { ChatTheme } from './appearance';

// Self contained: also serialized into widget.js so the preview and embed share geometry.
export function launcherPresentation(theme: Partial<ChatTheme>, accent = '#6b59df', assetOrigin = '') {
  const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
  const bound = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  const size = bound(theme.launcherSize, 40, 96, 58), offsetX = bound(theme.launcherOffsetX, 8, 120, 16), offsetY = bound(theme.launcherOffsetY, 8, 120, 24);
  const left = theme.position === 'left', top = theme.launcherVertical === 'top';
  const x = `min(${offsetX}px, max(8px, calc((100% - 320px) / 2)))`;
  const y = `min(${offsetY}px, max(8px, calc((100% - ${size + 372}px) / 2)))`;
  const side = { left: left ? x : 'auto', right: left ? 'auto' : x };
  const requested = theme.launcherLogoMode === 'custom' ? theme.launcherLogoUrl : theme.launcherLogoMode === 'assistant' ? theme.avatarUrl : '';
  const safe = typeof requested === 'string' && requested.length <= 1000 && (/^https:\/\/[^\s]+$/i.test(requested) || (/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(requested) && !requested.includes('..')));
  const logo = safe ? requested.startsWith('/') ? assetOrigin + requested : requested : '';
  const icon = (['sparkles', 'book', 'wine', 'message'] as const).find(value => value === (theme.launcherIcon || theme.avatar)) || 'sparkles';
  const radius = theme.launcherShape === 'square' ? '0px' : theme.launcherShape === 'rounded' ? bound(theme.launcherRadius, 0, 48, 16) + 'px' : '50%';
  const borderStyle = (['none', 'solid', 'dashed', 'dotted'] as const).find(value => value === theme.launcherBorderStyle) || 'solid';
  return {
    size, logo, icon, background: color(theme.launcherColor, color(accent, '#6b59df')), foreground: color(theme.launcherTextColor, color(theme.buttonText, '#ffffff')),
    buttonStyle: { ...side, top: top ? y : 'auto', bottom: top ? 'auto' : y, width: size + 'px', height: size + 'px', borderRadius: radius, borderWidth: bound(theme.launcherBorderWidth, 0, 8, 0) + 'px', borderStyle, borderColor: color(theme.launcherBorderColor, '#ffffff') },
    panelStyle: { ...side, top: top ? `calc(${y} + ${size + 12}px)` : 'auto', bottom: top ? 'auto' : `calc(${y} + ${size + 12}px)`, width: `min(${bound(theme.width, 320, 480, 390)}px, calc(100% - (${x}) - (${x})))`, height: `min(${bound(theme.height, 420, 800, 640)}px, calc(100% - (${y}) - ${size + 24}px))` },
  };
}
