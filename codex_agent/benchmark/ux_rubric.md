# ux_rubric.md - UX Benchmark v2 전용 평가 루브릭

이 문서는 기존 `benchmark/rubric.md`를 보완하는 v2 전용 UX 평가 기준이다.

## 평가 항목

### 1. First-screen comprehension

- 첫 화면에서 서비스 목적이 5초 안에 이해되는가
- 시작 행동이 명확한가
- 첫 화면 정보량이 과도하지 않은가

### 2. Journey clarity

- 사용자가 step-to-step으로 자연스럽게 이동하는가
- 현재 위치와 다음 행동이 명확한가
- back/retry/approve 흐름이 납득 가능한가

### 3. Information architecture quality

- product UI와 evidence UI가 적절히 분리되어 있는가
- 긴 정보가 progressive disclosure로 정리되어 있는가
- 기본 화면이 증거판처럼 보이지 않는가

### 4. Export experience

- final step과 export의 관계가 명확한가
- copy/export 피드백이 직관적인가
- export 전 상태에서 guard 메시지가 자연스러운가

### 5. Error recovery

- 에러가 명확히 보이는가
- 다음 행동을 안내하는가
- 정상 흐름으로 복구 가능해 보이는가

### 6. Mobile usability

- 모바일에서도 주요 액션이 유지되는가
- 세로 흐름이 깨지지 않는가
- 가독성과 탭 가능성이 유지되는가

### 7. Harness differentiation

- 이 하네스만의 interaction model이 느껴지는가
- 다른 하네스와 구조적으로 구분되는가
- gimmick이 아니라 UX 구조 차이로 보이는가

### 8. Language appropriateness

- 기본 사용자 가시 텍스트가 한국어 우선으로 작성되어 있는가
- 불필요한 영어 debug/evidence copy가 제품 화면에 노출되지 않는가
- 기술 용어의 영어 병기는 이해를 돕는 수준으로만 제한되는가

## 간단 점수표 예시

각 항목 0~10:

```json
{
  "first_screen_comprehension": 0,
  "journey_clarity": 0,
  "information_architecture": 0,
  "export_experience": 0,
  "error_recovery": 0,
  "mobile_usability": 0,
  "harness_differentiation": 0,
  "language_appropriateness": 0,
  "overall_v2_ux_score": 0
}
```

## 해석 가이드

- 9~10: 매우 명확하고 product-like하며, 하네스 차이가 UX 구조로 살아 있음
- 7~8: 전반적으로 이해 가능하지만 일부 과밀 또는 약한 step 흐름 존재
- 5~6: 기능은 있으나 product UX보다 evidence dashboard에 가까움
- 0~4: 사용자가 흐름을 이해하기 어렵고 어디서 시작해야 할지 모호함
