export interface BotConfig {
  discordToken: string;
  databaseUrl: string;
  inactivityTimeoutMinutes: number;
  guildId?: string;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): BotConfig {
  const args = parseArgs(argv);

  const discordToken = args['discord-token'] || process.env.DISCORD_TOKEN;
  const databaseUrl = args['database-url'] || process.env.DATABASE_URL;
  const inactivityTimeoutMinutes = parseInt(
    args['inactivity-timeout'] ||
      process.env.INACTIVITY_TIMEOUT_MINUTES ||
      '30',
    10
  );
  const guildId = args['guild-id'] || process.env.DISCORD_GUILD_ID;

  if (!discordToken) {
    throw new Error(
      'Discord token required. Set DISCORD_TOKEN or pass --discord-token'
    );
  }

  if (!databaseUrl) {
    throw new Error(
      'Database URL required. Set DATABASE_URL or pass --database-url'
    );
  }

  return {
    discordToken,
    databaseUrl,
    inactivityTimeoutMinutes,
    guildId: guildId || undefined,
  };
}
