# review_report.md - orchestrator_worker 구현 검토

## Build summary

- starter app를 `orchestrator -> ui_worker / state_worker / content_worker -> integrator` 구조가 보이는 전용 UI로 교체했다.
- Orchestrator Desk에 decomposition reason, worker task bundles, integration checklist를 직접 노출했다.
- Worker Board에는 `UI Worker`, `State Worker`, `Content Worker` 각각의 ownership scope, owned deliverables, integration risk, handoff note를 표시하도록 구현했다.
- Integration Desk에는 layout/state/content consistency와 `Fixes applied`를 노출해 최종 post가 단순 raw draft 나열이 아니라 integration review 결과임이 보이게 했다.
- `npm install --prefer-offline`와 `npm run build`를 통과했다.

## Verification

- Playwright로 `http://127.0.0.1:4180`에서 happy path를 검증했다.
- `LangGraph 1.0에서 Supervisor 패턴 설계하기` preset으로 실행했을 때 orchestrator plan, worker ownership, research/outline, section drafts, review notes, final post가 모두 보이는 것을 확인했다.
- `Copy markdown` 동작을 확인했고 final Markdown export가 `Final post` 패널의 결과를 기준으로 동작하는 것을 확인했다.
- `fail orchestrator planning regression check` 토픽으로 orchestrator planning 단계 error state와 `role=\"alert\"` 에러 패널을 확인했다.
- 데스크톱과 모바일 스크린샷을 `runs/desktop-verification.png`, `runs/mobile-verification.png`로 저장했다.

## Evaluation result

- `HARNESS=orchestrator_worker uv run python scripts/evaluate.py` 실행 완료
- L1 Playwright smoke: `28 / 28 passed`
- L2 build: `OK`
- L3 scorecard overall: `8.8`
- final score: `9.4 / 10`
- `reports/evaluation_report.json` 생성 확인

## Risks

- worker 분해는 deterministic simulation이므로 실제 멀티에이전트 조정 비용이나 race condition은 재현하지 않는다.
- content worker가 만드는 초안이 길어질수록 integrator 수정은 현재보다 더 강한 dedupe 규칙이 필요할 수 있다.

## Remaining issues

- artifact/evaluation 패널은 실제 파일 내용을 실시간으로 읽지 않고 benchmark 계약 미리보기를 보여준다.
- final post는 integration review를 거치지만 pre-integration diff 자체를 별도 시각화하지는 않는다.

## Self-evaluation

- 하네스 핵심인 `task decomposition + ownership separation + integration review + evaluation completion`이 화면 구조와 산출물 계약에 모두 드러나도록 맞춘 점이 좋다.
- `router`와 달리 선택보다 분해/통합이 먼저 보이도록 만든 덕분에 하네스 성격 차이가 명확하다.
