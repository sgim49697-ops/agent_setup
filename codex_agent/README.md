# codex_agent - 독립 하네스 워크스페이스 기반 Codex 실험실

`codex_agent`는 `Codex UI/CLI`가 각 폴더의 규칙을 직접 따르도록 설계된 실험실입니다. 루트에는 공통 벤치마크와 비교 도구만 두고, 실제 실험은 `single_agent`, `sequential_pipeline`, `parallel_sections`, `router`, `orchestrator_worker`, `evaluator_optimizer` 여섯 워크스페이스에서 독립적으로 진행합니다.

## 공통 벤치마크

모든 하네스는 동일한 제품 과제인 `기술 블로그 포스트 자동 생성기`를 구현합니다.

- 입력: `topic`, `audience`, `tone`, `length`
- 단계: 주제 입력 → 리서치 → 아웃라인 → 섹션 작성 → 리뷰/수정 → 최종 출력
- 출력: `Markdown` 우선, 가능하면 `copy to clipboard`

공통 제품 문서는 [`benchmark/`](./benchmark) 아래에 있습니다.

- [`benchmark/spec.md`](./benchmark/spec.md)
- [`benchmark/rubric.md`](./benchmark/rubric.md)
- [`benchmark/ui_contract.md`](./benchmark/ui_contract.md)
- [`benchmark/review_checklist.md`](./benchmark/review_checklist.md)

## 하네스 워크스페이스

- `single_agent`: 하나의 메인 실행 흐름으로 전부 처리
- `sequential_pipeline`: researcher → outliner → writer → reviewer 순차 파이프라인
- `parallel_sections`: 섹션 라이터 병렬 작성 후 merge
- `router`: 주제 난이도/분야에 따라 specialist로 라우팅
- `orchestrator_worker`: orchestrator가 하위 작업을 분배/통합
- `evaluator_optimizer`: writer/reviewer/revise 반복 루프

각 워크스페이스는 다음 구조를 가집니다.

- `AGENTS.md`
- `README.md`
- `app/`
- `harness/`
- `spec/`
- `runs/`
- `reports/`

## OMX 확장 하네스

기존 6개 비교군은 그대로 두고, 별도 확장 실험으로 `omx_evaluator_optimizer` 워크스페이스를 추가할 수 있다. 이 워크스페이스는 `evaluator_optimizer`의 강화형으로, 더 많은 review/revise 루프와 반복 검증(compare/evaluate/validate) 압박을 전제로 한다.

## 운영 모델

이 실험실에서 `Codex`는 앱 내부 런타임 엔진이 아니라, 각 워크스페이스에서 사이트를 구현하는 실험 대상입니다. 원하는 하네스 폴더에서 `codex`를 실행하면 그 폴더의 `AGENTS.md`와 `harness/` 계약을 따르게 됩니다.

```bash
cd /home/user/projects/agent_setup/codex_agent/single_agent
codex
```

## 비교 도구

- [`scripts/compare_scorecards.py`](./scripts/compare_scorecards.py): 하네스별 최신 점수카드 비교
- [`scripts/validate_workspace.py`](./scripts/validate_workspace.py): 워크스페이스 레이아웃 검증

## Legacy

이전 shared-core prototype은 [`legacy/shared_core_prototype/`](./legacy/shared_core_prototype) 아래에 보존되어 있습니다.
