/**
 * Dev-only: read migration status from Liquibase databasechangelog table.
 * Does not run migrations; that is done via CLI (yarn migrate:up / migrate:docker).
 */

import { pool } from '@/config/database';

export interface AppliedChangeset {
  id: string;
  author: string;
  filename: string;
  dateexecuted: string;
}

export interface DevDbStatusResult {
  ok: boolean;
  applied?: AppliedChangeset[];
  error?: string;
}

const CHANGELOG_TABLE = 'databasechangelog';

export async function getMigrationStatus(): Promise<DevDbStatusResult> {
  try {
    const result = await pool.query<AppliedChangeset>(
      `SELECT id, author, filename, dateexecuted::text AS dateexecuted
       FROM ${CHANGELOG_TABLE}
       ORDER BY dateexecuted ASC`
    );
    return { ok: true, applied: result.rows };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
