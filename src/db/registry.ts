import { DatabaseManager } from './connection';

export class ConnectionRegistry {
  private readonly sessions = new Map<string, DatabaseManager>();
  private readonly inactivityTimeoutMs: number;

  constructor(inactivityTimeoutMs: number) {
    this.inactivityTimeoutMs = inactivityTimeoutMs;
  }

  get(userId: string): DatabaseManager | undefined {
    return this.sessions.get(userId);
  }

  has(userId: string): boolean {
    return this.sessions.has(userId);
  }

  async connect(userId: string, connectionString: string): Promise<DatabaseManager> {
    validateConnectionString(connectionString);

    const existing = this.sessions.get(userId);
    if (existing) {
      await existing.disconnect();
    }

    const manager = new DatabaseManager({
      connectionString,
      inactivityTimeoutMs: this.inactivityTimeoutMs,
    });

    await manager.connect();
    this.sessions.set(userId, manager);
    return manager;
  }

  async disconnect(userId: string): Promise<boolean> {
    const manager = this.sessions.get(userId);
    if (!manager) return false;
    await manager.disconnect();
    this.sessions.delete(userId);
    return true;
  }

  async disconnectAll(): Promise<void> {
    const disconnects = Array.from(this.sessions.values()).map((m) =>
      m.disconnect()
    );
    await Promise.all(disconnects);
    this.sessions.clear();
  }

  sessionCount(): number {
    return this.sessions.size;
  }
}

export function validateConnectionString(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('Connection string cannot be empty.');
  }
  if (!/^postgres(?:ql)?:\/\//i.test(trimmed)) {
    throw new Error(
      'Invalid connection string. Must start with postgresql:// or postgres://'
    );
  }
}

export function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || 'unknown';
    const db = parsed.pathname?.replace(/^\//, '') || 'unknown';
    return `${host}/${db}`;
  } catch {
    return '[hidden]';
  }
}
