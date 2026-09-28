// Local-only adapter exposing the subset of the Neon HTTP client API used by Amelib
// (tagged template, query(), transaction()) on top of a regular PostgreSQL connection.
// Used by tests and the local API server; never imported by production code.
import pg from 'pg';
export function pgNeon(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const lazy = (text, values) => ({ text, values, then(ok, ko) { return pool.query(text, values).then((r) => r.rows).then(ok, ko); }, catch(ko) { return this.then(undefined, ko); } });
  const sql = (strings, ...values) => lazy(strings.reduce((text, part, i) => text + part + (i < values.length ? '$' + (i + 1) : ''), ''), values);
  sql.query = (text, values = []) => lazy(text, values);
  sql.transaction = async (queries) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = [];
      for (const q of queries) out.push((await client.query(q.text, q.values)).rows);
      await client.query('COMMIT');
      return out;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  };
  sql.end = () => pool.end();
  return sql;
}
