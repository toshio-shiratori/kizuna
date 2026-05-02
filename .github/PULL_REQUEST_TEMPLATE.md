## Related Issue

Closes #<issue-number>

## Summary

<この PR が何を達成するかの簡潔な説明>

## Changes

- <変更1>
- <変更2>
- <変更3>

## Validation

- [ ] `pnpm tsc --noEmit` が成功
- [ ] `pnpm test` が成功 (テストがある場合)
- [ ] CLAUDE.md と設計原則 (docs/02-design-principles.md) に違反していない
- [ ] 関連する ADR がある場合は遵守している

## Design Principles Check

該当する原則に ✓ を付け、違反がないことを確認:

- [ ] 1. No external dependencies (新規外部依存を追加していない、または妥当)
- [ ] 2. Zero token cost on save (LLM 呼び出しを core に追加していない)
- [ ] 3. Auto save (ユーザー操作を要求していない)
- [ ] 4. Always recall (モデル判断に依存していない)
- [ ] 5. Edit and delete (ユーザー制御が維持されている)
- [ ] 6. Minimal dependencies (依存ツリーが浅い)
- [ ] 7. DB bloat prevention (無制限の成長がない)
- [ ] 8. Plugin-based specialization (core に特化機能を追加していない)

## Notes for Reviewer

<レビュアーが見るべき重要ポイント、悩みどころ、未解決事項など>
