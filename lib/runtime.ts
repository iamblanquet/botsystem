// The existing Vite/Cloudflare preview keeps its persisted D1 and R2 bindings.
// Next.js replaces this module with runtime-node.ts through an exact alias.
export { env } from 'cloudflare:workers';
