---
name: post-merge
description: PR マージ後の後片付け。メモリ更新、main 切り替え、pull、マージ済みブランチ一括削除を行う。
---

## When to Use

- PR がマージされた後
- ユーザーから「後片付け」「ブランチ整理」等の指示を受けたとき

## Input

- `$ARGUMENTS` — PR 番号（例: `113`）。省略時はブランチ整理のみ実行。

## Steps

### 1. PR 情報の取得（PR 番号が指定された場合）

```bash
gh pr view $ARGUMENTS --json title,number,body,headRefName
```

- マージされた PR の内容を把握する
- 対応する Issue 番号を PR 本文の `Closes #N` から特定する

### 2. メモリ更新（PR 番号が指定された場合）

`project_next_tasks.md` を更新する:

- 完了した Issue をオープン Issue 一覧から削除
- 完了済み一覧に追加（PR 番号・マージ日付を含む）
- 他に更新すべきメモリがあれば合わせて更新

### 3. main に切り替え

```bash
git switch main
```

### 4. 最新を pull

```bash
git pull
```

### 5. マージ済みローカルブランチの一括削除

```bash
git branch --merged main | grep -v '^\*\|main' | while read -r branch; do git branch -d "$branch"; done
```

- 削除対象のブランチ一覧を報告する
- 削除対象がない場合は「削除対象なし」と報告する

### 6. 完了報告

```
## 後片付け完了

**マージ済み PR**: #<N> <title>（PR 番号指定時のみ）
**ブランチ**: main (最新)
**削除したブランチ**: <list> or なし
**メモリ更新**: 更新内容の概要 or なし
```
