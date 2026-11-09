export type Company = { id: string; name: string; website: string; description: string; budget: number; spent: number; reserved: number; status: string; created_at: string };
export type Assistant = { id: string; company_id: string; name: string; subtitle: string; color: string; welcome: string; instructions: string; suggestions: string[]; model: string; mode: string; published: number; origins: string[]; catalog_url: string; created_at: string };
export type Source = { id: string; company_id: string; assistant_id: string; name: string; type: string; bytes: number; created_at: string };
export type Usage = { id: string; company_id: string; assistant_id: string; conversation_id: string; model: string; mode: string; input_tokens: number; output_tokens: number; cost: number; reservation: number; status: string; created_at: string };
export type Conversation = { id: string; company_id: string; assistant_id: string; mode: string; title: string; message_count: number; created_at: string };
export type Provider = { company_id: string; configured: boolean; input_price: number; output_price: number };
export type State = { companies: Company[]; assistants: Assistant[]; sources: Source[]; usage: Usage[]; conversations: Conversation[]; providers: Provider[]; month: string; encryptionReady: boolean; user: { name: string; email: string } };
export const usd = (micros: number, precise = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: precise ? 4 : 2, maximumFractionDigits: precise ? 4 : 2 }).format(micros / 1e6);
export const date = (s: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' }).format(new Date(s));
export async function api<T = any>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api' + path, { method, ...(data instanceof FormData ? { body: data } : data != null ? { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } } : {}) });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}
