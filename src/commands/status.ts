import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { ConnectionRegistry } from '../db/registry';
import { formatDuration } from '../utils/format';
import { requireConnection } from '../utils/require-connection';

export const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('View your database connection status'),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry
  ): Promise<void> {
    const db = registry.get(interaction.user.id);

    if (!db) {
      await interaction.reply({
        content:
          '❌ **Not connected.** Use `/connect` to link your PostgreSQL database.',
        flags: 64,
      });
      return;
    }

    const status = db.getStatus();

    const lines = [
      '**Your Database Connection Status**',
      '',
      `• **Connected:** ${status.connected ? '✅ Yes' : '❌ No'}`,
      `• **Database:** ${status.databaseName ?? '_unknown_'}`,
      `• **Timed out:** ${status.timedOut ? 'Yes (use /reconnect)' : 'No'}`,
    ];

    if (status.lastActivityAt) {
      lines.push(`• **Last activity:** ${status.lastActivityAt.toISOString()}`);
      if (status.idleMs !== null) {
        lines.push(`• **Idle for:** ${formatDuration(status.idleMs)}`);
      }
    } else {
      lines.push('• **Last activity:** _none yet_');
    }

    lines.push('');
    lines.push('_Connection credentials are never displayed._');

    await interaction.reply({ content: lines.join('\n'), flags: 64 });
  },
};

export const reconnectCommand = {
  data: new SlashCommandBuilder()
    .setName('reconnect')
    .setDescription('Reconnect to your database after timeout or disconnect'),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry
  ): Promise<void> {
    await interaction.deferReply({ flags: 64 });

    const db = await requireConnection(interaction, registry);
    if (!db) return;

    try {
      await db.reconnect();
      const status = db.getStatus();
      await interaction.editReply(
        `✅ Reconnected to database **${status.databaseName ?? 'unknown'}**.`
      );
    } catch (err) {
      await interaction.editReply(
        `❌ **Reconnect failed:** ${err instanceof Error ? err.message : String(err)}\n\nIf your session expired, use \`/connect\` again.`
      );
    }
  },
};

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands and safety policies'),

  async execute(
    interaction: ChatInputCommandInteraction,
    _registry: ConnectionRegistry
  ): Promise<void> {
    await interaction.reply({
      content: truncateHelp(),
      flags: 64,
    });
  },
};

function truncateHelp(): string {
  return `**pgDiscord — Safe Read-Only DB Access**

**Getting started:**
• \`/connect\` — Connect to your PostgreSQL database (private modal; URL hidden)
• \`/disconnect\` — End your session and clear credentials from memory

**Commands:**
• \`/query\` — Execute read-only SQL (SELECT, WITH, EXPLAIN, SHOW)
• \`/ask\` — Natural language queries (auto-converted to SQL)
• \`/schema\` — Schema documentation (human markdown or agent YAML)
• \`/diagram\` — ER diagrams (Mermaid or ASCII)
• \`/status\` — Your connection status (no credentials shown)
• \`/reconnect\` — Reconnect after inactivity timeout

**Privacy:**
🔒 Run \`/connect\` **without** the url option to enter your connection string in a private modal
🔒 All connect/disconnect/status responses are ephemeral (only you can see them)
🔒 Connection strings are kept in memory only — never logged or displayed

**Safety Policy (hard enforced):**
🚫 INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE
🚫 GRANT, REVOKE, COPY, CALL, VACUUM, transactions
🚫 SELECT … FOR UPDATE, SELECT INTO, dangerous pg_* functions
✅ SELECT, WITH (read-only CTEs), EXPLAIN, SHOW, VALUES only

**For AI Agents:**
Use \`/schema format:agent\` for structured YAML schema.
Use \`/ask\` for NLP-driven lookups.
Use \`/query\` for precise read-only SQL.`;
}
