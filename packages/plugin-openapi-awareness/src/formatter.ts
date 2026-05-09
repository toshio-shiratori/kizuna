import type { EndpointInfo } from "./parser.js";
import type { MatchResult } from "./matcher.js";

export function formatEndpoints(matches: MatchResult[]): string {
  if (matches.length === 0) return "";

  const lines: string[] = ["## Related API Endpoints\n"];

  for (const { endpoint } of matches) {
    lines.push(formatEndpoint(endpoint));
    lines.push("");
  }

  return lines.join("\n");
}

function formatEndpoint(ep: EndpointInfo): string {
  const lines: string[] = [];
  lines.push(`### ${ep.method} ${ep.path}`);

  if (ep.summary) {
    lines.push(`> ${ep.summary}`);
  }
  if (ep.description) {
    lines.push("");
    lines.push(ep.description);
  }

  if (ep.tags.length > 0) {
    lines.push(`\nTags: ${ep.tags.join(", ")}`);
  }

  if (ep.parameters.length > 0) {
    lines.push("\n**Parameters:**");
    for (const param of ep.parameters) {
      const req = param.required ? " (required)" : "";
      const desc = param.description ? ` — ${param.description}` : "";
      lines.push(`- \`${param.name}\` (${param.in}${req})${desc}`);
    }
  }

  if (ep.requestBody) {
    lines.push("\n**Request Body:**");
    if (ep.requestBody.description) {
      lines.push(ep.requestBody.description);
    }
    if (ep.requestBody.properties.length > 0) {
      for (const prop of ep.requestBody.properties) {
        const req = prop.required ? " (required)" : "";
        const type = prop.type ? `: ${prop.type}` : "";
        const desc = prop.description ? ` — ${prop.description}` : "";
        lines.push(`- \`${prop.name}\`${type}${req}${desc}`);
      }
    }
  }

  if (ep.responses.length > 0) {
    lines.push("\n**Responses:**");
    for (const resp of ep.responses) {
      const desc = resp.description ? ` — ${resp.description}` : "";
      lines.push(`- ${resp.status}${desc}`);
    }
  }

  return lines.join("\n");
}
