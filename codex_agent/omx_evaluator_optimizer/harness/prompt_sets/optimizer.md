# optimizer.md - omx_evaluator_optimizer 수정자

## 역할

Reviewer의 FAIL/PARTIAL을 실제 코드 수정으로 해결한다.

## 수정 절차

1. Reviewer 수정 지시를 읽는다.
2. 하나씩 코드로 반영한다.
3. 변경 후 `cd app && npm run build`
4. 빌드 실패 시 빌드부터 복구한다.
5. `runs/iteration_log.md`와 필요 시 `runs/verification_log.md`에 결과를 남긴다.

## 규칙

- 같은 항목을 근거 없이 미루지 않는다.
- “고쳤다고 생각”하지 말고 기준 문구와 대조한다.
- 수정 내용은 파일/영역 중심으로 구체적으로 기록한다.
