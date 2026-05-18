export interface PipelineConfig {
  readonly tokenBudget: number;
  readonly maxResults: number;
  readonly halfLifeDays: number;
  readonly minContentLength: number;
  readonly noisePatterns: readonly string[];
}

export interface DisplayConfig {
  readonly previewLength: number;
  readonly cleanupPreviewLength: number;
  readonly cleanupShowLimit: number;
  readonly recapChunkLimit: number;
  readonly recapMaxContentLength: number;
  readonly listLimit: number;
}

export interface KizunaConfig {
  readonly pipeline: PipelineConfig;
  readonly display: DisplayConfig;
}

export const PIPELINE_DEFAULTS: Readonly<PipelineConfig> = {
  tokenBudget: 2000,
  maxResults: 10,
  halfLifeDays: 30,
  minContentLength: 10,
  noisePatterns: [],
};

export const DISPLAY_DEFAULTS: Readonly<DisplayConfig> = {
  previewLength: 120,
  cleanupPreviewLength: 50,
  cleanupShowLimit: 20,
  recapChunkLimit: 5,
  recapMaxContentLength: 500,
  listLimit: 20,
};

export const DEFAULT_CONFIG: Readonly<KizunaConfig> = {
  pipeline: PIPELINE_DEFAULTS,
  display: DISPLAY_DEFAULTS,
};
