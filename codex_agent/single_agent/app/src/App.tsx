import { useEffect, useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  ArtifactIndex,
  Audience,
  BlogGeneratorInputs,
  GenerationStageId,
  GenerationState,
  GenerationStatus,
  Length,
  PipelineOutputs,
  RunManifest,
  Scorecard,
  Tone,
} from './contracts'
import { generatePipelineOutputs } from './generator'
import { deliverables, reviewLenses, topicPresets, workflowStages } from './starterData'

type AppState = {
  inputs: BlogGeneratorInputs
  generation: GenerationState
  copyFeedback: string
}

type Action =
  | {
      type: 'update-input'
      field: keyof BlogGeneratorInputs
      value: BlogGeneratorInputs[keyof BlogGeneratorInputs]
    }
  | { type: 'apply-preset'; payload: BlogGeneratorInputs }
  | { type: 'start-run'; message: string }
  | {
      type: 'set-stage-output'
      stage: GenerationStageId
      nextStage: GenerationStageId | null
      key: keyof PipelineOutputs
      value: PipelineOutputs[keyof PipelineOutputs]
      status: GenerationStatus
      message: string
    }
  | { type: 'finalize-run'; finalPost: string; message: string }
  | { type: 'set-copy-feedback'; message: string }
  | { type: 'set-error'; stage: GenerationStageId; message: string }

const stageOrder = workflowStages.map((stage) => stage.id)

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentStage: 'research',
  completedStages: [],
  outputs: {},
  statusMessage:
    'initial | 브리프가 준비되었습니다. Generate post로 리서치부터 최종 원고까지 한 번에 진행하세요.',
  errorMessage: null,
}

const audienceOptions: { value: Audience; label: string }[] = [
  { value: 'beginner', label: '입문자' },
  { value: 'practitioner', label: '실무자' },
  { value: 'advanced', label: '고급 사용자' },
]

const toneOptions: { value: Tone; label: string }[] = [
  { value: 'clear', label: '명료한 설명' },
  { value: 'pragmatic', label: '실무 중심' },
  { value: 'opinionated', label: '선명한 관점' },
]

const lengthOptions: { value: Length; label: string }[] = [
  { value: 'short', label: '짧게' },
  { value: 'medium', label: '중간' },
  { value: 'long', label: '길게' },
]

const statusLabels: Record<GenerationStatus, string> = {
  initial: '대기',
  loading: '생성 중',
  populated: '초안 준비',
  'review-complete': '검토 완료',
  'export-ready': '내보내기 준비',
  error: '오류',
}

const stageFocusCopy: Record<GenerationStageId, string> = {
  research: '핵심 사실과 독자 관점을 좁혀 첫 문단의 논지를 고정합니다.',
  outline: '문단 순서와 논리 흐름을 한 번에 이해되도록 정리합니다.',
  drafts: '섹션별 초안을 채워 읽기 리듬과 밀도를 맞춥니다.',
  review: '과장, 누락, 모호성을 빠르게 걷어내는 검토 구간입니다.',
  final: '최종 마크다운을 짧은 리더 표면에서 확인하고 바로 복사합니다.',
}

const emptyCopy: Record<GenerationStageId, { title: string; body: string }> = {
  research: {
    title: '리서치 결과를 아직 만들지 않았습니다.',
    body: '브리프를 확인한 뒤 생성 버튼을 누르면 핵심 사실, 검색어, 참고 근거가 먼저 채워집니다.',
  },
  outline: {
    title: '개요가 아직 비어 있습니다.',
    body: '리서치가 끝나면 문단 순서와 독자 흐름이 자동으로 정리됩니다.',
  },
  drafts: {
    title: '섹션 초안이 아직 없습니다.',
    body: '초안 단계에서는 각 문단의 핵심 문장과 takeaway가 순서대로 나타납니다.',
  },
  review: {
    title: '검토 메모가 아직 없습니다.',
    body: '검토 단계에서는 흐름, 깊이, 실행 가능성, 문장 다듬기 메모가 생성됩니다.',
  },
  final: {
    title: '최종 원고가 아직 없습니다.',
    body: '최종 단계에 도달하면 마크다운이 잠금 해제되고 Copy markdown 액션이 활성화됩니다.',
  },
}

const previewManifest: RunManifest = {
  harness: 'single_agent',
  run_id: 'single-agent-local-preview',
  started_at: '브라우저에서 Generate post를 누른 시점',
  finished_at: 'Final post가 준비된 직후',
  task_spec_version: 'v2',
  status: 'completed',
}

const previewArtifacts: ArtifactIndex = {
  screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
  final_urls: ['http://127.0.0.1:4273/'],
  notes: [
    '기본 표면은 focused wizard를 유지하고 evidence는 drawer에 둡니다.',
    '영문 훅은 테스트/라이브 리전용으로만 유지합니다.',
  ],
  deliverables: ['reports/review_report.md', 'reports/scorecard.json'],
}

const previewScorecard: Scorecard = {
  task_success: 9,
  ux_score: 8,
  flow_clarity: 9,
  visual_quality: 8,
  responsiveness: 8,
  a11y_score: 8,
  process_adherence: 9,
  overall_score: 8.4,
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'update-input':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [action.field]: action.value,
        },
        generation:
          state.generation.status === 'error'
            ? {
                ...initialGeneration,
                statusMessage:
                  'initial | 브리프를 수정했습니다. Generate post로 집중형 단계를 다시 시작하세요.',
              }
            : state.generation,
        copyFeedback: '',
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          errorMessage: null,
          statusMessage:
            'initial | 프리셋을 불러왔습니다. Generate post로 단일 작성 흐름을 바로 시작할 수 있습니다.',
        },
        copyFeedback: '',
      }
    case 'start-run':
      return {
        ...state,
        generation: {
          status: 'loading',
          currentStage: 'research',
          completedStages: [],
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
      }
    case 'set-stage-output':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentStage: action.nextStage ?? action.stage,
          completedStages: unique([...state.generation.completedStages, action.stage]),
          outputs: {
            ...state.generation.outputs,
            [action.key]: action.value,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'finalize-run':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'export-ready',
          currentStage: 'final',
          completedStages: unique([...state.generation.completedStages, 'final']),
          outputs: {
            ...state.generation.outputs,
            final_post: action.finalPost,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-copy-feedback':
      return {
        ...state,
        copyFeedback: action.message,
      }
    case 'set-error':
      return {
        ...state,
        generation: {
          status: 'error',
          currentStage: action.stage,
          completedStages: [],
          outputs: {},
          statusMessage: 'error | 생성이 멈췄습니다. 브리프를 수정한 뒤 다시 시도하세요.',
          errorMessage: action.message,
        },
        copyFeedback: '',
      }
    default:
      return state
  }
}

function nextStageFor(stage: GenerationStageId | null, completedStages: GenerationStageId[]) {
  if (stage === null) {
    return workflowStages[0]
  }

  const currentIndex = stageOrder.indexOf(stage)
  const nextId = stageOrder[currentIndex + 1]
  if (!nextId) {
    return null
  }
  if (completedStages.includes(nextId) && nextId !== 'final') {
    const unfinished = workflowStages.find((item) => !completedStages.includes(item.id))
    return unfinished ?? null
  }
  return workflowStages.find((item) => item.id === nextId) ?? null
}

function stageTone(stageId: GenerationStageId, generation: GenerationState, selectedStage: GenerationStageId) {
  const isCurrent = generation.currentStage === stageId
  const isComplete = generation.completedStages.includes(stageId)
  const classes = ['stage-chip']
  if (isCurrent || (generation.status === 'initial' && stageId === 'research')) {
    classes.push('current')
  }
  if (isComplete) {
    classes.push('complete')
  }
  if (selectedStage === stageId) {
    classes.push('is-selected')
  }
  return classes.join(' ')
}

function stageStateLabel(stageId: GenerationStageId, generation: GenerationState) {
  if (generation.status === 'error' && generation.currentStage === stageId) {
    return '재입력 필요'
  }
  if (generation.completedStages.includes(stageId) || (generation.status === 'export-ready' && stageId === 'final')) {
    return '완료'
  }
  if (generation.currentStage === stageId) {
    return generation.status === 'loading' ? '진행 중' : '현재 단계'
  }
  if (generation.status === 'initial' && stageId === 'research') {
    return '시작 준비'
  }
  return '대기'
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const [selectedStage, setSelectedStage] = useState<GenerationStageId>('research')
  const timeoutRefs = useRef<number[]>([])

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  const selectedStageMeta =
    workflowStages.find((stage) => stage.id === selectedStage) ?? workflowStages[0]
  const nextStageMeta = nextStageFor(state.generation.currentStage, state.generation.completedStages)
  const finalPost = state.generation.outputs.final_post
  const finalCharacterCount = finalPost?.length ?? 0
  const completedCount = state.generation.completedStages.length
  const progressRatio = Math.max(completedCount, state.generation.status === 'initial' ? 0 : 1) / workflowStages.length
  const nextActionLabel =
    state.generation.status === 'loading'
      ? '현재 단계를 생성 중입니다.'
      : state.generation.status === 'export-ready'
        ? '최종 원고를 복사하고 공유 전 검토를 마무리합니다.'
        : state.generation.status === 'error'
          ? '토픽을 수정하고 다시 생성해 첫 단계부터 복구합니다.'
          : nextStageMeta
            ? `${nextStageMeta.label}로 자연스럽게 이어집니다.`
            : '브리프를 점검하고 생성 버튼으로 다시 시작합니다.'

  const liveRegionMessage = `${state.generation.status} | ${state.generation.statusMessage}${
    state.copyFeedback ? ` | ${state.copyFeedback}` : ''
  }`

  function schedulePause(ms: number) {
    return new Promise<void>((resolve) => {
      const timerId = window.setTimeout(() => {
        timeoutRefs.current = timeoutRefs.current.filter((item) => item !== timerId)
        resolve()
      }, ms)
      timeoutRefs.current.push(timerId)
    })
  }

  async function handleGenerate() {
    if (state.generation.status === 'loading') {
      return
    }

    const trimmedTopic = state.inputs.topic.trim()
    if (/^(fail|error)\b/i.test(trimmedTopic)) {
      dispatch({
        type: 'set-error',
        stage: 'research',
        message: '토픽이 fail 또는 error로 시작해 의도된 복구 경로를 실행했습니다. 주제를 수정하고 다시 시도하세요.',
      })
      setSelectedStage('research')
      return
    }

    const outputs = generatePipelineOutputs({
      ...state.inputs,
      topic: trimmedTopic || initialInputs.topic,
    })

    dispatch({
      type: 'start-run',
      message: 'loading | Research results를 준비하는 중입니다. 핵심 사실과 독자 관점을 먼저 고정합니다.',
    })
    setSelectedStage('research')
    await schedulePause(220)

    dispatch({
      type: 'set-stage-output',
      stage: 'research',
      nextStage: 'outline',
      key: 'research_summary',
      value: outputs.research_summary,
      status: 'loading',
      message: 'loading | Research results가 정리되었습니다. 이제 Outline으로 구조를 고정합니다.',
    })
    setSelectedStage('outline')
    await schedulePause(220)

    dispatch({
      type: 'set-stage-output',
      stage: 'outline',
      nextStage: 'drafts',
      key: 'outline',
      value: outputs.outline,
      status: 'loading',
      message: 'loading | Outline이 확정되었습니다. 이제 Section drafts를 채웁니다.',
    })
    setSelectedStage('drafts')
    await schedulePause(220)

    dispatch({
      type: 'set-stage-output',
      stage: 'drafts',
      nextStage: 'review',
      key: 'section_drafts',
      value: outputs.section_drafts,
      status: 'loading',
      message: 'loading | Section drafts가 채워졌습니다. 이제 Review notes로 밀도를 정리합니다.',
    })
    setSelectedStage('review')
    await schedulePause(220)

    dispatch({
      type: 'set-stage-output',
      stage: 'review',
      nextStage: 'final',
      key: 'review_notes',
      value: outputs.review_notes,
      status: 'review-complete',
      message: 'review-complete | Review notes를 반영했습니다. 최종 원고를 열어 export-ready 상태로 마무리합니다.',
    })
    setSelectedStage('final')
    await schedulePause(220)

    dispatch({
      type: 'finalize-run',
      finalPost: outputs.final_post,
      message: 'export-ready | Final post가 준비되었습니다. Copy markdown로 바로 전달 가능한 상태입니다.',
    })
  }

  async function handleCopyMarkdown() {
    if (!state.generation.outputs.final_post) {
      dispatch({
        type: 'set-copy-feedback',
        message: 'copy markdown locked | 먼저 최종 원고를 생성해야 복사할 수 있습니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(state.generation.outputs.final_post)
      dispatch({
        type: 'set-copy-feedback',
        message: 'copy markdown ready | 마크다운을 클립보드에 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: 'copy markdown fallback | 브라우저 권한 때문에 자동 복사가 실패했습니다. 아래 원고를 직접 복사하세요.',
      })
    }
  }

  function updateInput(
    field: keyof BlogGeneratorInputs,
    value: BlogGeneratorInputs[keyof BlogGeneratorInputs],
  ) {
    dispatch({ type: 'update-input', field, value })
  }

  function renderStageContent() {
    switch (selectedStage) {
      case 'research': {
        const research = state.generation.outputs.research_summary
        if (!research) {
          return <EmptyStage stageId="research" />
        }

        return (
          <>
            <article className="content-card">
              <p className="card-eyebrow">research focus</p>
              <h3>리서치 결과 요약</h3>
              <p>{research.angle}</p>
              <p>{research.thesis}</p>
              <p>{research.audienceFit}</p>
            </article>
            <article className="content-card">
              <p className="card-eyebrow">search plan</p>
              <h3>확인한 검색 포인트</h3>
              <ul className="stack-list">
                {research.searchTerms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
              <div className="tag-row">
                {research.references.map((reference) => (
                  <span key={reference} className="soft-tag">
                    {reference}
                  </span>
                ))}
              </div>
            </article>
          </>
        )
      }
      case 'outline': {
        const outline = state.generation.outputs.outline
        if (!outline) {
          return <EmptyStage stageId="outline" />
        }

        return (
          <article className="content-card">
            <p className="card-eyebrow">outline map</p>
            <h3>문단 흐름</h3>
            <ol className="outline-stack">
              {outline.map((section) => (
                <li key={section.id} className="content-card">
                  <h3>{section.title}</h3>
                  <p>{section.summary}</p>
                </li>
              ))}
            </ol>
          </article>
        )
      }
      case 'drafts': {
        const drafts = state.generation.outputs.section_drafts
        if (!drafts) {
          return <EmptyStage stageId="drafts" />
        }

        return drafts.map((draft) => (
          <article key={draft.id} className="content-card">
            <p className="card-eyebrow">draft block</p>
            <h3>{draft.title}</h3>
            {draft.body.map((paragraph, index) => (
              <p key={`${draft.id}-${index}`}>{paragraph}</p>
            ))}
            <p className="takeaway-line">{draft.takeaway}</p>
          </article>
        ))
      }
      case 'review': {
        const reviewNotes = state.generation.outputs.review_notes
        if (!reviewNotes) {
          return <EmptyStage stageId="review" />
        }

        return reviewNotes.map((note) => (
          <article key={note.label} className={`content-card review-${note.severity}`}>
            <div className="review-head">
              <h3>{note.label}</h3>
              <span>{note.severity}</span>
            </div>
            <p>{note.detail}</p>
          </article>
        ))
      }
      case 'final': {
        if (!finalPost) {
          return <EmptyStage stageId="final" />
        }

        return (
          <>
            <article className="content-card final-summary-card">
              <p className="card-eyebrow">final summary</p>
              <h3>최종 원고 점검</h3>
              <div className="tag-row">
                <span className="soft-tag">문자 수 {finalCharacterCount.toLocaleString()}</span>
                <span className="soft-tag">완료 단계 {completedCount} / 5</span>
                <span className="soft-tag">최종 단계 Final post</span>
              </div>
              <p>
                첫 폴드에서는 지금 바로 전달해야 할 최종 원고만 남기고, scorecard와 artifact는 아래
                evidence drawer로 격리했습니다.
              </p>
            </article>
            <article className="content-card final-panel">
              <p className="card-eyebrow">reader surface</p>
              <h3>최종 마크다운</h3>
              <pre className="markdown-preview">{finalPost}</pre>
            </article>
          </>
        )
      }
      default:
        return null
    }
  }

  return (
    <main className="app-shell">
      <div className="assistive-live" aria-live="polite">
        {liveRegionMessage}
      </div>

      <section className="workspace-hero">
        <div className="hero-copy">
          <p className="section-kicker">focused wizard</p>
          <h1>집중형 단일 작성 워크스페이스</h1>
          <p className="hero-lead">
            브리프, 현재 단계, 다음 행동만 첫 화면에 남기고 긴 원고와 평가 자료는 뒤로 밀어 둔
            single-owner writing flow입니다.
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-action"
            aria-label="Generate post"
            onClick={handleGenerate}
            disabled={state.generation.status === 'loading'}
          >
            <span className="button-copy-kr">원고 생성 시작</span>
            <span className="button-copy-hook">
              {state.generation.status === 'loading' ? 'Generating...' : 'Generate post'}
            </span>
          </button>
          <button
            type="button"
            className="secondary-action"
            aria-label="Copy markdown"
            onClick={handleCopyMarkdown}
            disabled={state.generation.status === 'loading'}
          >
            <span className="button-copy-kr">최종 원고 복사</span>
            <span className="button-copy-hook">Copy markdown</span>
          </button>
        </div>
      </section>

      <section className="workspace-frame">
        <aside className="brief-rail">
          <section className="rail-card rail-card-dark">
            <div className="status-row">
              <span className={`status-badge status-${state.generation.status}`}>
                {statusLabels[state.generation.status]}
              </span>
              {state.generation.status === 'loading' ? (
                <span className="loading-pulse" aria-hidden="true" />
              ) : (
                <span className="active-dot" aria-hidden="true" />
              )}
            </div>
            <p className="rail-label">current step</p>
            <h2>{selectedStageMeta.label}</h2>
            <p className="rail-hook">{selectedStageMeta.testHook}</p>
            <p className="rail-description">{stageFocusCopy[selectedStageMeta.id]}</p>
            <p className="status-detail">
              다음 행동: {nextActionLabel}
            </p>
            {state.generation.errorMessage ? (
              <p className="status-detail status-detail-soft">{state.generation.errorMessage}</p>
            ) : null}
            {state.copyFeedback ? <p className="status-detail status-detail-soft">{state.copyFeedback}</p> : null}
            <div className="progress-meta">
              <span>완료 단계 {completedCount} / 5</span>
              <span>{nextStageMeta ? `다음 ${nextStageMeta.label}` : '내보내기 또는 재시작'}</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${Math.max(progressRatio, 0.08) * 100}%` }} />
            </div>
          </section>

          <section className="rail-card">
            <div className="rail-section-head">
              <div>
                <p className="section-kicker">brief input</p>
                <h3>글 요청 설정</h3>
              </div>
              <p className="brief-inline">현재 브리프를 짧게 정리해 한 번에 끝까지 생성합니다.</p>
            </div>

            <form className="brief-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                <span>주제</span>
                <textarea
                  aria-label="Topic"
                  name="topic"
                  value={state.inputs.topic}
                  onChange={(event) => updateInput('topic', event.target.value)}
                />
              </label>

              <label>
                <span>독자 수준</span>
                <select
                  aria-label="Audience"
                  name="audience"
                  value={state.inputs.audience}
                  onChange={(event) => updateInput('audience', event.target.value as Audience)}
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>문체 톤</span>
                <select
                  aria-label="Tone"
                  name="tone"
                  value={state.inputs.tone}
                  onChange={(event) => updateInput('tone', event.target.value as Tone)}
                >
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>분량</span>
                <select
                  aria-label="Length"
                  name="length"
                  value={state.inputs.length}
                  onChange={(event) => updateInput('length', event.target.value as Length)}
                >
                  {lengthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </form>

            <details className="support-drawer">
              <summary>
                <strong>프리셋 제안</strong>
                <span>빠르게 브리프를 교체해 single-agent 흐름을 확인합니다.</span>
              </summary>
              <div className="preset-list">
                {topicPresets.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    className="preset-tile"
                    onClick={() => {
                      dispatch({ type: 'apply-preset', payload: preset })
                      setSelectedStage('research')
                    }}
                  >
                    <strong>{preset.title}</strong>
                    <span>{preset.rationale}</span>
                  </button>
                ))}
              </div>
            </details>
          </section>
        </aside>

        <section className="workspace-main">
          <div className="spotlight-row">
            <article className="spotlight-card spotlight-card-primary">
              <p className="spotlight-label">now</p>
              <strong>{selectedStageMeta.label}</strong>
              <span className="spotlight-hook">{selectedStageMeta.testHook}</span>
              <p>{stageFocusCopy[selectedStageMeta.id]}</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">next action</p>
              <strong>{nextStageMeta ? nextStageMeta.label : '복사 또는 재시작'}</strong>
              <p>{nextActionLabel}</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">reader gate</p>
              <strong>{finalCharacterCount > 0 ? `${finalCharacterCount.toLocaleString()}자 준비` : '리더 표면 잠금'}</strong>
              <p>
                {finalCharacterCount > 0
                  ? '최종 원고는 짧은 reader surface에만 노출하고 자세한 trace는 드로어로 분리했습니다.'
                  : 'Generate post 이후 Final post 단계가 열리면 reader surface가 자동으로 채워집니다.'}
              </p>
            </article>
          </div>

          <div className="stage-rail">
            {workflowStages.map((stage, index) => (
              <button
                key={stage.id}
                type="button"
                className={stageTone(stage.id, state.generation, selectedStage)}
                onClick={() => setSelectedStage(stage.id)}
              >
                <span className="stage-chip-index">{index + 1}</span>
                <span className="stage-chip-copy">
                  <strong>{stage.label}</strong>
                  <em>{stage.description}</em>
                </span>
                <span className="stage-chip-state">{stage.testHook}</span>
                <span className="stage-chip-state">{stageStateLabel(stage.id, state.generation)}</span>
              </button>
            ))}
          </div>

          <section className="workspace-panel">
            <div className="workspace-panel-head">
              <div>
                <p className="section-kicker">active panel</p>
                <h2>{selectedStageMeta.label}</h2>
              </div>
              <div className="panel-actions">
                <button
                  type="button"
                  className="inline-action"
                  aria-label="Generate post"
                  onClick={handleGenerate}
                  disabled={state.generation.status === 'loading'}
                >
                  생성 다시 실행
                </button>
                <button
                  type="button"
                  className="inline-action inline-action-ghost"
                  aria-label="Copy markdown"
                  onClick={handleCopyMarkdown}
                  disabled={state.generation.status === 'loading'}
                >
                  최종 원고 복사
                </button>
              </div>
            </div>
            <div className="workspace-panel-copy">
              <p>{stageFocusCopy[selectedStageMeta.id]}</p>
              <p>{nextActionLabel}</p>
            </div>
            <div className="stage-stack">{renderStageContent()}</div>
          </section>

          <details className="support-drawer evidence-drawer">
            <summary>
              <strong>지원 레이어 열기</strong>
              <span>run manifest, artifact, scorecard, review lens는 필요할 때만 펼칩니다.</span>
            </summary>
            <div className="evidence-grid">
              <article className="evidence-card">
                <p className="card-eyebrow">deliverables</p>
                <h3>필수 산출물</h3>
                {deliverables.map((item) => (
                  <div key={item.id} className="evidence-row">
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                ))}
              </article>

              <article className="evidence-card">
                <p className="card-eyebrow">run manifest</p>
                <h3>실행 메타데이터</h3>
                <div className="evidence-row">
                  <strong>run_id</strong>
                  <p>{previewManifest.run_id}</p>
                </div>
                <div className="evidence-row">
                  <strong>status</strong>
                  <p>{previewManifest.status}</p>
                </div>
                <div className="evidence-row">
                  <strong>version</strong>
                  <p>{previewManifest.task_spec_version}</p>
                </div>
              </article>

              <article className="evidence-card">
                <p className="card-eyebrow">artifact index</p>
                <h3>검증 경로</h3>
                <div className="evidence-row">
                  <strong>screenshots</strong>
                  <p>{previewArtifacts.screenshots.join(' · ')}</p>
                </div>
                <div className="evidence-row">
                  <strong>final_urls</strong>
                  <p>{previewArtifacts.final_urls.join(' · ')}</p>
                </div>
                <div className="evidence-row">
                  <strong>notes</strong>
                  <p>{previewArtifacts.notes.join(' ')}</p>
                </div>
              </article>

              <article className="evidence-card">
                <p className="card-eyebrow">scorecard</p>
                <h3>현재 품질 시그널</h3>
                <div className="evidence-row">
                  <strong>overall_score</strong>
                  <p>{previewScorecard.overall_score}</p>
                </div>
                <div className="evidence-row">
                  <strong>flow_clarity</strong>
                  <p>{previewScorecard.flow_clarity}</p>
                </div>
                <div className="evidence-row">
                  <strong>a11y_score</strong>
                  <p>{previewScorecard.a11y_score}</p>
                </div>
              </article>

              <article className="evidence-card">
                <p className="card-eyebrow">review lens</p>
                <h3>빠른 검토 체크</h3>
                <ul className="lens-list">
                  {reviewLenses.map((lens) => (
                    <li key={lens}>{lens}</li>
                  ))}
                </ul>
              </article>
            </div>
          </details>
        </section>
      </section>
    </main>
  )

  function EmptyStage({ stageId }: { stageId: GenerationStageId }) {
    return (
      <article
        className={`empty-block ${state.generation.status === 'error' && stageId === 'research' ? 'error-block' : ''}`}
        role={state.generation.status === 'error' && stageId === 'research' ? 'alert' : undefined}
      >
        <div>
          <strong>{emptyCopy[stageId].title}</strong>
          <p>{emptyCopy[stageId].body}</p>
        </div>
      </article>
    )
  }
}

export default App
