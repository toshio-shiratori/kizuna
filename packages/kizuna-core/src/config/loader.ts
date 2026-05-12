import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
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

function mergePipeline(overrides: Partial<Record<string, unknown>>): PipelineConfig {
  return {
    tokenBudget: intOrDefault(overrides.tokenBudget, PIPELINE_DEFAULTS.tokenBudget),
    maxResults: intOrDefault(overrides.maxResults, PIPELINE_DEFAULTS.maxResults),
    halfLifeDays: numOrDefault(overrides.halfLifeDays, PIPELINE_DEFAULTS.halfLifeDays),
    minContentLength: intOrDefault(overrides.minContentLength, PIPELINE_DEFAULTS.minContentLength),
  };
}

function mergeDisplay(overrides: Partial<Record<string, unknown>>): DisplayConfig {
  return {
    previewLength: intOrDefault(overrides.previewLength, DISPLAY_DEFAULTS.previewLength),
    cleanupPreviewLength: intOrDefault(
      overrides.cleanupPreviewLength,
      DISPLAY_DEFAULTS.cleanupPreviewLength,
    ),
    cleanupShowLimit: intOrDefault(overrides.cleanupShowLimit, DISPLAY_DEFAULTS.cleanupShowLimit),
    recapChunkLimit: intOrDefault(overrides.recapChunkLimit, DISPLAY_DEFAULTS.recapChunkLimit),
    listLimit: intOrDefault(overrides.listLimit, DISPLAY_DEFAULTS.listLimit),
  };
}

export function loadConfig(cwd: string): KizunaConfig {
  const configPath = join(cwd, ".kizuna", CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const pipelineOverrides =
      typeof parsed.pipeline === "object" && parsed.pipeline !== null
        ? (parsed.pipeline as Record<string, unknown>)
        : {};

    const displayOverrides =
      typeof parsed.display === "object" && parsed.display !== null
        ? (parsed.display as Record<string, unknown>)
        : {};

    return {
      pipeline: mergePipeline(pipelineOverrides),
      display: mergeDisplay(displayOverrides),
    };
  } catch (error) {
    throw new Error(`Failed to parse config file: ${configPath}`, { cause: error });
  }
}
