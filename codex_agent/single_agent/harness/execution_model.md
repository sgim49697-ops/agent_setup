# execution_model.md - single_agent 실행 모델

## 흐름

1. 제품 스펙 파악
2. 앱 구조 결정
3. UI/상태 구현
4. 자체 검토 및 polish
5. 산출물 기록

## 의사결정 원칙

- 하위 역할을 따로 만들지 않는다.
- 흐름이 막혀도 같은 컨텍스트 안에서 해결한다.
- 지나친 문서 분해보다 직접 구현을 우선한다.


## 마지막 단계: 자동 평가

구현 완료 후 반드시 실행한다. 이 단계를 건너뛰면 Done 조건을 만족하지 못한다.

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=single_agent uv run python scripts/evaluate.py
```

평가가 생성하는 `reports/evaluation_report.json`의 `final_score ≥ 7.0`이어야 완료다.
미달 시 코드를 수정하고 다시 평가한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **focused wizard** 로 보여야 한다.

### 권장 여정 구조

- Brief/Input 단계에서 시작한다.
- 각 단계는 primary CTA 1개를 가진다.
- 다음 단계로 넘어갈 때 이전 단계 산출물은 요약 상태로 접어둘 수 있다.
- Final 단계에서만 `Copy markdown`를 가장 강하게 노출한다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

