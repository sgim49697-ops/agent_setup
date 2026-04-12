# replan-notes.md - master UX benchmark v2 cycle 1 follow-up

## Cycle verdict

This first full master cycle did improve the benchmark away from the old single-page evidence wall, but the result is still mixed.

Strongest harnesses:

- `single_agent`: focused wizard is readable and the evidence layer is secondary.
- `evaluator_optimizer`: the visible loop metaphor feels the most product-like and preserves the main narrative.

Weak or still evidence-heavy harnesses:

- `sequential_pipeline`
- `parallel_sections`
- `router`
- `orchestrator_worker`
- `omx_evaluator_optimizer`

These harnesses now expose different metaphors, but too many of them still default to showing evaluation, artifact, or evidence surfaces before the main product flow earns that space.

## What still feels wrong

- Too many apps still show artifact/evaluation cards on the default screen.
- Several harnesses still stack long sections vertically after generation instead of narrowing the user into one active moment.
- Hero and first-screen copy improved, but default information density is still high in most non-wizard harnesses.
- `parallel_sections`, `router`, and `orchestrator_worker` especially still read like benchmark workspaces instead of product UIs with secondary evidence layers.
- `omx_evaluator_optimizer` expresses pressure well, but the gauntlet remains more benchmark-like than product-like.

## Next-cycle requirements

1. Remove artifacts/evaluation/checklist blocks from default first screens across the weak harnesses.
2. Move benchmark evidence behind one of:
   - a collapsed drawer
   - a secondary tab
   - a dedicated debug/review route
3. Keep only the current product decision, next action, and one supporting context panel visible in the primary flow.
4. Preserve harness metaphor, but let the metaphor drive the main surface:
   - `sequential_pipeline`: current handoff + next handoff
   - `parallel_sections`: lane board first, merge/evidence later
   - `router`: routing desk first, evidence second
   - `orchestrator_worker`: ownership board first, reports later
   - `omx_evaluator_optimizer`: active gate + current loop first, full evidence pack later
5. Re-run browser review with extra weight on first-screen cognitive load and default evidence leakage.

## Benchmark follow-up

The shared Playwright smoke spec needed two v2-safe updates during this cycle:

- export completion must not depend on a single `Export ready` text node
- loop-style harnesses may expose the status as `export-ready` or `export.ready`

The common benchmark layer is closer to v2-safe now, but future loops should keep selectors anchored to stable semantics rather than display-text exactness.
