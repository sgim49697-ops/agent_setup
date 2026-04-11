# codex_agent - 공통 코어 기반 에이전트 아키텍처 실험실

`codex_agent`는 여러 에이전트 아키텍처를 같은 시나리오, 같은 평가 기준, 같은 리포트 포맷으로 비교하기 위한 실험실입니다. 핵심 아이디어는 실행 수명주기와 평가기를 공유하고, 각 아키텍처는 `adapter.py`, `config.yaml`, `prompts/`, `README.md`만 바꾸는 것입니다.

## 포함된 아키텍처

- `workflow_pipeline`: `localize -> repair -> validate`처럼 단계를 고정하는 워크플로형
- `single_loop`: 하나의 에이전트가 탐색/수정/검증을 자유 루프로 반복하는 구조
- `scaffolded_single`: 계획/구현/검증을 강제한 단일 에이전트 기본형
- `reviewer_optimizer`: 구현자와 검증자를 분리한 evaluator-optimizer형
- `manager_workers`: 매니저와 워커를 분리한 멀티에이전트형
- `long_horizon`: 체크포인트와 resume를 고려한 장기 실행형

## 빠른 시작

```bash
cd /home/user/projects/agent_setup/codex_agent
python scripts/run_experiment.py --architecture scaffolded_single --scenario feature_small
python scripts/compare_runs.py
python scripts/summarize_report.py --latest 3
```

기본 실행 모드는 `simulate`입니다. 실제 에이전트 커맨드를 연결하고 싶으면 `configs/global.yaml`의 `execution.mode`를 `command`로 바꾸고 `execution.command`를 지정하면 됩니다.

## 구조 요약

- `configs/`: 전역 예산, 실행 모드, 모델 프로필
- `docs/`: 아키텍처 설명, 평가 기준, 실험 프로토콜
- `src/codex_agent/core/`: 공통 데이터 모델, 저장소, 러너, 평가기, 레지스트리
- `src/codex_agent/architectures/`: 아키텍처별 어댑터와 프롬프트
- `src/codex_agent/scenarios/`: 비교용 시나리오 세트
- `scripts/`: 실험 실행, 비교, 요약 생성 진입점
- `runs/`: 실행 산출물 저장소

## 설계 원칙

- 동일한 시나리오와 동일한 예산 아래에서만 아키텍처를 비교합니다.
- 아키텍처 차이는 `adapter.py`와 패턴별 프롬프트로만 표현합니다.
- 결과물은 모두 `runs/<run_id>/` 아래에 저장하고, JSON과 Markdown을 함께 남깁니다.
- 평가 결과는 `task success`, `requirement coverage`, `regression/safety`, `efficiency`, `process quality` 다섯 축으로 고정합니다.
