import { Pool, PoolClient, QueryResult } from 'pg';
import { sanitizeOutput, validateReadOnlyQuery, QueryRejectedError } from '../safety/query-filter';

export interface ConnectionConfig {
  connectionString: string;
  inactivityTimeoutMs: number;
}

export interface ConnectionStatus {
  connected: boolean;
  lastActivityAt: Date | null;
  idleMs: number | null;
  timedOut: boolean;
  databaseName: string | null;
}

export class DatabaseManager {
  private pool: Pool | null = null;
  private lastActivityAt: Date | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private timedOut = false;
  private databaseName: string | null = null;

  constructor(private readonly config: ConnectionConfig) {}

  getStatus(): ConnectionStatus {
    const now = Date.now();
    return {
      connected: this.pool !== null && !this.timedOut,
      lastActivityAt: this.lastActivityAt,
      idleMs: this.lastActivityAt ? now - this.lastActivityAt.getTime() : null,
      timedOut: this.timedOut,
      databaseName: this.databaseName,
    };
  }

  async connect(): Promise<void> {
    await this.disconnect();

    this.pool = new Pool({
      connectionString: this.config.connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
      query_timeout: 30_000,
    });

    this.pool.on('error', () => {
      this.handleDisconnect();
    });

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT current_database() AS db');
      this.databaseName = result.rows[0]?.db ?? null;
    } finally {
      client.release();
    }

    this.timedOut = false;
    this.touch();
  }

  async ensureConnected(): Promise<Pool> {
    if (!this.pool || this.timedOut) {
      await this.connect();
    }
    this.touch();
    return this.pool!;
  }

  async disconnect(): Promise<void> {
    this.clearInactivityTimer();
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
    }
    this.timedOut = false;
  }

  async reconnect(): Promise<void> {
    await this.connect();
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    validateReadOnlyQuery(sql);

    const pool = await this.ensureConnected();
    const client = await pool.connect();

    try {
      await client.query('SET TRANSACTION READ ONLY');
      const result = await client.query<T>(sql, params);
      this.touch();
      return result;
    } catch (err) {
      if (err instanceof QueryRejectedError) {
        throw err;
      }
      const message = sanitizeOutput(
        err instanceof Error ? err.message : String(err),
        this.config.connectionString
      );
      throw new Error(message);
    } finally {
      client.release();
    }
  }

  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = await this.ensureConnected();
    const client = await pool.connect();
    try {
      await client.query('SET TRANSACTION READ ONLY');
      const result = await fn(client);
      this.touch();
      return result;
    } finally {
      client.release();
    }
  }

  private touch(): void {
    this.lastActivityAt = new Date();
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      this.handleInactivityTimeout();
    }, this.config.inactivityTimeoutMs);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private async handleInactivityTimeout(): Promise<void> {
    this.timedOut = true;
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
    }
  }

  private handleDisconnect(): void {
    this.pool = null;
    this.timedOut = true;
    this.clearInactivityTimer();
  }
}
