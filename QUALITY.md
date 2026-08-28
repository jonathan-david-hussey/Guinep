# Quality Standards

Run the full repository gate before merging:

```bash
npm run quality
```

The gate includes:

- TypeScript type checking with `tsc --noEmit`.
- ESLint with strict/stylistic type-checked TypeScript rules and `--max-warnings 0`.
- Oxlint with type-aware checks and `--deny-warnings`.
- Prettier format checking.
- npm audit for any reported vulnerability.
- Nest build.
- Unit tests with coverage thresholds.
- E2E tests.

The supported local toolchain is Node.js `24.15.0` and npm `11.12.1`.

## Complexity

New code must stay within these limits:

- Cyclomatic complexity: maximum `8` per function.
- Cognitive complexity: maximum `12` per function.
- Nesting depth: maximum `3`.
- Production function length: maximum `40` non-empty, non-comment lines.
- Test function length: maximum `80` non-empty, non-comment lines.

All configured lint rules are errors. Do not downgrade a rule or threshold without explicit approval.

## Coverage

Unit coverage thresholds are enforced by Vitest with Istanbul coverage:

- Statements: `80%`
- Lines: `80%`
- Functions: `80%`
- Branches: `70%`

Framework bootstrap and module wiring files are excluded from coverage.
