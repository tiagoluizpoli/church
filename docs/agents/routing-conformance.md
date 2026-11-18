# Routing conformance

| Scenario | Required guidance | Unloaded guidance |
| --- | --- | --- |
| Backend-only TypeScript | global baseline, TypeScript, backend | frontend, domain |
| Frontend-only TypeScript | global baseline, TypeScript, frontend | backend, domain |
| Cross-stack TypeScript | global baseline, TypeScript, backend, frontend | domain |
| Language-specific | global baseline, matching language | backend, frontend, domain |
| Domain/planning | global baseline, domain docs, applicable ADR/plan | backend, frontend |
| Documentation-only | global baseline | language, backend, frontend, domain |
| Version-sensitive technology | global baseline, skills/research, matching gap search, official-doc child research | unrelated profiles |
| Missing safeguard | global baseline warning | autonomous configuration |

The router composes every required row and applies precedence: user direction,
project guidance, selected global profiles, then the baseline.

## Session smoke

Codex and Claude load their one-line global adapters before project guidance.
Their project entry declares project-over-global precedence. Gemini has no
local executable in this environment and is not a supported session here.
