# git automation for `codex_agent`

이 문서는 `codex_agent` 워크스페이스를 Git에 안전하게 자동 반영하는 방식을 정리한다.

## 핵심 원칙

이 저장소의 Git root는 `codex_agent`가 아니라 상위 디렉토리인:

- `/home/user/projects/agent_setup`

이다.

따라서 자동 stage/commit 스크립트는 **반드시 `codex_agent/` 서브트리만 다뤄야** 한다.

## 자동화 대상

자동 반영 대상:

- `codex_agent/benchmark/**`
- `codex_agent/scripts/**`
- `codex_agent/*/app/src/**`
- `codex_agent/*/harness/**`
- `codex_agent/*/spec/**`
- `codex_agent/*.md`
- `codex_agent/.codex/skills/**`

자동 제외 대상:

- `node_modules/`
- `dist/`
- `.omx/`
- `.openclaw/`
- Playwright test-results
- manual UI review screenshots
- root screenshot dumps
- `output/`

## 스크립트

### 1. large-file guard

```bash
python3 codex_agent/scripts/git_guard_large_files.py
```

역할:
- 현재 staged 된 `codex_agent/` 파일 중 5 MiB 초과 파일을 차단한다.

### 2. checkpoint commit

```bash
codex_agent/scripts/git_auto_checkpoint.sh --message "..." 
```

옵션:

- `--push` : 커밋 후 현재 브랜치를 `origin`에 push
- `--message <msg>` : 커밋 메시지 지정

동작:
- `codex_agent/` subtree만 stage
- large-file guard 실행
- staged diff가 있으면 commit

예시:

```bash
scripts/git_auto_checkpoint.sh --message "Checkpoint benchmark v2 docs"
scripts/git_auto_checkpoint.sh --push --message "Checkpoint single_agent wizard refactor"
```

## 권장 자동화 방식

### A. 수동 checkpoint

큰 단계가 끝날 때:

```bash
cd /home/user/projects/agent_setup/codex_agent
scripts/git_auto_checkpoint.sh --message "Checkpoint after cycle review"
```

### B. loop와 결합

master loop worker가 다음 이벤트 뒤에 이 스크립트를 호출하도록 붙이는 방식이 적합하다.

- benchmark v2 문서층 갱신 완료 후
- 하네스 하나 완료 후
- 브라우저 리뷰/replan 결과 저장 후

### C. 너무 촘촘한 auto-commit은 비추천

상태 파일 변경마다 commit 하는 방식은 보통 너무 noisy 하다.

추천 단위:

- phase
- harness
- cycle

## 추가 체크 포인트

1. 현재 브랜치 확인:

```bash
git rev-parse --abbrev-ref HEAD
```

2. remote 확인:

```bash
git remote -v
```

3. subtree 바깥 변경 확인:

```bash
git status --short
```

4. staged diff stat 확인:

```bash
git diff --cached --stat -- codex_agent
```

## GitHub 관련

현재 remote:

- `origin https://github.com/sgim49697-ops/agent_setup.git`

즉 push 자체는 가능한 상태다. 다만 자동 push를 붙일 때는:

- branch 전략
- force push 금지
- screenshot/large artifact 차단

를 같이 관리하는 게 안전하다.
