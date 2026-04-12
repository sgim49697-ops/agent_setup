# master-loop-safe-mode.md - background-safe automation mode for bounded UX cycles

## 목적

safe mode는 WSL CPU/RAM 폭주를 막기 위해:

1. 백그라운드 런타임을 완전히 정지하고
2. watchdog의 자동 재기동을 막고
3. 필요할 때만 orchestrator step 하나씩 수동 실행

하도록 바꾼 운영 모드다.

## 동작 원리

- safe mode 상태 파일:
  - `.omx/state/master-loop-safe-mode.json`
- watchdog 차단 파일:
  - `.omx/logs/master-ux-benchmark-v2.blocked`

safe mode가 켜져 있으면:
- `openclaw_master_loop_watchdog.py`는 sync / tmux 재생성 / runner relaunch를 하지 않고 즉시 종료
- `run_master_ux_worker.sh`는 `MASTER_LOOP_SAFE_MODE_BYPASS=1` 없이 시작되면 exit 90
- `master_loop_orchestrator.py`도 같은 bypass 없이 시작되면 exit 90

즉 자동화는 멈추고, 수동 step만 허용된다.

## 사용법

### 1) safe mode 켜기

```bash
bash scripts/master_loop_safe_mode.sh on "manual maintenance"
```

이 명령은 다음을 수행한다:
- safe mode JSON 기록
- blocker 파일 생성
- `openclaw-gateway.service` 정지
- `ux-master-loop-watchdog.timer/service` 정지
- `ux-master-bg`, `ux-preview-bg` tmux 세션 종료
- worker / orchestrator / orphan codex / MCP proxy 정리

### 2) 상태 확인

```bash
bash scripts/master_loop_safe_mode.sh status
```

### 3) step 하나만 수동 실행

safe mode를 유지한 채 필요한 step만 실행:

```bash
python3 scripts/master_loop_manual_step.py --step design --harness single_agent
python3 scripts/master_loop_manual_step.py --step critique --harness single_agent
python3 scripts/master_loop_manual_step.py --step ko-copy --harness single_agent
python3 scripts/master_loop_manual_step.py --step verify --harness single_agent
python3 scripts/master_loop_manual_step.py --step gates --harness single_agent
python3 scripts/master_loop_manual_step.py --step complete --harness single_agent
```

사용 가능한 step:
- `design`
- `critique`
- `ko-copy`
- `verify`
- `gates`
- `complete`
- `full`

### 4) safe mode 해제

```bash
bash scripts/master_loop_safe_mode.sh off
```

주의:
- 이 명령은 safe mode/blocker만 해제한다
- watchdog / gateway는 자동으로 다시 켜지지 않는다
- 다시 백그라운드 자동화를 켜려면 서비스와 watchdog를 수동으로 시작해야 한다

## 운영 규칙

- 메모리/CPU가 튀면 **먼저 safe mode on**
- 수리는 `master_loop_manual_step.py`로 step 단위 진행
- 상태/아티팩트는 `.omx/cycles/cycle-<n>-<harness>/`에서 확인
- 수동 수리가 끝났을 때만 safe mode를 해제하고 watchdog를 다시 올린다
