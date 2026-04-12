# review_report.md - router 구현 검토

## Build summary

- starter app를 router 전용 흐름으로 교체했다.
- topic classification, chosen specialist, matched signals, fallback reason이 모두 `Routing Desk`에 보이도록 구현했다.
- specialist별로 `frontend`, `orchestration`, `infra`, `fallback` 렌즈가 실제 research / outline / drafts / review 표현에 드러나도록 deterministic generator를 구현했다.
- `npm install --prefer-offline`와 `npm run build`를 통과했다.

## Verification

- Playwright로 `http://127.0.0.1:4177`에서 기본 happy path를 검증했다.
- `LangGraph 1.0에서 Supervisor 패턴 설계하기`는 `Orchestration Specialist`로, `React Compiler 시대의 memoization 전략`은 `Frontend Specialist`로, `RAG에서 Vector DB 선택 기준과 트레이드오프`는 `Infra Specialist`로, `Engineering team knowledge sharing habits`는 `Fallback Specialist`로 라우팅되는 것을 확인했다.
- `Copy markdown` 성공 피드백을 확인했다.
- `fail routing smoke` 토픽으로 router classification 단계 error state와 에러 패널을 확인했다.
- 데스크톱과 모바일 스크린샷을 `runs/desktop-verification.png`, `runs/mobile-verification.png`로 저장했다.

## Evaluation result

- `HARNESS=router uv run python scripts/evaluate.py` 실행 완료
- L1 Playwright smoke: `28 / 28 passed`
- L2 build: `OK`
- L3 scorecard overall: `8.7`
- final score: `9.35 / 10`
- `reports/evaluation_report.json` 생성 확인

## Risks

- routing은 deterministic keyword scoring이므로, 경계가 모호한 topic에서는 실제 의미론보다 키워드가 더 크게 작동할 수 있다.
- specialist 표현 차이는 충분히 보이지만, 더 많은 examples나 richer content blocks가 들어가면 fallback와 specialist 간 차별성이 더 커질 수 있다.

## Remaining issues

- artifact preview 패널은 실제 report file을 실시간으로 읽지 않고 예시 데이터를 보여준다.
- 현재는 specialist별 시각 차이를 텍스트 중심으로 보여주므로, 이후에는 compact comparison blocks를 넣으면 더 좋다.

## Self-evaluation

- 하네스 핵심인 `routing decision + specialist difference + fallback trace + evaluation completion`을 화면과 산출물 모두에서 확인 가능하게 만든 점이 좋다.
- 평가 시스템을 완료 조건에 직접 연결한 덕분에 router가 실제로 “잘 끝났는지”가 수치로도 남는다.
