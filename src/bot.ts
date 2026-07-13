import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  REST,
  Routes,
} from "discord.js";
import { BotConfig } from "./config";
import { ConnectionRegistry } from "./db/registry";
import { queryCommand } from "./commands/query";
import { askCommand } from "./commands/ask";
import { schemaCommand } from "./commands/schema";
import { diagramCommand } from "./commands/diagram";
import { statusCommand, reconnectCommand, helpCommand } from "./commands/status";
import {
  connectCommand,
  disconnectCommand,
  CONNECT_MODAL_ID,
  handleConnectModal,
} from "./commands/connect";

interface Command {
  data: { name: string; toJSON: () => unknown };
  execute: (
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry,
  ) => Promise<void>;
}

const commands: Command[] = [
  connectCommand,
  disconnectCommand,
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
    await rest.put(
      Routes.applicationGuildCommands(await getApplicationId(config), config.guildId),
      { body },
    );
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

export function createBot(config: BotConfig, registry: ConnectionRegistry): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const commandMap = new Collection<string, Command>();
  for (const cmd of commands) {
    commandMap.set(cmd.data.name, cmd);
  }

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    console.log("Read-only mode: destructive queries are hard-blocked.");
    console.log("Multi-tenant: users connect via /connect (credentials stay private).");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isModalSubmit()) {
      if (interaction.customId === CONNECT_MODAL_ID) {
        try {
          await handleConnectModal(interaction, registry);
        } catch (err) {
          console.error("Connect modal failed:", err);
          const msg = "An unexpected error occurred while connecting.";
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(msg).catch(() => {});
          } else {
            await interaction.reply({ content: msg, flags: 64 }).catch(() => {});
          }
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, registry);
    } catch (err) {
      console.error(`Command /${interaction.commandName} failed:`, err);
      const msg = "An unexpected error occurred.";
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: 64 }).catch(() => {});
      }
    }
  });

  return client;
}

export { commands };
