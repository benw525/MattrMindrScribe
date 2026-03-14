import 'dotenv/config';
import pg from 'pg';

const dbUrl = process.env.DATABASE_URL;
console.log('[DB] Connecting with URL:', dbUrl ? dbUrl.replace(/:[^:@]+@/, ':***@') : 'UNDEFINED');

const pool = new pg.Pool({
  connectionString: dbUrl,
});

export default pool;
