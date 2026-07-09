import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  REST,
  Routes,
} from 'discord.js';
import { BotConfig } from './config';
import { DatabaseManager } from './db/connection';
import { queryCommand } from './commands/query';
import { askCommand } from './commands/ask';
import { schemaCommand } from './commands/schema';
import { diagramCommand } from './commands/diagram';
import {
  statusCommand,
  reconnectCommand,
  helpCommand,
} from './commands/status';

interface Command {
  data: { name: string; toJSON: () => unknown };
  execute: (
    interaction: ChatInputCommandInteraction,
    db: DatabaseManager
  ) => Promise<void>;
}

const commands: Command[] = [
  queryCommand,
  askCommand,
  schemaCommand,
  diagramCommand,
  statusCommand,
  reconnectCommand,
  helpCommand,
];

export async function registerSlashCommands(config: BotConfig): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = commands.map((cmd) => cmd.data.toJSON());

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(
      await getApplicationId(config),
      config.guildId
    ), { body });
    console.log(`Registered ${body.length} guild commands.`);
  } else {
    await rest.put(Routes.applicationCommands(await getApplicationId(config)), {
      body,
    });
    console.log(`Registered ${body.length} global commands.`);
  }
}

async function getApplicationId(config: BotConfig): Promise<string> {
  const rest = new REST().setToken(config.discordToken);
  const app = (await rest.get(Routes.oauth2CurrentApplication())) as {
    id: string;
  };
  return app.id;
}

export function createBot(config: BotConfig, db: DatabaseManager): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const commandMap = new Collection<string, Command>();
  for (const cmd of commands) {
    commandMap.set(cmd.data.name, cmd);
  }

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    console.log('Read-only mode: destructive queries are hard-blocked.');
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, db);
    } catch (err) {
      console.error(`Command /${interaction.commandName} failed:`, err);
      const msg = 'An unexpected error occurred.';
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  });

  return client;
}

export { commands };
