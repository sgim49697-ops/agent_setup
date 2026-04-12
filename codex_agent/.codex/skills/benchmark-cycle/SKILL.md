---
name: benchmark-cycle
description: "Run one benchmark improvement cycle for codex_agent: pick a harness, build it, run benchmark evaluation, run browser/journey review, record artifacts, and decide whether to replan."
---

# benchmark-cycle

## Purpose

이 skill은 `codex_agent` 프로젝트에서 하네스 하나 또는 여러 개를 대상으로 **한 번의 benchmark 개선 사이클**을 수행하기 위한 실무형 워크플로다.

핵심 흐름:

1. 대상 하네스 선택
2. 구현 또는 수정
3. `npm run build`
4. benchmark 평가 (`scripts/evaluate.py`)
5. browser/journey review
6. artifact consistency 확인
7. replan 필요 여부 판정

## Use when

- 사용자가 benchmark cycle, harness rerun, UX review loop, 재실행/재평가를 원할 때
- `codex_agent`의 7개 하네스를 순차 비교/개선할 때
- smoke + journey + 수동 브라우저 리뷰를 한 세트로 묶어야 할 때

## Rules

- 한 번에 한 하네스씩 순차 진행한다.
- build/evaluate/browser review를 모두 본 뒤에만 완료 판단한다.
- 결과와 메모는 `.omx/logs/`, `.omx/state/`, `benchmark/manual_ui_review/`에 남긴다.
- 기본 사용자 가시 텍스트는 한국어 우선 기준을 따른다.
- design-tool 맥락이 있으면 이 프로젝트에서는 Figma보다 **Stitch MCP**를 우선 검토한다.

## Suggested cycle checklist

### 1. 준비

- 대상 하네스 확인
- 관련 `AGENTS.md`, `harness/execution_model.md`, `harness/done_criteria.md` 확인
- 현재 benchmark v2 문서 변화 반영 여부 확인

### 2. 구현/수정

- UX 메타포 유지
- product UI / evidence UI 분리
- 첫 화면 정보량 줄이기
- current step / next action 명확화

### 3. 검증

```bash
cd <harness>/app
npm run build
```

```bash
cd /home/user/projects/agent_setup/codex_agent
HARNESS=<harness> uv run python scripts/evaluate.py
python3 scripts/check_artifact_consistency.py
```

필요 시:

```bash
cd benchmark
npm run test:journey -- --project=desktop
```

### 4. 브라우저 리뷰

- localhost preview 실행
- 입력 / step progression / export / error / mobile 직접 점검
- 스크린샷 저장

### 5. 기록

- `benchmark/manual_ui_review/<date>/`
- `.omx/logs/master-ux-benchmark-v2.log`
- `.omx/state/master-ux-loop.json`

### 6. 판정

- UX가 여전히 “증거판”처럼 보이면 replan
- 제품 흐름이 이해 가능해졌으면 다음 하네스로 진행
