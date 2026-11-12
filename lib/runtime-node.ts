import { createClient } from '@libsql/client/web';
import { put, get, del } from '@vercel/blob';
import { createDatabaseAdapter } from './database-adapter.mjs';

let database: D1Database | undefined;
let databaseConfig = '';
function getDatabase() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return undefined;
  if (!/^(libsql|https):\/\//.test(url)) throw new Error('TURSO_DATABASE_URL debe usar libsql:// o https://.');
  const config = JSON.stringify([url, authToken]);
  if (!database || databaseConfig !== config) {
    database = createDatabaseAdapter(createClient({ url, authToken, intMode: 'number' })) as unknown as D1Database;
    databaseConfig = config;
  }
  return database;
}

const bucket = {
  async put(key: string, body: Parameters<typeof put>[1], options?: { httpMetadata?: { contentType?: string } }) {
    return put(key, body, {
      access: 'private', addRandomSuffix: false, allowOverwrite: false,
      contentType: options?.httpMetadata?.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  },
  async get(key: string) {
    const result = await get(key, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN, useCache: false });
    return result?.statusCode === 200 ? { body: result.stream } : null;
  },
  async delete(key: string) { await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN }); },
};

export const env: Cloudflare.Env = {
  get DB() { return getDatabase(); },
  get BUCKET() { return process.env.BLOB_READ_WRITE_TOKEN ? bucket as unknown as R2Bucket : undefined; },
  get ENCRYPTION_KEY() { return process.env.ENCRYPTION_KEY; },
  get GEMINI_API_KEY() { return process.env.GEMINI_API_KEY; },
};
