# 0006. Use MIT license

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna is published as open source. The license choice affects:

- How users (individuals, organizations) can use the software
- Whether derivative works must remain open source
- Liability and warranty exposure for the author
- Compatibility with other open-source projects' licenses

The project owner's intent is:

- Allow free use, modification, and distribution
- Allow commercial use (including by the project owner's own employer)
- Avoid copyleft requirements that would burden adopters
- Disclaim all warranties (this is a personal project with no support guarantee)
- Maintain consistency with similar Claude Code memory tools (Engram, sui-memory both use MIT)

The project owner explicitly does NOT intend to:

- Restrict adoption
- Require contributors to share modifications
- Provide support or warranty
- Compete with cloud-hosted derivatives

Alternatives considered:

1. **MIT License** (permissive, simple, ubiquitous)
2. **Apache License 2.0** (permissive, with explicit patent grant)
3. **BSD 2-Clause / 3-Clause** (permissive, similar to MIT)
4. **GNU AGPL v3.0** (strong copyleft, prevents proprietary cloud forks)
5. **GNU GPL v3.0** (strong copyleft for distribution)
6. **Polyform Noncommercial** or similar source-available licenses

## Decision

Use the MIT License with the copyright holder declared as:

```
Copyright (c) 2026 Toshio Shiratori (@toshio-shiratori)
```

The license text is the standard MIT License from the OSI website, unmodified.

## Rationale

### Why MIT

- **Simplicity**: The MIT License is short, well-known, and unambiguous. Users understand what they can do without legal review.
- **Permissive**: Allows commercial use, modification, distribution, and private use without obligation. Aligns with the project owner's stated intent of "free to use, no support guarantee."
- **Liability disclaimer**: The license includes strong "AS IS" language disclaiming warranties and liability, which is essential for a personal project shared as-is.
- **Ecosystem alignment**: Engram and sui-memory both use MIT. Following the same license avoids friction for users adopting Kizuna alongside these tools.
- **Plugin ecosystem**: Plugin authors can use any compatible license (MIT, Apache 2.0, BSD) without conflict.
- **Universal recognition**: Both individuals and large organizations have established processes for handling MIT-licensed code.

### Why not Apache 2.0

- Apache 2.0 includes an explicit patent grant, which is valuable for projects that may include patented techniques. Kizuna does not.
- Apache 2.0 requires preserving NOTICE files and includes other obligations that add complexity for derivative works
- The boilerplate (per-file headers, NOTICE) increases maintenance overhead for a small project
- For a small TypeScript project with no patent risks, MIT is simpler and equally permissive

### Why not BSD 2-Clause / 3-Clause

- Functionally similar to MIT
- Less common in the JavaScript ecosystem; using MIT reduces confusion
- The 3-Clause version's "no endorsement" provision is irrelevant for a project this small

### Why not AGPL or GPL

- The project owner does not want to restrict adoption
- Many organizations have policies preventing AGPL/GPL adoption
- Kizuna is not the kind of project that benefits from copyleft enforcement (it's not a competitive cloud service)
- Some inspirational projects (claude-mem, Axon.MCP.Server) use AGPL, but their motivation is preventing commercial cloud forks. Kizuna has no cloud aspirations.

### Why not Polyform Noncommercial or source-available licenses

- These licenses restrict commercial use, which conflicts with the goal of allowing the project owner's employer to use Kizuna
- Source-available licenses are not OSI-approved open source, which limits adoption
- The project owner has no commercial interest to protect

## Consequences

### Positive

- Maximum freedom for users
- Compatible with virtually all other open-source licenses
- No compliance burden for adopters
- Strong liability disclaimer protects the author
- Aligns with the inspirational projects in the ecosystem

### Negative

- Anyone can use Kizuna without giving back; no "give back" mechanism
- Commercial entities can fork and create proprietary derivatives without contributing
- For-profit cloud services could host Kizuna without compensating the author

The project owner accepts these tradeoffs. Kizuna's value is not as a commercial product; the value is in solving a personal/team workflow problem and contributing back to the ecosystem.

### Constraints introduced

- All contributions to Kizuna are implicitly MIT-licensed (per the standard "inbound = outbound" convention)
- Dependencies must have compatible licenses (MIT, Apache 2.0, BSD, ISC, etc.); GPL/AGPL dependencies are forbidden
- The copyright holder is the project owner; corporate ownership of contributions would require a CLA, which is not currently planned

## Practical Implications

### "No support" stance

The MIT License's warranty disclaimer is legally strong, but to make the "no support" stance practically clear, the project also:

- States the no-support policy in the README
- Configures GitHub Issues to redirect to Discussions (where there is no expectation of response)
- Documents this in CONTRIBUTING.md (Phase 4)

The license alone is the legal foundation; the README and Issue templates are the social communication.

### Use by the project owner's employer

The project owner intends for the employer to be able to use Kizuna. With the MIT License:

- The employer can clone, fork, or use the software without any obligation
- The recommended pattern is for the employer to fork Kizuna and maintain their own derivative (per `docs/01-vision.md`)
- The fork may include private/internal extensions that are not contributed back; this is permitted
- The employer assumes all risk via the warranty disclaimer

The fork-based usage pattern is documented in the README and is the recommended approach for any organization wanting to use Kizuna in production.

### Distribution

When publishing to npm in Phase 4:

- Each package's `package.json` declares `"license": "MIT"`
- Each package includes a copy of the LICENSE file (or references the root LICENSE via package.json)
- The `repository` field links to the GitHub repository

## Future Reconsideration

The license decision is reversible only for new code. Existing released versions remain under MIT permanently (this is a feature, not a bug).

If the project ever needs to change licenses (e.g., to AGPL for some reason), it would require:

- Contributor agreement (or rewriting any non-author contributions)
- A clear announcement and version bump
- Acceptance that older versions remain MIT-licensed forever

Such a change is not anticipated and would need strong justification.
