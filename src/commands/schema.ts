import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ConnectionRegistry } from "../db/registry";
import { introspectSchema } from "../schema/introspector";
import { schemaToMarkdown, schemaToAgentMarkdown } from "../schema/markdown";
import { truncateText } from "../utils/format";
import { requireConnection } from "../utils/require-connection";

export const schemaCommand = {
  data: new SlashCommandBuilder()
    .setName("schema")
    .setDescription("View database schema (markdown format)")
    .addStringOption((opt) =>
      opt
        .setName("table")
        .setDescription("Filter to a specific table (optional)")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("format")
        .setDescription("Output format")
        .setRequired(false)
        .addChoices(
          { name: "Human (Markdown tables)", value: "human" },
          { name: "Agent (YAML block)", value: "agent" },
        ),
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry,
  ): Promise<void> {
    const tableFilter = interaction.options.getString("table") ?? undefined;
    const format = interaction.options.getString("format") ?? "human";

    await interaction.deferReply();

    const db = await requireConnection(interaction, registry);
    if (!db) return;

    try {
      const schema = await db.withClient(introspectSchema);
      const markdown =
        format === "agent" ? schemaToAgentMarkdown(schema) : schemaToMarkdown(schema, tableFilter);

      await interaction.editReply(truncateText(markdown));
    } catch (err) {
      await interaction.editReply(
        `❌ **Error:** ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
