# stitch-ux-reference.md — Stitch MCP + 웹 레퍼런스 기반 디자인 권한 문서

디자이너는 코드를 작성하기 전에 반드시 이 문서의 두 단계를 완료해야 한다.
Stitch는 토큰/컴포넌트 공급원이고, 웹 리서치는 창의적 방향의 공급원이다.

---

## 0. 웹 레퍼런스 리서치 (항상 먼저)

디자인 결정을 내리기 전에 실제 제품 UI를 탐색한다.

**참고할 제품 카테고리:**
- 기술 글쓰기/에디터 툴: Notion, Craft, Obsidian Publish, Ghost editor
- SaaS 온보딩/wizard: Linear, Vercel deploy flow, Railway dashboard
- 크리에이터/퍼블리싱: Loom, Substack, Hashnode, Typefully
- 진행 표시/파이프라인: GitHub Actions 로그뷰, Retool, Temporal

**반드시 캡처해야 할 인터랙션 패턴:**
- 화면 전환 방식 (slide, fade, morph, shared-element)
- 버튼 클릭 피드백 (scale, ripple, color fill)
- 로딩 상태 (skeleton shimmer, 단계별 reveal, progress pulse)
- 완료 애니메이션 (체크마크 그리기, 색상 채움, 미묘한 bounce)
- 에러 상태 (shake, red glow, inline message animation)

designer-notes.md에 최소 3개의 레퍼런스 + 추출한 패턴을 기록한다.

---

## 1. Stitch 프로젝트

- Project: `projects/11015732894783859302`
- Title: `codex_agent orchestrator_worker UX loop`

**Stitch 탐색 순서:**
1. `get_design_system` 또는 `list_components`로 전체 토큰/컴포넌트 목록 확인
2. 아래 키워드로 검색: `wizard` `multi-step` `stepper` `pipeline` `onboarding`
   `article` `editor` `publish` `transition` `animation` `motion`
3. Color token, typography scale, spacing, motion/easing token 추출
4. 화면 전환 패턴이 있으면 직접 가져와 구현에 반영

---

## 2. 토큰 사용 원칙

Stitch에서 가져온 토큰은 CSS 변수로 매핑해서 사용한다.

```css
/* 예시 — Stitch 토큰 → CSS variable */
:root {
  --bg:          <stitch.color.background>;
  --surface:     <stitch.color.surface>;
  --border:      <stitch.color.border>;
  --text:        <stitch.color.text.primary>;
  --accent:      <stitch.color.accent>;
  --accent-muted:<stitch.color.accent.muted>;

  --font-heading: <stitch.typography.heading.family>;
  --font-body:    <stitch.typography.body.family>;

  --duration-micro:   150ms;
  --duration-screen:  350ms;
  --ease-out:         cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in-out:      cubic-bezier(0.4, 0.0, 0.2, 1);
}
```

Tailwind 유틸리티 클래스로 색상을 직접 지정하지 않는다. 항상 변수를 통해서.

---

## 3. 기존 등록 화면 (참고용, 제약이 아님)

### orchestrator_worker
- Screen: `projects/11015732894783859302/screens/a9c46f1393b341f8bb24da291814c1d2`
- 요약: 입력 상단, stage tracker 단일 활성, ownership board 3 카드, evidence drawer 격리

### parallel_sections
- Screen: `projects/11015732894783859302/screens/d8a6e9d589d7433181abc1a96b8c6108`
- 요약: 3 lane board, merge rail 시각화, evidence drawer 격리

### router
- Screen: `projects/11015732894783859302/screens/c006565d81214e89b6d9f52928b4003f`
- 요약: routing decision card, specialist board, evidence drawer 격리

아래 harness는 Stitch 전용 화면 없음 — 웹 리서치 + 공통 token으로 결정:
`single_agent` `sequential_pipeline` `evaluator_optimizer` `omx_evaluator_optimizer`

---

## 4. 화면 흐름 원칙

**기본 구조 (모든 harness):**
```
Screen 1 — 입력: 파라미터 설정 → [생성 시작] → slide-left 전환
Screen 2 — 진행: 단계별 reveal, 각 단계 완료 시 애니메이션 → [완료] → fade 전환
Screen 3 — 결과: final post + export CTA
```

- 각 화면에 primary CTA 1개
- 파이프라인 산출물은 화면 간 분리 또는 progressive reveal
- 모든 전환에 CSS transition 또는 animation 적용 (instant snap 금지)
- Stitch에서 더 나은 패턴 발견 시 위 구조보다 우선

---

## 5. 자동화 루프 규칙

1. 코드 수정 전 웹 리서치(3개 레퍼런스) + Stitch 탐색 완료
2. designer-notes.md에 레퍼런스, Stitch 결과, 인터랙션 인벤토리 기록
3. Stitch 토큰을 코드에 직접 반영
4. 수정 후 Playwright smoke/journey + browser review 재수행
5. 브라우저 검증 시 `python3 scripts/harness_preview.py ensure <harness>` 사용
