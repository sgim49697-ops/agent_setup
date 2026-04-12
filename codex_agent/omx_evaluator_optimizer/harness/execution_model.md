# execution_model.md - omx_evaluator_optimizer 실행 모델

## 핵심 원칙

이 하네스는 `반복 개선`에 더해 `반복 검증`을 강제한다. 앱이 한 번 좋아 보인다고 끝내지 않는다. reviewer와 root-level comparison flow를 계속 돌려서 버티는지 확인한다.

## Phase 1: Writer (거친 초안)

1. `spec/spec.md`, `spec/ui_contract.md`를 읽는다.
2. 동작하는 end-to-end 앱을 만든다.
3. 입력 폼, 생성 플로우, 5단계 표시, export가 **작동하기만 하면** reviewer로 넘긴다.
4. 이 단계에서 세부 polish를 끝내지 마라.

**Writer exit gate**:
- `cd app && npm run build` 통과

## Phase 2-N: Review → Revise 루프

### 루프 1회 = 아래 4단계

#### Step A: Reviewer

`harness/prompt_sets/reviewer.md`의 체크리스트 9개를 전부 평가한다.

- PASS: 기준 충족
- PARTIAL: 일부 충족, 구체적 부족점 기재
- FAIL: 미충족, 수정 지시를 파일/영역 중심으로 작성

#### Step B: Optimizer

- FAIL/PARTIAL 항목을 실제 코드 수정으로 해결한다.
- 변경 후 `npm run build` 확인
- 빌드 실패 시 빌드부터 고친다.

#### Step C: 기록

`runs/iteration_log.md`에 append:

```md
## Iteration N

- Started at: ...
- Reviewer verdict: PASS X / PARTIAL Y / FAIL Z
- Key fixes:
  - ...
- Build: success/failure
- Needs another loop: yes/no
```

#### Step D: Verification cadence

루프 도중 아래 검증 흐름을 계속 끼워 넣는다:

- `python scripts/validate_workspace.py`
- `python scripts/compare_scorecards.py`
- `HARNESS=omx_evaluator_optimizer uv run python scripts/evaluate.py`

각 결과는 `runs/verification_log.md`에 append한다.

## 루프 종료 조건

- 최소 **10회** 루프 완료
- 마지막 reviewer 체크리스트 **9/9 PASS**
- verification cycle **10회 이상**

## 강한 종료 기준

- smoke pass rate = **100%**
- L3 overall_score ≥ **9.2**
- final_score ≥ **9.4**

## 실패 허용 방식

이 기준은 일부러 빡빡하다. 만약 20회 이내에 도달하지 못하면:

- 최고 달성 점수
- 남은 결함
- 어디서 막혔는지
- verification evidence

를 남기고 마감한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **quality gauntlet** 로 보여야 한다.

### 권장 여정 구조

- Brief/Input 이후 gauntlet entry 상태를 명확히 보여준다.
- loop history와 verification status는 summary-first로 제시한다.
- 각 gate 통과 전후의 사용자 행동이 분명해야 한다.
- Final/export는 마지막 승인 gate 뒤에 위치해야 한다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

