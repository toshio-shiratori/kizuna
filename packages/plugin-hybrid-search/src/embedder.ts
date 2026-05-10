export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
  readonly stats?: EmbeddingStats;
}

export interface EmbeddingStats {
  modelLoadMs: number;
  totalEmbedCalls: number;
  totalEmbedMs: number;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

export function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function bufferToFloat32(buf: Buffer): Float32Array {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Float32Array(ab);
}

type Extractor = (
  text: string,
  options: Record<string, unknown>,
) => Promise<{ data: ArrayLike<number> }>;

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  readonly stats: EmbeddingStats = { modelLoadMs: 0, totalEmbedCalls: 0, totalEmbedMs: 0 };
  private readonly model: string;
  private extractor: Extractor | null = null;

  constructor(options?: { model?: string; dimensions?: number }) {
    this.model = options?.model ?? "Xenova/multilingual-e5-small";
    this.dimensions = options?.dimensions ?? 384;
  }

  async embed(text: string): Promise<Float32Array> {
    const start = performance.now();
    if (!this.extractor) {
      const { pipeline } = await import("@huggingface/transformers");
      this.extractor = (await pipeline("feature-extraction", this.model)) as Extractor;
      this.stats.modelLoadMs = performance.now() - start;
    }
    const output = await this.extractor(text, { pooling: "mean", normalize: true });
    this.stats.totalEmbedCalls++;
    this.stats.totalEmbedMs += performance.now() - start;
    return new Float32Array(output.data);
  }
}
