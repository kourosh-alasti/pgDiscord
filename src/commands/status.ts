import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { DatabaseManager } from '../db/connection';
import { formatDuration } from '../utils/format';

export const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('View database connection status'),

  async execute(
    interaction: ChatInputCommandInteraction,
    db: DatabaseManager
  ): Promise<void> {
    const status = db.getStatus();

    const lines = [
      '**Database Connection Status**',
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

    await interaction.reply(lines.join('\n'));
  },
};

export const reconnectCommand = {
  data: new SlashCommandBuilder()
    .setName('reconnect')
    .setDescription('Reconnect to the database after timeout or disconnect'),

  async execute(
    interaction: ChatInputCommandInteraction,
    db: DatabaseManager
  ): Promise<void> {
    await interaction.deferReply();

    try {
      await db.reconnect();
      const status = db.getStatus();
      await interaction.editReply(
        `✅ Reconnected to database **${status.databaseName ?? 'unknown'}**.`
      );
    } catch (err) {
      await interaction.editReply(
        `❌ **Reconnect failed:** ${err instanceof Error ? err.message : String(err)}`
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
    _db: DatabaseManager
  ): Promise<void> {
    await interaction.reply({
      content: truncateHelp(),
      flags: 64, // MessageFlags.Ephemeral
    });
  },
};

function truncateHelp(): string {
  return `**pgDiscord — Safe Read-Only DB Access**

**Commands:**
• \`/query\` — Execute read-only SQL (SELECT, WITH, EXPLAIN, SHOW)
• \`/ask\` — Natural language queries (auto-converted to SQL)
• \`/schema\` — Schema documentation (human markdown or agent YAML)
• \`/diagram\` — ER diagrams (Mermaid or ASCII)
• \`/status\` — Connection status (no credentials shown)
• \`/reconnect\` — Reconnect after inactivity timeout

**Safety Policy (hard enforced):**
🚫 INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE
🚫 GRANT, REVOKE, COPY, CALL, VACUUM, transactions
🚫 SELECT … FOR UPDATE, SELECT INTO, dangerous pg_* functions
✅ SELECT, WITH (read-only CTEs), EXPLAIN, SHOW, VALUES only

**For AI Agents:**
Use \`/schema format:agent\` for structured YAML schema.
Use \`/ask\` for NLP-driven lookups.
Use \`/query\` for precise read-only SQL.

_Connection string is configured at startup and never exposed in chat._`;
}
