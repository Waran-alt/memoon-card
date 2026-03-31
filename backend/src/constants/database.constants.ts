/**
 * pg Pool tuning (see config/database.ts). Statement/query timeouts bound runaway SQL under load.
 */

export const DATABASE_POOL = {
  /** Maximum number of clients in the connection pool */
  MAX_CLIENTS: 20,
  
  /** Idle timeout in milliseconds (30 seconds) */
  IDLE_TIMEOUT_MS: 30000,
  
  /** Connection timeout in milliseconds (2 seconds) */
  CONNECTION_TIMEOUT_MS: 2000,
  
  /** Query timeout in milliseconds (5 seconds) */
  QUERY_TIMEOUT_MS: 5000,
  
  /** Statement timeout in milliseconds (5 seconds) */
  STATEMENT_TIMEOUT_MS: 5000,
} as const;
