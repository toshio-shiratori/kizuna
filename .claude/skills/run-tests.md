---
name: run-tests
description: テスト実行と品質検証。実装後やリファクタ後に使用。kizuna-test-writer エージェントとは異なり、既存テストの実行と結果分析に特化。
---

## When to Use

- 実装後にテストを実行・検証するとき
- テスト結果を分析して問題を特定するとき
- テストカバレッジを確認するとき

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

3. **結果分析** — 失敗がある場合:
   - エラーメッセージから原因を特定
   - 該当する実装コードを確認
   - 修正案をユーザーに提示

## Relationship to kizuna-test-writer Agent

- **このスキル**: 既存テストの実行・結果分析・問題特定
- **kizuna-test-writer**: 新規テストの設計・作成（日本語テストケース必須、カバレッジ目標あり）
- テスト作成が必要な場合は kizuna-test-writer エージェントを使用すること

## Testing Rules

- `docs/02-design-principles.md` に違反するテスト（外部 API 呼び出し等）は書かない
- テキスト処理のテストには日本語テストケースを含める
- in-memory SQLite (`:memory:`) をストレージ単体テストに使用
