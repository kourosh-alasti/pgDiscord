import { isIP } from 'net';
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

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid connection string URL format.');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new Error('Connection string must include a hostname.');
  }

  if (isBlockedHost(hostname)) {
    throw new Error(
      'Connection to private, loopback, or link-local hosts is not allowed.'
    );
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 0) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  if (ipVersion === 6) {
    if (host === '::1') return true;
    if (host.startsWith('fe80:')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
  }

  return false;
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
