# ko-copy-gate-fix-plan.md — 한국어 게이트 실패 원인 분석 및 수정 계획

## 배경

`single_agent` 하네스가 `master_loop_ui_language_gate.py`의 한국어 비율 테스트(threshold 0.70)를  
반복적으로 통과하지 못하는 문제. 로그에서 확인된 실패 ratio: `0.49 ~ 0.66`.  
원인은 **측정 자체가 틀렸다** + **교정 루프가 제때 안 돌아간다** 두 층으로 나뉜다.

---

## 1층: 게이트가 틀린 걸 측정하고 있다 (근본 원인)

### 원인 A — JSX 텍스트 노드 누락 (가장 큰 구조적 버그)

`master_loop_ui_language_gate.py`의 현재 정규식:

```python
STRING_RE = re.compile(r'(["\'\`])((?:\\.|(?!\1).)*)\1')
```

이 패턴은 따옴표(`"`, `'`, `` ` ``)로 감싸인 문자열 리터럴만 잡는다.  
React(TSX) 환경에서 실제로 사용자에게 보이는 텍스트는 대부분 JSX 태그 사이에 직접 쓰인 텍스트 노드다.

```tsx
const label = "제출"        // ← 잡힘 → 한국어 카운트 +1
<Button>제출</Button>        // ← 안 잡힘 → 카운트 0
<p>생성을 시작하세요</p>     // ← 안 잡힘 → 카운트 0
```

결과: **화면에 보이는 한국어는 대부분 카운트되지 않고**, 변수/prop 안의 따옴표 문자열만 계산된다.  
Stitch MCP가 정상적으로 한국어 UI를 생성해도 게이트는 이를 인식하지 못한다.

**수정 방향**  
`STRING_RE` 외에 JSX 텍스트 노드 패턴을 추가 스캔한다.  
패턴 예시: `>([^<>{}\n]+?)<` — 태그 사이 텍스트 추출.  
또는 tsx를 AST로 파싱(ts-morph, babel)해서 StringLiteral + JSXText를 모두 추출하는 방식으로 전환.

---

### 원인 B — 영어 prop 값이 false positive로 카운트됨

`IGNORE_CONTEXT_TOKENS`가 `className`, `import`, `href=` 등은 제외하지만 아래는 걸러내지 못한다.

```tsx
size="medium"      // → 영어 카운트 +1
variant="primary"  // → 영어 카운트 +1
type="button"      // → 영어 카운트 +1
status="idle"      // → 영어 카운트 +1
```

이 값들은 컴포넌트 제어 인자이지 visible copy가 아니다.  
이것들이 영어 카운트에 쌓이면 분모가 부풀어 `korean_ratio`가 내려간다.

**수정 방향**  
`IGNORE_CONTEXT_TOKENS`에 `size=`, `variant=`, `type=`, `status=`, `color=`, `console.` 추가.  
또는 더 근본적으로: **공백이 없는 단어 하나짜리 문자열**은 visible copy가 아니라고 보고 제외.  
실제 UI 텍스트는 거의 항상 두 단어 이상이거나 한국어가 포함된다.

---

### 원인 C — 스캔 파일이 3개로 고정됨

```python
def should_scan_file(path: Path) -> bool:
    return path.name in {'App.tsx', 'starterData.ts', 'generator.ts'}
```

디자이너가 `components/Wizard.tsx`, `components/StepPanel.tsx` 등 새 파일을 만들면  
게이트에서 완전히 안 보인다. 통과는 되지만 실제 화면엔 영어가 있는 구조.

**수정 방향**  
파일 이름 화이트리스트 방식을 폐기하고 `harness/app/src/**/*.tsx` 전체를 스캔.  
단, 테스트 파일(`*.test.tsx`, `*.spec.tsx`)은 제외.

---

## 2층: 교정 루프가 제때 안 돌아간다

### 원인 D — critic reject → ko-copy 완전 스킵

`master_loop_orchestrator.py`의 흐름:

```python
if design_rc == 0 and approved:   # critic이 reject하면 이 블록 전체 스킵
    ko_rc = step_ko_copy(...)
```

critic이 CSS 누락, 빌드 오류 등으로 reject를 연속으로 내면  
ko-copy는 **한 번도 실행되지 않은 채** 사이클이 끝난다.  
다음 사이클도 영어 copy 상태 그대로 시작 → 같은 실패 반복.

로그에서 확인된 streak: `quality-gate failure streak=14 for single_agent`  
이 기간 동안 ko-copy-fix가 실행된 기록 없음.

**수정 방향**  
ko-copy를 critic approve 여부와 무관하게 design 단계 직후 독립적으로 실행.  
또는 최소한 "디자인 성공 + critic reject" 케이스에서도 ko-copy가 돌도록 조건을 분리.

```
현재: design → critic → (approve만) → ko-copy → verify
변경: design → ko-copy → critic → (approve만) → verify
```

---

### 원인 E — Stitch/AI가 영어 플레이스홀더를 섞어 넣음

Stitch 또는 내부 AI 모델이 생성한 코드에 아래 패턴이 그대로 포함된다.

```
"Submit", "Cancel", "Loading...", "Next", "Back",
"Lorem ipsum", "Placeholder", "Enter text here"
```

`single_agent`는 이걸 검토 없이 그대로 쓰는 경향이 있다.  
로그에서 확인된 offenders: `"Flow clarity"`, `"Depth balance"`, `"Editorial polish"` (generator.ts)  
`"Start with a topic, then move through the single-agent wizard one focused step at a time."` (starterData.ts)

**수정 방향**  
`build_ko_copy_fix_prompt`에 **"Stitch 생성 코드에서 흔히 섞여 들어오는 영어 패턴"** hunt list를 명시.

```
찾아서 한국어로 바꿀 패턴 (우선순위 높음):
Submit, Cancel, Loading, Next, Back, Skip, Done, Save,
Continue, Finish, Placeholder, Enter text, Lorem ipsum,
Flow clarity, Depth balance, Editorial polish
```

---

### 원인 F — single_agent 에이전트 자체에 Korean-first 지침 없음

`build_design_prompt`는 `{harness}` 인자로 단순 치환되며,  
`single_agent`에 특화된 한국어 관련 추가 지침이 없다.

다른 하네스(orchestrator_worker, router 등)는 복잡한 구조 덕분에  
여러 에이전트를 거치면서 한국어가 자연스럽게 올라가지만,  
`single_agent`는 첫 번째 출력이 그대로 남아서 잔류 영어가 수정될 기회가 없다.

또한 `single_agent/` 디렉토리 내 `AGENTS.md`, `SOUL.md` 등에  
Korean-first 원칙이나 70% 비율 달성 지침이 명시되어 있지 않다.

**수정 방향**  
`build_design_prompt`에서 `harness == "single_agent"`일 때 추가 경고문 삽입:

```
이 하네스는 단일 파일 구조라 ko-copy 게이트에 특히 민감하다.
JSX 태그 사이 텍스트 노드를 포함한 모든 visible copy를 한국어로 작성하라.
따옴표 문자열뿐 아니라 <p>, <span>, <button>, <label> 등 태그 사이에 직접 쓰는
텍스트도 모두 한국어 우선으로 작성해야 korean_ratio >= 0.70을 통과할 수 있다.
```

---

## 우선순위 요약

| 순위 | 대상 파일 | 픽스 내용 | 기대 효과 | 난이도 |
|------|-----------|-----------|-----------|--------|
| 1 | `master_loop_ui_language_gate.py` | JSX 텍스트 노드 스캔 추가 | 게이트 측정 자체를 정상화 | 중간 |
| 2 | `master_loop_ui_language_gate.py` | prop 값 false positive 제거 (`size=`, `variant=` 등) | 영어 카운트 노이즈 제거 | 쉬움 |
| 3 | `master_loop_orchestrator.py` | ko-copy를 critic approve와 분리, design 직후 실행 | 교정 루프 보장 | 쉬움 |
| 4 | `master_loop_ui_language_gate.py` | 스캔 파일 범위를 `src/**/*.tsx` 전체로 확장 | 숨겨진 영어 탐지 | 쉬움 |
| 5 | `master_loop_orchestrator.py` | `ko-copy-fix` 프롬프트에 English hunt list 추가 | AI 생성 플레이스홀더 제거 | 쉬움 |
| 6 | `master_loop_orchestrator.py` | `single_agent` 전용 Korean-first 강조 지침 삽입 | 사전 예방 | 쉬움 |

**1번 + 2번**만 고쳐도 게이트 측정이 정상화되어,  
"한국어인데 실패"와 "통과는 됐는데 실제로 영어 투성이" 두 가지 역설이 동시에 해소된다.

---

## 참고: 주요 관련 파일

| 파일 | 역할 |
|------|------|
| `scripts/master_loop_ui_language_gate.py` | ko-copy 게이트 본체 (측정 로직) |
| `scripts/master_loop_orchestrator.py` | 파이프라인 오케스트레이터 (ko-copy 실행 순서) |
| `single_agent/app/src/App.tsx` | 스캔 대상 메인 파일 |
| `single_agent/app/src/generator.ts` | 스캔 대상 (과거 offender 발생지) |
| `single_agent/app/src/starterData.ts` | 스캔 대상 (placeholder 영어 발생지) |
| `.omx/state/master-loop-ui-language.json` | 마지막 게이트 실행 결과 리포트 |
