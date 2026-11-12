/** Adapt libSQL to the D1 operations used by the platform, including atomic batches.
 * @param {import('@libsql/client').Client} client
 */
export function createDatabaseAdapter(client) {
  /** @param {import('@libsql/client').ResultSet} result */
  function resultView(result) {
    return {
      success: true,
      results: result.rows.map(row => Object.fromEntries(Object.entries(row))),
      meta: { changes: result.rowsAffected, last_row_id: Number(result.lastInsertRowid ?? 0) },
    };
  }
  /** @param {string} sql @param {import('@libsql/client').InValue[]} args */
  function statement(sql, args = []) {
    return {
      sql, args,
      /** @param {import('@libsql/client').InValue[]} values */
      bind(...values) { return statement(sql, values); },
      async first() { return resultView(await client.execute({ sql, args })).results[0] ?? null; },
      async all() { return resultView(await client.execute({ sql, args })); },
      async run() { return resultView(await client.execute({ sql, args })); },
    };
  }
  return {
    prepare: statement,
    /** @param {ReturnType<typeof statement>[]} statements */
    async batch(statements) {
      // One write transaction: a failed reservation or revision update rolls back all SQL.
      return (await client.batch(statements.map(({ sql, args }) => ({ sql, args })), 'write')).map(resultView);
    },
  };
}
