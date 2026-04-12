# execution_model.md - parallel_sections 실행 모델

## 흐름

1. 공통 리서치와 아웃라인 정리
2. 섹션 단위 병렬 작성
3. merge와 통합 리뷰

## 규칙

- 각 섹션은 ownership을 가진다.
- 병렬 작성 후 반드시 merge 기준을 적용한다.
- 통합 시 tone mismatch와 반복을 제거한다.


## 마지막 단계: 자동 평가

구현 완료 후 반드시 실행한다. 이 단계를 건너뛰면 Done 조건을 만족하지 못한다.

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=parallel_sections uv run python scripts/evaluate.py
```

평가가 생성하는 `reports/evaluation_report.json`의 `final_score ≥ 7.0`이어야 완료다.
미달 시 코드를 수정하고 다시 평가한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **board-based composition workspace** 로 보여야 한다.

### 권장 여정 구조

- Research와 Outline은 공통 상위 단계로 제시한다.
- Section drafts는 병렬 카드/컬럼 구조로 제시한다.
- Merge/Review 단계에서 충돌 정리와 톤 통합을 보여준다.
- Final 단계에서만 통합 Markdown export를 강조한다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

