declare module "@huggingface/transformers" {
  export function pipeline(
    task: string,
    model: string,
  ): Promise<
    (text: string, options: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>
  >;
}
