# loop_metrics_report.md - latest loop quality + efficiency composite

generated_at: 2026-04-15T01:09:17Z
latest_reset_timestamp: 2026-04-14T11:00:52Z
excluded_harnesses: single_agent

Composite score = latest available quality score (existing evaluation_report) + current-loop efficiency metrics (runtime, cycle count, token usage).

## Existing score meaning

- `evaluation_report.final.final_score` is **not browser-only**.
- It already combines L1 Playwright smoke + L2 quantitative build metrics + L3 subjective rubric score.
- However, it does **not** include latest-loop runtime, cycle count, or token usage.

## Latest loop composite

| harness | quality(100) | wall clock(s) | active(s) | cycles | tokens | wall eff | cycle eff | token eff | composite |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| omx_evaluator_optimizer | 98.00 | 1817 | 1817 | 1 | 890,473 | 100.00 | 100.00 | 100.00 | **98.90** |
| evaluator_optimizer | 89.20 | 2634 | 2634 | 1 | 1,101,074 | 68.98 | 100.00 | 80.87 | **86.54** |
| sequential_pipeline | 93.00 | 2966 | 2966 | 1 | 1,518,495 | 61.26 | 100.00 | 58.64 | **84.13** |
| orchestrator_worker | 94.00 | 5111 | 4810 | 2 | 2,061,030 | 35.55 | 50.00 | 43.21 | **71.01** |
| router | 93.50 | 6345 | 6114 | 3 | 2,257,543 | 28.64 | 33.33 | 39.44 | **66.64** |
| parallel_sections | 93.50 | 12590 | 8969 | 5 | 3,801,067 | 14.43 | 20.00 | 23.43 | **60.10** |

## Interpretation

- `quality(100)` = latest available `evaluation_report.final.final_score * 10`
- `wall clock(s)` = latest loop reset 이후 첫 시도부터 최종 통과까지의 실제 경과 시간
- `active(s)` = 같은 기간 동안 각 cycle 시도 시간을 합산한 시간
- `cycles` = 최신 루프에서 최종 통과까지 걸린 cycle 수
- `tokens` = 관련 cycle들의 design/critique/verify 로그에 기록된 `tokens used` 합산
- `composite` = 품질 55% + wall-clock 효율 15% + cycle 효율 15% + token 효율 15%
