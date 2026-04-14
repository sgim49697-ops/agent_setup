# master-loop-reset-watchdog-guidance.md - reset 후 watchdog/worker가 따라야 할 재시작 가이드

## 언제 이 가이드를 적용하나

다음 상황에서 이전 `project_completed` 상태는 더 이상 최신 진실이 아니다.

- 프로젝트 완료 후 수동 디자인 수정이 들어갔을 때
- 프로젝트 완료 후 Korean-first / ko-copy 관련 수정이 들어갔을 때
- `scripts/`, `docs/`, `benchmark/`, `.omx/config`, `AGENTS.md` 같은 공유 경로를 건드렸을 때

이 경우에는 **반드시 reset 후 재시작**한다.

```bash
bash scripts/openclaw_master_loop_reset.sh
```

## reset 이후 watchdog가 기본으로 가정해야 하는 것

1. 이전 `project_completed` / `remaining_harnesses=[]`는 **역사적 기록**일 뿐 현재 상태가 아니다.
2. 새 루프는 `in_progress` 상태로 다시 시작해야 한다.
3. 이전 project-final marker, cycle marker, quality-gate/validator/trace/ui-language 리포트는 stale일 수 있으므로 reset에서 archive된 것으로 본다.
4. 새 bounded cycle은 현재 저장소 내용을 기준으로 다시 검증해야 한다.
5. 수동 수정이 디자인/ko-copy 범주라면, 첫 루프부터 Korean-first visible copy와 first-fold 디자인 품질을 다시 점검해야 한다.

## reset 이후 worker/agent 체크리스트

루프를 다시 시작한 에이전트는 다음을 먼저 확인한다.

- `docs/stitch-ux-reference.md` 읽기
- 이 문서(`docs/master-loop-reset-watchdog-guidance.md`) 읽기
- 현재 수정이 어떤 하네스/공유 파일에 영향을 줬는지 확인
- 이전 completion claim을 재사용하지 말고 현재 repo 상태로 다시 증명
- project-final marker는 **새 검증에서** `remaining_harnesses=[]`와 full-project rescan green이 확인될 때만 다시 작성

## reset 이후 첫 사이클에서 특히 금지되는 것

- 이전 완료 상태를 근거로 quality gate를 생략하는 것
- 이전 cycle artifact만 보고 `project_completed`를 다시 선언하는 것
- stale quality-gate/trace 보고서를 현재 실패/성공 근거로 재사용하는 것
- 디자인 변경이 있었는데 ko-copy / browser-review / harness gate를 건너뛰는 것

## 설계/한국어 수정이 들어간 경우의 기본 기대치

- visible copy는 한국어 우선
- 영어는 안정적인 test hook (`aria-*`, `data-testid`, live-region hook) 에만 제한
- ko-copy 점검은 quoted string뿐 아니라 **JSX text node**도 포함
- design patch 이후에는 critic reject 여부와 별개로 ko-copy가 한 번은 돌아야 함

## 구현 메모

- `scripts/openclaw_master_loop_reset.sh`는 completion marker뿐 아니라 derived state report도 archive한다.
- `scripts/run_master_ux_worker.sh`는 새 사이클 시작 시 이 문서를 읽도록 프롬프트에 포함해야 한다.
- `scripts/master_loop_quality_gate.py`는 reset 이후 새 state를 기준으로만 판단해야 한다.
