import type { ChatTheme } from './appearance';
export type DemoAssistant = { id: string; name: string; color: string; mode: string; theme: ChatTheme };
export type DemoProduct = { id: string; name: string; price: number; currency: string; description: string; pairings: string[] };
export type DemoPilot = { company: { name: string; website: string }; assistant: DemoAssistant; products: DemoProduct[] };
