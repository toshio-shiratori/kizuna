import type BetterSqlite3 from "better-sqlite3";
import type {
  Plugin,
  PluginConfig,
  PluginContext,
  ProjectConfig,
  Logger,
  RawChunk,
  StoredChunk,
  SearchQuery,
  SearchResult,
  ContextInjection,
} from "../index.js";
import { SqlitePluginStorage } from "./plugin-storage.js";
import { runPluginMigrations } from "./plugin-migrator.js";

export interface PluginEntry {
  readonly plugin: Plugin;
  readonly config: PluginConfig;
  readonly context: PluginContext;
  initialized: boolean;
  initFailed: boolean;
}

export interface PluginManagerOptions {
  db: BetterSqlite3.Database;
  projectConfig: ProjectConfig;
  logger?: Logger;
}

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function createScopedLogger(parent: Logger, pluginName: string): Logger {
  const prefix = `[plugin:${pluginName}]`;
  return {
    debug(message, meta) {
      parent.debug(`${prefix} ${message}`, meta);
    },
    info(message, meta) {
      parent.info(`${prefix} ${message}`, meta);
    },
    warn(message, meta) {
      parent.warn(`${prefix} ${message}`, meta);
    },
    error(message, meta) {
      parent.error(`${prefix} ${message}`, meta);
    },
  };
}

export class PluginManager {
  private readonly plugins: PluginEntry[] = [];
  private readonly db: BetterSqlite3.Database;
  private readonly projectConfig: ProjectConfig;
  private readonly logger: Logger;

  constructor(options: PluginManagerOptions) {
    this.db = options.db;
    this.projectConfig = options.projectConfig;
    this.logger = options.logger ?? noopLogger;
  }

  register(plugin: Plugin, config?: PluginConfig): void {
    if (!plugin.name) {
      throw new Error("Plugin must have a name");
    }
    if (!plugin.version) {
      throw new Error("Plugin must have a version");
    }
    if (this.plugins.some((e) => e.plugin.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    const pluginConfig: PluginConfig = config ?? { enabled: true, options: {} };

    if (!pluginConfig.enabled) {
      this.logger.info(`Plugin "${plugin.name}" is disabled, skipping`);
      return;
    }

    const scopedLogger = createScopedLogger(this.logger, plugin.name);
    const storage = new SqlitePluginStorage(this.db, plugin.name);
    const context: PluginContext = {
      db: this.db,
      config: pluginConfig,
      projectConfig: this.projectConfig,
      logger: scopedLogger,
      storage,
    };

    const entry: PluginEntry = {
      plugin,
      config: pluginConfig,
      context,
      initialized: false,
      initFailed: false,
    };

    if (plugin.migrations) {
      try {
        const migrations = plugin.migrations();
        if (migrations.length > 0) {
          runPluginMigrations(this.db, plugin.name, migrations, scopedLogger);
        }
      } catch (err) {
        scopedLogger.error(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
        entry.initFailed = true;
      }
    }

    this.plugins.push(entry);
  }

  async initAll(): Promise<void> {
    for (const entry of this.plugins) {
      if (entry.initFailed) {
        this.logger.warn(`Skipping init for "${entry.plugin.name}" due to prior failure`);
        continue;
      }

      if (entry.plugin.init) {
        try {
          await entry.plugin.init(entry.context);
          entry.initialized = true;
        } catch (err) {
          entry.initFailed = true;
          entry.context.logger.error(
            `init failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        entry.initialized = true;
      }
    }
  }

  async shutdownAll(): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const entry = this.plugins[i]!;
      if (!entry.initialized || !entry.plugin.shutdown) continue;

      try {
        await entry.plugin.shutdown(entry.context);
      } catch (err) {
        entry.context.logger.error(
          `shutdown failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  getPlugins(): ReadonlyArray<PluginEntry> {
    return this.plugins;
  }

  getPlugin(name: string): PluginEntry | undefined {
    return this.plugins.find((e) => e.plugin.name === name);
  }

  private activePlugins(): PluginEntry[] {
    return this.plugins.filter((e) => e.initialized && !e.initFailed);
  }

  async runBeforeCapture(chunk: RawChunk): Promise<RawChunk | null> {
    let current: RawChunk | null = chunk;
    for (const entry of this.activePlugins()) {
      if (!entry.plugin.beforeCapture || current === null) continue;
      try {
        current = await entry.plugin.beforeCapture(current, entry.context);
      } catch (err) {
        entry.context.logger.error(
          `beforeCapture failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return current;
  }

  async runAfterCapture(chunk: StoredChunk): Promise<void> {
    for (const entry of this.activePlugins()) {
      if (!entry.plugin.afterCapture) continue;
      try {
        await entry.plugin.afterCapture(chunk, entry.context);
      } catch (err) {
        entry.context.logger.error(
          `afterCapture failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async runBeforeSearch(query: SearchQuery): Promise<SearchQuery> {
    let current = query;
    for (const entry of this.activePlugins()) {
      if (!entry.plugin.beforeSearch) continue;
      try {
        current = await entry.plugin.beforeSearch(current, entry.context);
      } catch (err) {
        entry.context.logger.error(
          `beforeSearch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return current;
  }

  async runAfterSearch(results: SearchResult[]): Promise<SearchResult[]> {
    let current = results;
    for (const entry of this.activePlugins()) {
      if (!entry.plugin.afterSearch) continue;
      try {
        current = await entry.plugin.afterSearch(current, entry.context);
      } catch (err) {
        entry.context.logger.error(
          `afterSearch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return current;
  }

  getReservedTokenBudgets(): Map<string, number> {
    const budgets = new Map<string, number>();
    for (const entry of this.activePlugins()) {
      if (entry.plugin.tokenBudget != null && entry.plugin.tokenBudget > 0) {
        budgets.set(entry.plugin.name, entry.plugin.tokenBudget);
      }
    }
    return budgets;
  }

  getTotalReservedTokens(): number {
    let total = 0;
    for (const entry of this.activePlugins()) {
      if (entry.plugin.tokenBudget != null && entry.plugin.tokenBudget > 0) {
        total += entry.plugin.tokenBudget;
      }
    }
    return total;
  }

  scaleTokenBudgets(totalBudget: number): number {
    const totalReserved = this.getTotalReservedTokens();
    if (totalReserved <= 0 || totalReserved < totalBudget) {
      return totalReserved;
    }
    const cap = Math.floor(totalBudget * 0.8);
    const scale = cap / totalReserved;
    const budgets = this.getReservedTokenBudgets();
    const entries = [...budgets.entries()]
      .map(([name, b]) => `${name}=${Math.floor(b * scale)}`)
      .join(", ");
    this.logger.warn(
      `Plugin token budgets (${totalReserved}) exceed total budget (${totalBudget}). Scaled to 80%: ${entries}`,
    );
    return cap;
  }

  async runEnrichContext(injection: ContextInjection): Promise<ContextInjection> {
    let current = injection;
    for (const entry of this.activePlugins()) {
      if (!entry.plugin.enrichContext) continue;
      try {
        current = await entry.plugin.enrichContext(current, entry.context);
      } catch (err) {
        entry.context.logger.error(
          `enrichContext failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return current;
  }
}
