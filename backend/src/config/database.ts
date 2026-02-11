import { Pool, PoolConfig } from 'pg';
import {
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_DB,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
} from './env';
import { DATABASE_POOL } from '../constants/database.constants';
import { logger, serializeError } from '@/utils/logger';

const dbConfig: PoolConfig = {
  host: POSTGRES_HOST,
  port: POSTGRES_PORT,
  database: POSTGRES_DB,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  max: DATABASE_POOL.MAX_CLIENTS,
  idleTimeoutMillis: DATABASE_POOL.IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DATABASE_POOL.CONNECTION_TIMEOUT_MS,
  query_timeout: DATABASE_POOL.QUERY_TIMEOUT_MS,
  statement_timeout: DATABASE_POOL.STATEMENT_TIMEOUT_MS,
};

export const pool = new Pool(dbConfig);

// Test connection
pool.on('connect', () => {
  logger.info('Database connected', {
    host: POSTGRES_HOST,
    port: POSTGRES_PORT,
    database: POSTGRES_DB,
  });
});

pool.on('error', (err) => {
  logger.error('Database pool error', { error: serializeError(err) });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  logger.info('Database pool closed');
  process.exit(0);
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection test successful', { now: result.rows[0].now });
    return true;
  } catch (error) {
    logger.error('Database connection test failed', { error: serializeError(error) });
    return false;
  }
}
