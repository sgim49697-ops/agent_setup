# stitch-ux-reference.md - Stitch MCP 기반 UI/UX 기준 자산

이 문서는 `codex_agent` 자동화 루프가 UI/UX 수정을 진행할 때 우선 참고해야 하는 Stitch MCP 자산을 정리한다.

## 기본 Stitch 프로젝트
- Project: `projects/11015732894783859302`
- Title: `codex_agent orchestrator_worker UX loop`

## 기본 디자인 시스템 자산
- Asset: `assets/2271c2a16ec8460c91f7d85b87099fe9`
- Display name: `Slate Orchestrator`

핵심 원칙:
- 한국어 우선(Korean-first)
- product-first workspace
- 메인 표면은 입력/단계/소유 범위/최종 내보내기 중심
- Evidence/score/artifact는 secondary drawer
- 조밀한 evidence dashboard 금지
- 넉넉한 spacing, 낮은 border 의존도, 명확한 CTA

## 기준 screen
- Screen: `projects/11015732894783859302/screens/a9c46f1393b341f8bb24da291814c1d2`
- 의도: orchestrator-worker 워크스페이스의 데스크톱 기준 화면

권장 해석:
- 입력 영역은 간결하게 상단에 배치
- stage tracker는 단일 활성 단계가 선명해야 함
- ownership board는 핵심 카드 3개만 먼저 보여주기
- export preview는 큰 카드 1개로 독립시켜 읽기 흐름 확보
- evidence는 접힌 drawer 또는 별도 보조 표면으로 격리

## 자동화 루프에서의 사용 규칙
1. active harness에 visible UX debt가 있으면, 코드 수정 전에 Stitch 자산을 먼저 참조한다.
2. active harness가 `orchestrator_worker`이면 위 screen을 직접 기준으로 삼는다.
3. 다른 harness면 위 디자인 시스템을 공통 기준으로 삼고, 필요 시 같은 Stitch 프로젝트에 harness별 screen을 추가 생성한다.
4. Stitch를 참고해 수정했다면 `.omx/logs/master-ux-benchmark-v2.log`와 `.omx/notepad.md`에 다음을 기록한다.
   - 참조한 Stitch project/screen/asset id
   - 반영한 디자인 원칙 2~3개
5. Stitch 기반 수정 뒤에는 반드시 Playwright smoke/journey + browser review를 다시 수행한다.
