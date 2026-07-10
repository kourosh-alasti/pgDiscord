import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { ConnectionRegistry } from '../db/registry';
import { introspectSchema } from '../schema/introspector';
import { schemaToMermaid, schemaToAsciiDiagram } from '../schema/diagram';
import { truncateText } from '../utils/format';
import { requireConnection } from '../utils/require-connection';

export const diagramCommand = {
  data: new SlashCommandBuilder()
    .setName('diagram')
    .setDescription('Generate a schema diagram')
    .addStringOption((opt) =>
      opt
        .setName('table')
        .setDescription('Filter to a specific table (optional)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('format')
        .setDescription('Diagram format')
        .setRequired(false)
        .addChoices(
          { name: 'Mermaid ER (for renderers)', value: 'mermaid' },
          { name: 'ASCII (inline visual)', value: 'ascii' }
        )
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry
  ): Promise<void> {
    const tableFilter = interaction.options.getString('table') ?? undefined;
    const format = interaction.options.getString('format') ?? 'mermaid';

    await interaction.deferReply();

    const db = await requireConnection(interaction, registry);
    if (!db) return;

    try {
      const schema = await db.withClient(introspectSchema);

      if (format === 'ascii') {
        const ascii = schemaToAsciiDiagram(schema, tableFilter);
        await interaction.editReply(truncateText(`\`\`\`\n${ascii}\n\`\`\``));
        return;
      }

      const mermaid = schemaToMermaid(schema, tableFilter);
      const content = truncateText(
        `**Mermaid ER Diagram** _(paste into a Mermaid renderer)_\n\`\`\`mermaid\n${mermaid}\n\`\`\``
      );

      if (content.length > 1800) {
        const attachment = new AttachmentBuilder(
          Buffer.from(mermaid, 'utf-8'),
          { name: 'schema-diagram.mmd' }
        );
        await interaction.editReply({
          content: '📊 Schema diagram attached as Mermaid file.',
          files: [attachment],
        });
      } else {
        await interaction.editReply(content);
      }
    } catch (err) {
      await interaction.editReply(
        `❌ **Error:** ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};
