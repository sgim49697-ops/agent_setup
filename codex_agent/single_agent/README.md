# single_agent

`single_agent`는 하나의 Codex 작업 흐름이 사이트 전체를 구현하는 비교군입니다. 가장 단순한 기본형이며, 빠른 진행과 일관된 스타일을 기대할 수 있지만 자기 검증 품질에 따라 결과 편차가 커질 수 있습니다.

## 사용법

```bash
cd /home/user/projects/agent_setup/codex_agent/single_agent
codex
cd app && npm install && npm run dev
```

## 이 하네스의 핵심

- 메인 지시서 하나
- 구현 루프 하나
- self-check 중심 마감
