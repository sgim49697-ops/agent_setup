import { useReducer, useRef, useState } from 'react'
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
  Scorecard,
  Tone,
} from './contracts'
import {
  generateSpecialistOutput,
  getSpecialistProfile,
  routeTopic,
} from './generator'
import {
  deliverables,
  evaluationChecklist,
  reviewLenses,
  specialistProfiles,
  topicPresets,
  workflowStages,
} from './starterData'

type OutputKey = 'research_summary' | 'outline' | 'section_drafts' | 'review_notes' | 'voice_notes'
type FocusSurface = 'research' | 'outline' | 'drafts' | 'review'
type WizardScreen = 'brief' | 'progress' | 'final'

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
      type: 'set-routing'
      routingDecision: NonNullable<GenerationState['routingDecision']>
      message: string
    }
  | {
      type: 'set-output'
      stage: GenerationState['currentStage']
      key: OutputKey
      value: PipelineOutputs[OutputKey]
      message: string
      status: GenerationStatus
    }
  | {
      type: 'finalize-run'
      finalPost: string
      message: string
    }
  | { type: 'set-copy-feedback'; message: string }
  | { type: 'set-error'; message: string }

const stageTestIds: Record<GenerationStageId, string> = {
  research: 'stage-research',
  outline: 'stage-outline',
  drafts: 'stage-drafts',
  review: 'stage-review',
  final: 'stage-final',
}

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentStage: null,
  completedStages: [],
  routingDecision: null,
  chosenSpecialist: null,
  outputs: {},
  statusMessage: '브리프를 정리하면 라우터가 가장 적합한 스페셜리스트 경로를 고릅니다.',
  errorMessage: null,
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
                statusMessage: '브리프가 바뀌었습니다. 다시 생성하면 경로를 새로 계산합니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 이제 경로를 잠글 준비가 되었습니다.',
          errorMessage: null,
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
          routingDecision: null,
          chosenSpecialist: null,
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
      }
    case 'set-routing': {
      const chosenSpecialist = getSpecialistProfile(action.routingDecision.specialist)
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'research',
          routingDecision: action.routingDecision,
          chosenSpecialist,
          outputs: {
            ...state.generation.outputs,
            routing_decision: action.routingDecision,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    }
    case 'set-output': {
      const nextCompleted = action.stage
        ? unique([...state.generation.completedStages, action.stage])
        : state.generation.completedStages

      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentStage: action.stage,
          completedStages: nextCompleted,
          outputs: {
            ...state.generation.outputs,
            [action.key]: action.value,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
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
          currentStage: 'research',
          completedStages: [],
          routingDecision: null,
          chosenSpecialist: null,
          outputs: {},
          statusMessage: '라우팅이 중단되었습니다. 브리프를 조정한 뒤 다시 시도하세요.',
          errorMessage: action.message,
        },
        copyFeedback: '',
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusLabel(status: GenerationStatus) {
  const labels: Record<GenerationStatus, string> = {
    initial: '대기 중',
    loading: '경로 생성 중',
    populated: '초안 작성 중',
    'review-complete': '검토 정리 완료',
    'export-ready': '출고 준비 완료',
    error: '복구 필요',
  }
  return labels[status]
}

function statusHook(status: GenerationStatus) {
  const hooks: Record<GenerationStatus, string> = {
    initial: 'initial',
    loading: 'generating',
    populated: 'drafts-populated',
    'review-complete': 'review-complete',
    'export-ready': 'export-ready',
    error: 'error',
  }
  return hooks[status]
}

function surfaceFromStage(stage: GenerationStageId): FocusSurface {
  if (stage === 'outline') {
    return 'outline'
  }
  if (stage === 'drafts') {
    return 'drafts'
  }
  if (stage === 'review' || stage === 'final') {
    return 'review'
  }
  return 'research'
}

function stageStateLabel(isComplete: boolean, isCurrent: boolean) {
  if (isCurrent) {
    return '진행 중'
  }
  if (isComplete) {
    return '완료'
  }
  return '대기'
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const [manualSurface, setManualSurface] = useState<FocusSurface | null>(null)
  const [screen, setScreen] = useState<WizardScreen>('brief')
  const runRef = useRef(0)

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    setScreen('progress')
    setManualSurface(null)

    dispatch({
      type: 'start-run',
      message: '라우터가 주제를 분류하고 가장 설득력 있는 스페셜리스트 경로를 잠그는 중입니다.',
    })

    await sleep(260)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message: '이 브리프에서는 안정적인 경로를 만들지 못했습니다. 주제를 다듬은 뒤 다시 설계하세요.',
      })
      setScreen('brief')
      return
    }

    const routingDecision = routeTopic(state.inputs.topic)

    dispatch({
      type: 'set-routing',
      routingDecision,
      message: `${getSpecialistProfile(routingDecision.specialist).label} 경로를 ${(routingDecision.confidence * 100).toFixed(0)}% 신뢰도로 잠갔습니다.`,
    })

    await sleep(220)
    if (runRef.current !== runId) {
      return
    }

    const specialistOutput = generateSpecialistOutput(
      state.inputs,
      routingDecision,
      getSpecialistProfile(routingDecision.specialist),
    )

    dispatch({
      type: 'set-output',
      stage: 'research',
      key: 'research_summary',
      value: specialistOutput.researchSummary,
      status: 'loading',
      message: '리서치 방향을 확보했습니다. 이제 선택된 렌즈로 개요를 다듬습니다.',
    })

    await sleep(210)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-output',
      stage: 'outline',
      key: 'outline',
      value: specialistOutput.outline,
      status: 'loading',
      message: '개요가 잠겼습니다. 다음은 섹션 초안을 작성할 차례입니다.',
    })

    await sleep(210)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-output',
      stage: 'drafts',
      key: 'section_drafts',
      value: specialistOutput.sectionDrafts,
      status: 'populated',
      message: '섹션 초안이 채워졌습니다. 검토 메모를 정리해 최종 출고를 준비합니다.',
    })

    dispatch({
      type: 'set-output',
      stage: 'drafts',
      key: 'voice_notes',
      value: specialistOutput.voiceNotes,
      status: 'populated',
      message: '섹션 초안이 채워졌습니다. 검토 메모를 정리해 최종 출고를 준비합니다.',
    })

    await sleep(210)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-output',
      stage: 'review',
      key: 'review_notes',
      value: specialistOutput.reviewNotes,
      status: 'review-complete',
      message: '검토 메모가 정리되었습니다. 최종 포스트를 출고 상태로 묶는 중입니다.',
    })

    await sleep(210)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'finalize-run',
      finalPost: specialistOutput.finalPost,
      message: '라우팅 파이프라인이 끝났습니다. 최종 포스트와 복사 동선이 열렸습니다.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    setScreen('final')
  }

  async function copyMarkdown() {
    const payload = state.generation.outputs.final_post
    if (!payload) {
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 포스트가 준비되면 복사 버튼이 활성화됩니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 마크다운을 클립보드에 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '클립보드 복사는 실패했지만 아래 최종 포스트는 그대로 확인할 수 있습니다.',
      })
    }
  }

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({
      type: 'update-input',
      field,
      value,
    })
    setScreen('brief')
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({
      type: 'apply-preset',
      payload: { topic: title, audience, tone, length },
    })
    setScreen('brief')
  }

  function openStage(stageId: GenerationStageId) {
    if (stageId === 'final') {
      if (state.generation.outputs.final_post) {
        setScreen('final')
      }
      return
    }

    setManualSurface(surfaceFromStage(stageId))
    setScreen('progress')
  }

  const routingDecision = state.generation.routingDecision
  const chosenSpecialist = state.generation.chosenSpecialist
  const researchSummary = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline ?? []
  const sectionDrafts = state.generation.outputs.section_drafts ?? []
  const reviewNotes = state.generation.outputs.review_notes ?? []
  const voiceNotes = state.generation.outputs.voice_notes ?? []
  const finalPost = state.generation.outputs.final_post

  const canCopy = Boolean(finalPost)
  const routeMoment = !routingDecision
    ? '브리프를 읽고 잠금 가능한 경로를 찾는 중입니다.'
    : finalPost
      ? '선택된 경로가 출고 단계까지 도달했습니다.'
      : state.generation.currentStage === 'research'
        ? '선택된 렌즈로 리서치 방향을 고정하는 중입니다.'
        : state.generation.currentStage === 'outline'
          ? '선택된 렌즈로 개요를 잠그고 있습니다.'
          : state.generation.currentStage === 'drafts'
            ? '선택된 경로를 따라 섹션 초안을 확장하는 중입니다.'
            : '검토 메모로 경로를 정제해 출고 직전까지 밀어붙이고 있습니다.'
  const nextAction = !routingDecision
    ? '브리프를 확정한 뒤 경로 설계를 시작하세요.'
    : !researchSummary
      ? '리서치 방향이 고정될 때까지 현재 경로 잠금을 유지하세요.'
      : !outline.length
        ? '개요가 잠기면 구조 비교를 시작하세요.'
        : !sectionDrafts.length
          ? '초안이 모두 채워질 때까지 현재 경로를 유지하세요.'
          : !reviewNotes.length
            ? '검토 메모가 정리되면 최종 출고 화면으로 넘어갑니다.'
            : '최종 포스트를 읽고, 문제없으면 마크다운을 복사하세요.'
  const routeSignals = routingDecision?.matchedSignals.length
    ? routingDecision.matchedSignals
    : ['신호 부족', '안전한 분류 유지']
  const fallbackCopy =
    routingDecision?.fallbackReason ??
    (routingDecision
      ? '현재 경로의 신호가 충분히 강해 폴백은 대기 상태로 유지됩니다.'
      : '신호가 충돌하거나 약할 때만 폴백 경로를 활성화합니다.')

  const recommendedSurface: FocusSurface =
    finalPost || state.generation.currentStage === 'review'
      ? 'review'
      : state.generation.currentStage === 'drafts'
        ? 'drafts'
        : state.generation.currentStage === 'outline'
          ? 'outline'
          : 'research'

  const activeSurface =
    manualSurface === 'review' && !(finalPost || state.generation.currentStage === 'review')
      ? recommendedSurface
      : manualSurface === 'drafts' && state.generation.currentStage !== 'drafts'
        ? recommendedSurface
        : manualSurface === 'outline' && state.generation.currentStage !== 'outline'
          ? recommendedSurface
          : manualSurface ?? recommendedSurface

  const currentStageIndex = workflowStages.findIndex((stage) => stage.id === state.generation.currentStage)
  const progressPercent =
    state.generation.status === 'export-ready'
      ? 100
      : state.generation.status === 'initial' || state.generation.status === 'error'
        ? 8
        : Math.max(18, ((Math.max(currentStageIndex, 0) + 1) / workflowStages.length) * 100 - 4)

  const artifactPreview: ArtifactIndex = {
    screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
    final_urls: ['http://127.0.0.1:<dev-port>'],
    notes: ['라우팅 흔적 노출', '평가 체크리스트 준비 완료'],
    deliverables: deliverables.map((item) => item.title),
  }

  const scorePreview: Scorecard = {
    task_success: 8.8,
    ux_score: 8.4,
    flow_clarity: 8.7,
    visual_quality: 8.2,
    responsiveness: 8.5,
    a11y_score: 8.1,
    process_adherence: 9.1,
    overall_score: 8.6,
  }

  function renderSurfacePanel() {
    if (activeSurface === 'research') {
      if (chosenSpecialist && researchSummary) {
        return (
          <div className="surface-grid surface-grid-research">
            <article className="surface-card">
              <p className="surface-kicker">리서치 앵글</p>
              <h3>{researchSummary.thesis}</h3>
              <p>{researchSummary.angle}</p>
            </article>
            <article className="surface-card">
              <p className="surface-kicker">집중 포인트</p>
              <ul className="compact-list">
                {researchSummary.focusBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <p className="surface-footnote">{researchSummary.supportingLens}</p>
            </article>
            <article className="surface-card">
              <p className="surface-kicker">보이스 노트</p>
              <ul className="compact-list">
                {voiceNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          </div>
        )
      }
    }

    if (activeSurface === 'outline') {
      if (outline.length > 0) {
        return (
          <div className="surface-grid surface-grid-outline">
            {outline.map((section) => (
              <article key={section.id} className="surface-card outline-card">
                <p className="surface-kicker">섹션 구조</p>
                <h3>{section.title}</h3>
                <p>{section.goal}</p>
              </article>
            ))}
          </div>
        )
      }
    }

    if (activeSurface === 'drafts') {
      if (sectionDrafts.length > 0) {
        return (
          <div className="surface-grid surface-grid-drafts">
            {sectionDrafts.map((draft) => (
              <article key={draft.id} className="surface-card draft-card">
                <p className="surface-kicker">섹션 초안</p>
                <h3>{draft.title}</h3>
                <p>{draft.summary}</p>
                <ul className="compact-list">
                  {draft.paragraphs.map((paragraph) => (
                    <li key={paragraph}>{paragraph}</li>
                  ))}
                </ul>
                <p className="surface-footnote">{draft.takeaway}</p>
              </article>
            ))}
          </div>
        )
      }
    }

    if (activeSurface === 'review') {
      if (reviewNotes.length > 0) {
        return (
          <div className="surface-grid surface-grid-review">
            {reviewNotes.map((note) => (
              <article key={note.label} className={`surface-card review-card severity-${note.severity}`}>
                <p className="surface-kicker">검토 메모</p>
                <h3>{note.label}</h3>
                <p>{note.detail}</p>
              </article>
            ))}
          </div>
        )
      }
    }

    if (state.generation.status === 'loading') {
      return (
        <div className="loading-surface" aria-hidden="true">
          <div className="loading-card">
            <span className="skeleton-line skeleton-line-title" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line-short" />
          </div>
          <div className="loading-reveal">
            {workflowStages.map((stage) => {
              const isDone = state.generation.completedStages.includes(stage.id)
              const isCurrent = state.generation.currentStage === stage.id
              return (
                <div
                  key={stage.id}
                  className={`loading-step ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}
                >
                  <span className="loading-step-dot" />
                  <div>
                    <strong>{stage.label}</strong>
                    <p>{stageStateLabel(isDone, isCurrent)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">
          ↗
        </div>
        <h3>아직 열린 작업면이 없습니다</h3>
        <p>경로가 잠기면 현재 단계에 맞는 리서치, 구조, 초안, 검토 메모를 한 면씩 보여줍니다.</p>
      </div>
    )
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-block stagger-1">
          <p className="eyebrow">라우터 작업실</p>
          <h1>기술 지휘자</h1>
          <p className="brand-copy">
            한 번의 주제 입력을 가장 설득력 있는 스페셜리스트 경로로 잠그고, 출고까지의 흐름을
            세 화면으로 압축한 라우팅 작업실입니다.
          </p>
        </div>

        <div className="status-dock stagger-2" aria-live="polite">
          <span className={`status-chip status-${state.generation.status}`}>{statusLabel(state.generation.status)}</span>
          <div className="status-copy">
            <strong>{routeMoment}</strong>
            <p>{state.generation.statusMessage}</p>
            {state.copyFeedback ? <small>{state.copyFeedback}</small> : null}
            <span className="sr-only">{statusHook(state.generation.status)}</span>
          </div>
        </div>

        <div className="action-deck stagger-3">
          <button
            type="button"
            className={`action-button ${screen === 'brief' ? 'is-primary' : 'is-secondary'}`}
            disabled={state.generation.status === 'loading'}
            onClick={handleGenerate}
            aria-label="Generate post"
          >
            {state.generation.status === 'loading'
              ? '생성 중...'
              : screen === 'progress'
                ? '다시 경로 설계'
                : screen === 'final'
                  ? '다시 생성'
                  : '경로 설계 시작'}
          </button>

          {screen === 'progress' ? (
            <button
              type="button"
              className="action-button is-primary"
              disabled={!canCopy}
              onClick={() => setScreen('final')}
            >
              {canCopy ? '최종 초안 보기' : '최종 초안 준비 중'}
            </button>
          ) : (
            <button
              type="button"
              className={`action-button ${screen === 'final' ? 'is-primary' : 'is-secondary'}`}
              disabled={!canCopy}
              onClick={copyMarkdown}
              aria-label="Copy markdown"
            >
              마크다운 복사
            </button>
          )}
        </div>
      </header>

      <section className="wizard-shell">
        <div className="screen-rail stagger-4">
          <div className="screen-pills" role="tablist" aria-label="화면 흐름">
            <button
              type="button"
              className={`screen-pill ${screen === 'brief' ? 'is-active' : ''}`}
              onClick={() => setScreen('brief')}
            >
              브리프 설계
            </button>
            <button
              type="button"
              className={`screen-pill ${screen === 'progress' ? 'is-active' : ''}`}
              onClick={() => setScreen('progress')}
            >
              경로 진행
            </button>
            <button
              type="button"
              className={`screen-pill ${screen === 'final' ? 'is-active' : ''}`}
              onClick={() => {
                if (canCopy) {
                  setScreen('final')
                }
              }}
            >
              출고 준비
            </button>
          </div>

          <div className="progress-meter" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="stage-rail stagger-5">
          {workflowStages.map((stage) => {
            const isComplete = state.generation.completedStages.includes(stage.id)
            const isCurrent =
              (state.generation.currentStage === stage.id && state.generation.status !== 'error') ||
              (stage.id === 'final' && state.generation.status === 'export-ready')

            return (
              <button
                key={stage.id}
                type="button"
                data-testid={stageTestIds[stage.id]}
                className={`stage-button ${isComplete ? 'is-complete' : ''} ${isCurrent ? 'is-current' : ''}`}
                onClick={() => openStage(stage.id)}
              >
                <span className="stage-index">{String(workflowStages.indexOf(stage) + 1).padStart(2, '0')}</span>
                <span className="stage-copy">
                  <strong>{stage.label}</strong>
                  <small>{stageStateLabel(isComplete, isCurrent)}</small>
                </span>
                <span className="stage-mark" aria-hidden="true">
                  {isComplete ? (
                    <svg className="stage-check" viewBox="0 0 16 16" fill="none">
                      <path d="M3.5 8.4 6.5 11.4 12.5 4.8" />
                    </svg>
                  ) : (
                    <span className="stage-dot" />
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {screen === 'brief' ? (
          <section className="wizard-screen screen-grid screen-grid-brief">
            <article className="panel brief-panel stagger-1">
              <div className="section-head">
                <p className="eyebrow">화면 1</p>
                <h2>브리프 설계</h2>
              </div>

              <p className="lead">
                주제, 독자, 톤, 길이를 짧게 고정하면 라우터가 왜 이 경로를 선택했는지 설명 가능한
                상태로 잠급니다.
              </p>

              <form className="brief-form">
                <label className="ghost-field">
                  <span>주제</span>
                  <textarea
                    aria-label="Topic"
                    name="topic"
                    rows={5}
                    value={state.inputs.topic}
                    onChange={(event) => updateField('topic', event.target.value)}
                  />
                </label>

                <div className="brief-grid">
                  <label className="ghost-field">
                    <span>독자</span>
                    <select
                      aria-label="Audience"
                      name="audience"
                      value={state.inputs.audience}
                      onChange={(event) => updateField('audience', event.target.value as Audience)}
                    >
                      <option value="beginner">입문자</option>
                      <option value="practitioner">실무자</option>
                      <option value="advanced">고급 사용자</option>
                    </select>
                  </label>

                  <label className="ghost-field">
                    <span>톤</span>
                    <select
                      aria-label="Tone"
                      name="tone"
                      value={state.inputs.tone}
                      onChange={(event) => updateField('tone', event.target.value as Tone)}
                    >
                      <option value="clear">명료함</option>
                      <option value="pragmatic">실무형</option>
                      <option value="opinionated">강한 의견형</option>
                    </select>
                  </label>

                  <label className="ghost-field">
                    <span>길이</span>
                    <select
                      aria-label="Length"
                      name="length"
                      value={state.inputs.length}
                      onChange={(event) => updateField('length', event.target.value as Length)}
                    >
                      <option value="short">짧게</option>
                      <option value="medium">중간</option>
                      <option value="long">길게</option>
                    </select>
                  </label>
                </div>
              </form>

              <p className="panel-note">
                이 화면의 유일한 primary action은 상단의 <strong>경로 설계 시작</strong>입니다. 입력은
                짧게, 결정은 강하게.
              </p>

              {state.generation.errorMessage ? (
                <div className="error-panel is-active" role="alert">
                  <strong>복구가 필요합니다</strong>
                  <p>{state.generation.errorMessage}</p>
                </div>
              ) : null}
            </article>

            <aside className="panel signal-panel stagger-2">
              <div className={`signal-lock ${routingDecision ? 'is-locked' : 'is-idle'}`}>
                <div className="signal-orbit" />
                {specialistProfiles.map((profile, index) => {
                  const isSelected = routingDecision?.specialist === profile.id
                  const isFallback = profile.id === 'fallback'
                  return (
                    <span
                      key={profile.id}
                      className={`orbit-node orbit-node-${index} ${isSelected ? 'is-selected' : ''} ${isFallback ? 'is-fallback' : ''}`}
                    >
                      {profile.label.replace(' 스페셜리스트', '')}
                    </span>
                  )
                })}
                <div className="signal-core">
                  <p>{routingDecision ? '경로 잠금 완료' : '신호 대기'}</p>
                  <strong>{routingDecision ? `${(routingDecision.confidence * 100).toFixed(0)}%` : '준비'}</strong>
                  <span>{routingDecision ? chosenSpecialist?.label : '브리프가 잠기면 경로를 고릅니다.'}</span>
                </div>
              </div>

              <div className="empty-state signal-empty">
                <div className="empty-icon" aria-hidden="true">
                  ◌
                </div>
                <h3>아직 경로가 잠기지 않았습니다</h3>
                <p>
                  먼저 브리프를 정리한 뒤 상단 primary action을 눌러야 선택 경로, 폴백 경로,
                  신뢰도가 동시에 열립니다.
                </p>
              </div>

              <div className="preset-bank">
                <p className="eyebrow">빠른 브리프</p>
                <div className="preset-grid">
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
              </div>
            </aside>
          </section>
        ) : null}

        {screen === 'progress' ? (
          <section className="wizard-screen screen-grid screen-grid-progress">
            <article className="panel route-hero stagger-1">
              <div className="route-copy">
                <div className="section-head">
                  <p className="eyebrow">화면 2</p>
                  <h2>전문가 경로 진행</h2>
                </div>

                <p className="lead route-lead">
                  {routingDecision && chosenSpecialist
                    ? `${chosenSpecialist.label}가 현재 경로를 주도하고 있습니다. 선택 근거와 폴백 대기 상태를 한 화면에서만 요약합니다.`
                    : '브리프를 읽는 동안 라우터가 현재 경로와 폴백 대기를 정리합니다.'}
                </p>

                <div className="route-meta-grid">
                  <article className="metric-card">
                    <span>선택 경로</span>
                    <strong>{chosenSpecialist ? chosenSpecialist.label : '분석 중'}</strong>
                  </article>
                  <article className="metric-card">
                    <span>신뢰도</span>
                    <strong>{routingDecision ? `${(routingDecision.confidence * 100).toFixed(0)}%` : '계산 중'}</strong>
                  </article>
                  <article className="metric-card">
                    <span>폴백</span>
                    <strong>{routingDecision?.fallbackReason ? '대기 경로 유지' : '직행 가능'}</strong>
                  </article>
                </div>

                <p className="route-summary">
                  {routingDecision
                    ? routingDecision.reason
                    : '현재는 브리프를 읽고 어떤 렌즈가 가장 설득력 있는지 비교하는 중입니다.'}
                </p>

                <div className="token-row">
                  {routeSignals.map((signal) => (
                    <span key={signal}>{signal}</span>
                  ))}
                </div>
              </div>

              <div className={`signal-lock ${routingDecision ? 'is-locked' : 'is-idle'}`}>
                <div className="signal-orbit" />
                {specialistProfiles.map((profile, index) => {
                  const isSelected = routingDecision?.specialist === profile.id
                  const isFallback =
                    profile.id === 'fallback' && Boolean(routingDecision?.fallbackReason)

                  return (
                    <span
                      key={profile.id}
                      className={`orbit-node orbit-node-${index} ${isSelected ? 'is-selected' : ''} ${isFallback ? 'is-fallback-active' : ''}`}
                    >
                      {profile.label.replace(' 스페셜리스트', '')}
                    </span>
                  )
                })}
                <div className="signal-core">
                  <p>{state.generation.currentStage ? '현재 단계' : '신호 수집 중'}</p>
                  <strong>
                    {state.generation.currentStage
                      ? workflowStages.find((stage) => stage.id === state.generation.currentStage)?.label
                      : '대기'}
                  </strong>
                  <span>{nextAction}</span>
                </div>
              </div>
            </article>

            <aside className="panel route-sidebar stagger-2">
              <article className="sidebar-card">
                <p className="surface-kicker">현재 순간</p>
                <h3>{routeMoment}</h3>
                <p>{nextAction}</p>
              </article>

              <article className="sidebar-card">
                <p className="surface-kicker">복구 및 폴백</p>
                <h3>경로가 흔들려도 이탈하지 않습니다</h3>
                <p>{fallbackCopy}</p>
              </article>

              <article className="sidebar-card">
                <p className="surface-kicker">출고 조건</p>
                <h3>{canCopy ? '최종 초안이 준비되었습니다' : '최종 초안이 준비되면 바로 이동합니다'}</h3>
                <p>
                  이 화면의 유일한 primary action은 상단의{' '}
                  <strong>{canCopy ? '최종 초안 보기' : '최종 초안 준비 중'}</strong>입니다.
                </p>
              </article>
            </aside>

            <article className="panel surface-panel stagger-3">
              <div className="surface-head">
                <div>
                  <p className="eyebrow">단계별 작업면</p>
                  <h2>한 번에 하나의 산출물만 전면에 놓습니다</h2>
                </div>
                <div className="surface-tabs" role="tablist" aria-label="Routed workspace">
                  {(['research', 'outline', 'drafts', 'review'] as FocusSurface[]).map((surface) => {
                    const labels: Record<FocusSurface, string> = {
                      research: '리서치',
                      outline: '개요',
                      drafts: '초안',
                      review: '검토',
                    }
                    return (
                      <button
                        key={surface}
                        type="button"
                        className={`surface-tab ${activeSurface === surface ? 'is-active' : ''}`}
                        role="tab"
                        aria-selected={activeSurface === surface}
                        onClick={() => setManualSurface(surface)}
                      >
                        {labels[surface]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {renderSurfacePanel()}
            </article>
          </section>
        ) : null}

        {screen === 'final' ? (
          <section className="wizard-screen screen-grid screen-grid-final">
            <article className="panel final-panel stagger-1">
              <div className="surface-head">
                <div>
                  <p className="eyebrow">화면 3</p>
                  <h2>출고 준비</h2>
                </div>
                <div className="final-badges">
                  <span className="route-pill">경로 고정</span>
                  <span className="route-pill route-pill-soft">복사 가능</span>
                </div>
              </div>

              {finalPost ? (
                <pre className="markdown-preview">{finalPost}</pre>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">
                    ✓
                  </div>
                  <h3>최종 포스트를 준비 중입니다</h3>
                  <p>검토 메모가 모두 정리되면 이 화면에 최종 마크다운이 펼쳐집니다.</p>
                </div>
              )}
            </article>

            <aside className="panel export-panel stagger-2">
              <article className="sidebar-card">
                <p className="surface-kicker">출고 메모</p>
                <h3>복사 전에 마지막으로 확인하세요</h3>
                <ul className="compact-list">
                  <li>선택 경로: {chosenSpecialist ? chosenSpecialist.label : '미정'}</li>
                  <li>신뢰도: {routingDecision ? `${(routingDecision.confidence * 100).toFixed(0)}%` : '미정'}</li>
                  <li>폴백 상태: {routingDecision?.fallbackReason ? '설명 가능' : '대기 유지'}</li>
                </ul>
              </article>

              <article className="sidebar-card">
                <p className="surface-kicker">검토 메모 요약</p>
                <div className="review-mini-stack">
                  {reviewNotes.slice(0, 3).map((note) => (
                    <div key={note.label} className={`review-mini severity-${note.severity}`}>
                      <strong>{note.label}</strong>
                      <p>{note.detail}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="sidebar-card">
                <p className="surface-kicker">다음 행동</p>
                <h3>{nextAction}</h3>
                <p>
                  이 화면의 유일한 primary action은 상단의 <strong>마크다운 복사</strong>입니다.
                </p>
              </article>
            </aside>
          </section>
        ) : null}
      </section>

      <details className="panel evidence-drawer">
        <summary className="drawer-summary">
          <span>증거 및 평가 레이어</span>
          <div>
            <strong>기본 사용자 흐름을 보존한 뒤에만 열리는 보조 레이어입니다.</strong>
            <p>산출물 계약, 평가 체크리스트, 검토 렌즈는 모두 여기로 밀어냅니다.</p>
          </div>
        </summary>

        <div className="utility-grid">
          <div className="artifact-list">
            {deliverables.map((item) => (
              <article key={item.id} className="surface-card artifact-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>

          <article className="surface-card">
            <h3>평가 체크리스트</h3>
            <ul className="compact-list">
              {evaluationChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="surface-card">
            <h3>검토 렌즈</h3>
            <ul className="compact-list">
              {reviewLenses.map((lens) => (
                <li key={lens}>{lens}</li>
              ))}
            </ul>
          </article>

          <article className="surface-card">
            <h3>아티팩트 미리보기</h3>
            <pre className="contract-preview">{JSON.stringify(artifactPreview, null, 2)}</pre>
          </article>

          <article className="surface-card">
            <h3>스코어카드 미리보기</h3>
            <pre className="contract-preview">{JSON.stringify(scorePreview, null, 2)}</pre>
          </article>
        </div>
      </details>
    </main>
  )
}

export default App
