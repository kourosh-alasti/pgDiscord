import 'dotenv/config';
import { loadConfig } from './config';
import { DatabaseManager } from './db/connection';
import { createBot, registerSlashCommands } from './bot';

async function main(): Promise<void> {
  const config = loadConfig();

  const db = new DatabaseManager({
    connectionString: config.databaseUrl,
    inactivityTimeoutMs: config.inactivityTimeoutMinutes * 60 * 1000,
  });

  console.log('Connecting to database...');
  await db.connect();
  console.log(`Connected to: ${db.getStatus().databaseName}`);

  await registerSlashCommands(config);

  const client = createBot(config, db);
  await client.login(config.discordToken);

  const shutdown = async () => {
    console.log('Shutting down...');
    await db.disconnect();
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
