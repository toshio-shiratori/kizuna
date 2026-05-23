---
name: telepathy-send
description: 他プロジェクトにテレパシーを送信する
user-invocable: true
---

## 使い方

/telepathy-send <伝えたい内容>

## Steps

1. ユーザーが指定した内容を、受信側が行動に活かせる形に整理する
   - 変更内容は具体的に（ファイル名、API パス、フィールド名など）
   - 背景や理由があれば簡潔に添える
   - 不要な挨拶や装飾は省く
2. `kizuna_telepathy_send` で送信する
3. 送信完了を報告する
