import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { DatabaseManager } from '../db/connection';
import { QueryRejectedError } from '../safety/query-filter';
import { formatQueryResult, truncateText } from '../utils/format';

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
    db: DatabaseManager
  ): Promise<void> {
    const sql = interaction.options.getString('sql', true);
    await interaction.deferReply();

    try {
      const start = Date.now();
      const result = await db.query(sql);
      const elapsed = Date.now() - start;
      const formatted = formatQueryResult(result);

      await interaction.editReply(
        truncateText(`✅ Query executed in ${elapsed}ms\n${formatted}`)
      );
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
