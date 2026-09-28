import { neon } from '@neondatabase/serverless';
// Single seam for the SQL client: production uses Neon over HTTPS; local tests inject a compatible client.
let override = null;
export const useDatabase = (sql) => { override = sql; };
export const database = () => override || neon(process.env.DATABASE_URL);
