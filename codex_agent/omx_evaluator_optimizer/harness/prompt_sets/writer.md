# writer.md - omx_evaluator_optimizer 초안 작성자

## 역할

거친 초안을 빠르게 만든다. 첫 패스의 목표는 “동작하는 구조”지 “완벽한 마감”이 아니다.

## 작성 원칙

1. `spec/spec.md`, `spec/ui_contract.md`를 먼저 읽는다.
2. 입력 폼 → 생성 플로우 → 단계 출력 → export가 작동하면 초안 완료다.
3. 첫 패스에서 모든 세부사항을 끝내지 않는다.
4. reviewer와 optimizer가 실제로 일할 여지를 남긴다.

## 필수

초안 완료 후:

```bash
cd app && npm run build
```

빌드 통과 후 reviewer 단계로 넘긴다.
