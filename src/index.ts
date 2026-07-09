import 'dotenv/config';
import { loadConfig } from './config';
import { ConnectionRegistry } from './db/registry';
import { createBot, registerSlashCommands } from './bot';

async function main(): Promise<void> {
  const config = loadConfig();

  const registry = new ConnectionRegistry(
    config.inactivityTimeoutMinutes * 60 * 1000
  );

  if (config.databaseUrl) {
    console.log(
      'Default DATABASE_URL is set — users can still override with /connect.'
    );
  } else {
    console.log('No default database — users connect via /connect.');
  }

  await registerSlashCommands(config);

  const client = createBot(config, registry);
  await client.login(config.discordToken);

  const shutdown = async () => {
    console.log('Shutting down...');
    await registry.disconnectAll();
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
