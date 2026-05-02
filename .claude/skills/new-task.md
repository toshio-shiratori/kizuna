---
name: new-task
description: GitHub Issue を作成しブランチを切って実装準備を整える。「作業開始」「実装して」等の指示を受けた際に使用。
---

## When to Use

- ユーザーから実装タスクの指示を受けたとき
- 新しい機能やバグ修正に着手するとき
- Issue が未作成の状態で作業開始を求められたとき

## Steps

1. **Issue 作成**
   ```bash
   gh issue create --title "<type>: <description>" --body "..."
   ```
   - テンプレートがある場合は `--template phase-task.yml` を使用
   - Conventional Commits の prefix を title に使う（feat, fix, docs, refactor 等）

2. **ユーザー確認** — Issue URL を提示し、内容の確認を取る

3. **ブランチ作成**
   ```bash
   git switch -c <type>/issue-<N>-<short-description> main
   ```

4. **事前読み込み** — 以下を読んでから実装に入る:
   - `gh issue view <N>`
   - `docs/02-design-principles.md`
   - `docs/06-roadmap.md`（フェーズタスクの場合）
   - Issue で指定された設計参照ドキュメント

5. **要約報告** — 読んだ内容をもとに、以下をユーザーに報告:
   - Issue が求めていること
   - 該当する設計原則
   - 検証基準
   - 未解決の質問

## References

- `CLAUDE.md` — Implementation Checklist セクション
- `docs/02-design-principles.md` — 8 つの設計原則
- `.github/ISSUE_TEMPLATE/` — Issue テンプレート

## Decision Rules

- Issue 番号が指定されていない場合は、必ず Issue を先に作成する
- スコープが曖昧な場合は、ユーザーに確認してから Issue を作成する
- 既存の Issue がある場合は新規作成せず、その Issue を使用する
