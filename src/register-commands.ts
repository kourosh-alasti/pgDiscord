import 'dotenv/config';
import { loadConfig } from './config';
import { registerSlashCommands } from './bot';

async function main(): Promise<void> {
  const config = loadConfig();
  await registerSlashCommands(config);
  console.log('Commands registered successfully.');
}

main().catch((err) => {
  console.error('Failed to register commands:', err);
  process.exit(1);
});
