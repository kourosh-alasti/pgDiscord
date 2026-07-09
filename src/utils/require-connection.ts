import { ChatInputCommandInteraction } from 'discord.js';
import { DatabaseManager } from '../db/connection';
import { ConnectionRegistry } from '../db/registry';

const EPHEMERAL = 64;

export async function requireConnection(
  interaction: ChatInputCommandInteraction,
  registry: ConnectionRegistry
): Promise<DatabaseManager | null> {
  const manager = registry.get(interaction.user.id);

  if (!manager) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        '❌ **Not connected.** Use `/connect` to link your PostgreSQL database first.'
      );
    } else {
      await interaction.reply({
        content:
          '❌ **Not connected.** Use `/connect` to link your PostgreSQL database first.',
        flags: EPHEMERAL,
      });
    }
    return null;
  }

  return manager;
}
