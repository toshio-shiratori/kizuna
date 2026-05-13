import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const KIZUNA_SECTION_MARKER = "## Kizuna (Long-term Memory)";

export function buildClaudeMdSection(): string {
  return `
${KIZUNA_SECTION_MARKER}

Memories are captured and recalled automatically via hooks. For active queries:

| Command | Description |
|---------|-------------|
| \`kizuna search <query>\` | Search this project's memories |
| \`kizuna search <query> --cwd <path>\` | Search another project's memories |
| \`kizuna list --session <id>\` | List chunks from a specific session |
| \`kizuna stats\` | Show database statistics |
`;
}

export function injectClaudeMdSection(claudeMdPath: string): boolean {
  let content = "";
  if (existsSync(claudeMdPath)) {
    content = readFileSync(claudeMdPath, "utf-8");
    if (content.includes(KIZUNA_SECTION_MARKER)) {
      return false;
    }
  }

  const section = buildClaudeMdSection();
  const newContent = content.length > 0 ? content.trimEnd() + "\n" + section : section.trimStart();
  writeFileSync(claudeMdPath, newContent);
  return true;
}
