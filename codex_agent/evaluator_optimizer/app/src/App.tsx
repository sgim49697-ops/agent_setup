import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStatus,
  IterationPhase,
  IterationRecord,
  Length,
  Tone,
} from './contracts'
import { generatePipelineOutputs, isForcedErrorTopic } from './generator'
import { deliverables, evaluationTargets, topicPresets, workflowStages } from './starterData'

type ReaderSurface = 'research' | 'outline' | 'drafts' | 'review'

interface AppState {
  inputs: BlogGeneratorInputs
  status: GenerationStatus
  statusMessage: string
  copyFeedback: string
  outputs: ReturnType<typeof generatePipelineOutputs> | null
  revealedIterations: number
  selectedIteration: number
  isGenerating: boolean
  errorMessage: string | null
}

type Action =
  | {
      type: 'update_field'
      field: keyof BlogGeneratorInputs
      value: BlogGeneratorInputs[keyof BlogGeneratorInputs]
    }
  | { type: 'apply_preset'; preset: BlogGeneratorInputs }
  | { type: 'start_generation'; outputs: ReturnType<typeof generatePipelineOutputs> }
  | {
      type: 'reveal_iteration'
      count: number
      selectedIteration: number
      status: GenerationStatus
      statusMessage: string
    }
  | { type: 'finish_generation'; statusMessage: string }
  | { type: 'generation_error'; message: string }
  | { type: 'select_iteration'; iteration: number }
  | { type: 'set_copy_feedback'; feedback: string }

const audienceCopy: Record<Audience, string> = {
  beginner: '입문자',
  practitioner: '실무자',
  advanced: '고급 사용자',
}

const toneCopy: Record<Tone, string> = {
  clear: '명료하게',
  pragmatic: '실무적으로',
  opinionated: '단호하게',
}

const lengthCopy: Record<Length, string> = {
  short: '짧게',
  medium: '균형 있게',
  long: '깊게',
}

const phaseCopy: Record<IterationPhase, string> = {
  writer: '초안 작성',
  reviewer: '리뷰 중',
  optimizer: '수정 적용',
  ready: '승인 완료',
}

const statusBadgeCopy: Record<GenerationStatus, string> = {
  initial: '대기',
  loading: '재생 중',
  populated: '검토 중',
  'review-complete': '리뷰 완료',
  'export-ready': '내보내기 가능',
  error: '복구 필요',
}

const verdictCopy = {
  PASS: '통과',
  PARTIAL: '보류',
  FAIL: '실패',
} as const

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialState: AppState = {
  inputs: initialInputs,
  status: 'initial',
  statusMessage: '초안 대기 중입니다. 브리프를 확인한 뒤 생성 버튼으로 첫 루프를 시작하세요.',
  copyFeedback: '',
  outputs: null,
  revealedIterations: 0,
  selectedIteration: 0,
  isGenerating: false,
  errorMessage: null,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'update_field':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [action.field]: action.value,
        },
        copyFeedback: '',
        errorMessage: null,
      }
    case 'apply_preset':
      return {
        ...state,
        inputs: action.preset,
        statusMessage: '프리셋을 불러왔습니다. 다음 생성 실행에서 평가 루프가 이 브리프를 다시 재생합니다.',
        copyFeedback: '',
        errorMessage: null,
      }
    case 'start_generation':
      return {
        ...state,
        outputs: action.outputs,
        revealedIterations: 0,
        selectedIteration: 0,
        status: 'loading',
        statusMessage: '초안 작성자가 거친 후보안을 만들고 있습니다. 리뷰어와 수정자가 곧 순차적으로 따라붙습니다.',
        isGenerating: true,
        copyFeedback: '',
        errorMessage: null,
      }
    case 'reveal_iteration':
      return {
        ...state,
        revealedIterations: action.count,
        selectedIteration: action.selectedIteration,
        status: action.status,
        statusMessage: action.statusMessage,
      }
    case 'finish_generation':
      return {
        ...state,
        status: 'export-ready',
        statusMessage: action.statusMessage,
        isGenerating: false,
      }
    case 'generation_error':
      return {
        ...state,
        status: 'error',
        statusMessage: `복구가 필요합니다. ${action.message}`,
        copyFeedback: '',
        outputs: null,
        revealedIterations: 0,
        selectedIteration: 0,
        isGenerating: false,
        errorMessage: action.message,
      }
    case 'select_iteration':
      return {
        ...state,
        selectedIteration: action.iteration,
        copyFeedback: '',
      }
    case 'set_copy_feedback':
      return {
        ...state,
        copyFeedback: action.feedback,
        statusMessage: action.feedback,
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function stageState(
  index: number,
  status: GenerationStatus,
  revealedIterations: number,
): 'waiting' | 'active' | 'complete' {
  if (status === 'error') {
    return index === 0 ? 'active' : 'waiting'
  }

  if (status === 'initial') {
    return index === 0 ? 'active' : 'waiting'
  }

  if (revealedIterations === 0 || status === 'loading') {
    return index === 0 ? 'active' : 'waiting'
  }

  if (index < 4) {
    return 'complete'
  }

  return status === 'export-ready' ? 'complete' : 'active'
}

function formatCounts(record: IterationRecord | null) {
  if (!record) {
    return '대기 중'
  }

  return `통과 ${record.passCount} · 보류 ${record.partialCount} · 실패 ${record.failCount}`
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [readerSurface, setReaderSurface] = useState<ReaderSurface>('research')
  const runTokenRef = useRef(0)
  const readerTabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    return () => {
      runTokenRef.current += 1
    }
  }, [])

  const visibleIterations = state.outputs?.iterations.slice(0, state.revealedIterations) ?? []
  const latestVisibleIteration = visibleIterations[visibleIterations.length - 1] ?? null
  const selectedIteration =
    visibleIterations.find((record) => record.iteration === state.selectedIteration) ??
    latestVisibleIteration
  const finalArticle =
    state.outputs && state.revealedIterations >= 3 ? state.outputs.final_article : null
  const hasLoopStarted = state.status !== 'initial'
  const repairRows = selectedIteration?.verdictRows.filter((row) => row.verdict !== 'PASS') ?? []
  const loopStatus =
    state.status === 'initial'
      ? '아직 첫 초안이 시작되지 않았습니다.'
      : state.status === 'loading'
        ? '작성자, 리뷰어, 수정자가 순서대로 루프를 재생하는 중입니다.'
        : state.status === 'error'
          ? '토픽 검수에서 멈췄습니다. 브리프를 손본 뒤 다시 생성해야 합니다.'
          : state.status === 'export-ready'
            ? `3차 반복이 완료되어 ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과했습니다.`
            : `${selectedIteration?.iteration ?? 0}차 루프가 현재 화면에 열려 있습니다.`
  const currentGateTitle =
    state.status === 'initial'
      ? '브리프 정렬'
      : state.status === 'loading' && state.revealedIterations === 0
        ? '1차 초안 생성'
        : state.status === 'loading'
          ? `${Math.min(state.revealedIterations + 1, 3)}차 리뷰 게이트`
          : state.status === 'error'
            ? '브리프 복구'
            : state.status === 'export-ready'
              ? '출시 승인'
              : `${state.revealedIterations}차 루프 고정`
  const currentGateBody =
    state.status === 'initial'
      ? '브리프를 좁혀 첫 초안을 열기 전, 주제와 독자 방향을 맞추는 단계입니다.'
      : state.status === 'loading' && state.revealedIterations === 0
        ? '작성자가 1차 초안을 세우는 중이라 아직 리뷰 이력 레일이 열리지 않았습니다.'
        : state.status === 'loading'
          ? `${Math.min(state.revealedIterations + 1, 3)}차 리뷰 게이트에서 남은 막힘 항목을 순서대로 닫는 중입니다.`
          : state.status === 'error'
            ? '토픽 분류에서 루프가 멈췄습니다. 브리프를 정리한 뒤 다시 실행해 복구해야 합니다.'
            : state.status === 'export-ready'
              ? '승인 게이트가 닫혀 이제는 수정보다 최종 검토와 복사 판단이 중심입니다.'
              : `${selectedIteration?.iteration ?? state.revealedIterations}차 반복의 막힘 항목과 수정 응답을 대조하는 구간입니다.`
  const nextActionTitle =
    state.status === 'initial'
      ? '첫 루프 시작'
      : state.status === 'loading'
        ? '루프 재생 대기'
        : state.status === 'error'
          ? '토픽 수정 후 재실행'
          : state.status === 'export-ready'
            ? '원고 검토 또는 복사'
            : `${selectedIteration?.iteration ?? state.revealedIterations}차 확인`
  const nextActionBody =
    state.status === 'initial'
      ? '브리프를 확인한 뒤 생성 버튼을 눌러 작성자-리뷰어-수정자 루프를 시작하세요.'
      : state.status === 'loading'
        ? '지금은 리뷰어와 수정자가 같은 브리프를 이어받아 수정을 쌓는 중입니다.'
        : state.status === 'error'
          ? '주제 앞의 강제 실패 접두어를 제거하고 다시 생성해 복구하세요.'
        : state.status === 'export-ready'
            ? '승인 게이트가 열렸으니 이제는 수리보다 내보내기와 최종 검토가 중심입니다.'
            : '보이는 루프를 선택하고 막힘 항목을 읽은 뒤, 수정 응답이 충분한지 확인하세요.'
  const remainingLoops = Math.max(3 - state.revealedIterations, 0)
  const exportLockTitle =
    finalArticle || state.status === 'export-ready'
      ? '내보내기 열림'
      : `${remainingLoops}회 남음`
  const exportLockBody =
    finalArticle || state.status === 'export-ready'
      ? `3차 반복이 ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과해 복사 경로를 열었습니다.`
      : '3차 반복이 승인 게이트를 닫기 전까지는 내보내기가 잠긴 상태로 유지됩니다.'
  const gateCards = [
    {
      id: 'current',
      label: '현재 게이트',
      title: currentGateTitle,
      body: currentGateBody,
      note: loopStatus,
    },
    {
      id: 'action',
      label: '다음 행동',
      title: nextActionTitle,
      body: nextActionBody,
      note: state.isGenerating
        ? '작성자, 리뷰어, 수정자가 같은 브리프를 이어받아 순차적으로 재생합니다.'
        : '루프를 열기 전까지는 브리프와 첫 행동만 남겨 첫 화면 밀도를 낮춥니다.',
    },
  ] as const
  const readerTabs = [
    { id: 'research', label: '연구 결과' },
    { id: 'outline', label: '개요' },
    { id: 'drafts', label: '섹션 초안' },
    { id: 'review', label: '리뷰 메모' },
  ] as const
  const loopPreview = [
    { step: '1차', label: '초안 세움' },
    { step: '2차', label: '수정 압축' },
    { step: '3차', label: '승인 잠금' },
  ] as const
  const heroSignals = [
    {
      label: '승인 잠금',
      value: exportLockTitle,
      note: finalArticle ? '3차 승인본에서만 복사가 열립니다.' : '승인 전에는 복사 경로가 잠겨 있습니다.',
    },
    {
      label: '집중 루프',
      value: selectedIteration ? `${selectedIteration.iteration}차 반복` : '첫 루프 대기',
      note: selectedIteration ? formatCounts(selectedIteration) : '브리프를 맞춘 뒤 첫 초안을 엽니다.',
    },
    {
      label: '바로 다음',
      value: nextActionTitle,
      note: state.isGenerating ? '작성자, 리뷰어, 수정자가 같은 브리프를 이어받는 중입니다.' : nextActionBody,
    },
  ] as const

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({ type: 'update_field', field, value })
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({
      type: 'apply_preset',
      preset: {
        topic: title,
        audience,
        tone,
        length,
      },
    })
  }

  function focusReaderTab(index: number) {
    const safeIndex = (index + readerTabs.length) % readerTabs.length
    const nextTab = readerTabs[safeIndex]
    setReaderSurface(nextTab.id)
    readerTabRefs.current[safeIndex]?.focus()
  }

  function handleReaderTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusReaderTab(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusReaderTab(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusReaderTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusReaderTab(readerTabs.length - 1)
    }
  }

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken
    setReaderSurface('research')

    if (isForcedErrorTopic(topic)) {
      dispatch({
        type: 'generation_error',
        message:
          '토픽 분류 단계에서 리뷰어가 이 브리프를 막았습니다. 강제 실패 접두어를 지우고 다시 실행하세요.',
      })
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    dispatch({ type: 'start_generation', outputs })

    await sleep(500)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'reveal_iteration',
      count: 1,
      selectedIteration: 1,
      status: 'populated',
      statusMessage:
        '1차 반복 기록 완료. 통과 0 · 보류 3 · 실패 6 상태로 초안 기준선을 다시 쓰는 중입니다.',
    })

    await sleep(650)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'reveal_iteration',
      count: 2,
      selectedIteration: 2,
      status: 'populated',
      statusMessage:
        '2차 반복에서 큰 막힘 항목을 대부분 회수했습니다. 지금은 통과 6 · 보류 3 상태입니다.',
    })

    await sleep(650)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'reveal_iteration',
      count: 3,
      selectedIteration: 3,
      status: 'review-complete',
      statusMessage: '3차 반복이 모든 리뷰 게이트를 닫았고, 승인 후보안을 최종 승인안으로 올렸습니다.',
    })

    await sleep(280)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'finish_generation',
      statusMessage: `승인 게이트 완료. 3차 반복이 ${outputs.loop_summary.lastIterationPassCount}/9 체크리스트를 통과했습니다.`,
    })
  }

  async function handleCopyMarkdown() {
    if (!finalArticle || state.status !== 'export-ready') {
      dispatch({
        type: 'set_copy_feedback',
        feedback: '아직 3차 반복이 끝나지 않아 복사를 열 수 없습니다. 승인 게이트가 닫힌 뒤에만 복사 버튼이 열립니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalArticle.markdown)
      dispatch({
        type: 'set_copy_feedback',
        feedback: '최종 마크다운을 복사했습니다. 현재 내보내기는 3차 승인안에만 고정됩니다.',
      })
    } catch {
      dispatch({
        type: 'set_copy_feedback',
        feedback: '브라우저 문맥에서 복사가 실패했습니다. 아래 승인 원고에서 마크다운 내용을 직접 확인할 수 있습니다.',
      })
    }
  }

  return (
    <main className="loop-shell">
      <section className="hero-grid">
        <article className="hero-card">
          <p className="eyebrow">수정 이력 워크스페이스</p>
          <h1>기술 블로그 초안 생성과 승인 루프</h1>
          <p className="hero-lead">
            이번 화면은 길게 펼친 리포트 대신 지금 닫아야 할 게이트를 먼저 보여 줍니다.
            승인 근거와 평가 표는 뒤쪽 레이어로 밀어, 사용자가 현재 루프와 다음 행동만 빠르게
            붙잡게 만듭니다.
          </p>
          <div className="hero-status-line">
            <span>현재 루프 상태</span>
            <strong>{loopStatus}</strong>
          </div>
          {hasLoopStarted ? (
            <div className="hero-kpis" aria-label="핵심 신호대">
              {heroSignals.map((signal) => (
                <article key={signal.label} className="metric-chip hero-signal">
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.note}</small>
                </article>
              ))}
            </div>
          ) : null}
          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              aria-label="Generate post"
              data-testid="generate-post-button"
              onClick={handleGenerate}
              disabled={state.isGenerating}
            >
              {state.isGenerating ? '루프 재생 중...' : '초안 생성 시작'}
            </button>
            <button
              type="button"
              className="secondary-button"
              aria-label="Copy markdown"
              data-testid="copy-markdown-button"
              onClick={handleCopyMarkdown}
              disabled={state.status !== 'export-ready'}
            >
              승인 원고 복사
            </button>
          </div>
          <div className={`status-banner is-${state.status}`} aria-live="polite">
            <strong>{statusBadgeCopy[state.status]}</strong>
            <span>{nextActionBody}</span>
          </div>
        </article>

        <aside className="input-card">
          <div className="section-head">
            <p className="panel-label">브리프 입력</p>
            <h2>이번 승인본의 브리프</h2>
            <p>
              첫 화면에서는 방향만 확인하고, 세부 조정은 접힌 입력 레이어 안에서만 엽니다.
            </p>
          </div>
          <details className="brief-drawer">
            <summary>
              <div>
                <p className="panel-label">현재 브리프</p>
                <h3>{state.inputs.topic}</h3>
              </div>
              <div className="brief-pills">
                <span className="meta-pill">독자 {audienceCopy[state.inputs.audience]}</span>
                <span className="meta-pill">톤 {toneCopy[state.inputs.tone]}</span>
                <span className="meta-pill">분량 {lengthCopy[state.inputs.length]}</span>
              </div>
            </summary>
            <form className="input-grid" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="topic">
                <span>주제</span>
                <textarea
                  id="topic"
                  name="topic"
                  aria-label="Topic"
                  rows={4}
                  value={state.inputs.topic}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('topic', event.target.value)}
                />
              </label>
              <label htmlFor="audience">
                <span>독자 수준</span>
                <select
                  id="audience"
                  name="audience"
                  aria-label="Audience"
                  value={state.inputs.audience}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('audience', event.target.value as Audience)}
                >
                  <option value="beginner">입문자</option>
                  <option value="practitioner">실무자</option>
                  <option value="advanced">고급 사용자</option>
                </select>
              </label>
              <label htmlFor="tone">
                <span>문체 톤</span>
                <select
                  id="tone"
                  name="tone"
                  aria-label="Tone"
                  value={state.inputs.tone}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('tone', event.target.value as Tone)}
                >
                  <option value="clear">명료하게</option>
                  <option value="pragmatic">실무적으로</option>
                  <option value="opinionated">단호하게</option>
                </select>
              </label>
              <label htmlFor="length">
                <span>글 분량</span>
                <select
                  id="length"
                  name="length"
                  aria-label="Length"
                  value={state.inputs.length}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('length', event.target.value as Length)}
                >
                  <option value="short">짧게</option>
                  <option value="medium">균형 있게</option>
                  <option value="long">깊게</option>
                </select>
              </label>
            </form>
          </details>
          <p className="copy-feedback" aria-live="polite">
            {state.copyFeedback ||
              (hasLoopStarted
                ? '복사 가능 여부와 승인 잠금 변화는 이 레일에서 바로 알려줍니다.'
                : '브리프를 확인한 뒤 첫 루프를 시작하세요.')}
          </p>
        </aside>
      </section>

      {hasLoopStarted ? (
        <>
          <section className="gate-grid" aria-label="현재 진행 신호">
            {gateCards.map((card) => (
              <article key={card.id} className={`panel gate-card is-${card.id}`}>
                <p className="panel-label">{card.label}</p>
                <strong>{card.title}</strong>
                <p>{card.body}</p>
                <span className="gate-note">{card.note}</span>
              </article>
            ))}
          </section>

          <div className="gate-inline-note" aria-live="polite">
            <span className="meta-pill">내보내기 잠금</span>
            <strong>{exportLockTitle}</strong>
            <p>{exportLockBody}</p>
          </div>

          <section className="loop-preview-strip" aria-label="반복 구조 미리보기">
            {loopPreview.map((item, index) => {
              const previewState =
                state.status === 'export-ready'
                  ? 'is-complete'
                  : index < state.revealedIterations
                    ? 'is-complete'
                    : index === Math.min(state.revealedIterations, loopPreview.length - 1)
                      ? 'is-active'
                      : 'is-waiting'

              return (
                <article key={item.step} className={`loop-preview-card ${previewState}`}>
                  <span>{item.step}</span>
                  <strong>{item.label}</strong>
                </article>
              )
            })}
          </section>
        </>
      ) : null}

      {hasLoopStarted ? (
        <section className="supporting-grid">
          <details className="panel supporting-panel">
            <summary>
              <div>
                <p className="panel-label">프리셋 브리프</p>
                <h2>되돌려 쓰는 브리프 묶음</h2>
                <p>첫 루프가 열린 뒤에는 보조 레이어에서만 다시 꺼내 봅니다.</p>
              </div>
              <span>4개 프리셋</span>
            </summary>
            <div className="preset-strip" aria-label="Benchmark topics">
              {topicPresets.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className="preset-chip"
                  onClick={() =>
                    applyPreset(preset.title, preset.audience, preset.tone, preset.length)
                  }
                >
                  <strong>{preset.title}</strong>
                  <span>{preset.rationale}</span>
                </button>
              ))}
            </div>
          </details>

          <details className="panel supporting-panel">
            <summary>
              <div>
                <p className="panel-label">단계 계약</p>
                <h2>승인에 도달하는 단계</h2>
                <p>{workflowStages.map((stage) => stage.label).join(' · ')}</p>
              </div>
              <span>필수 5단계</span>
            </summary>
            <div className="workflow-strip" aria-label="Required stages">
              {workflowStages.map((stage, index) => {
                const stateClass = stageState(index, state.status, state.revealedIterations)
                return (
                  <article key={stage.id} className={`workflow-card is-${stateClass}`}>
                    <p className="workflow-step">0{index + 1}</p>
                    <h3>{stage.label}</h3>
                    <p>{stage.description}</p>
                  </article>
                )
              })}
            </div>
          </details>
        </section>
      ) : null}

      {hasLoopStarted ? (
        <>
          <section className="workbench-grid">
            <article className="panel workbench-panel">
              <div className="section-head">
                <p className="panel-label">현재 루프</p>
                <h2>반복 이력</h2>
                <p>
                  이 영역은 보고서가 아니라 지금 닫아야 할 반복을 고르는 용도입니다. 막힘
                  항목과 수정 응답만 앞으로 당기고, 상세 표는 접힘 레이어 안으로 밀었습니다.
                </p>
              </div>
              <div className="timeline-grid">
                {[1, 2, 3].map((iterationNumber) => {
                  const record =
                    visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
                  const isSelected = selectedIteration?.iteration === iterationNumber
                  const isRevealed = Boolean(record)

                  return (
                    <button
                      key={iterationNumber}
                      type="button"
                      className={`timeline-card ${isSelected ? 'is-selected' : ''} ${
                        isRevealed ? 'is-revealed' : 'is-queued'
                      }`}
                      aria-pressed={isSelected}
                      aria-current={isSelected ? 'step' : undefined}
                      onClick={() =>
                        record && dispatch({ type: 'select_iteration', iteration: iterationNumber })
                      }
                      disabled={!record}
                    >
                      <div className="timeline-head">
                        <div>
                          <p className="timeline-kicker">{iterationNumber}차 반복</p>
                          <strong>{record ? record.buildStatus : '리뷰 대기 중'}</strong>
                        </div>
                        {isSelected ? <span className="meta-pill current-loop-pill">현재 루프</span> : null}
                      </div>
                      <p className="timeline-counts">{formatCounts(record)}</p>
                      <div className="phase-track" aria-hidden="true">
                        {['작성', '리뷰', '수정'].map((label, index) => {
                          const depth = !record ? 0 : iterationNumber === 1 ? 1 : iterationNumber === 2 ? 2 : 3
                          const stateClass =
                            depth === 0
                              ? 'is-waiting'
                              : index + 1 < depth
                                ? 'is-complete'
                                : index + 1 === depth
                                  ? 'is-active'
                                  : 'is-waiting'
                          return (
                            <span key={label} className={`phase-track-pill ${stateClass}`}>
                              {label}
                            </span>
                          )
                        })}
                      </div>
                      <div>
                        <p className="timeline-kicker">{iterationNumber}차 반복</p>
                        <strong>
                          {record
                            ? iterationNumber === 1
                              ? '리뷰 지시를 정리 중'
                              : iterationNumber === 2
                                ? '수정 응답을 반영 중'
                                : '승인 잠금을 마침'
                            : '다음 루프 대기'}
                        </strong>
                      </div>
                      <span className={`phase-pill is-${record?.phase ?? 'writer'}`}>
                        {record ? phaseCopy[record.phase] : '대기'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {selectedIteration ? (
                <>
                  <div className="iteration-meta">
                    <span className="meta-pill">시작 시각 {selectedIteration.startedAt}</span>
                    <span className="meta-pill">{formatCounts(selectedIteration)}</span>
                    <span className="meta-pill">
                      다음 루프 필요 {selectedIteration.needsAnotherLoop ? '예' : '아니오'}
                    </span>
                  </div>

                  <div className="workbench-signal-grid">
                    <article className="subpanel review-signal-panel">
                      <p className="panel-label">리뷰어 신호</p>
                      <h3>{repairRows.length > 0 ? '아직 막고 있는 항목' : '승인 게이트 통과'}</h3>
                      {repairRows.length > 0 ? (
                        <ul className="repair-list">
                          {repairRows.map((row) => (
                            <li key={row.index}>
                              <strong>#{row.index}</strong>
                              <span>{row.note}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="empty-state compact">
                          3차 승인안에는 더 이상 열린 수리 항목이 없습니다. 지금은 내보내기 검토로
                          넘어갈 수 있습니다.
                        </div>
                      )}
                    </article>

                    <article className="subpanel optimizer-response-panel">
                      <p className="panel-label">수정자 응답</p>
                      <h3>가장 최근에 반영한 변경</h3>
                      <ul className="bullet-list">
                        {selectedIteration.optimizerChanges.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  </div>

                  <details className="panel detail-drawer checklist-drawer">
                    <summary>
                      <div>
                        <p className="panel-label">체크리스트 근거</p>
                        <h2>전체 리뷰 판정 표</h2>
                        <p>
                          통과·보류·실패 매트릭스는 필요할 때만 펼쳐 보고, 기본 화면에서는
                          막힘 항목과 응답만 남겨 정보 밀도를 낮춥니다.
                        </p>
                      </div>
                      <span>{formatCounts(selectedIteration)}</span>
                    </summary>
                    <div className="detail-body">
                      <div className="review-table-wrap">
                        <table className="review-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>체크 항목</th>
                              <th>판정</th>
                              <th>리뷰 메모</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedIteration.verdictRows.map((row) => (
                              <tr key={row.index}>
                                <td>{row.index}</td>
                                <td>{row.label}</td>
                                <td>
                                  <span className={`verdict-badge is-${row.verdict.toLowerCase()}`}>
                                    {verdictCopy[row.verdict]}
                                  </span>
                                </td>
                                <td>{row.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <div className="empty-state">
                  첫 초안을 생성하면 리뷰 신호와 수정 응답이 여기에 쌓입니다.
                </div>
              )}
            </article>

            <article className="panel reader-panel">
              <div className="section-head">
                <p className="panel-label">읽기 표면</p>
                <h2>지금 읽어야 할 단일 원고면</h2>
                <p>
                  현재 단계에 맞는 읽기 결과만 한 장씩 보여 줘서, 사용자가 다음 수정 포인트를
                  놓치지 않게 붙잡아 둡니다.
                </p>
              </div>

              <div className="reader-tabs" role="tablist" aria-label="Loop surfaces">
                {readerTabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    id={`reader-tab-${tab.id}`}
                    role="tab"
                    ref={(node) => {
                      readerTabRefs.current[index] = node
                    }}
                    className={`reader-tab ${readerSurface === tab.id ? 'is-active' : ''}`}
                    aria-selected={readerSurface === tab.id}
                    aria-controls={`reader-panel-${tab.id}`}
                    tabIndex={readerSurface === tab.id ? 0 : -1}
                    onKeyDown={(event) => handleReaderTabKeyDown(event, index)}
                    onClick={() => setReaderSurface(tab.id)}
                  >
                    <span className="reader-tab-copy">{tab.label}</span>
                    <span className="hook-chip">{tab.label}</span>
                  </button>
                ))}
              </div>

              {selectedIteration ? (
                <article
                  className="reader-card"
                  role="tabpanel"
                  id={`reader-panel-${readerSurface}`}
                  aria-labelledby={`reader-tab-${readerSurface}`}
                >
                  <div className="reader-heading">
                    <p className="reader-kicker">
                      {selectedIteration.iteration === 3
                        ? '승인 후보 표면'
                        : `${selectedIteration.iteration}차 작업 표면`}
                    </p>
                    <span className="hook-chip">
                      {readerTabs.find((tab) => tab.id === readerSurface)?.label}
                    </span>
                  </div>

                  {readerSurface === 'research' ? (
                    <>
                      <h3>연구 결과</h3>
                      <ul className="bullet-list">
                        {selectedIteration.researchSummary.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {readerSurface === 'outline' ? (
                    <>
                      <h3>개요</h3>
                      <ol className="outline-list">
                        {selectedIteration.outline.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}

                  {readerSurface === 'drafts' ? (
                    <>
                      <h3>섹션 초안</h3>
                      <div className="draft-stack">
                        {selectedIteration.sectionDrafts.map((draft) => (
                          <article key={draft.title} className="draft-card">
                            <h4>{draft.title}</h4>
                            <p>{draft.body}</p>
                            <strong>{draft.takeaway}</strong>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {readerSurface === 'review' ? (
                    <>
                      <h3>리뷰 메모</h3>
                      <ol className="review-notes">
                        {selectedIteration.reviewNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                </article>
              ) : (
                <div className="empty-state">첫 초안을 생성하면 현재 읽기 표면이 열립니다.</div>
              )}
            </article>
          </section>

          <section className="final-layout">
            <article className="panel final-panel">
              <div className="section-head">
                <p className="panel-label">최종 원고</p>
                <div className="panel-heading">
                  <h2>승인된 최종 원고</h2>
                  <span className="hook-chip">최종 원고</span>
                </div>
                <p>
                  승인된 3차 루프만 내보내기를 엽니다. 상세 본문은 접힘 레이어로 뒤로 미뤄
                  첫 화면의 집중도를 지킵니다.
                </p>
              </div>

              {finalArticle ? (
                <>
                  <div className="final-summary-strip">
                    <div className="metric-chip">
                      <span>승인 루프</span>
                      <strong>3차 반복</strong>
                    </div>
                    <div className="metric-chip">
                      <span>리뷰 게이트</span>
                      <strong>{state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 통과</strong>
                    </div>
                    <div className="metric-chip">
                      <span>다음 행동</span>
                      <strong>원고 검토 후 복사</strong>
                    </div>
                  </div>

                  <div className="release-spotlight">
                    <p className="article-kicker">3차 승인 후보</p>
                    <h3>{finalArticle.title}</h3>
                    <p className="article-intro">{finalArticle.intro}</p>
                    <ul className="release-highlights">
                      {finalArticle.mergedSections.slice(0, 3).map((section) => (
                        <li key={section.title}>
                          <strong>{section.title}</strong>
                          <span>{section.takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <details className="panel detail-drawer article-drawer">
                    <summary>
                      <div>
                        <p className="panel-label">전체 본문</p>
                        <h2>승인된 전체 미리보기</h2>
                        <p>모든 섹션과 클로징은 필요할 때만 펼쳐 확인합니다.</p>
                      </div>
                      <span>3개 섹션</span>
                    </summary>
                    <div className="detail-body">
                      <div className="article-preview">
                        <p className="article-kicker">승인 원고 미리보기</p>
                        <h3>{finalArticle.title}</h3>
                        <p className="article-intro">{finalArticle.intro}</p>
                        <div className="article-sections">
                          {finalArticle.mergedSections.map((section) => (
                            <article key={section.title} className="article-section">
                              <h4>{section.title}</h4>
                              <p>{section.body}</p>
                              <strong>{section.takeaway}</strong>
                            </article>
                          ))}
                        </div>
                        <p className="article-closing">{finalArticle.closing}</p>
                      </div>
                    </div>
                  </details>
                  <div className="markdown-heading">
                    <p className="panel-label">내보내기 원문</p>
                    <span className="hook-chip">마크다운 복사</span>
                  </div>
                  <pre className="markdown-export">{finalArticle.markdown}</pre>
                </>
              ) : (
                <div className="empty-state">최종 원고는 3차 루프가 끝나기 전까지 잠겨 있습니다.</div>
              )}
            </article>

            <details className="panel readiness-drawer">
              <summary>
                <div>
                  <p className="panel-label">평가 준비</p>
                  <h2>평가 준비 자료</h2>
                  <p>
                    산출물과 점수는 승인 원고가 먼저 보인 뒤에만 열리도록 뒤쪽 보조 레이어에
                    격리합니다.
                  </p>
                </div>
                <span>{state.outputs ? '요약 준비됨' : '기본 접힘'}</span>
              </summary>
              <div className="deliverable-grid">
                {deliverables.map((item) => (
                  <article key={item.id} className="deliverable-card">
                    <p className="deliverable-path">{item.path}</p>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
              <ul className="target-list">
                {evaluationTargets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="loop-readiness">
                <p className="readiness-label">루프 요약</p>
                {state.outputs ? (
                  <>
                    <strong>
                      마지막 루프에서 {state.outputs.loop_summary.lastIterationPassCount}/9 통과
                      게이트 확보
                    </strong>
                    <span>
                      최소 반복 충족 {state.outputs.loop_summary.minimumLoopsMet ? '예' : '아니오'} ·
                      내보내기 가능 {state.outputs.loop_summary.readyForExport ? '예' : '아니오'}
                    </span>
                  </>
                ) : (
                  <div className="empty-state compact">
                    루프를 한 번이라도 실행하면 승인 요약과 근거 체크리스트가 열립니다.
                  </div>
                )}
              </div>
            </details>
          </section>
        </>
      ) : null}

      {state.errorMessage ? (
        <section className="error-panel" role="alert">
          <strong>루프가 차단되었습니다.</strong>
          <p>{state.errorMessage}</p>
          <span>정상적인 토픽 제목으로 바꾼 뒤 다시 생성하면 복구할 수 있습니다.</span>
        </section>
      ) : null}
    </main>
  )
}

export default App
