# stitch-ux-reference.md - Stitch MCP 기반 UI/UX 기준 자산

이 문서는 `codex_agent` 자동화 루프가 UI/UX 수정을 진행할 때 우선 참고해야 하는 Stitch MCP 자산을 정리한다.

## 기본 Stitch 프로젝트
- Project: `projects/11015732894783859302`
- Title: `codex_agent orchestrator_worker UX loop`

## 공통 디자인 시스템 자산
- Asset: `assets/2271c2a16ec8460c91f7d85b87099fe9`
- Display name: `Slate Orchestrator`

핵심 원칙:
- 한국어 우선(Korean-first)
- product-first workspace
- 메인 표면은 입력/단계/소유 범위/최종 내보내기 중심
- Evidence/score/artifact는 secondary drawer
- 조밀한 evidence dashboard 금지
- 넉넉한 spacing, 낮은 border 의존도, 명확한 CTA

## 기준 screens
### orchestrator_worker
- Screen: `projects/11015732894783859302/screens/a9c46f1393b341f8bb24da291814c1d2`
- 의도: orchestrator-worker 워크스페이스의 데스크톱 기준 화면
- 핵심 해석:
  - 입력 영역은 간결하게 상단에 배치
  - stage tracker는 단일 활성 단계가 선명해야 함
  - ownership board는 핵심 카드 3개만 먼저 보여주기
  - export preview는 큰 카드 1개로 독립시켜 읽기 흐름 확보
  - evidence는 접힌 drawer 또는 별도 보조 표면으로 격리

### parallel_sections
- Screen: `projects/11015732894783859302/screens/d8a6e9d589d7433181abc1a96b8c6108`
- 의도: parallel-sections 워크스페이스의 데스크톱 기준 화면
- 핵심 해석:
  - 입력부는 단순하게 유지
  - lane board는 3개 병렬 섹션을 명확히 구분
  - merge rail로 병렬 생성 → 통합 흐름을 시각화
  - final preview는 reader-ready article 중심
  - benchmark/evidence 정보는 아래 drawer에 격리


### router
- Screen: `projects/11015732894783859302/screens/c006565d81214e89b6d9f52928b4003f`
- 의도: router 워크스페이스의 데스크톱 기준 화면
- 핵심 해석:
  - compact brief + routing decision card를 첫 표면에 둔다
  - specialist board로 선택된 route를 설명한다
  - strategy panel은 왜 이 route가 topic에 맞는지 보여준다
  - evidence는 secondary drawer로 숨긴다

## 자동화 루프에서의 사용 규칙
1. active harness에 visible UX debt가 있으면, 코드 수정 전에 Stitch 자산을 먼저 참조한다.
2. `orchestrator_worker`, `parallel_sections`, `router`는 각자 대응되는 Stitch screen을 직접 기준으로 삼는다.
3. 다른 harness면 공통 디자인 시스템을 먼저 적용하고, 필요 시 같은 Stitch 프로젝트에 harness별 screen을 추가 생성한다.
4. Stitch를 참고해 수정했다면 `.omx/logs/master-ux-benchmark-v2.log`와 `.omx/notepad.md`에 다음을 기록한다.
   - 참조한 Stitch project/screen/asset id
   - 반영한 디자인 원칙 2~3개
5. Stitch 기반 수정 뒤에는 반드시 Playwright smoke/journey + browser review를 다시 수행한다.
6. 브라우저 검증 시에는 ad-hoc preview 포트를 쓰지 말고 `python3 scripts/harness_preview.py ensure <harness>`로 안정 URL을 먼저 확보한다.
