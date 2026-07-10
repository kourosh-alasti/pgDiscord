import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  ConnectionRegistry,
  maskConnectionString,
  validateConnectionString,
} from '../db/registry';
import { sanitizeOutput } from '../safety/query-filter';

export const CONNECT_MODAL_ID = 'pgdiscord-connect-modal';
export const CONNECT_URL_INPUT_ID = 'pgdiscord-connection-url';

export const connectCommand = {
  data: new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Connect to a PostgreSQL database (connection string stays private)')
    .addStringOption((opt) =>
      opt
        .setName('url')
        .setDescription(
          'PostgreSQL URL (visible in channel — omit to use a private modal instead)'
        )
        .setRequired(false)
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry
  ): Promise<void> {
    const urlOption = interaction.options.getString('url');

    if (urlOption) {
      await handleConnect(interaction, registry, urlOption);
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(CONNECT_MODAL_ID)
      .setTitle('Connect to PostgreSQL');

    const urlInput = new TextInputBuilder()
      .setCustomId(CONNECT_URL_INPUT_ID)
      .setLabel('Connection string')
      .setPlaceholder('postgresql://user:pass@host:5432/dbname')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput)
    );

    await interaction.showModal(modal);
  },
};

export async function handleConnectModal(
  interaction: ModalSubmitInteraction,
  registry: ConnectionRegistry
): Promise<void> {
  const url = interaction.fields.getTextInputValue(CONNECT_URL_INPUT_ID);
  await handleConnect(interaction, registry, url);
}

async function handleConnect(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  registry: ConnectionRegistry,
  connectionString: string
): Promise<void> {
  const isModal = interaction.isModalSubmit();
  const usedPublicOption =
    interaction.isChatInputCommand() &&
    interaction.options.getString('url') !== null;

  if (!isModal && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 });
  } else if (isModal) {
    await interaction.deferReply({ flags: 64 });
  }

  try {
    validateConnectionString(connectionString);
    const manager = await registry.connect(
      interaction.user.id,
      connectionString.trim()
    );
    const status = manager.getStatus();
    const masked = maskConnectionString(connectionString);

    const warning = usedPublicOption
      ? '\n\n⚠️ _You passed the URL as a command option, which is visible in this channel. Next time, run `/connect` without the url option to use a private modal._'
      : '';

    await interaction.editReply({
      content:
        `✅ Connected to **${status.databaseName ?? masked}** (\`${masked}\`)\n` +
        `Your session is read-only. Credentials are not stored or displayed.${warning}`,
    });
  } catch (err) {
    const message = sanitizeOutput(
      err instanceof Error ? err.message : String(err),
      connectionString
    );
    await interaction.editReply({
      content: `❌ **Connection failed:** ${message}`,
    });
  }
}

export const disconnectCommand = {
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect from your database session'),

  async execute(
    interaction: ChatInputCommandInteraction,
    registry: ConnectionRegistry
  ): Promise<void> {
    const disconnected = await registry.disconnect(interaction.user.id);

    await interaction.reply({
      content: disconnected
        ? '✅ Disconnected. Your connection string has been removed from memory.'
        : 'ℹ️ You are not connected to any database.',
      flags: 64,
    });
  },
};
