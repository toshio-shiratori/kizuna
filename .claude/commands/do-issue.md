---
name: do-issue
description: 指定 Issue を自律的に実装し PR 作成まで一気通貫で行う。承認不要。
---

## When to Use

- ユーザーから `/do-issue <N>` で Issue 番号を指定されたとき
- 「Issue N を実装して」「#N やって」等の指示を受けたとき

## Input

- `$ARGUMENTS` — GitHub Issue 番号（例: `114`）

## Autonomy

このスキルはすべてのステップを **承認なしで自律実行** する。
コミット、プッシュ、PR 作成を含め、ユーザーへの確認待ちは行わない。
不明点や判断に迷うスコープ外の問題が見つかった場合のみ、ユーザーに質問する。

## Steps

### 1. Issue 読み込みとブランチ作成

```bash
gh issue view $ARGUMENTS
```

- Issue のタイトル・本文から要件を把握する
- Issue が存在しない、またはクローズ済みの場合はエラーを報告して終了

```bash
git switch -c <type>/issue-<N>-<short-description> main
```

- `<type>` は Issue 内容に応じて `feat`, `fix`, `refactor`, `docs` 等

### 2. 設計ドキュメント事前読み込み

以下を読んでコンテキストを構築:

- `docs/02-design-principles.md` — 8 つの設計原則
- Issue で参照されているドキュメント（あれば）
- 実装対象の既存コードの把握

### 3. 実装

`kizuna-implementer` エージェントに実装を委譲する。
エージェントへのプロンプトには以下を含める:

- Issue の全文
- 設計原則の要約
- **「ユーザー確認は不要。自律的に実装を完了せよ」** という明示的な指示

実装にはテストの追加・更新を含める。

### 4. 品質検証（自動修正ループ: 最大 3 回）

```bash
pnpm tsc --noEmit
pnpm test
pnpm lint
pnpm format
pnpm knip
```

- `pnpm format` は自動修正を実行する（`format:check` ではなく `format` を使う）
- 失敗した場合は原因を特定し修正 → 再検証
- 3 回のループで解決しない場合、現状をユーザーに報告して判断を仰ぐ

### 5. セルフレビュー

`kizuna-reviewer` エージェントに差分をレビューさせる:

```bash
git diff main...HEAD
```

- **Blocker**: 自動修正 → 再検証（ステップ 4 に戻る）
- **Concern**: 軽微なら修正、判断に迷うならそのまま PR に注記
- **Pass**: 次ステップへ

### 6. コミット

```bash
git add <changed-files>
git commit -m "<type>(<scope>): <description> (#<N>)"
```

- Conventional Commits 形式
- Issue 番号を含める

### 7. PR 作成

```bash
git push -u origin <branch-name>
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Related Issue

Closes #<N>

## Summary
...

## Changes
- ...

## Validation
- [x] `pnpm tsc --noEmit` が成功
- [x] `pnpm test` が成功
- [x] `pnpm lint` が成功
- [x] `pnpm format:check` が成功
- [x] `pnpm knip` が成功
- [x] 設計原則に違反していない

## Design Principles Check
...

## Notes for Reviewer
...
EOF
)"
```

- `.github/PULL_REQUEST_TEMPLATE.md` のフォーマットに従う
- 検証結果（テスト数、lint 結果等）を具体的に記載

### 8. 完了報告

PR URL を含む簡潔な完了報告をユーザーに行う:

```
## 完了: #<N> <Issue title>

**PR**: <PR URL>
**ブランチ**: <branch-name>
**検証**: tsc ✓ / test (N passed) ✓ / lint ✓ / format ✓

### 変更サマリ
- ...
```

## Decision Rules

- Issue のスコープが明らかに大きすぎる場合（複数パッケージにまたがる大規模変更等）、着手前にユーザーに確認する
- 新しい依存パッケージの追加が必要な場合、ユーザーに確認する
- 既存の公開 API を破壊的に変更する必要がある場合、ユーザーに確認する
- 上記以外はすべて自律的に判断して進める

## References

- `CLAUDE.md` — Implementation Checklist セクション
- `docs/02-design-principles.md` — 設計原則
- `.github/PULL_REQUEST_TEMPLATE.md` — PR テンプレート
- `.claude/agents/kizuna-implementer.md` — 実装エージェント
- `.claude/agents/kizuna-reviewer.md` — レビューエージェント
