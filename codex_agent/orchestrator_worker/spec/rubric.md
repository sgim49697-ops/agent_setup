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

## 점수 파일 계약

### L3 주관 점수: `scorecard.json`

```json
{
  "task_success": 0,
  "ux_score": 0,
  "flow_clarity": 0,
  "visual_quality": 0,
  "responsiveness": 0,
  "a11y_score": 0,
  "process_adherence": 0,
  "overall_score": 0
}
```

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
