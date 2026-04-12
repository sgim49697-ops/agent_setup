# execution_model.md - evaluator_optimizer 실행 모델

## 핵심 원칙

이 하네스는 **반복 개선**이 목적이다. 한 번에 좋은 코드를 쓰는 것이 아니라, 빠른 초안 → 엄격한 리뷰 → 구체적 수정을 반복하여 품질을 끌어올린다.

토큰을 아끼기 위해 루프를 줄이는 것은 이 하네스의 규칙 위반이다.

## Phase 1: Writer (초안)

1. `spec/spec.md`, `spec/ui_contract.md`를 읽는다.
2. 동작하는 end-to-end 앱을 만든다.
3. 입력 폼, 생성 플로우, 5단계 표시, export가 **작동하기만 하면** Phase 2로 넘긴다.
4. 이 단계에서 CSS polish, 에러 핸들링 세부, 접근성 라벨 등을 완벽하게 하지 마라. reviewer가 잡아야 할 포인트를 남겨둬라.

**빌드 확인**: `cd app && npm run build` 통과해야 Phase 2 진입.

## Phase 2-N: Review → Revise 루프

### 루프 1회 = 아래 3단계를 순서대로 실행

#### Step A: Reviewer

`harness/prompt_sets/reviewer.md`의 체크리스트 9개 항목을 **하나씩** 평가한다.

각 항목에 대해:
- **PASS**: 기준 충족. 추가 작업 없음.
- **PARTIAL**: 일부 충족. 구체적으로 뭐가 부족한지 서술.
- **FAIL**: 미충족. 구체적 수정 지시 작성 (어떤 파일의 어떤 부분을 어떻게 바꿔야 하는지).

**Reviewer 출력 형식** (반드시 준수):
```
## Iteration N Review

| # | 항목 | 판정 | 비고 |
|---|------|------|------|
| 1 | 입력 필드 4개 | PASS/FAIL/PARTIAL | ... |
| 2 | Generate/Copy 액션 | PASS/FAIL/PARTIAL | ... |
| ... | ... | ... | ... |

### FAIL/PARTIAL 수정 지시
- [ ] 항목 N: {구체적 수정 내용}
- [ ] 항목 M: {구체적 수정 내용}
```

#### Step B: Optimizer

- FAIL/PARTIAL 항목의 수정 지시를 **코드 변경으로** 해결한다.
- 변경 후 `npm run build` 확인한다.
- 빌드 실패 시 빌드부터 고친다.

#### Step C: 기록

`runs/iteration_log.md`에 아래 형식으로 append:

```markdown
## Iteration N

- 시작 시점: YYYY-MM-DDTHH:MM:SSZ
- Reviewer 판정: PASS X개 / PARTIAL Y개 / FAIL Z개
- 주요 수정: {한 줄 요약}
- 빌드: 성공/실패
- 다음 루프 필요: 예/아니오
```

### 루프 종료 조건

- **정상 종료**: 9개 항목 중 8개 이상 PASS **그리고** 최소 3회 완료
- **강제 종료**: 15회 도달 시 현재 상태로 마감 (단, iteration_log에 이유 기록)

### 루프 강제 규칙

- **Iteration 1**: FAIL 항목이 3개 이상이어야 정상이다. 초안이 그만큼 rough해야 한다.
- **Iteration 2**: 이전 FAIL의 절반 이상이 PASS/PARTIAL로 개선되어야 한다.
- **Iteration 3+**: 남은 PARTIAL/FAIL을 해소한다.
- Reviewer가 iteration 1에서 전부 PASS를 내면, **초안이 너무 polish됐다는 뜻**이므로 의도적으로 더 까다로운 기준을 적용한다.

## Phase Final: 평가

1. `reports/scorecard.json` 작성 (rubric.md 기준, overall_score ≥ 7.5)
2. 평가 실행:
   ```bash
   cd /home/user/projects/agent_setup/codex_agent
   HARNESS=evaluator_optimizer uv run python scripts/evaluate.py
   ```
3. `final_score ≥ 8.0` 미달 시 루프를 더 돌린다.
4. `runs/iteration_log.md` 최종 요약을 추가한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **revision history loop** 로 보여야 한다.

### 권장 여정 구조

- Writer baseline을 먼저 보여준다.
- Review feedback과 revision change를 순차적으로 연결한다.
- iteration timeline이나 history는 유용하지만 가독성을 해치지 않게 설계한다.
- export는 최종 승인 iteration에서만 강하게 노출한다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

