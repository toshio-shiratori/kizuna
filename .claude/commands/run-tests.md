---
name: run-tests
description: 品質検証の実行。型チェック・テスト・lint・フォーマットをすべて実行し結果を報告する。
---

## When to Use

- 実装後に品質検証を実行するとき
- PR 作成前の最終チェックとして
- ユーザーから「テスト」「検証」「チェック」等の指示を受けたとき

## Steps

1. **型チェック**

   ```bash
   pnpm tsc --noEmit
   ```

2. **テスト実行**

   ```bash
   pnpm test
   ```

   - 特定パッケージのみ: `pnpm --filter kizuna-core test`
   - 特定ファイルのみ: `pnpm test -- src/path/to/file.test.ts`

3. **Lint**

   ```bash
   pnpm lint
   ```

4. **フォーマット修正**

   ```bash
   pnpm format
   ```

   - `format:check` ではなく `format` を使い、自動修正を適用する

5. **未使用コード検出**

   ```bash
   pnpm knip
   ```

6. **結果レポート**

   ```
   ## 検証結果
   - tsc: PASS/FAIL
   - test: PASS/FAIL (N tests)
   - lint: PASS/FAIL
   - format: PASS/FAIL
   - knip: PASS/FAIL
   ```

   - 失敗がある場合、エラー内容から原因を特定し修正案を提示

## Relationship to kizuna-test-writer Agent

- **このスキル**: 既存テストの実行・結果分析・問題特定
- **kizuna-test-writer**: 新規テストの設計・作成（日本語テストケース必須、カバレッジ目標あり）
- テスト作成が必要な場合は kizuna-test-writer エージェントを使用すること

## Testing Rules

- `docs/02-design-principles.md` に違反するテスト（外部 API 呼び出し等）は書かない
- テキスト処理のテストには日本語テストケースを含める
- in-memory SQLite (`:memory:`) をストレージ単体テストに使用
