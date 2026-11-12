import { createClient } from '@libsql/client/web';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** @param {import('@libsql/client').Client} client */
export async function migrate(client) {
  await client.execute('CREATE TABLE IF NOT EXISTS nexo_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const transaction = await client.transaction('write');
  const applied = [];
  try {
    const existing = new Map((await transaction.execute('SELECT name, hash FROM nexo_migrations')).rows.map(row => [row.name, row.hash]));
    const directory = new URL('../drizzle/', import.meta.url);
    for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      const source = await readFile(new URL(name, directory), 'utf8');
      const hash = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
      if (existing.has(name)) {
        if (existing.get(name) !== hash) throw new Error(`La migración aplicada ${name} ha cambiado. Crea una migración nueva.`);
        continue;
      }
      for (const sql of source.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await transaction.execute(sql);
      await transaction.execute({ sql: 'INSERT INTO nexo_migrations (name, hash, applied_at) VALUES (?, ?, ?)', args: [name, hash, new Date().toISOString()] });
      applied.push(name);
    }
    await transaction.commit();
    return applied;
  } catch (error) { await transaction.rollback(); throw error; }
  finally { transaction.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error('Configura TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de migrar.');
  const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try { const applied = await migrate(client); console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'La base de datos ya está actualizada.'); }
  finally { client.close(); }
}
