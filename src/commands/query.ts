import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { ConnectionRegistry } from '../db/registry';
import { QueryRejectedError } from '../safety/query-filter';
import { formatQueryResult } from '../utils/format';
import { requireConnection } from '../utils/require-connection';

export const queryCommand = {
  data: new SlashCommandBuilder()
    .setName('query')
    .setDescription('Execute a read-only SQL query')
    .addStringOption((opt) =>
      opt
        .setName('sql')
        .setDescription('SQL query (SELECT, WITH, EXPLAIN, SHOW only)')
        .setRequired(true)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry
  ): Promise<void> {
    const sql = interaction.options.getString('sql', true);
    await interaction.deferReply();

    const db = await requireConnection(interaction, registry);
    if (!db) return;

    try {
      const start = Date.now();
      const result = await db.query(sql);
      const elapsed = Date.now() - start;
      const prefix = `✅ Query executed in ${elapsed}ms\n`;
      const formatted = formatQueryResult(result, 1900 - prefix.length);

      await interaction.editReply(`${prefix}${formatted}`);
    } catch (err) {
      if (err instanceof QueryRejectedError) {
        await interaction.editReply(
          `🚫 **Query rejected** (${err.reason})\n${err.message}\n\n_Only read-only queries are permitted. Destructive and modifying statements are blocked._`
        );
        return;
      }
      await interaction.editReply(
        `❌ **Error:** ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};
