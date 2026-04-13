import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStatus,
  IterationRecord,
  Length,
  PipelineOutputs,
  Tone,
} from './contracts'
import { generatePipelineOutputs, isForcedErrorTopic } from './generator'
import { deliverables, evaluationTargets, requiredLoops, topicPresets, workflowStages } from './starterData'

interface AppState {
  inputs: BlogGeneratorInputs
  status: GenerationStatus
  statusMessage: string
  copyFeedback: string
  outputs: PipelineOutputs | null
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
  | { type: 'start_generation'; outputs: PipelineOutputs }
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

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[1].title,
  audience: 'advanced',
  tone: 'opinionated',
  length: 'long',
}

const initialState: AppState = {
  inputs: initialInputs,
  status: 'initial',
  statusMessage: '건틀릿이 대기 중입니다. 브리프를 확인한 뒤 생성 버튼으로 10회 평가 루프를 시작하세요.',
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
        inputs: { ...state.inputs, [action.field]: action.value },
        copyFeedback: '',
        errorMessage: null,
      }
    case 'apply_preset':
      return {
        ...state,
        inputs: action.preset,
        statusMessage: '프리셋을 불러왔습니다. 다음 생성 실행에서 OMX 건틀릿이 이 브리프를 다시 재생합니다.',
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
        statusMessage: '작성자가 첫 초안을 세우고 있습니다. 곧 리뷰어와 수정자가 순차적으로 게이트를 밀어 올립니다.',
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
        statusMessage: action.message,
        copyFeedback: '',
        outputs: null,
        revealedIterations: 0,
        selectedIteration: 0,
        isGenerating: false,
        errorMessage: action.message,
      }
    case 'select_iteration':
      return { ...state, selectedIteration: action.iteration, copyFeedback: '' }
    case 'set_copy_feedback':
      return { ...state, copyFeedback: action.feedback, statusMessage: action.feedback }
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
  if (status === 'error') return index === 0 ? 'active' : 'waiting'
  if (status === 'initial') return index === 0 ? 'active' : 'waiting'
  if (revealedIterations === 0 || status === 'loading') return index === 0 ? 'active' : 'waiting'
  if (index < 4) return 'complete'
  return status === 'export-ready' ? 'complete' : 'active'
}

function formatCounts(record: IterationRecord | null) {
  if (!record) return '대기 중'
  return `통과 ${record.passCount} · 보류 ${record.partialCount} · 실패 ${record.failCount}`
}

function statusForIteration(iteration: number, total: number): GenerationStatus {
  if (iteration < total) return 'populated'
  return 'review-complete'
}

function statusMessageForIteration(record: IterationRecord, total: number) {
  if (record.iteration === 1) {
    return `${record.iteration}차는 의도적으로 거칠게 시작합니다. 통과 ${record.passCount}, 보류 ${record.partialCount}, 실패 ${record.failCount} 상태에서 첫 수정을 받습니다.`
  }
  if (record.iteration < total) {
    return `${record.iteration}차 루프가 기준을 더 끌어올렸습니다. 통과 ${record.passCount}, 보류 ${record.partialCount}, 실패 ${record.failCount}를 기록했습니다.`
  }
  return `${record.iteration}차 루프가 모든 리뷰 게이트를 통과해 승인 후보를 넘깁니다.`
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const runTokenRef = useRef(0)
  const readerTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeSurface, setActiveSurface] = useState<'research' | 'outline' | 'drafts' | 'review'>(
    'research',
  )

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
    state.outputs && state.revealedIterations >= requiredLoops ? state.outputs.final_article : null
  const releasePreview = finalArticle ? finalArticle.markdown.split('\n').slice(0, 6).join('\n') : ''
  const repairRows = selectedIteration?.verdictRows.filter((row) => row.verdict !== 'PASS') ?? []
  const visibleVerificationCycles =
    state.outputs?.verification_cycles.slice(
      0,
      Math.min(state.revealedIterations + 2, state.outputs.verification_cycles.length),
    ) ?? []
  const remainingLoops = Math.max(requiredLoops - state.revealedIterations, 0)
  const remainingVerificationCycles = Math.max(requiredLoops - visibleVerificationCycles.length, 0)
  const hasLoopOutputs = Boolean(state.outputs)
  const stageHooks = {
    research: 'Research results',
    outline: 'Outline',
    drafts: 'Section drafts',
    review: 'Review notes',
    final: 'Final post',
  } as const

  const loopStatus =
    state.status === 'initial'
      ? '첫 초안이 아직 시작되지 않았습니다.'
      : state.status === 'loading'
        ? '작성자, 리뷰어, 수정자, 검증 사이클이 순서대로 건틀릿을 다시 재생하는 중입니다.'
        : state.status === 'error'
          ? '강제 실패 토픽 때문에 리뷰 전에 루프가 멈췄습니다.'
          : state.status === 'export-ready'
            ? `건틀릿이 끝났습니다. ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과했습니다.`
        : `${selectedIteration?.iteration ?? 0}차 루프가 현재 화면에 열려 있습니다.`

  const currentGateTitle =
    state.status === 'initial'
      ? '브리프 확인'
      : state.status === 'loading' && state.revealedIterations === 0
        ? '초안 작성'
        : state.status === 'loading'
          ? `${Math.min(state.revealedIterations + 1, requiredLoops)}차 리뷰 게이트`
          : state.status === 'error'
            ? '복구 게이트'
            : state.status === 'export-ready'
              ? '승인 후보'
              : `${state.revealedIterations}차 루프가 대기 중`

  const nextActionTitle =
    state.status === 'initial'
      ? '첫 초안 시작'
      : state.status === 'loading'
        ? '건틀릿 재생 대기'
        : state.status === 'error'
          ? '브리프 수정 후 재실행'
          : state.status === 'export-ready'
            ? '원고 복사 또는 증거 확인'
            : `${selectedIteration?.iteration ?? state.revealedIterations}차 루프 점검`

  const nextActionBody =
    state.status === 'initial'
      ? '첫 행동은 하나면 충분합니다. 브리프를 다듬고 바로 건틀릿을 시작하세요.'
      : state.status === 'loading'
        ? '작성자, 리뷰어, 수정자, 검증 사이클이 아직 순서대로 재생되는 중입니다.'
        : state.status === 'error'
          ? '토픽에서 강제 실패 접두어를 지우고 다시 생성해 제품 흐름을 복구하세요.'
          : state.status === 'export-ready'
            ? '승인 게이트가 열렸으므로, 이제 화면의 중심을 수정 작업에서 출고 점검으로 옮길 수 있습니다.'
            : '아래 선택된 루프 스냅샷에서 막히는 항목과 최신 수정 반응을 함께 읽으세요.'

  const exportLockTitle =
    finalArticle || state.status === 'export-ready'
      ? '내보내기 해제'
      : `${remainingLoops}회 루프 + ${remainingVerificationCycles}회 검증 남음`

  const exportLockBody =
    finalArticle || state.status === 'export-ready'
      ? `${requiredLoops}차 루프가 ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과해 복사 잠금을 풀었습니다.`
      : '계약 안정성을 위해 복사 액션은 미리 보이되, 열 번째 루프와 반복 검증이 끝날 때까지 실제 출고는 잠가 둡니다.'

  const readerTabs = [
    {
      id: 'research',
      label: '연구 결과',
      hook: stageHooks.research,
      note: '근거와 핵심 논점이 얼마나 압축됐는지 읽습니다.',
    },
    {
      id: 'outline',
      label: '개요',
      hook: stageHooks.outline,
      note: '글 구조가 어떤 순서로 잠기는지 빠르게 확인합니다.',
    },
    {
      id: 'drafts',
      label: '섹션 초안',
      hook: stageHooks.drafts,
      note: '문단 톤, 전환, 결론 리듬을 한 장에서 점검합니다.',
    },
    {
      id: 'review',
      label: '리뷰 메모',
      hook: stageHooks.review,
      note: '아직 출고를 막는 판정과 수정 압박만 남겨 둡니다.',
    },
  ] as const
  const activeReaderTab = readerTabs.find((tab) => tab.id === activeSurface) ?? readerTabs[0]
  const heroRail = [
    {
      title: '초안 점화',
      detail: state.status === 'initial' ? '브리프 대기' : '1차 거친 후보안 가동',
      className: state.status === 'initial' ? 'is-queued' : 'is-revealed',
    },
    {
      title: '게이트 압축',
      detail:
        state.status === 'initial'
          ? '리뷰 대기'
          : `${Math.max(state.revealedIterations, 1)}/${requiredLoops}회 루프 노출`,
      className:
        state.status === 'export-ready'
          ? 'is-revealed'
          : state.status === 'loading' || state.revealedIterations > 0
            ? 'is-selected'
            : 'is-queued',
    },
    {
      title: '승인 잠금',
      detail: state.status === 'export-ready' ? '복사 가능' : `${remainingLoops}회 남음`,
      className: state.status === 'export-ready' ? 'is-selected' : 'is-queued',
    },
  ] as const
  const stagedWorkflow = workflowStages.map((stage, index) => ({
    ...stage,
    stateClass: stageState(index, state.status, state.revealedIterations),
  }))
  const completedStageCount = stagedWorkflow.filter((stage) => stage.stateClass === 'complete').length
  const activeStageLabel =
    stagedWorkflow.find((stage) => stage.stateClass === 'active')?.label ?? workflowStages[0].label

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({ type: 'update_field', field, value })
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({ type: 'apply_preset', preset: { topic: title, audience, tone, length } })
  }

  function focusReaderTab(index: number) {
    const nextIndex = (index + readerTabs.length) % readerTabs.length
    const nextTab = readerTabs[nextIndex]
    setActiveSurface(nextTab.id)
    window.requestAnimationFrame(() => {
      readerTabRefs.current[nextIndex]?.focus()
    })
  }

  function handleReaderTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusReaderTab(index + 1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusReaderTab(index - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusReaderTab(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusReaderTab(readerTabs.length - 1)
    }
  }

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken

    if (topic.length < 6) {
      dispatch({
        type: 'generation_error',
        message: '주제는 최소 6자 이상이어야 작성자가 건틀릿을 시작할 충분한 단서를 얻을 수 있습니다.',
      })
      return
    }

    if (isForcedErrorTopic(topic)) {
      dispatch({
        type: 'generation_error',
        message: '리뷰어가 이 주제를 분류 단계에서 차단했습니다. fail/error 접두어를 지운 뒤 다시 실행하세요.',
      })
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    dispatch({ type: 'start_generation', outputs })

    for (const record of outputs.iterations) {
      await sleep(record.iteration === 1 ? 300 : 140)
      if (runTokenRef.current !== runToken) return

      dispatch({
        type: 'reveal_iteration',
        count: record.iteration,
        selectedIteration: record.iteration,
        status: statusForIteration(record.iteration, outputs.iterations.length),
        statusMessage: statusMessageForIteration(record, outputs.iterations.length),
      })
    }

    await sleep(180)
    if (runTokenRef.current !== runToken) return

    dispatch({
      type: 'finish_generation',
      statusMessage: `${requiredLoops}차 루프가 ${outputs.loop_summary.verificationCycles}회 검증 뒤에 ${outputs.loop_summary.lastIterationPassCount}/9 게이트를 통과했습니다. 승인 후보가 열렸습니다.`,
    })
  }

  async function handleCopyMarkdown() {
    if (!finalArticle || state.status !== 'export-ready') {
      dispatch({
        type: 'set_copy_feedback',
        feedback: `${requiredLoops}차 루프가 끝나고 승인 후보가 열려야 복사를 풀 수 있습니다.`,
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalArticle.markdown)
      dispatch({
        type: 'set_copy_feedback',
        feedback: `최종 마크다운을 복사했습니다. 현재 출고는 ${requiredLoops}차 승인 후보에 고정돼 있습니다.`,
      })
    } catch {
      dispatch({
        type: 'set_copy_feedback',
        feedback: '이 브라우저에서는 클립보드 복사가 실패했습니다. 대신 승인 패널에서 원문을 바로 확인할 수 있습니다.',
      })
    }
  }

  return (
    <main className="gauntlet-shell">
      <section className="hero-grid">
        <article className="hero-card">
          <p className="eyebrow">품질 관제실 · OMX 검수 건틀릿</p>
          <h1>초안을 바로 믿지 않는 출고 관제실</h1>
          <p className="hero-lead">
            기본 화면은 현재 게이트, 다음 행동, 출고 잠금만 먼저 드러냅니다. 긴 증거 표와
            반복 로그는 뒤쪽으로 밀어 두고, 지금 무엇을 고쳐야 하는지만 선명하게 남깁니다.
          </p>
          <div className="hero-loop-rail" aria-label="품질 관제 흐름">
            {heroRail.map((item, index) => (
              <article key={item.title} className={`loop-rail-step ${item.className}`}>
                <span className="loop-rail-index">0{index + 1}</span>
                <div className="loop-rail-copy">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              data-testid="generate-post"
              onClick={handleGenerate}
              disabled={state.isGenerating}
            >
              <span className="sr-only">Generate post</span>
              {state.isGenerating ? '생성 중...' : '원고 생성 시작'}
            </button>
            <button
              type="button"
              className="secondary-button"
              data-testid="copy-markdown"
              onClick={handleCopyMarkdown}
            >
              <span className="sr-only">Copy markdown</span>
              승인 원고 복사
            </button>
          </div>
          <div
            className={`status-banner is-${state.status}`}
            aria-live="polite"
            data-testid="generation-status"
          >
            <strong>{statusBadgeCopy[state.status]}</strong>
            <span>{state.statusMessage}</span>
            <span className="sr-only">{state.status}</span>
          </div>
        </article>

        <aside className="input-card">
          <div className="section-head">
            <p className="panel-label">브리프 입력 레일</p>
            <h2>작성자에게 넘길 첫 지시를 잠급니다</h2>
            <p>
              OMX 변형은 같은 제품 계약을 지키되, 이른 시점의 “이 정도면 됐다”를 허용하지
              않습니다. 브리프가 분명해야 루프 압박도 제대로 걸립니다.
            </p>
          </div>
          <form className="input-grid" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="topic">
              <span>주제</span>
              <span className="sr-only">Topic</span>
              <textarea
                id="topic"
                name="topic"
                rows={4}
                value={state.inputs.topic}
                disabled={state.isGenerating}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label htmlFor="audience">
              <span>독자</span>
              <span className="sr-only">Audience</span>
              <select
                id="audience"
                name="audience"
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
              <span>톤</span>
              <span className="sr-only">Tone</span>
              <select
                id="tone"
                name="tone"
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
              <span>분량</span>
              <span className="sr-only">Length</span>
              <select
                id="length"
                name="length"
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
          <p className="copy-feedback" role="status" aria-live="polite">
            {state.copyFeedback || '복사 결과와 잠금 안내는 여기에서 바로 알려 줍니다.'}
          </p>
          <details className="drawer preset-drawer">
            <summary className="drawer-summary">
              <div>
                <p className="panel-label">빠른 시작 프리셋</p>
                <h3>초기 브리프 후보 열기</h3>
                <p>기본 화면이 현재 게이트에 집중하도록, 프리셋은 보조 레이어 안에만 남겨 둡니다.</p>
              </div>
              <span className="meta-pill">프리셋 {topicPresets.length}개</span>
            </summary>
            <div className="drawer-body preset-grid">
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
        </aside>
      </section>

      <section className="focus-strip">
        <article className="focus-card is-primary">
          <p className="panel-label">현재 게이트</p>
          <h2>{currentGateTitle}</h2>
          <p>{loopStatus}</p>
          <div className="focus-meta">
            <span className="meta-pill">
              화면 노출 {state.revealedIterations}/{requiredLoops}
            </span>
            <span className="meta-pill">직전 통과 {state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9</span>
          </div>
        </article>
        <article className="focus-card">
          <p className="panel-label">다음 행동</p>
          <h2>{nextActionTitle}</h2>
          <p>{nextActionBody}</p>
          <div className="focus-meta">
            <span className="meta-pill">
              검증 {visibleVerificationCycles.length}/{requiredLoops}
            </span>
          </div>
        </article>
        <article className="focus-card">
          <p className="panel-label">출고 잠금</p>
          <h2>{exportLockTitle}</h2>
          <p>{exportLockBody}</p>
          <div className="focus-meta">
            <span className="meta-pill">
              승인 상태 {state.outputs?.loop_summary.readyForExport ? '열림' : '잠김'}
            </span>
          </div>
        </article>
      </section>

      <section className="journey-strip" aria-label="Required stages">
        {stagedWorkflow.map((stage, index) => (
          <article
            key={stage.id}
            className={`journey-step is-${stage.stateClass}`}
            aria-label={stageHooks[stage.id]}
            data-testid={`stage-${stage.id}`}
          >
            <p className="workflow-step">0{index + 1}</p>
            <div>
              <strong>{stage.label}</strong>
              <span>
                {stage.stateClass === 'active'
                  ? '현재 게이트'
                  : stage.stateClass === 'complete'
                    ? '통과'
                    : '대기'}
              </span>
            </div>
          </article>
        ))}
      </section>

      <details className="drawer stage-drawer">
        <summary className="drawer-summary">
          <div>
            <p className="panel-label">단계 흐름</p>
            <h3>상세 단계 지도 열기</h3>
            <p>기본 화면의 compact strip만으로 부족할 때, 상태 설명이 붙은 전체 단계 맵을 펼칩니다.</p>
          </div>
          <span className="meta-pill">
            {completedStageCount}/{workflowStages.length} 통과 · {activeStageLabel}
          </span>
        </summary>
        <div className="drawer-body">
          <section className="stage-strip" aria-label="Required stages">
            {stagedWorkflow.map((stage, index) => (
              <article
                key={stage.id}
                className={`stage-card is-${stage.stateClass}`}
                aria-label={stageHooks[stage.id]}
                data-testid={`stage-detail-${stage.id}`}
              >
                <p className="workflow-step">0{index + 1}</p>
                <div>
                  <h3>{stage.label}</h3>
                  <p>
                    {stage.stateClass === 'active'
                      ? '현재 게이트'
                      : stage.stateClass === 'complete'
                        ? '통과'
                        : '대기'}
                  </p>
                </div>
              </article>
            ))}
          </section>
        </div>
      </details>

      {hasLoopOutputs ? (
      <section className="workbench-grid">
        <article className="panel review-panel">
          <div className="section-head">
            <p className="panel-label">현재 루프 스냅샷</p>
            <h2>막힘 메모와 수정 반응을 한 화면에 고정합니다</h2>
            <p>지금 막는 항목과 방금 적용된 수정은 가까이 두고, 원시 판정표는 서랍 뒤로 밀어 둡니다.</p>
          </div>
          {selectedIteration ? (
            <>
              <div className="iteration-meta">
                <span className="meta-pill">시작 {selectedIteration.startedAt}</span>
                <span className="meta-pill">{formatCounts(selectedIteration)}</span>
                <span className="meta-pill">
                  추가 반복 {selectedIteration.needsAnotherLoop ? '필요' : '불필요'}
                </span>
              </div>
              <div className="current-loop-grid">
                <article className="subpanel">
                  <p className="panel-label">방금 적용된 수정</p>
                  <h3>수정자가 이번 차수에 실제로 반영한 변화</h3>
                  <ul className="bullet-list">
                    {selectedIteration.optimizerChanges.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
                <article className="subpanel">
                  <p className="panel-label">수정 브리프</p>
                  <h3>아직 출고를 막고 있는 항목</h3>
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
                      {requiredLoops}차 승인 후보에는 열린 수정 항목이 없습니다. 이제 출고 점검으로 넘길 수 있습니다.
                    </div>
                  )}
                </article>
              </div>
              <details className="drawer detail-drawer">
                <summary className="drawer-summary">
                  <div>
                    <p className="panel-label">리뷰어 상세 판정</p>
                    <h3>전체 판정표 열기</h3>
                    <p>엄격한 증거는 유지하되, 첫 읽기 표면과 경쟁하지 않도록 뒤 레이어에 둡니다.</p>
                  </div>
                  <span className="meta-pill">9개 체크</span>
                </summary>
                <div className="drawer-body">
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
              첫 초안을 생성하면 선택 루프 스냅샷이 채워지고, 건틀릿 브리프가 열립니다.
            </div>
          )}
        </article>

        <section className="panel reader-panel">
          <div className="section-head">
            <p className="panel-label">집중 읽기 표면</p>
            <h2>한 번에 하나의 읽기 표면만 유지합니다</h2>
            <p>리서치, 구조, 초안, 리뷰 메모는 한 장의 집중된 읽기 표면 안에서만 교체합니다.</p>
          </div>
          <div className="reader-tabs" role="tablist" aria-label="Loop surfaces">
            {readerTabs.map((tab, index) => (
              <button
                key={tab.id}
                ref={(node) => {
                  readerTabRefs.current[index] = node
                }}
                id={`surface-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeSurface === tab.id}
                aria-label={`${tab.label} · ${tab.hook}`}
                aria-controls={`surface-panel-${tab.id}`}
                tabIndex={activeSurface === tab.id ? 0 : -1}
                className={`reader-tab ${activeSurface === tab.id ? 'is-active' : ''}`}
                data-testid={`reader-tab-${tab.id}`}
                onClick={() => setActiveSurface(tab.id)}
                onKeyDown={(event) => handleReaderTabKeyDown(event, index)}
              >
                <span className="reader-tab-copy">
                  <strong className="reader-tab-title">{tab.label}</strong>
                  <span className="reader-tab-note">{tab.note}</span>
                </span>
                <span className="sr-only">{tab.hook}</span>
              </button>
            ))}
          </div>
          <article
            id={`surface-panel-${activeReaderTab.id}`}
            className="surface-card"
            role="tabpanel"
            aria-labelledby={`surface-tab-${activeReaderTab.id}`}
            aria-label={activeReaderTab.hook}
            data-testid={`surface-${activeReaderTab.id}`}
          >
            <div className="section-head">
              <p className="panel-label">{activeReaderTab.label}</p>
              <h2>{activeReaderTab.label}</h2>
              <p className="surface-note">{activeReaderTab.note}</p>
              <span className="sr-only">{activeReaderTab.hook}</span>
            </div>
            {selectedIteration ? (
              activeSurface === 'research' ? (
                <ul className="bullet-list">
                  {selectedIteration.researchSummary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : activeSurface === 'outline' ? (
                <ol className="outline-list">
                  {selectedIteration.outline.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              ) : activeSurface === 'drafts' ? (
                <div className="draft-stack">
                  {selectedIteration.sectionDrafts.map((draft) => (
                    <article key={draft.title} className="draft-card">
                      <h3>{draft.title}</h3>
                      <p>{draft.body}</p>
                      <strong>{draft.takeaway}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <ol className="review-notes">
                  {selectedIteration.reviewNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ol>
              )
            ) : (
              <div className="empty-state">
                {activeSurface === 'research'
                  ? '1차 반복이 열리면 연구 결과가 이곳에 쌓입니다.'
                  : activeSurface === 'outline'
                    ? '작성 초안이 검토되면 개요 순서가 이곳에 나타납니다.'
                    : activeSurface === 'drafts'
                      ? '루프가 실제로 평가할 초안을 만들기 전까지 섹션 초안은 숨겨 둡니다.'
                      : '리뷰 메모는 첫 초안이 점수화된 뒤에 여기에 채워집니다.'}
              </div>
            )}
          </article>
        </section>
      </section>

      <section
        className="panel final-panel"
        aria-label={stageHooks.final}
        data-testid="final-post-panel"
      >
        <div className="section-head">
          <p className="panel-label">최종 원고</p>
          <h2>승인 직전 원고만 첫 화면에 남깁니다</h2>
          <span className="sr-only">{stageHooks.final}</span>
          <p>열 번째 루프가 모든 게이트를 통과할 때만 출고를 엽니다. 긴 본문과 원문 마크다운은 모두 뒤쪽 서랍에 둡니다.</p>
        </div>
        {finalArticle ? (
          <>
            <div className="release-spotlight">
              <p className="article-kicker">{requiredLoops}차 승인안</p>
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
              <div className="release-preview">
                <p className="panel-label">승인안 미리보기</p>
                <pre className="markdown-preview">{releasePreview}</pre>
              </div>
            </div>
            <details className="drawer detail-drawer article-drawer">
              <summary className="drawer-summary">
                <div>
                  <p className="panel-label">전체 본문</p>
                  <h3>승인된 본문 전체 보기</h3>
                  <p>긴 본문은 기본 표면 밖으로 빼고, 필요할 때만 전체 섹션을 펼칩니다.</p>
                </div>
                <span className="meta-pill">섹션 {finalArticle.mergedSections.length}개</span>
              </summary>
              <div className="drawer-body">
                <div className="article-preview">
                  <p className="article-kicker">{requiredLoops}차 승인 후보</p>
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
            <details className="drawer detail-drawer markdown-drawer">
              <summary className="drawer-summary">
                <div>
                  <p className="panel-label">마크다운 원문</p>
                  <h3>복사용 원문 열기</h3>
                  <p>복사 실패나 포맷 점검이 필요할 때만 원문 마크다운을 펼칩니다.</p>
                </div>
                <span className="meta-pill">원문</span>
              </summary>
              <div className="drawer-body">
                <pre className="markdown-export">{finalArticle.markdown}</pre>
              </div>
            </details>
          </>
        ) : (
          <div className="empty-state">
            최종 원고는 {requiredLoops}차 루프가 끝나기 전까지 잠겨 있습니다.
          </div>
        )}
      </section>

      <details className="panel proof-panel proof-drawer">
        <summary className="drawer-summary">
          <div>
            <p className="panel-label">검증 증거</p>
            <h2>증거 팩은 한 단계 뒤에 둡니다</h2>
            <p>비교, 평가, 검증 기록은 유지하되 기본 표면에서는 요약만 남깁니다.</p>
          </div>
          <span className="meta-pill">
            검증 {visibleVerificationCycles.length}/{requiredLoops}
          </span>
        </summary>
        <div className="drawer-body">
          <div className="verification-summary">
            <article className="subpanel compact">
              <p className="panel-label">노출된 검증</p>
              <h3>
                {visibleVerificationCycles.length}/{requiredLoops}
              </h3>
              <p>비교, 검증, 평가 펄스가 반복적으로 누적되어야만 출고가 열립니다.</p>
            </article>
            <article className="subpanel compact">
              <p className="panel-label">최신 변화</p>
              <h3>{visibleVerificationCycles.at(-1)?.label ?? '1차 검증 대기'}</h3>
              <p>{visibleVerificationCycles.at(-1)?.delta ?? '첫 초안을 생성하면 검증 압력이 이곳에 드러납니다.'}</p>
            </article>
            <article className="subpanel compact">
              <p className="panel-label">루프 요약</p>
              {state.outputs ? (
                <>
                  <h3>{state.outputs.loop_summary.lastIterationPassCount}/9 게이트 통과</h3>
                  <p>
                    최소 반복 충족 {state.outputs.loop_summary.minimumLoopsMet ? '완료' : '미완료'} · 출고 준비{' '}
                    {state.outputs.loop_summary.readyForExport ? '완료' : '잠금'}
                  </p>
                </>
              ) : (
                <>
                  <h3>1차 루프 대기</h3>
                  <p>한 번 루프를 실행하면 승인 요약과 증거 체크리스트가 이곳에 열립니다.</p>
                </>
              )}
            </article>
          </div>
          <details className="drawer detail-drawer">
          <summary className="drawer-summary">
            <div>
              <p className="panel-label">루프 타임라인</p>
              <h3>10회 반복 루프 열기</h3>
              <p>이 건틀릿은 첫 답변을 신뢰하지 않습니다. 모든 루프가 스스로 승격을 벌어야 합니다.</p>
            </div>
            <span className="meta-pill">{visibleIterations.length}/{requiredLoops} 노출</span>
          </summary>
          <div className="drawer-body">
            <div className="timeline-grid">
              {Array.from({ length: requiredLoops }, (_, index) => index + 1).map((iterationNumber) => {
                const record = visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
                const isSelected = selectedIteration?.iteration === iterationNumber
                const isRevealed = Boolean(record)

                return (
                  <button
                    key={iterationNumber}
                    type="button"
                    className={`timeline-card ${isSelected ? 'is-selected' : ''} ${
                      isRevealed ? 'is-revealed' : 'is-queued'
                    }`}
                    onClick={() =>
                      record && dispatch({ type: 'select_iteration', iteration: iterationNumber })
                    }
                    disabled={!record}
                  >
                    <div>
                      <p className="timeline-kicker">{iterationNumber}차 반복</p>
                      <strong>{record ? record.buildStatus : '리뷰 대기'}</strong>
                    </div>
                    <p className="timeline-counts">{formatCounts(record)}</p>
                    <span className={`phase-pill is-${record?.phase ?? 'writer'}`}>
                      {record ? phaseCopy[record.phase] : '대기'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          </details>
          <details className="drawer detail-drawer">
          <summary className="drawer-summary">
            <div>
              <p className="panel-label">검증 상세</p>
              <h3>비교 · 평가 · 검증 사이클 열기</h3>
              <p>증거 선은 건틀릿을 감사해야 할 때만 세부까지 펼칩니다.</p>
            </div>
            <span className="meta-pill">{visibleVerificationCycles.length}개 노출</span>
          </summary>
          <div className="drawer-body">
            <div className="verification-grid">
              {visibleVerificationCycles.map((cycle) => (
                <article key={cycle.cycle} className="verification-card">
                  <p className="timeline-kicker">{cycle.cycle}차 검증</p>
                  <h3>{cycle.label}</h3>
                  <div className="verification-badges">
                    <span className="meta-pill">검증 · 통과</span>
                    <span className="meta-pill">비교 · 통과</span>
                    <span className="meta-pill">평가 · 통과</span>
                  </div>
                  <p>{cycle.delta}</p>
                </article>
              ))}
            </div>
          </div>
          </details>
          <details className="drawer detail-drawer">
          <summary className="drawer-summary">
            <div>
              <p className="panel-label">증거 팩</p>
              <h3>아티팩트와 루브릭 목표 열기</h3>
              <p>모든 증거는 남겨 두되, 더 이상 제품 표면을 압도하지 않게 합니다.</p>
            </div>
            <span className="meta-pill">파일 {deliverables.length}개</span>
          </summary>
          <div className="drawer-body">
            <div className="deliverable-grid">
              {deliverables.map((item) => (
                <article key={item.id} className="deliverable-card">
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
          </div>
          </details>
        </div>
      </details>
      ) : null}

      {state.errorMessage ? (
        <section className="error-panel" role="alert">
          <strong>루프가 차단되었습니다.</strong>
          <p>{state.errorMessage}</p>
          <span>일반 주제 제목으로 바꾼 뒤 다시 생성하면 흐름을 복구할 수 있습니다.</span>
        </section>
      ) : null}
    </main>
  )
}

export default App
