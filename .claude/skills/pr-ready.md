---
name: pr-ready
description: 実装完了後の検証・レビュー・PR 作成を行う。コードが書き終わった後に使用。
---

## When to Use

- 実装が完了し PR を作成する準備ができたとき
- ユーザーから「PR 作って」「PR 準備して」と指示されたとき

## Steps

1. **検証実行**

   ```bash
   pnpm tsc --noEmit && pnpm test
   ```

   - 失敗した場合は修正してから先に進む

2. **セルフレビュー** — `kizuna-reviewer` エージェントを使用:
   - 設計原則チェック（8 項目）
   - コード品質チェック
   - Issue 要件との整合性チェック
   - ブロッカーがあれば修正

3. **変更内容の確認**

   ```bash
   git diff main...HEAD
   git log main..HEAD --oneline
   ```

4. **コミット** — 未コミットの変更がある場合:
   - Conventional Commits 形式: `<type>(<scope>): <description> (#<issue-number>)`
   - ユーザーの確認を取ってからコミット

5. **PR 作成**

   ```bash
   git push -u origin <branch-name>
   gh pr create --title "<title>" --body "$(cat <<'EOF'
   ## Related Issue

   Closes #<issue-number>

   ## Summary
   ...

   ## Validation
   - [x] `pnpm tsc --noEmit` が成功
   - [x] `pnpm test` が成功
   ...
   EOF
   )"
   ```

   - `.github/PULL_REQUEST_TEMPLATE.md` のフォーマットに従う
   - Design Principles Check を含める

## References

- `.github/PULL_REQUEST_TEMPLATE.md` — PR テンプレート
- `docs/02-design-principles.md` — Design Principles Check 用

## Decision Rules

- 検証が通らない場合は PR を作成しない
- レビューでブロッカーがある場合は修正を優先する
- コミット・プッシュはユーザーの確認を取ってから行う
