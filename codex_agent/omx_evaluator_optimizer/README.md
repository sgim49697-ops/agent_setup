# omx_evaluator_optimizer

`omx_evaluator_optimizer`는 `evaluator_optimizer`의 강화형 실험 워크스페이스입니다. 목표는 단순 통과가 아니라, 반복 루프와 반복 검증을 강하게 걸어 **거의 한계까지 품질을 밀어붙이는 것**입니다.

## 사용법

```bash
cd /home/user/projects/agent_setup/codex_agent/omx_evaluator_optimizer
codex
cd app && npm install --prefer-offline && npm run dev
```

## 이 하네스의 핵심

- writer
- reviewer
- optimizer
- 10+ review/revise loops
- 10+ validate/compare/evaluate verification cycles
- additive evidence logging
