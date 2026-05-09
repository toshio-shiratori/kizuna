export interface RedactionPattern {
  readonly name: string;
  readonly regex: RegExp;
}

export const DEFAULT_PATTERNS: readonly RedactionPattern[] = [
  { name: "anthropic_key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_key", regex: /sk-[A-Za-z0-9]{32,}/g },
  { name: "github_token", regex: /ghp_[A-Za-z0-9]{36}/g },
  { name: "github_oauth", regex: /gho_[A-Za-z0-9]{36}/g },
  { name: "github_pat", regex: /github_pat_[A-Za-z0-9_]{22,}/g },
  { name: "aws_access_key", regex: /AKIA[A-Z0-9]{16}/g },
  {
    name: "aws_secret_key",
    regex: /(?<=AWS_SECRET_ACCESS_KEY\s*[=:]\s*['"]?)[A-Za-z0-9/+=]{40}(?=['"]?)/g,
  },
  { name: "slack_token", regex: /xox[bpras]-[A-Za-z0-9-]{10,}/g },
  {
    name: "generic_secret",
    regex: /(?<=(?:secret|token|password|api_key|apikey)\s*[=:]\s*['"])[^'"]{16,}(?=['"])/gi,
  },
];

export function compilePatterns(
  customPatterns?: ReadonlyArray<{ name: string; pattern: string; flags?: string }>,
): RedactionPattern[] {
  const patterns = DEFAULT_PATTERNS.map((p) => ({
    name: p.name,
    regex: new RegExp(p.regex.source, p.regex.flags),
  }));

  if (customPatterns) {
    for (const cp of customPatterns) {
      patterns.push({
        name: cp.name,
        regex: new RegExp(cp.pattern, cp.flags ?? "g"),
      });
    }
  }

  return patterns;
}
