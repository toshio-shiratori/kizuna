export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
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
  private readonly model: string;
  private extractor: Extractor | null = null;

  constructor(options?: { model?: string; dimensions?: number }) {
    this.model = options?.model ?? "Xenova/multilingual-e5-small";
    this.dimensions = options?.dimensions ?? 384;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.extractor) {
      const { pipeline } = await import("@huggingface/transformers");
      this.extractor = (await pipeline("feature-extraction", this.model)) as Extractor;
    }
    const output = await this.extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  }
}
