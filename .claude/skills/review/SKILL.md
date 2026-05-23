---
name: review
description: コードレビューを実行。PR 作成前やコード変更後に使用。kizuna-reviewer エージェントを内部で呼び出す。
---

## When to Use

- PR 作成前にセルフレビューするとき
- コード変更の品質を確認するとき
- 設計原則への準拠を検証するとき

## Steps

1. **変更差分の確認**

   ```bash
   git diff main...HEAD
   ```

2. **kizuna-reviewer エージェントを呼び出す**
   - エージェントが以下をチェック:
     - 8 つの設計原則への準拠
     - コード品質（TypeScript strict、未使用コード、エラーハンドリング）
     - Issue 要件との整合性
     - ドキュメントの更新

3. **レビュー結果をユーザーに報告**
   - Passes / Concerns / Blockers の分類
   - Approve / Request changes の推奨

## Relationship to kizuna-reviewer Agent

- **このスキル**: レビューの起動トリガーとフロー管理
- **kizuna-reviewer**: 実際のレビューロジック（チェックリスト、設計原則検証）
- スキルはエージェントを呼び出すためのエントリポイント
