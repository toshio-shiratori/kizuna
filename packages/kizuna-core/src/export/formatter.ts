import type { StoredChunk } from "../index.js";

export type ExportFormat = "markdown" | "json";

export interface ExportFilters {
  since?: string;
  until?: string;
  query?: string;
  limit?: number;
}

export interface ExportMeta {
  projectId: string;
  exportedAt: string;
  chunkCount: number;
  dateRange: { from: string; to: string } | null;
  filters: ExportFilters;
}

export interface ExportData {
  meta: ExportMeta;
  chunks: StoredChunk[];
}

/**
 * Format export data as Markdown according to ADR-0015.
 */
export function formatMarkdown(data: ExportData): string {
  const { meta, chunks } = data;
  const lines: string[] = [];

  lines.push("# Kizuna Memory Export");
  lines.push("");
  lines.push(`- **Project**: ${meta.projectId}`);
  lines.push(`- **Exported**: ${meta.exportedAt}`);
  lines.push(`- **Chunks**: ${meta.chunkCount}`);

  if (meta.dateRange) {
    lines.push(`- **Date range**: ${meta.dateRange.from} — ${meta.dateRange.to}`);
  } else {
    lines.push("- **Date range**: (none)");
  }

  lines.push(`- **Filters**: ${formatFiltersMarkdown(meta.filters)}`);
  lines.push("");
  lines.push("---");

  for (const chunk of chunks) {
    lines.push("");
    const shortSessionId = chunk.sessionId.slice(0, 8);
    lines.push(
      `## [${chunk.createdAt}] ${chunk.role} (session: ${shortSessionId}, importance: ${chunk.importance})`,
    );
    lines.push("");
    lines.push(chunk.content);
    lines.push("");
    lines.push("---");
  }

  return lines.join("\n") + "\n";
}

function formatFiltersMarkdown(filters: ExportFilters): string {
  const parts: string[] = [];

  if (filters.since) {
    parts.push(`since=${filters.since}`);
  }
  if (filters.until) {
    parts.push(`until=${filters.until}`);
  }
  if (filters.query) {
    parts.push(`query="${filters.query}"`);
  }
  if (filters.limit !== undefined) {
    parts.push(`limit=${filters.limit}`);
  }

  return parts.length > 0 ? parts.join(", ") : "(none)";
}

/**
 * Format export data as JSON according to ADR-0015.
 */
export function formatJson(data: ExportData): string {
  const output = {
    meta: {
      projectId: data.meta.projectId,
      exportedAt: data.meta.exportedAt,
      chunkCount: data.meta.chunkCount,
      dateRange: data.meta.dateRange,
      filters: data.meta.filters,
    },
    chunks: data.chunks.map((chunk) => ({
      id: chunk.id,
      sessionId: chunk.sessionId,
      role: chunk.role,
      content: chunk.content,
      importance: chunk.importance,
      createdAt: chunk.createdAt,
      metadata: chunk.metadata,
    })),
  };

  return JSON.stringify(output, null, 2) + "\n";
}

/**
 * Format export data in the specified format.
 */
export function formatExport(data: ExportData, format: ExportFormat): string {
  switch (format) {
    case "markdown":
      return formatMarkdown(data);
    case "json":
      return formatJson(data);
  }
}
