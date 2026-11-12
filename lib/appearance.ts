import { publicWebsite } from './core';
export type ChatTheme = {
  background: string; surface: string; text: string; muted: string; border: string;
  headerBackground: string; headerText: string; assistantBackground: string; assistantText: string;
  userBackground: string; userText: string; buttonText: string;
  font: 'system' | 'serif' | 'rounded'; fontSize: number; radius: number; density: 'comfortable' | 'compact';
  avatar: 'sparkles' | 'book' | 'wine' | 'message' | 'none'; avatarUrl: string; avatarSize: number;
  avatarShape: 'circle' | 'square' | 'rounded'; avatarRadius: number;
  avatarBorderColor: string; avatarBorderWidth: number; avatarBorderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  launcherLogoMode: 'icon' | 'assistant' | 'custom'; launcherLogoUrl: string;
  launcherIcon: 'sparkles' | 'book' | 'wine' | 'message'; launcherColor: string; launcherTextColor: string;
  launcherSize: number; launcherVertical: 'top' | 'bottom'; launcherOffsetX: number; launcherOffsetY: number;
  launcherShape: 'circle' | 'square' | 'rounded'; launcherRadius: number;
  launcherBorderColor: string; launcherBorderWidth: number; launcherBorderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  showSubtitle: boolean; showWelcome: boolean; showSuggestions: boolean; showDay: boolean;
  placeholder: string; flowLabel: string; position: 'left' | 'right'; width: number; height: number;
};
export const fontFamilies = { system: 'Arial, Helvetica, sans-serif', serif: 'Georgia, "Times New Roman", serif', rounded: '"Trebuchet MS", Arial, sans-serif' };
export function contrastingText(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex)) return '#ffffff';
  const [r, g, b] = [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b > .179 ? '#171717' : '#ffffff';
}
export function defaultTheme(accent = '#6b59df'): ChatTheme {
  return { background: '#ffffff', surface: '#ffffff', text: '#3d3548', muted: '#796c86', border: '#e5dfec', headerBackground: accent, headerText: contrastingText(accent), assistantBackground: '#f3f1f6', assistantText: '#4c4358', userBackground: accent, userText: contrastingText(accent), buttonText: contrastingText(accent), font: 'system', fontSize: 13, radius: 12, density: 'comfortable', avatar: 'sparkles', avatarUrl: '', avatarSize: 38, avatarShape: 'rounded', avatarRadius: 12, avatarBorderColor: '#e5dfec', avatarBorderWidth: 1, avatarBorderStyle: 'solid', launcherLogoMode: 'icon', launcherLogoUrl: '', launcherIcon: 'sparkles', launcherColor: accent, launcherTextColor: contrastingText(accent), launcherSize: 58, launcherVertical: 'bottom', launcherOffsetX: 16, launcherOffsetY: 24, launcherShape: 'circle', launcherRadius: 16, launcherBorderColor: '#ffffff', launcherBorderWidth: 0, launcherBorderStyle: 'solid', showSubtitle: true, showWelcome: true, showSuggestions: true, showDay: false, placeholder: 'Escribe tu mensaje…', flowLabel: 'Elige por dónde empezar', position: 'right', width: 390, height: 640 };
}
const colorKeys = ['background', 'surface', 'text', 'muted', 'border', 'headerBackground', 'headerText', 'assistantBackground', 'assistantText', 'userBackground', 'userText', 'buttonText', 'avatarBorderColor', 'launcherColor', 'launcherTextColor', 'launcherBorderColor'] as const;
const booleans = ['showSubtitle', 'showWelcome', 'showSuggestions', 'showDay'] as const;
const enums = { font: ['system', 'serif', 'rounded'], density: ['comfortable', 'compact'], avatar: ['sparkles', 'book', 'wine', 'message', 'none'], position: ['left', 'right'], avatarShape: ['circle', 'square', 'rounded'], avatarBorderStyle: ['none', 'solid', 'dashed', 'dotted'], launcherLogoMode: ['icon', 'assistant', 'custom'], launcherIcon: ['sparkles', 'book', 'wine', 'message'], launcherVertical: ['top', 'bottom'], launcherShape: ['circle', 'square', 'rounded'], launcherBorderStyle: ['none', 'solid', 'dashed', 'dotted'] };
const numbers = { fontSize: [12, 18], radius: [0, 28], width: [320, 480], height: [420, 800], avatarSize: [28, 72], avatarRadius: [0, 28], avatarBorderWidth: [0, 6], launcherSize: [40, 96], launcherOffsetX: [8, 120], launcherOffsetY: [8, 120], launcherRadius: [0, 48], launcherBorderWidth: [0, 8] };
function validAvatar(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000) return false;
  if (!value) return true;
  if (/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..')) return true;
  try { publicWebsite(value); return true; } catch { return false; }
}
function valid(key: string, value: any) {
  if ((colorKeys as readonly string[]).includes(key)) return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  if ((booleans as readonly string[]).includes(key)) return typeof value === 'boolean';
  if (Object.hasOwn(enums, key)) return (enums[key as keyof typeof enums] as string[]).includes(value);
  if (Object.hasOwn(numbers, key)) { const [min, max] = numbers[key as keyof typeof numbers]; return Number.isInteger(value) && value >= min && value <= max; }
  if (key === 'avatarUrl' || key === 'launcherLogoUrl') return validAvatar(value);
  if (key === 'placeholder' || key === 'flowLabel') return typeof value === 'string' && value.length <= 100 && (key !== 'placeholder' || !!value.trim());
  return false;
}
export function validateTheme(raw: unknown, accent = '#6b59df'): ChatTheme {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Apariencia inválida: usa las opciones del editor.');
  for (const [key, value] of Object.entries(raw)) if (!valid(key, value)) throw new Error(`Apariencia inválida: revisa ${key}.`);
  return resolveTheme(raw, accent);
}
export function resolveTheme(raw: unknown, accent = '#6b59df'): ChatTheme {
  const theme = defaultTheme(accent);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [key, value] of Object.entries(raw)) if (valid(key, value)) (theme as any)[key] = value;
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'avatarRadius')) theme.avatarRadius = theme.radius;
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'avatarBorderColor')) theme.avatarBorderColor = theme.border;
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'launcherIcon')) theme.launcherIcon = theme.avatar === 'none' ? 'sparkles' : theme.avatar;
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'launcherTextColor')) theme.launcherTextColor = theme.buttonText;
  return theme;
}
export function appearancePreset(id: string) {
  if (id === 'manuel') return { color: '#cfb47a', theme: { ...defaultTheme('#cfb47a'), background: '#11100e', surface: '#1c1915', text: '#f5eee0', muted: '#bcb09b', border: '#453c2e', headerBackground: '#17140f', headerText: '#efe0ba', assistantBackground: '#242019', assistantText: '#ede3d0', userBackground: '#cfb47a', userText: '#17140f', buttonText: '#17140f', font: 'serif', fontSize: 14, radius: 8, avatar: 'book', launcherIcon: 'book' } as ChatTheme };
  if (id === 'winetalia') return { color: '#7f304b', theme: { ...defaultTheme('#7f304b'), background: '#fffaf1', surface: '#fffdf8', text: '#3c2b2b', muted: '#806d68', border: '#e4d7c9', headerBackground: '#7f304b', headerText: '#fff8ed', assistantBackground: '#f0e8dc', assistantText: '#49373a', userBackground: '#7f304b', userText: '#ffffff', font: 'system', radius: 14, avatar: 'wine', launcherIcon: 'wine' } as ChatTheme };
  if (id === 'dark') return { color: '#a89bf3', theme: { ...defaultTheme('#a89bf3'), background: '#171923', surface: '#212431', text: '#f1f0f6', muted: '#b0adbf', border: '#3f4053', headerBackground: '#242735', headerText: '#f5f3ff', assistantBackground: '#2b2d3e', assistantText: '#e9e6f3', userBackground: '#a89bf3', userText: '#171923' } as ChatTheme };
  return { color: '#6b59df', theme: defaultTheme('#6b59df') };
}
