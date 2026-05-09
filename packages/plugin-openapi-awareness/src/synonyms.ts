export type SynonymMap = Record<string, readonly string[]>;

export const BUILTIN_SYNONYMS: SynonymMap = {
  パスキー: ["passkey", "passkeys"],
  認証: ["auth", "authentication", "authenticate"],
  ログイン: ["login", "signin"],
  ログアウト: ["logout", "signout"],
  ユーザー: ["user", "users"],
  ユーザ: ["user", "users"],
  トランザクション: ["transaction", "transactions"],
  取引: ["transaction", "transactions"],
  決済: ["payment", "payments", "checkout"],
  支払い: ["payment", "payments"],
  登録: ["register", "registration", "signup"],
  削除: ["delete", "remove"],
  更新: ["update", "modify", "patch"],
  作成: ["create", "post"],
  一覧: ["list", "index"],
  検索: ["search", "find", "query"],
  設定: ["settings", "config", "configuration"],
  通知: ["notification", "notifications"],
  プロフィール: ["profile", "profiles"],
  パスワード: ["password", "passwords"],
  メール: ["email", "mail"],
  アカウント: ["account", "accounts"],
  セッション: ["session", "sessions"],
  トークン: ["token", "tokens"],
  リクエスト: ["request", "requests"],
  レスポンス: ["response", "responses"],
  エラー: ["error", "errors"],
  ヘルスチェック: ["health", "healthcheck"],
  ヘルス: ["health"],
  アップロード: ["upload", "uploads"],
  ダウンロード: ["download", "downloads"],
  ファイル: ["file", "files"],
  画像: ["image", "images"],
  グループ: ["group", "groups"],
  カテゴリ: ["category", "categories"],
  カテゴリー: ["category", "categories"],
  コメント: ["comment", "comments"],
  ステータス: ["status"],
  権限: ["permission", "permissions", "role"],
  招待: ["invite", "invitation"],
  お知らせ: ["notice", "announcement"],
  履歴: ["history", "log"],
  承認: ["approve", "approval"],
  拒否: ["reject", "deny"],
  確認: ["confirm", "verify", "check"],
  送信: ["send", "submit"],
  受信: ["receive", "inbox"],
  フロー: ["flow"],
  バリデーション: ["validation", "validate"],
  ウェブフック: ["webhook", "webhooks"],
};

export function mergeSynonyms(base: SynonymMap, overrides: SynonymMap): SynonymMap {
  const merged = { ...base };
  for (const [key, values] of Object.entries(overrides)) {
    merged[key] = values;
  }
  return merged;
}

export function expandTerms(terms: string[], synonymMap: SynonymMap): string[] {
  const expanded = new Set(terms);
  const keys = Object.keys(synonymMap);

  for (const term of terms) {
    for (const key of keys) {
      if (term.includes(key)) {
        for (const value of synonymMap[key]!) {
          expanded.add(value);
        }
      }
    }
  }

  return [...expanded];
}
