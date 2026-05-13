import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  PIPELINE_DEFAULTS,
  DISPLAY_DEFAULTS,
  type KizunaConfig,
  type PipelineConfig,
  type DisplayConfig,
} from "./defaults.js";

const CONFIG_FILENAME = "config.json";

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function intOrDefault(value: unknown, fallback: number): number {
  return isPositiveNumber(value) ? Math.floor(value) : fallback;
}

function numOrDefault(value: unknown, fallback: number): number {
  return isPositiveNumber(value) ? value : fallback;
}

function mergePipeline(
  overrides: Partial<Record<string, unknown>>,
  base: PipelineConfig,
): PipelineConfig {
  return {
    tokenBudget: intOrDefault(overrides.tokenBudget, base.tokenBudget),
    maxResults: intOrDefault(overrides.maxResults, base.maxResults),
    halfLifeDays: numOrDefault(overrides.halfLifeDays, base.halfLifeDays),
    minContentLength: intOrDefault(overrides.minContentLength, base.minContentLength),
  };
}

function mergeDisplay(
  overrides: Partial<Record<string, unknown>>,
  base: DisplayConfig,
): DisplayConfig {
  return {
    previewLength: intOrDefault(overrides.previewLength, base.previewLength),
    cleanupPreviewLength: intOrDefault(overrides.cleanupPreviewLength, base.cleanupPreviewLength),
    cleanupShowLimit: intOrDefault(overrides.cleanupShowLimit, base.cleanupShowLimit),
    recapChunkLimit: intOrDefault(overrides.recapChunkLimit, base.recapChunkLimit),
    recapMaxContentLength: intOrDefault(
      overrides.recapMaxContentLength,
      base.recapMaxContentLength,
    ),
    listLimit: intOrDefault(overrides.listLimit, base.listLimit),
  };
}

interface ConfigOverrides {
  pipeline: Partial<Record<string, unknown>>;
  display: Partial<Record<string, unknown>>;
}

function readConfigFile(configPath: string): ConfigOverrides | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const pipeline =
      typeof parsed.pipeline === "object" && parsed.pipeline !== null
        ? (parsed.pipeline as Record<string, unknown>)
        : {};

    const display =
      typeof parsed.display === "object" && parsed.display !== null
        ? (parsed.display as Record<string, unknown>)
        : {};

    return { pipeline, display };
  } catch (error) {
    throw new Error(`Failed to parse config file: ${configPath}`, { cause: error });
  }
}

export function loadConfig(cwd: string, globalConfigDir?: string): KizunaConfig {
  const effectiveGlobalDir = globalConfigDir ?? join(homedir(), ".config", "kizuna");
  const globalConfigPath = join(effectiveGlobalDir, CONFIG_FILENAME);
  const projectConfigPath = join(cwd, ".kizuna", CONFIG_FILENAME);

  // Start with defaults
  let pipeline: PipelineConfig = PIPELINE_DEFAULTS;
  let display: DisplayConfig = DISPLAY_DEFAULTS;

  // Layer 1: Apply global config overrides
  const globalOverrides = readConfigFile(globalConfigPath);
  if (globalOverrides) {
    pipeline = mergePipeline(globalOverrides.pipeline, pipeline);
    display = mergeDisplay(globalOverrides.display, display);
  }

  // Layer 2: Apply project config overrides
  const projectOverrides = readConfigFile(projectConfigPath);
  if (projectOverrides) {
    pipeline = mergePipeline(projectOverrides.pipeline, pipeline);
    display = mergeDisplay(projectOverrides.display, display);
  }

  return { pipeline, display };
}
