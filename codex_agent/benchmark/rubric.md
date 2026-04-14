# rubric.md - 공통 평가 루브릭

## 1. Task Success

- 필수 단계가 모두 연결되어 있는가
- 필수 산출물이 모두 화면에 드러나는가
- 최종 포스트 출력과 export가 가능한가

## 2. Process Adherence

- 해당 하네스의 역할 구조를 실제 구현 흐름에 반영했는가
- `AGENTS.md`와 `harness/` 계약을 지켰는가
- done criteria를 만족했는가

## 3. UX Quality

- 흐름 명확성
- 상태 표현 품질
- 사용자의 다음 액션 가시성
- 에러/빈 상태 메시지 품질

## 4. Visual Quality

- 정보 계층
- 타이포그래피 일관성
- 여백과 레이아웃 안정성
- 디자인 방향성

## 5. Responsiveness + A11y

- 모바일/데스크톱 레이아웃 대응
- 키보드 접근
- 레이블/aria 기본기
- 명확한 명도 대비

## UX Benchmark v2 Additive Criteria

v2에서는 아래 항목을 별도로 강하게 본다.

### 6. Information Architecture Quality

- 첫 화면 정보량이 과도하지 않은가
- 현재 단계와 다음 행동이 명확한가
- product UI와 evidence UI가 섞여 있지 않은가
- 긴 정보가 progressive disclosure로 정리되어 있는가

### 7. Journey Clarity

- 사용자가 step-to-step으로 자연스럽게 이동하는가
- 각 단계의 primary action이 분명한가
- 뒤로 가기 / 재시도 / 승인 흐름이 자연스러운가
- export는 final step에 어울리게 배치되어 있는가

### 8. Harness-to-UI Differentiation

- 각 하네스의 내부 구조가 결과 UX에서도 느껴지는가
- 서로 다른 하네스가 비슷한 dashboard UI로 수렴하지 않았는가
- 구조적 차별성이 gimmick이 아니라 interaction model로 드러나는가

### 9. Interactive Design Quality (v2 엄격 기준)

이 항목은 **blocking 평가**다. 아래 기준을 충족하지 못하면 전체 점수가 60점 이하로 캡된다.

**필수 충족 항목 (모두 pass해야 함):**
- 화면 전환 시 CSS transition 또는 animation 사용 (instant snap = fail)
- 모든 버튼/인터랙티브 요소에 :hover + :focus-visible 스타일 존재 (cursor:pointer만 = fail)
- 로딩/비동기 상태에 시각적 진행 표시 존재 (skeleton, shimmer, pulse, 단계별 reveal 중 하나)
- 완료/성공 상태에 명확한 피드백 애니메이션 존재
- `@media (prefers-reduced-motion: reduce)` 래퍼가 모든 animation에 적용됨
- 시스템 폰트(Inter, Roboto, Arial, system-ui) 미사용 — 개성 있는 폰트 페어링 적용
- 색상이 CSS 변수로만 참조됨 (하드코딩된 hex/rgb 없음)
- 빈 상태(empty state)가 기본 브라우저 동작이 아닌 설계된 UI로 처리됨

**보너스 (점수 가산):**
- 화면 입장 시 staggered 애니메이션 (항목별 순차 등장)
- 버튼 클릭 시 micro-interaction (scale, ripple 등)
- 에러 상태에 shake/glow 등 시각 피드백
- 완료 시 checkmark stroke 또는 color fill 애니메이션

## 점수 파일 계약

### L3 주관 점수: `scorecard.json`

```json
{
  "task_success": 0,
  "ux_score": 0,
  "flow_clarity": 0,
  "visual_quality": 0,
  "interactive_design": 0,
  "responsiveness": 0,
  "a11y_score": 0,
  "process_adherence": 0,
  "overall_score": 0
}
```

`interactive_design` 점수 기준:
- 0–40: blocking 기준 2개 이상 미충족
- 41–59: blocking 기준 1개 미충족 또는 대부분 충족하나 polish 부족
- 60–74: blocking 기준 전부 충족, 보너스 없음
- 75–89: blocking 전부 + 보너스 1–2개
- 90–100: blocking 전부 + 보너스 3개 이상, 실제 premium app 수준

### 통합 평가: `evaluation_report.json`

3-layer 평가 러너(`scripts/evaluate.py`)가 자동 생성한다.

| 계층 | 가중치 | 소스 | 성격 |
|------|--------|------|------|
| L1 Playwright smoke | 30% | `benchmark/playwright/smoke.spec.ts` | 기계적 pass/fail |
| L2 정량 메트릭 | 20% | `scripts/collect_metrics.py` | 빌드, 번들, 코드량 |
| L3 주관 scorecard | 50% | `reports/scorecard.json` | rubric 기반 평가 |

L3가 없으면 L1 60% / L2 40%로 자동 재조정된다.

```bash
# 단일 하네스 평가
HARNESS=single_agent uv run python scripts/evaluate.py

# 전체 비교
uv run python scripts/evaluate.py
```
