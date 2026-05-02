# 0009. Use FTS5 trigram tokenizer with CJK n-gram preprocessing

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna's search functionality must work for both English and Japanese (and ideally other CJK languages). The project owner is a Japanese developer; many sessions will involve Japanese conversation. A search system that doesn't handle Japanese well would severely limit Kizuna's utility.

Full-text search in SQLite is provided by FTS5, which supports several tokenizers:

- **Default tokenizer** (`unicode61`): Splits on whitespace and punctuation. Works well for space-separated languages (English) but fails for Japanese (no spaces).
- **Porter tokenizer**: English-specific stemming. Useless for Japanese.
- **ASCII tokenizer**: ASCII-only. Useless for Japanese.
- **Trigram tokenizer**: Splits text into 3-character sequences. Language-agnostic.
- **External tokenizers**: Custom implementations like ICU-based tokenizers, MeCab integration, etc.

Engram encountered and documented a specific failure mode: Japanese queries with FTS5's default tokenizer return 0 results because the entire Japanese sentence is treated as a single token. The fix was to use the trigram tokenizer with additional CJK n-gram preprocessing.

The relevant constraints are:

- **No external dependencies** (Principle 1): External tokenizers (MeCab, etc.) require additional installation
- **Minimal dependencies** (Principle 6): Adding language-specific tokenizers bloats the dependency tree
- **Cross-platform**: The solution must work on macOS, Linux, and Windows uniformly
- **Sufficient quality**: Search quality must be adequate for finding past memories; perfect linguistic accuracy is not required

Alternatives considered:

1. **FTS5 trigram tokenizer with CJK n-gram preprocessing** (Engram's approach)
2. **FTS5 default tokenizer** (works for English only)
3. **Custom MeCab-based tokenizer** (best Japanese quality, but heavy)
4. **ICU-based tokenizer** (better than default, requires SQLite ICU build)
5. **Application-level n-gram generation only** (manual indexing without FTS5)

## Decision

Use FTS5 with the **trigram tokenizer**, combined with **application-level CJK n-gram preprocessing** for query strings.

The chunks_fts virtual table is created with `tokenize='trigram'`. Query strings containing CJK characters are preprocessed before passing to FTS5 to ensure they match the trigram-indexed content.

## Rationale

### Why FTS5 trigram tokenizer

- **Language-agnostic**: Works for English, Japanese, Chinese, Korean, and any other language without per-language configuration
- **Built into SQLite**: No external dependencies needed
- **Sufficient quality**: For memory retrieval (where perfect recall isn't required), trigram-based search is good enough
- **Engram precedent**: Engram demonstrates this works in practice for Japanese
- **Reasonable index size**: Trigram indexes are larger than word-based but manageable for the target database sizes

### Why CJK n-gram preprocessing on the query side

The trigram tokenizer indexes content correctly (3-character sequences from the original text). However, the FTS5 MATCH query syntax expects tokens. When a user searches `claude codeで記憶を共有する方法`, FTS5 tries to match this as a literal sequence, which fails on the indexed 3-grams.

The fix is to preprocess the query: split CJK substrings into 3-grams, separate them with the FTS5 OR operator, and submit the resulting query.

For example, `記憶を共有` becomes something like:

```
"記憶を" OR "憶を共" OR "を共有"
```

This matches against the indexed trigrams, returning the chunks that contain those sequences.

For non-CJK substrings (like `claude code`), the existing word-level tokenization works fine and is preserved.

### Why not the default tokenizer

- Default tokenizer treats CJK content as a single un-splittable token
- Japanese queries return 0 results, even when matching content is in the database
- Engram's article documented this exact failure
- Not viable for a tool that must support Japanese

### Why not MeCab-based tokenizer

- Requires installing MeCab as a system dependency
- Requires bundling Japanese dictionaries (multi-megabyte)
- Per-platform installation complexity (different on macOS vs Linux vs Windows)
- Violates "minimal dependencies"
- Higher quality is unnecessary for memory retrieval

### Why not ICU-based tokenizer

- Requires SQLite to be built with ICU support, which is not the default
- `better-sqlite3`'s prebuilt binaries don't include ICU
- Custom builds are platform-specific and fragile
- Better than default but worse than trigram for the cost

### Why not application-level n-gram only (without FTS5)

- Reinventing inverted-index search is significant work
- FTS5 provides BM25 scoring, query parsing, and indexing for free
- Maintenance burden of a custom search implementation is high
- Performance is unlikely to match FTS5's optimized C implementation

## Consequences

### Positive

- Works for both English and Japanese with no language-specific configuration
- No external dependencies beyond `better-sqlite3`
- Builds cross-platform with no special handling
- BM25 ranking comes with FTS5 for free
- Engram's working implementation can be referenced

### Negative

- Trigram indexes are larger than word-based indexes (typically 2-3x)
- Trigram matching can produce false positives (especially for short queries)
- Query preprocessing adds a small computation cost (negligible)
- Search quality is good but not as accurate as MeCab-based tokenization for Japanese
- Very short Japanese queries (1-2 characters) may not match well

### Constraints introduced

- The chunks_fts virtual table must be recreated if the tokenizer changes (migration cost)
- Application code must implement CJK detection and n-gram generation
- Tests must include both English and Japanese query patterns

## Implementation Notes

### Schema

The chunks_fts table is defined with the trigram tokenizer (already documented in `04-schema.md`):

```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content=chunks,
  content_rowid=id,
  tokenize='trigram'
);
```

### CJK detection

A character is CJK if it falls in these Unicode ranges:

- U+3040–U+309F (Hiragana)
- U+30A0–U+30FF (Katakana)
- U+4E00–U+9FFF (CJK Unified Ideographs)
- U+3400–U+4DBF (CJK Unified Ideographs Extension A)
- U+FF00–U+FFEF (Halfwidth and Fullwidth Forms)
- U+3000–U+303F (CJK Symbols and Punctuation)

These ranges cover Japanese, Chinese, and Korean.

### Query preprocessing algorithm

```
function preprocessQuery(query: string): string {
  // 1. Split query into segments of consecutive CJK or non-CJK characters
  const segments = splitByCJK(query);
  
  // 2. For each segment:
  //    - If non-CJK: use as-is (FTS5 handles word tokenization)
  //    - If CJK: generate 3-grams and join with OR
  const processed = segments.map(segment => {
    if (isCJK(segment) && segment.length >= 3) {
      return generateTrigrams(segment).map(quote).join(' OR ');
    } else if (isCJK(segment) && segment.length < 3) {
      // Pad short CJK queries (e.g., 2-char names) with single-char prefix matches
      return segment.length > 0 ? `"${segment}"*` : '';
    }
    return segment;
  });
  
  return processed.join(' ');
}
```

The exact algorithm is implementation detail; it lives in `kizuna-core/src/search/cjk-preprocessing.ts` (Phase 2).

### Japanese particle handling

Engram's article noted that Japanese particles (は, が, を, に, で, etc.) can be treated as zero-width split points to improve tokenization. The implementation may include this as an optional optimization in Phase 2.

### Testing requirements

Phase 2 tests must include Japanese-specific cases:

- Query with only Japanese characters
- Query mixing English and Japanese
- Short Japanese queries (1-2 characters)
- Japanese with particles (e.g., `記憶の共有`)
- CJK punctuation (`。`, `、`, `「」`)
- Halfwidth and fullwidth variants

Test data should include realistic Japanese sentences from typical Claude Code interactions.

## Future Considerations

### If trigram quality is insufficient

If real-world usage shows trigram-based search produces too many false positives or misses important matches, options include:

- **Hybrid search plugin**: Add semantic vector search (sqlite-vec + small embedding model) as a Phase 5 feature. This is documented as a future direction.
- **Japanese tokenizer plugin**: A plugin could integrate MeCab or another tokenizer for users willing to install it. The plugin would maintain its own index alongside the FTS5 trigram index.

### If other languages need similar treatment

Korean and Chinese should work with the same trigram approach. If issues arise:

- Korean Hangul has different characteristics (syllabic blocks); may need custom preprocessing
- Chinese is similar to Japanese (no spaces); the same preprocessing should work
- Other non-space languages (Thai, etc.) would need similar analysis

These are deferred until real-world demand exists.
