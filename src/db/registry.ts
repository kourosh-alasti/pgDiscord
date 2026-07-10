import { isIP } from 'net';
import { lookup } from 'dns/promises';
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
    await validateConnectionStringWithDNS(connectionString);

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

async function validateConnectionStringWithDNS(url: string): Promise<void> {
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

  // Check literal hostname/IP first
  if (isBlockedHost(hostname)) {
    throw new Error(
      'Connection to private, loopback, or link-local hosts is not allowed.'
    );
  }

  // If hostname is already an IP, we're done
  if (isIP(hostname)) {
    return;
  }

  // Resolve hostname to IPs and validate each one
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (err) {
    throw new Error(
      `Failed to resolve hostname "${hostname}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`Hostname "${hostname}" did not resolve to any IP addresses.`);
  }

  for (const addr of addresses) {
    if (isBlockedHost(addr.address)) {
      throw new Error(
        `Connection to private, loopback, or link-local hosts is not allowed. Hostname "${hostname}" resolves to blocked IP: ${addr.address}`
      );
    }
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    return isBlockedIPv4(host);
  }

  if (ipVersion === 6) {
    if (host === '::1') return true;
    if (host.startsWith('fe80:')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;

    // Check for IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
    const ipv4MappedMatch = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (ipv4MappedMatch) {
      return isBlockedIPv4(ipv4MappedMatch[1]);
    }
  }

  return false;
}

function isBlockedIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 127 || a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
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
