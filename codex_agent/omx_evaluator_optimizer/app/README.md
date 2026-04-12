# omx_evaluator_optimizer app

이 앱은 `omx_evaluator_optimizer` 워크스페이스의 실제 프론트엔드 구현입니다. 공통 벤치마크 계약은 유지하되, 10회 루프와 10회 이상 verification cycle을 런타임 UI에 드러내는 것이 차별점입니다.

## 개발 명령

```bash
npm install --prefer-offline
npm run dev
npm run build
```

## 현재 상태 목표

- 공통 benchmark contract 준수
- 10 visible loops
- repeated validate / compare / evaluate evidence
- export-ready final post after the harsh gate clears
