import { z, type ZodTypeAny } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  Database,
  searchMemory,
  estimateTokens,
  type SearchQuery,
  type PluginManager,
  type StoredChunk,
} from "@kizuna/core";

interface SchemaPropertyDescriptor {
  type: string;
  description?: string;
}

/**
 * Convert a plugin's JSON Schema-like inputSchema to a Zod schema shape.
 *
 * Plugins define inputSchema as Record<string, unknown> with property
 * descriptors like { type: "string", description: "..." }. This function
 * converts them to Zod schemas that the MCP SDK's registerTool accepts.
 */
function buildZodSchema(inputSchema: Record<string, unknown>): Record<string, ZodTypeAny> {
  const zodShape: Record<string, ZodTypeAny> = {};

  for (const [key, value] of Object.entries(inputSchema)) {
    const prop = value as SchemaPropertyDescriptor;
    let schema: ZodTypeAny;

    switch (prop.type) {
      case "string":
        schema = z.string();
        break;
      case "number":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      default:
        schema = z.unknown();
        break;
    }

    if (prop.description) {
      schema = schema.describe(prop.description);
    }

    zodShape[key] = schema;
  }

  return zodShape;
}

export interface KizunaMcpServerOptions {
  dbPath: string;
  pluginManager?: PluginManager;
}

export function createServer(options: KizunaMcpServerOptions): McpServer {
  const mcp = new McpServer({ name: "kizuna", version: "0.0.0" }, { capabilities: { tools: {} } });

  const db = new Database(options.dbPath);
  const pluginManager = options.pluginManager;

  mcp.registerTool(
    "kizuna_search",
    {
      description:
        "Search Kizuna memories by query text. Returns relevant past conversation chunks ranked by relevance and recency.",
      inputSchema: {
        query: z.string().describe("Search query text"),
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results"),
      },
    },
    async (args) => {
      const searchQuery: SearchQuery = { text: args.query, limit: args.limit };
      const results = await searchMemory(db, searchQuery, { pluginManager });

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No memories found." }] };
      }

      const lines = results.map((r) => {
        const c = r.chunk;
        const date = c.createdAt.slice(0, 10);
        const preview = c.content.length > 200 ? c.content.slice(0, 200) + "..." : c.content;
        return `### [${date}] ${c.role} (score: ${r.score.toFixed(2)}, id: ${c.id})\n${preview}`;
      });

      return { content: [{ type: "text" as const, text: lines.join("\n\n---\n\n") }] };
    },
  );

  mcp.registerTool(
    "kizuna_save",
    {
      description: "Manually save a memory chunk to Kizuna storage.",
      inputSchema: {
        content: z.string().describe("The text content to save as a memory"),
        role: z
          .enum(["user", "assistant"])
          .default("assistant")
          .describe("The role of the speaker"),
        sessionId: z
          .string()
          .optional()
          .describe("Session ID to associate with (auto-generated if omitted)"),
        importance: z.number().int().min(0).max(10).default(5).describe("Importance score (0-10)"),
      },
    },
    async (args) => {
      const sessionId = args.sessionId ?? `manual-${Date.now()}`;
      const now = new Date().toISOString();

      const existingSession = db.getSession(sessionId);
      if (!existingSession) {
        db.insertSession({
          id: sessionId,
          projectId: "manual",
          startedAt: now,
          endedAt: null,
          transcriptPath: null,
          metadata: { source: "mcp" },
        });
      }

      const stored = db.insertChunk({
        sessionId,
        turnIndex: 0,
        role: args.role,
        content: args.content,
        metadata: { source: "mcp" },
        tokenCount: estimateTokens(args.content),
        importance: args.importance,
        createdAt: now,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Saved memory chunk (id: ${stored.id}, tokens: ${stored.tokenCount}).`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "kizuna_list",
    {
      description: "List recent memory chunks, optionally filtered by session ID.",
      inputSchema: {
        sessionId: z.string().optional().describe("Filter by session ID"),
        limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of results"),
      },
    },
    async (args) => {
      let chunks: StoredChunk[];

      if (args.sessionId) {
        chunks = db.getChunksBySession(args.sessionId);
        if (args.limit < chunks.length) {
          chunks = chunks.slice(0, args.limit);
        }
      } else {
        const stmt = db.db.prepare("SELECT * FROM chunks ORDER BY created_at DESC LIMIT ?");
        const rows = stmt.all(args.limit) as Array<{
          id: number;
          session_id: string;
          turn_index: number;
          role: string;
          content: string;
          token_count: number;
          importance: number;
          created_at: string;
          metadata: string;
        }>;
        chunks = rows.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          turnIndex: row.turn_index,
          role: row.role as "user" | "assistant",
          content: row.content,
          tokenCount: row.token_count,
          importance: row.importance,
          createdAt: row.created_at,
          metadata: JSON.parse(row.metadata) as Record<string, unknown>,
        }));
      }

      if (chunks.length === 0) {
        return { content: [{ type: "text" as const, text: "No chunks found." }] };
      }

      const lines = chunks.map((c) => {
        const date = c.createdAt.slice(0, 10);
        const preview = c.content.length > 100 ? c.content.slice(0, 100) + "..." : c.content;
        return `- **#${c.id}** [${date}] ${c.role}: ${preview}`;
      });

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "kizuna_delete",
    {
      description: "Delete memory chunks by their IDs.",
      inputSchema: {
        ids: z.array(z.number().int()).min(1).describe("Array of chunk IDs to delete"),
      },
    },
    async (args) => {
      const deleted = db.deleteChunks(args.ids);
      return {
        content: [{ type: "text" as const, text: `Deleted ${deleted} chunk(s).` }],
      };
    },
  );

  mcp.registerTool(
    "kizuna_report_save",
    {
      description:
        "Save a report to Kizuna. Used by Claude Code to write proposals or by Web UI to save analysis results.",
      inputSchema: {
        type: z.enum(["analysis", "proposal"]).describe("Report type"),
        source: z.enum(["webui", "claude"]).describe("Who created this report"),
        title: z.string().describe("Report title"),
        content: z.string().describe("Report content"),
      },
    },
    async (args) => {
      const report = db.insertReport({
        type: args.type,
        source: args.source,
        title: args.title,
        content: args.content,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved report (id: ${report.id}, type: ${report.type}, source: ${report.source}).`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "kizuna_report_read",
    {
      description:
        "Read reports from Kizuna. By default reads unread reports and marks them as read.",
      inputSchema: {
        status: z
          .enum(["unread", "read"])
          .default("unread")
          .describe("Filter by status (default: unread)"),
        type: z.enum(["analysis", "proposal"]).optional().describe("Filter by report type"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Maximum number of reports to return"),
      },
    },
    async (args) => {
      const { reports } = db.listReports({
        status: args.status,
        type: args.type,
        limit: args.limit,
      });

      if (reports.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No unread reports." }],
        };
      }

      // Mark returned reports as read in a transaction
      db.db.transaction(() => {
        for (const report of reports) {
          if (report.status === "unread") {
            db.updateReportStatus(report.id, "read");
          }
        }
      })();

      const lines = reports.map((r) => {
        const date = r.createdAt.slice(0, 10);
        return `### [${date}] ${r.type} by ${r.source} (id: ${r.id})\n**${r.title}**\n${r.content}`;
      });

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n---\n\n") }],
      };
    },
  );

  if (pluginManager) {
    for (const entry of pluginManager.getPlugins()) {
      if (!entry.initialized || entry.initFailed) continue;
      const tools = entry.plugin.mcpTools?.();
      if (!tools) continue;
      for (const tool of tools) {
        const hasInputSchema = Object.keys(tool.inputSchema).length > 0;
        if (hasInputSchema) {
          mcp.registerTool(
            tool.name,
            { description: tool.description, inputSchema: buildZodSchema(tool.inputSchema) },
            async (args) => {
              const result = await tool.handler(args, entry.context);
              return {
                content: [{ type: "text" as const, text: JSON.stringify(result.content) }],
                isError: result.isError,
              };
            },
          );
        } else {
          // MCP SDK calls the callback with (extra) when no inputSchema is set,
          // so we explicitly pass {} to the plugin handler.
          mcp.registerTool(tool.name, { description: tool.description }, async () => {
            const result = await tool.handler({}, entry.context);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(result.content) }],
              isError: result.isError,
            };
          });
        }
      }
    }
  }

  return mcp;
}
