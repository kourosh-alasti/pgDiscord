# pgDiscord

A Discord bot that provides a **safe, read-only access layer** to PostgreSQL databases — designed for AI agents and humans who need database visibility without modification rights.

## Features

- **Read-only SQL execution** — `/query` runs SELECT, WITH, EXPLAIN, SHOW, and VALUES only
- **Hard safety filter** — destructive/modifying statements are parsed and **rejected before execution**
- **Natural language queries** — `/ask` converts plain English to read-only SQL using schema context
- **Schema documentation** — `/schema` outputs human markdown tables or agent-friendly YAML
- **Schema diagrams** — `/diagram` generates Mermaid ER diagrams or ASCII visuals
- **Per-user connections** — `/connect` lets each user link their own database (multi-tenant hosting)
- **Hidden credentials** — connection strings entered via private modal; never shown in channel
- **Inactivity timeout** — auto-disconnects after configurable idle period; `/reconnect` restores access
- **Connection status** — `/status` shows health without exposing secrets

## Quick Start

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → Bot → copy the **token**
3. Enable **Message Content Intent** is not required (slash commands only)
4. Invite the bot with `applications.commands` and `bot` scopes

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_bot_token
INACTIVITY_TIMEOUT_MINUTES=30
```

For **multi-tenant hosting** (recommended), only set `DISCORD_TOKEN` — each user connects their own database via `/connect`.

For **single-tenant** deployments, you can optionally set a default database:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Or pass credentials via CLI:

```bash
npm run dev -- \
  --discord-token "YOUR_TOKEN" \
  --database-url "postgresql://user:pass@host:5432/mydb" \
  --inactivity-timeout 30
```

### 3. Run

```bash
npm install
npm run build
npm start
```

For development with hot reload:

```bash
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/connect [url]` | Connect to PostgreSQL (private modal if url omitted) |
| `/disconnect` | End session and clear credentials from memory |
| `/query sql:<SQL>` | Execute read-only SQL |
| `/ask question:<text>` | Natural language → SQL |
| `/schema [table] [format]` | Schema as markdown or agent YAML |
| `/diagram [table] [format]` | Mermaid ER or ASCII diagram |
| `/status` | Your connection status (ephemeral, no credentials) |
| `/reconnect` | Reconnect after timeout |
| `/help` | Commands and safety policy |

### Connecting to your database

Run `/connect` **without** the url option to open a **private modal** — your connection string is only visible to you and is never posted in the channel.

```
/connect          → opens private modal (recommended in shared servers)
/connect url:...  → works but url is visible in channel (use for automation only)
```

After connecting, use `/query`, `/ask`, `/schema`, and `/diagram` as normal. Sessions auto-disconnect after inactivity; use `/reconnect` or `/connect` again.

### Example NLP queries (`/ask`)

- "list all tables"
- "describe the users table"
- "how many rows in orders"
- "show top 10 rows from products"
- "foreign keys for users"
- "indexes on orders"

## Safety Policy

All queries pass through a **SQL AST parser** (`pgsql-ast-parser`) before execution. The following are **hard-rejected**:

| Blocked | Examples |
|---------|----------|
| DML writes | `INSERT`, `UPDATE`, `DELETE` |
| DDL | `CREATE`, `DROP`, `ALTER`, `TRUNCATE` |
| Privileges | `GRANT`, `REVOKE` |
| Maintenance | `VACUUM`, `REINDEX`, `COPY` |
| Transactions | `BEGIN`, `COMMIT`, `ROLLBACK` |
| Row locks | `SELECT … FOR UPDATE` |
| Side effects | `SELECT INTO`, dangerous `pg_*` functions |

Additionally, database connections use `SET TRANSACTION READ ONLY` for defense in depth.

## Architecture

```
src/
├── index.ts              # Entry point
├── bot.ts                # Discord client & command routing
├── config.ts             # CLI / env configuration
├── commands/             # Slash command handlers
├── db/
│   ├── connection.ts      # Pool manager with inactivity timeout
│   └── registry.ts        # Per-user connection sessions
├── safety/query-filter.ts # AST-based read-only enforcement
├── nlp/interpreter.ts    # Natural language → SQL
└── schema/               # Introspection, markdown, diagrams
```

## For AI Agents

Use these endpoints for structured database access:

1. **`/schema format:agent`** — YAML schema block for context injection
2. **`/ask`** — Natural language lookups without writing SQL
3. **`/query`** — Precise read-only SQL when you know the query
4. **`/diagram format:mermaid`** — ER relationships for query planning

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Discord bot token |
| `DATABASE_URL` | No | — | Optional default DB for single-tenant mode |
| `INACTIVITY_TIMEOUT_MINUTES` | No | `30` | Idle disconnect timeout per user session |
| `DISCORD_GUILD_ID` | No | — | Guild ID for faster dev command registration |

## License

MIT
