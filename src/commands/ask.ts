import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { DatabaseManager } from '../db/connection';
import { interpretNaturalLanguage } from '../nlp/interpreter';
import { introspectSchema } from '../schema/introspector';
import { QueryRejectedError } from '../safety/query-filter';
import { formatQueryResult, truncateText } from '../utils/format';

export const askCommand = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask a question in natural language (converted to read-only SQL)')
    .addStringOption((opt) =>
      opt
        .setName('question')
        .setDescription(
          'Natural language question, e.g. "show all tables" or "how many rows in users"'
        )
        .setRequired(true)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    db: DatabaseManager
  ): Promise<void> {
    const question = interaction.options.getString('question', true);
    await interaction.deferReply();

    try {
      const schema = await db.withClient(introspectSchema);
      const nlpResult = interpretNaturalLanguage(question, schema);

      if (!nlpResult) {
        await interaction.editReply(
          truncateText(
            `🤔 I couldn't interpret that question.\n\n**Try phrases like:**\n` +
              `• "list all tables"\n` +
              `• "describe the users table"\n` +
              `• "how many rows in orders"\n` +
              `• "show top 10 rows from products"\n` +
              `• "foreign keys for users"\n` +
              `• Or use \`/query\` with raw SQL`
          )
        );
        return;
      }

      if (!nlpResult.sql) {
        await interaction.editReply(`🤔 ${nlpResult.explanation}`);
        return;
      }

      const start = Date.now();
      const result = await db.query(nlpResult.sql);
      const elapsed = Date.now() - start;
      const formatted = formatQueryResult(result);

      const confidenceEmoji =
        nlpResult.confidence === 'high'
          ? '🟢'
          : nlpResult.confidence === 'medium'
            ? '🟡'
            : '🔴';

      await interaction.editReply(
        truncateText(
          `${confidenceEmoji} **Interpreted:** ${nlpResult.explanation}\n` +
            `\`\`\`sql\n${nlpResult.sql}\n\`\`\`\n` +
            `✅ Executed in ${elapsed}ms\n${formatted}`
        )
      );
    } catch (err) {
      if (err instanceof QueryRejectedError) {
        await interaction.editReply(
          `🚫 **Query rejected** (${err.reason})\n${err.message}\n\n_The interpreted SQL was blocked by the safety filter._`
        );
        return;
      }
      await interaction.editReply(
        `❌ **Error:** ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};
