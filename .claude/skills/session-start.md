---
name: session-start
description: セッション開始時のプロジェクト状況確認。ブランチ状態、未コミット変更、オープンPR/Issue、ロードマップ進捗を把握して報告する。
---

## When to Use

- 新しいセッションを開始するとき
- ユーザーから「セッション開始」「状況確認」等の指示を受けたとき

## Steps

1. **Git 状態の確認**

   ```bash
   git branch --show-current
   git status --short
   git log --oneline -5
   ```

   - 現在のブランチ、未コミット変更、直近のコミットを把握する

2. **未プッシュコミットの確認**

   ```bash
   git log --oneline @{upstream}..HEAD 2>/dev/null
   ```

   - upstream が無い場合はスキップ

3. **オープン PR / Issue の確認**

   ```bash
   gh pr list --state open --limit 10
   gh issue list --state open --limit 10
   ```

4. **ロードマップ進捗の確認**

   - `docs/06-roadmap.md` を読み、現在のフェーズとタスク状況を把握する

5. **状況レポートの報告** — 以下の形式でユーザーに報告:

   ```
   ## セッション開始レポート

   **ブランチ**: <current-branch>
   **未コミット変更**: あり/なし（概要）
   **未プッシュコミット**: N 件

   ### オープン PR
   - #N: <title> (<status>)

   ### オープン Issue
   - #N: <title>

   ### ロードマップ
   - 現在フェーズ: Phase N — <description>
   - 直近の完了タスク: ...
   - 次のタスク: ...

   ### 推奨アクション
   - <前回の作業の続きや、次に着手すべきこと>
   ```

## Decision Rules

- main ブランチ以外にいる場合、そのブランチの対応 Issue/PR も確認する
- 未コミット変更がある場合、変更内容の概要も報告する
- ビルドやテストは実行しない（session-start は情報収集のみ）
