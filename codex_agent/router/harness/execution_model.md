# execution_model.md - router 실행 모델

## specialist 예시

- frontend/performance specialist
- orchestration/agents specialist
- infra/tradeoff specialist

## 규칙

- 라우팅 기준은 topic 중심이다.
- specialist 선택이 불명확하면 fallback으로 이동한다.
- specialist 차이는 결과 구조나 표현 방식에 드러나야 한다.


## 마지막 단계: 자동 평가

구현 완료 후 반드시 실행한다. 이 단계를 건너뛰면 Done 조건을 만족하지 못한다.

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=router uv run python scripts/evaluate.py
```

평가가 생성하는 `reports/evaluation_report.json`의 `final_score ≥ 7.0`이어야 완료다.
미달 시 코드를 수정하고 다시 평가한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **decision-tree routing shell** 로 보여야 한다.

### 권장 여정 구조

- Brief 입력 후 routing decision 단계가 드러나야 한다.
- 선택된 specialist 경로의 연구/작성 흐름을 이어서 보여준다.
- fallback 또는 route switch 가능성이 있다면 부드럽게 안내한다.
- Final 단계에서는 어떤 specialist reasoning이 반영되었는지 요약만 보여주고, 상세 trace는 분리한다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

