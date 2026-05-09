import type { EndpointInfo } from "./parser.js";

export interface MatchResult {
  endpoint: EndpointInfo;
  score: number;
}

export function matchEndpoints(
  query: string,
  endpoints: readonly EndpointInfo[],
  maxResults: number,
): MatchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const results: MatchResult[] = [];

  for (const endpoint of endpoints) {
    const score = scoreEndpoint(terms, endpoint);
    if (score > 0) {
      results.push({ endpoint, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/_-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreEndpoint(terms: string[], endpoint: EndpointInfo): number {
  let score = 0;
  const pathLower = endpoint.path.toLowerCase();
  const pathSegments = pathLower.split("/").filter(Boolean);
  const operationLower = (endpoint.operationId ?? "").toLowerCase();
  const summaryLower = (endpoint.summary ?? "").toLowerCase();
  const descriptionLower = (endpoint.description ?? "").toLowerCase();
  const tagsLower = endpoint.tags.map((t) => t.toLowerCase());

  for (const term of terms) {
    if (pathSegments.some((seg) => seg === term || seg.includes(term))) {
      score += 5;
    }

    if (operationLower.includes(term)) {
      score += 4;
    }

    for (const tag of tagsLower) {
      if (tag === term || tag.includes(term)) {
        score += 3;
        break;
      }
    }

    if (summaryLower.includes(term)) {
      score += 2;
    }

    if (descriptionLower.includes(term)) {
      score += 1;
    }
  }

  return score;
}
