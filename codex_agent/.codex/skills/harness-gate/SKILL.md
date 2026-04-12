---
name: harness-gate
description: Run the standard harness quality gate before bounded cycle completion
---

# harness-gate

## Purpose

한 bounded cycle의 마지막에서 active harness가 실제로 통과 가능한 상태인지 구조적으로 판정한다.

## Gate order

1. validator
2. trace sanity
3. baseline metrics
4. Korean-first language gate
5. artifact freshness
6. outcome quality gate

## Procedure

```bash
python3 scripts/master_loop_validator.py --rewrite --quiet
python3 scripts/master_loop_trace_sanity.py --quiet
python3 scripts/master_loop_baseline_metrics.py --quiet
python3 scripts/master_loop_quality_gate.py --active-harness <harness> --enforce
```

## Rules

- gate 실패 시 cycle-complete marker를 쓰지 않는다.
- 어떤 gate가 실패했는지 summary에 남긴다.
- gate 통과 전에는 project complete 금지.

## Output

- `.omx/state/master-loop-quality-gate.json`
- `.omx/logs/master-ux-benchmark-v2.log`에 gate 결과 요약
