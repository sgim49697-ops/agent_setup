# evaluation_guide.md - Codex 평가 실행 가이드

이 문서는 Codex가 각 하네스 워크스페이스에서 앱 구현을 완료한 뒤 반드시 수행해야 하는 평가 절차를 정의한다.

## 전제

- 평가 스크립트는 프로젝트 루트(`codex_agent/`)에서 실행한다.
- Playwright, Node.js, Python(uv)이 설치되어 있어야 한다.
- 앱은 `npm run build` → `npx vite preview --port 4173`으로 실행 가능해야 한다.

## 구현 완료 후 필수 실행 순서

### Step 1: 빌드 확인

```bash
cd <workspace>/app
npm install --prefer-offline
npm run build
```

빌드가 실패하면 코드를 수정하고 다시 빌드한다. 빌드 성공 없이 다음 단계로 가지 않는다.

### Step 2: scorecard 작성

`reports/scorecard.json`을 작성한다. 아래 필드를 0-10 범위로 채운다.

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

채점 기준은 `benchmark/rubric.md`를 참고한다.

### Step 3: 3-layer 평가 실행

프로젝트 루트에서 실행:

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=<workspace_name> uv run python scripts/evaluate.py
```

`<workspace_name>`은 `single_agent`, `sequential_pipeline`, `parallel_sections`, `router`, `orchestrator_worker`, `evaluator_optimizer` 중 하나.

추가 확장 하네스로 `omx_evaluator_optimizer`도 같은 방식으로 실행할 수 있다. 이 변형은 더 많은 루프와 더 빡빡한 자체 완료 기준을 둘 수 있지만, 평가 명령 자체는 동일하다.

이 스크립트가 자동으로 수행하는 것:
1. **L1**: `npx vite preview`로 앱을 띄우고 Playwright smoke test 28개 실행
2. **L2**: 빌드 시간, 소스 파일 수, 라인 수, 번들 크기 수집
3. **L3**: `reports/scorecard.json` 로드
4. 가중 합산 → `reports/evaluation_report.json` 자동 생성

### Step 4: 통과 기준 확인

- L1 smoke pass rate ≥ 80% (28개 중 23개 이상)
- L2 빌드 성공
- L3 overall_score ≥ 6.0
- `reports/evaluation_report.json`이 존재

하나라도 미달이면 코드를 수정하고 Step 1부터 다시 반복한다.

### OMX 확장 하네스 참고

`omx_evaluator_optimizer`는 기본 평가 명령은 동일하지만, 워크스페이스 내부 규칙에서 더 높은 자체 기준(예: 더 많은 루프, 더 많은 verification cycle, 더 높은 subjective score)을 요구할 수 있다. 공통 평가 계약은 유지하되, 완료 기준은 해당 워크스페이스 문서를 우선한다.

## Playwright smoke test가 검증하는 것

총 14개 테스트 × 2 뷰포트(desktop + mobile) = 28 체크포인트:

| 카테고리 | 테스트 |
|---------|--------|
| 입력 필드 | Topic, Audience, Tone, Length 존재 |
| 액션 | Generate post 버튼, Copy markdown 버튼 존재 |
| 생성 플로우 | Generate 클릭 → 5단계 산출물 모두 표시 |
| 최종 출력 | Final post가 비어있지 않음 |
| 상태 | initial 표시, loading 중 비활성화, error 메시지 표시 |
| 접근성 | 모든 입력에 label, aria-live 영역 존재 |
| 빈 상태 | 생성 전 안내 메시지 존재 |

## 테스트 통과를 위한 UI 구현 필수사항

Playwright가 요소를 찾는 방식을 이해해야 한다:

- **Topic 입력**: `role="textbox"` + `aria-label="Topic"` 또는 `<label>Topic</label>`에 연결된 `<textarea>`/`<input>`
- **Audience/Tone/Length**: `aria-label="Audience"` 등이 있는 `<select>` 또는 동등한 입력
- **Generate post**: `role="button"` + 텍스트에 "Generate post" 포함
- **Copy markdown**: `role="button"` + 텍스트에 "Copy markdown" 포함
- **단계 영역**: 텍스트 "Research results", "Outline", "Section drafts", "Review notes", "Final post"가 화면에 보여야 함
- **상태 배너**: `aria-live="polite"` 속성이 있는 영역
- **에러 표시**: `role="alert"` 또는 `.error-panel`/`.error-state` 클래스
- **빈 상태**: `.empty-state` 또는 `[class*="empty"]`/`[class*="placeholder"]` 클래스
- **에러 트리거**: topic이 "fail" 또는 "error"로 시작하면 에러 상태 진입해야 함
- **loading 상태**: Generate 클릭 후 버튼이 disabled 되거나 텍스트가 "Generating..."으로 변경

이 규칙을 따르면 Playwright 테스트는 자동으로 통과한다.

## 산출물 체크리스트

구현 완료 시 아래 파일이 모두 존재해야 한다:

```
<workspace>/
├── app/dist/                       # 빌드 결과물
├── runs/run_manifest.json          # 실행 메타데이터
├── runs/artifact_index.json        # 산출물 목록
├── reports/review_report.md        # 자체 리뷰
├── reports/scorecard.json          # L3 주관 점수
└── reports/evaluation_report.json  # 3-layer 통합 (evaluate.py가 생성)
```

## UX Benchmark v2 evaluation overlay (additive)

이 섹션은 기존 v1 평가 절차를 유지하면서, **사용자 여정 중심 UX 품질**을 추가로 평가하기 위한 overlay다.

### v2에서 추가로 확인할 것

1. 첫 화면 5초 이해 가능성
2. 각 step의 primary action 명확성
3. 단계 이동 흐름의 자연스러움
4. product UI와 evidence UI의 분리 정도
5. 하네스별 interaction model 차별성
6. 모바일에서 흐름이 유지되는지

### v2 권장 실행 절차

v1 절차(build → scorecard → evaluate.py)를 수행한 뒤, 추가로 아래를 권장한다.

1. preview 서버 실행
2. 실제 브라우저에서 다음 흐름 수동/자동 검증
   - 입력
   - step progression
   - export
   - error recovery
   - mobile viewport
3. `benchmark/manual_ui_review/<date>/` 아래에 결과 저장

### v2 자동 평가 확장 예정

v2에서는 존재 중심 smoke test 외에 **journey test**를 추가하는 것을 권장한다.

예시:
- input → research 이동
- research 승인 → outline 이동
- outline 승인 → draft/review 이동
- final/export 단계에서만 export가 강하게 노출되는지

Journey test 파일은 별도 spec으로 추가할 수 있다.
