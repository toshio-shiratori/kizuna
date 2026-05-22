# Kizuna C4 Architecture Model

Created: 2026-05-16
Scope: Kizuna — Plugin-based local long-term memory for Claude Code

---

## Level 1: System Context

How external users (Claude Code agents) and systems interact with Kizuna.

```mermaid
graph TB
    subgraph agents["Claude Code Agents"]
        REPO_A["👤 Agent A<br/>(Repository A)<br/><br/>e.g. Frontend"]
        REPO_B["👤 Agent B<br/>(Repository B)<br/><br/>e.g. Backend"]
        REPO_C["👤 Agent C<br/>(Repository C)<br/><br/>e.g. Infrastructure"]
    end

    subgraph kizuna_system["Kizuna System"]
        KIZUNA["🧠 Kizuna<br/>(Local Long-Term Memory)<br/><br/>Automatic capture & recall<br/>Plugin-based specialization"]
    end

    SQLITE["🗄️ SQLite<br/>(Single File)<br/><br/>Per-project or shared<br/>FTS5 full-text search"]

    REPO_A -->|"Hooks<br/>(SessionEnd / UserPromptSubmit / SessionStart)"| KIZUNA
    REPO_B -->|"Hooks + MCP Tools<br/>(kizuna_search / kizuna_save)"| KIZUNA
    REPO_C -->|"Hooks + MCP Tools"| KIZUNA
    KIZUNA -->|"Read / Write<br/>(WAL mode)"| SQLITE

    style KIZUNA fill:#7ed321,color:#fff
    style SQLITE fill:#f5a623,color:#fff
    style REPO_A fill:#4a90d9,color:#fff
    style REPO_B fill:#4a90d9,color:#fff
    style REPO_C fill:#4a90d9,color:#fff
```

### Actors

| Actor             | Interaction                               | Purpose                                                             |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Claude Code Agent | Hooks (automatic) + MCP tools (on-demand) | Save session transcripts, recall relevant memories, search actively |

### External Systems

| System               | Role                                                       | Communication                                   |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| SQLite (single file) | Persistent storage for memories, sessions, and plugin data | Direct file I/O (WAL mode, busy_timeout)        |
| Target Projects      | Repositories where Claude Code agents run                  | Hooks registered per-project via `kizuna setup` |

### Design Principles Reflected

- **No external dependencies**: All data stays in a local SQLite file (Principle 1)
- **Auto save / Always recall**: Hooks fire automatically, no manual action needed (Principles 3, 4)

---

## Level 2: Container

The technical containers (executable units / packages) that compose the Kizuna system.

```mermaid
graph TB
    AGENT["👤 Claude Code Agent<br/><br/>Runs in target repository"]

    subgraph kizuna_system["Kizuna System"]
        CLI["⌨️ kizuna-cli<br/>(CLI / Hook Handlers)<br/><br/>commander<br/><br/>setup, search, list, prune,<br/>stats, cleanup, recap,<br/>plugin, hook handlers"]

        MCP["📡 kizuna-mcp<br/>(MCP Server)<br/><br/>stdio transport<br/>MCP SDK<br/><br/>kizuna_search, kizuna_save,<br/>kizuna_list, kizuna_delete"]

        CORE["⚙️ kizuna-core<br/>(Memory Engine)<br/><br/>better-sqlite3 only<br/><br/>Storage, Pipelines,<br/>Plugin Manager, Config"]

        subgraph plugins["Plugins (optional, shown: 2 of several)"]
            PII["🔒 plugin-pii-sanitizer<br/><br/>Redacts API keys,<br/>tokens, secrets<br/>before storage"]
            MULTI["🌐 plugin-multi-repo-sharing<br/><br/>Shared SQLite for<br/>cross-repo memories<br/>with namespace filtering"]
        end
    end

    SQLITE["🗄️ SQLite<br/>(memory.db)<br/><br/>FTS5 + trigram tokenizer<br/>WAL mode"]

    AGENT -->|"Hooks<br/>(SessionEnd / UserPromptSubmit<br/>/ SessionStart)"| CLI
    AGENT -->|"MCP Tools<br/>(stdio)"| MCP
    CLI -->|"Function calls"| CORE
    MCP -->|"Function calls"| CORE
    PII -->|"Plugin API<br/>(beforeCapture)"| CORE
    MULTI -->|"Plugin API<br/>(beforeCapture / beforeSearch / afterSearch)"| CORE
    CORE -->|"SQL<br/>(better-sqlite3)"| SQLITE

    style CLI fill:#7ed321,color:#fff
    style MCP fill:#66bb6a,color:#fff
    style CORE fill:#4a90d9,color:#fff
    style SQLITE fill:#f5a623,color:#fff
    style PII fill:#9b59b6,color:#fff
    style MULTI fill:#9b59b6,color:#fff
```

### Container List

| Container                     | Technology                  | Responsibility                                                                                                                          |
| ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **kizuna-cli**                | TypeScript, commander       | CLI commands (setup, search, list, prune, stats, cleanup, recap, plugin) and hook handlers (SessionEnd, UserPromptSubmit, SessionStart) |
| **kizuna-mcp**                | TypeScript, MCP SDK (stdio) | MCP server exposing tools (kizuna_search, kizuna_save, kizuna_list, kizuna_delete) for active agent queries                             |
| **kizuna-core**               | TypeScript, better-sqlite3  | Generic memory engine: storage layer, pipelines (capture, search, inject, maintain), plugin manager, configuration                      |
| **plugin-pii-sanitizer**      | TypeScript                  | Redacts API keys, tokens, and secrets from chunks before storage via `beforeCapture` hook                                               |
| **plugin-multi-repo-sharing** | TypeScript                  | Enables cross-repository memory search via federated read-only queries to referenced project databases                                  |
| _(and others)_                | TypeScript                  | Additional plugins include hybrid-search (FTS5 + sqlite-vec), openapi-awareness, etc.                                                   |
| **SQLite**                    | SQLite + FTS5 (trigram)     | Persistent storage for sessions, chunks, FTS index, maintenance metadata, and plugin KV store                                           |

### Dependency Rules

| From        | To                                  | Allowed?                                          |
| ----------- | ----------------------------------- | ------------------------------------------------- |
| kizuna-cli  | kizuna-core                         | Yes                                               |
| kizuna-mcp  | kizuna-core                         | Yes                                               |
| plugin-\*   | kizuna-core (types only)            | Yes                                               |
| kizuna-core | kizuna-cli / kizuna-mcp / plugin-\* | **No** (core must never depend on outer packages) |

### Hook Integration

| Hook             | Handler                                   | Latency Budget |
| ---------------- | ----------------------------------------- | -------------- |
| SessionStart     | CLI: inject baseline context              | < 200ms        |
| UserPromptSubmit | CLI: search + inject relevant memories    | < 100ms        |
| SessionEnd       | CLI: capture transcript + run maintenance | < 5s           |

---

## Level 3: Component (kizuna-core)

Internal components of the core memory engine.

```mermaid
graph TB
    CLI_IN["⌨️ kizuna-cli"]
    MCP_IN["📡 kizuna-mcp"]

    subgraph core["kizuna-core"]
        subgraph pipelines["Pipelines"]
            CAPTURE["📥 Capture Pipeline<br/><br/>Parse transcript JSONL<br/>Rule-based chunking<br/>Metadata extraction<br/><br/>Zero token cost"]
            SEARCH["🔍 Search Pipeline<br/><br/>FTS5 query<br/>BM25 + time decay<br/>Keyword reranker<br/><br/>CJK n-gram support"]
            INJECT["💉 Inject Pipeline<br/><br/>Format top-K results<br/>Token budget control<br/>Markdown output"]
            MAINTAIN["🧹 Maintain Pipeline<br/><br/>Prune old chunks<br/>Enforce size limits<br/>WAL checkpoint<br/>24h throttle"]
        end

        PM["🔌 Plugin Manager<br/><br/>Discovery & loading<br/>Lifecycle (init / shutdown)<br/>Hook dispatch<br/>Error isolation<br/>Per-plugin KV store"]

        subgraph storage_layer["Storage Layer"]
            DB["🗄️ Database<br/>(better-sqlite3)<br/><br/>SQLite + FTS5<br/>WAL mode<br/>Migrations"]
        end

        CONFIG["⚙️ Config<br/><br/>Global config<br/>Project config<br/>Merge & resolve"]
    end

    PLUGINS_EXT["🔌 Plugins<br/>(external packages)"]
    SQLITE_EXT["🗄️ SQLite File<br/>(memory.db)"]

    CLI_IN --> CAPTURE
    CLI_IN --> SEARCH
    CLI_IN --> INJECT
    CLI_IN --> MAINTAIN
    MCP_IN --> SEARCH

    CAPTURE -->|"beforeCapture / afterCapture"| PM
    SEARCH -->|"beforeSearch / afterSearch"| PM
    INJECT -->|"enrichContext"| PM
    PM <-->|"Plugin API"| PLUGINS_EXT

    CAPTURE --> DB
    SEARCH --> DB
    MAINTAIN --> DB
    DB -->|"SQL"| SQLITE_EXT

    CONFIG --> CAPTURE
    CONFIG --> SEARCH
    CONFIG --> INJECT
    CONFIG --> MAINTAIN

    style CAPTURE fill:#7ed321,color:#fff
    style SEARCH fill:#4a90d9,color:#fff
    style INJECT fill:#66bb6a,color:#fff
    style MAINTAIN fill:#f5a623,color:#fff
    style PM fill:#9b59b6,color:#fff
    style DB fill:#e74c3c,color:#fff
    style CONFIG fill:#95a5a6,color:#fff
```

### Component List

| Component              | Responsibility                                | Key Details                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Capture Pipeline**   | Parse session transcripts and store as chunks | JSONL parsing, rule-based chunking (one chunk per turn), metadata extraction. No LLM calls (Principle 2).                                                                                                                                        |
| **Search Pipeline**    | Find relevant memories for a given query      | FTS5 full-text search with trigram tokenizer, BM25 ranking with time decay, keyword-based reranking. Supports English and Japanese (CJK n-gram).                                                                                                 |
| **Inject Pipeline**    | Format search results for prompt injection    | Selects top-K results within a token budget, formats as Markdown, outputs augmented prompt.                                                                                                                                                      |
| **Maintain Pipeline**  | Prevent database bloat                        | Prunes chunks older than threshold (default: 90 days), enforces size limit (default: 100 MB), removes empty sessions, WAL checkpoint. Runs at most once per 24 hours (Principle 7).                                                              |
| **Plugin Manager**     | Manage plugin lifecycle and hook dispatch     | Discovers plugins (config-declared + auto-discovered), manages init/shutdown lifecycle, dispatches pipeline hooks (beforeCapture, afterCapture, beforeSearch, afterSearch, enrichContext), isolates plugin errors, provides per-plugin KV store. |
| **Database (Storage)** | SQLite access layer                           | Wraps better-sqlite3 with WAL mode, schema migrations, CRUD operations for sessions/chunks, FTS5 index management. The only external dependency in core (Principle 6).                                                                           |
| **Config**             | Configuration loading and resolution          | Loads global config (`~/.config/kizuna/config.json`) and project config (`.kizuna/config.json`), merges with project config taking precedence.                                                                                                   |

### Data Flow: Save Path (Capture)

```
Claude Code session ends
  → SessionEnd hook fires
    → CLI reads transcript JSONL
      → Plugin Manager: beforeCapture hooks
        → Capture Pipeline: rule-based chunking
          → Plugin Manager: afterCapture hooks
            → Database: insert into SQLite (chunks + FTS5)
              → Maintain Pipeline: cleanup if 24h since last run
```

### Data Flow: Recall Path (Inject)

```
User submits prompt
  → UserPromptSubmit hook fires
    → Plugin Manager: beforeSearch hooks
      → Search Pipeline: FTS5 + BM25 + time decay
        → Plugin Manager: afterSearch hooks
          → Inject Pipeline: format top-K results
            → Plugin Manager: enrichContext hooks
              → Augmented prompt output to Claude Code
```

### Data Flow: MCP Path (Active Search)

```
Agent invokes MCP tool (e.g. kizuna_search)
  → MCP Server receives request
    → Same Search Pipeline (steps above)
      → MCP Server returns formatted results
```

### Plugin Hook Points

| Hook                       | Pipeline Stage           | Purpose                                             |
| -------------------------- | ------------------------ | --------------------------------------------------- |
| `beforeCapture(chunk)`     | Capture, before storage  | Transform or filter chunks (e.g. PII redaction)     |
| `afterCapture(chunk)`      | Capture, after storage   | Post-processing (e.g. cross-repo tagging)           |
| `beforeSearch(query)`      | Search, before FTS5      | Transform query (e.g. expand keywords)              |
| `afterSearch(results)`     | Search, after ranking    | Rerank or filter results (e.g. namespace filtering) |
| `enrichContext(injection)` | Inject, after formatting | Add extra context blocks (e.g. shared memories)     |
