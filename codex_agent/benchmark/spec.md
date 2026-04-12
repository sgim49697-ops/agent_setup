# spec.md - 기술 블로그 포스트 자동 생성기 공통 제품 스펙

## 제품 목표

사용자가 기술 주제를 입력하면, 구조화된 리서치와 작성 단계를 거쳐 읽기 좋은 기술 블로그 초안을 만드는 브라우저 기반 도구를 구현한다.

이 사이트는 `Codex` 하네스 비교를 위한 공통 과제로 사용된다. 기능만 맞추는 것이 아니라, 흐름의 명확성, 상태 표현, UI 완성도까지 함께 평가 대상이다.

## 입력 계약

모든 구현은 아래 입력 필드를 지원해야 한다.

- `topic`: 작성할 기술 주제
- `audience`: 대상 독자 수준
- `tone`: 문체 톤
- `length`: 글 분량

권장 예시:

- audience: `beginner`, `practitioner`, `advanced`
- tone: `clear`, `pragmatic`, `opinionated`
- length: `short`, `medium`, `long`

## 필수 단계

1. 주제 입력
2. 리서치 결과 생성/표시
3. 아웃라인 생성
4. 섹션별 초안 작성
5. 리뷰/수정
6. 최종 포스트 출력 및 export

## 단계별 산출물

- `research_summary`
- `outline`
- `section_drafts`
- `review_notes`
- `final_post`

## 필수 제품 요구사항

- 단계 전환이 시각적으로 명확해야 한다.
- 현재 단계, 다음 단계, 완료 상태를 사용자가 바로 이해할 수 있어야 한다.
- 결과물은 최소 `Markdown`으로 볼 수 있어야 한다.
- 가능하면 `copy to clipboard`를 제공한다.
- 모바일과 데스크톱에서 모두 usable 해야 한다.
- loading, empty, error 상태를 반드시 가진다.
- 키보드 접근성과 기본 `aria` 레이블을 갖춘다.

## 비목표

- 별도 백엔드/API 서버 구축
- 사용자 인증
- 저장/공유/배포 기능
- 실제 퍼블리싱 CMS 연동

v1은 프론트엔드 중심 데모 사이트로 본다. 상태 관리는 로컬 상태 또는 mock 데이터로 충분하다.

## UX Benchmark v2 Overlay (additive)

이 섹션은 기존 v1 계약을 지우지 않고, **사용자 여정 중심 UX 품질 실험**을 위한 v2 overlay를 추가한다.

### 왜 v2가 필요한가

기존 v1 구현은 필수 산출물과 상태를 한 화면에 모두 노출하는 방향으로 수렴하기 쉽다. 그 결과:

- 사용자는 어디서 시작해야 하는지 이해하기 어렵고
- 하네스 evidence와 product UI가 한 화면에 섞이며
- 하네스별 내부 구조 차이가 최종 UX 차이로 충분히 드러나지 않는다

v2의 목적은 이를 해결해 **“증거판”이 아니라 “제품 여정”** 을 만들도록 유도하는 것이다.

### v2 핵심 원칙

1. **Product UI와 Evidence UI를 분리한다**
   - 사용자의 기본 흐름 화면에는 현재 단계와 다음 행동 중심 정보만 둔다.
   - 평가/추적/scorecard/run artifact는 별도 탭, drawer, collapsed section, debug route에 둘 수 있다.

2. **Progressive disclosure를 권장한다**
   - `research_summary`, `outline`, `section_drafts`, `review_notes`, `final_post`는 모두 존재해야 한다.
   - 그러나 한 화면에 동시에 전부 펼쳐 둘 필요는 없다.
   - stepper, wizard, multi-route, tabbed progression 모두 허용한다.

3. **사용자는 항상 “지금 뭘 하고 있는지 / 다음에 뭘 해야 하는지”를 이해해야 한다**
   - 각 단계에는 명확한 primary action이 있어야 한다.
   - 다음 단계로 넘어가는 기준과 상태가 분명해야 한다.

4. **하네스별 차이는 결과 화면의 구조에서도 느껴져야 한다**
   - 내부 오케스트레이션이 다르면 최종 interaction model도 달라져야 한다.

5. **출력 언어는 한국어 우선이다**
   - 기본 사용자 화면의 설명, 상태 메시지, review copy, final output은 가능한 한 **한국어 우선**으로 구성한다.
   - 기술 용어는 필요할 때만 영어를 병기한다.
   - 영어는 test compatibility를 위한 programmatic label이나 보조 metadata에만 최소한으로 남기는 것이 바람직하다.

### v2에서 기대하는 기본 여정

권장 여정은 아래와 같다.

1. Brief / Input
2. Research
3. Outline
4. Draft
5. Review
6. Final / Export

각 하네스는 이 여정을 다른 메타포로 풀 수 있지만, 사용자는 현재 위치와 다음 행동을 잃지 않아야 한다.

### v2 비목표

- 무조건 route를 많이 쓰게 하기
- 과도한 animation이나 gimmick 추가
- evidence를 감추어 비교 자체를 어렵게 만들기

v2의 목표는 **화려함이 아니라 이해 가능성과 구조적 차별성**이다.
