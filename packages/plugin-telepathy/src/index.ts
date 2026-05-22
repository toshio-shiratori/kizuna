import { existsSync } from "node:fs";
import BetterSqlite3 from "better-sqlite3";
import type {
  Plugin,
  Migration,
  MCPToolDefinition,
  MCPToolResult,
  PluginContext,
} from "@kizuna/core";

const PLUGIN_NAME = "@kizuna/plugin-telepathy";

export interface RepoReference {
  name: string;
  dbPath: string;
}

export interface TelepathyOptions {
  references?: RepoReference[];
}

export interface TelepathyMessage {
  source: string;
  message: string;
  createdAt: string;
}

/**
 * Check if a database has the telepathy_messages table.
 */
export function hasTelepathyTable(db: BetterSqlite3.Database): boolean {
  try {
    const row = db
      .prepare(
        `SELECT count(*) AS cnt FROM sqlite_master
         WHERE type = 'table' AND name = 'telepathy_messages'`,
      )
      .get() as { cnt: number };
    return row.cnt > 0;
  } catch {
    return false;
  }
}

/**
 * Send a telepathy message by deleting all existing messages and inserting
 * a new one. This ensures at most one message is retained per project.
 */
export function sendMessage(db: BetterSqlite3.Database, message: string): void {
  const deleteAll = db.prepare("DELETE FROM telepathy_messages");
  const insert = db.prepare("INSERT INTO telepathy_messages (message) VALUES (?)");
  db.transaction(() => {
    deleteAll.run();
    insert.run(message);
  })();
}

/**
 * Read telepathy messages from referenced project databases.
 * Each referenced database is opened in read-only mode. Databases that are
 * inaccessible, missing, or lack the telepathy_messages table are skipped
 * with a warning log.
 */
export function receiveMessages(
  references: RepoReference[],
  logger: PluginContext["logger"],
): TelepathyMessage[] {
  const messages: TelepathyMessage[] = [];

  for (const ref of references) {
    if (!existsSync(ref.dbPath)) {
      logger.warn(`Skipping reference "${ref.name}": database not found at ${ref.dbPath}`);
      continue;
    }

    try {
      const remoteDb = new BetterSqlite3(ref.dbPath, { readonly: true });
      try {
        if (!hasTelepathyTable(remoteDb)) {
          logger.debug(
            `Skipping reference "${ref.name}": no telepathy_messages table at ${ref.dbPath}`,
          );
          continue;
        }

        const row = remoteDb
          .prepare("SELECT message, created_at FROM telepathy_messages ORDER BY id DESC LIMIT 1")
          .get() as { message: string; created_at: string } | undefined;

        if (row) {
          messages.push({
            source: ref.name,
            message: row.message,
            createdAt: row.created_at,
          });
        }
      } finally {
        remoteDb.close();
      }
    } catch (err) {
      logger.warn(
        `Skipping reference "${ref.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return messages;
}

/**
 * Create the telepathy plugin instance.
 *
 * Provides two MCP tools:
 * - kizuna_telepathy_send: Write a telepathy message to the local database
 * - kizuna_telepathy_receive: Read telepathy messages from referenced databases
 */
export function createTelepathy(): Plugin {
  return {
    name: PLUGIN_NAME,
    version: "0.1.0",
    description: "Real-time context sharing between active Claude Code sessions",

    migrations(): Migration[] {
      return [
        {
          version: 1,
          description: "Create telepathy_messages table",
          up: `
            CREATE TABLE telepathy_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              message TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
          `,
          down: `DROP TABLE IF EXISTS telepathy_messages;`,
        },
      ];
    },

    mcpTools(): MCPToolDefinition[] {
      return [
        {
          name: "kizuna_telepathy_send",
          description:
            "Send a telepathy message to share context with other active Claude Code sessions. Overwrites any previous message.",
          inputSchema: {
            message: {
              type: "string",
              description: "The message content to send (typically a conversation summary)",
            },
          },
          async handler(args: unknown, ctx: PluginContext): Promise<MCPToolResult> {
            const { message } = args as { message: string };
            if (!message || typeof message !== "string") {
              return {
                content: { error: "message parameter is required and must be a string" },
                isError: true,
              };
            }

            const db = ctx.db as BetterSqlite3.Database;
            sendMessage(db, message);
            ctx.logger.info(`Telepathy message sent (${message.length} chars)`);

            return {
              content: { ok: true, length: message.length },
            };
          },
        },
        {
          name: "kizuna_telepathy_receive",
          description:
            "Receive telepathy messages from all referenced projects. Returns the latest message from each project that has one.",
          inputSchema: {},
          async handler(_args: unknown, ctx: PluginContext): Promise<MCPToolResult> {
            const options = ctx.config.options as TelepathyOptions;
            const references = options.references ?? [];

            if (references.length === 0) {
              return {
                content: {
                  messages: [],
                  note: "No references configured. Add references to your plugin configuration to receive messages from other projects.",
                },
              };
            }

            const messages = receiveMessages(references, ctx.logger);

            if (messages.length === 0) {
              return {
                content: {
                  messages: [],
                  note: "No telepathy messages found in referenced projects.",
                },
              };
            }

            return {
              content: { messages },
            };
          },
        },
      ];
    },
  };
}

/**
 * Pre-configured plugin instance for convenience.
 * For new code, prefer createTelepathy() which returns a fresh instance.
 */
export const telepathy: Plugin = createTelepathy();
