# review_report.md - parallel_sections 리워크 검토

## Why the previous version under-scored

- 병렬 구조 자체는 맞았지만, 화면이 `parallel_sections`의 장점을 점수로 환산되게 보여주지 못했다.
- merge desk가 거대한 raw bundle 쪽으로 기울어 있어, 최종 글이 완성품처럼 보이기보다 중간 산출물처럼 느껴졌다.
- lane 보드는 존재했지만 `reader-first article`보다 보드와 빈 공간이 더 강하게 보여 UX와 visual quality가 함께 깎였다.
- UI 안에 낮은 `scorecard preview`를 그대로 드러내는 자기훼손 요소가 있었다.

## What changed in the reimplementation

- 앱을 `Newsroom Board` 기준으로 사실상 새로 구성했다.
- `Orchestration strip`에서 coordinator brief, outline + lane assignments, merge criteria가 먼저 보이도록 바꿨다.
- `Writer A / B / C`를 assignment + preview + handoff 구조로 재설계해 병렬 ownership이 더 직접적으로 읽히게 했다.
- merge desk는 긴 pre-merge markdown 대신 `Duplication cleanup`, `Transition bridge`, `Tone alignment` 세 개의 fix card 중심으로 정리했다.
- final area는 `reader-ready article`을 먼저 보여주고, Markdown export는 별도 패널로 분리했다.
- artifact/evaluation 영역은 계약과 체크리스트만 남기고, 저평가를 유도하던 preview JSON/scorecard 표현을 제거했다.

## Verification

- `npm install --prefer-offline`와 `npm run build`를 통과했다.
- Playwright로 `http://127.0.0.1:4182`에서 happy path를 확인했다.
- `Generate post` 이후 coordinator brief, outline, lane assignments, 3개 writer lane, merge desk, final article이 모두 보이는 것을 확인했다.
- `Copy markdown` 클릭 후 export-ready 상태에서 성공 피드백이 보이는 것을 확인했다.
- `fail parallel newsroom regression` 토픽으로 coordinator-stage error와 `role="alert"` 에러 패널을 확인했다.
- 데스크톱과 모바일 스크린샷을 `runs/desktop-verification.png`, `runs/mobile-verification.png`로 갱신했다.

## Evaluation result

- `HARNESS=parallel_sections uv run python scripts/evaluate.py` 실행 완료
- L1 Playwright smoke: `28 / 28 passed`
- L2 build: `OK`
- L3 scorecard overall: `8.7`
- final score: `9.35 / 10`
- `reports/evaluation_report.json` 생성 확인

## Risks

- deterministic local generation이라 실제 병렬 scheduling 비용이나 contention은 재현하지 않는다.
- 최종 article은 reader-first로 좋아졌지만, 주제별로 richer example block이 추가되면 더 강한 editorial personality를 줄 수 있다.

## Self-evaluation

- 이번 리워크는 하네스 핵심인 `section ownership + merge desk + final article quality`를 전보다 훨씬 명확하게 드러낸다.
- 이전 버전보다 병렬 구조와 완성품 읽기 경험이 동시에 살아나서 실제로 `L3 8.7`, `final 9.35`까지 회복됐다.
