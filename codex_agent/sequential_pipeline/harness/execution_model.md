# execution_model.md - sequential_pipeline 실행 모델

## 역할

1. `researcher`: 사실과 포인트 정리
2. `outliner`: 구조와 섹션 흐름 설계
3. `writer`: 화면과 콘텐츠 흐름 구현
4. `reviewer`: 누락, 혼란, polish 점검

## 규칙

- 각 단계의 출력이 다음 단계의 명시적 입력이 된다.
- reviewer는 새 기능 추가보다 수정 지시와 마감 점검에 집중한다.


## 마지막 단계: 자동 평가

구현 완료 후 반드시 실행한다. 이 단계를 건너뛰면 Done 조건을 만족하지 못한다.

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=sequential_pipeline uv run python scripts/evaluate.py
```

평가가 생성하는 `reports/evaluation_report.json`의 `final_score ≥ 7.0`이어야 완료다.
미달 시 코드를 수정하고 다시 평가한다.


## UX Benchmark v2 Presentation Model (additive)

이 하네스는 v2 기준에서 **route-based stepper** 로 보여야 한다.

### 권장 여정 구조

- Research step -> Outline step -> Draft step -> Review step -> Final step 순서를 지킨다.
- 각 단계는 이전 단계 출력의 요약과 승인/진행 action을 포함한다.
- step indicator 또는 route 전환으로 progression을 명확히 보여준다.
- evidence는 기본 여정과 분리된 보조 surface로 둔다.

### Product UI / Evidence UI 분리

- product UI는 현재 단계와 다음 행동 중심으로 구성한다.
- evidence/debug/scorecard/review trace는 탭, drawer, collapsed section, 또는 별도 route로 분리할 수 있다.
- 필수 산출물은 모두 존재해야 하지만 동시에 한 화면에 전부 펼칠 필요는 없다.

