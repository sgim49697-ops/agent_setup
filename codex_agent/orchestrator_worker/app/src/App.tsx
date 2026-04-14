import { useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationState,
  GenerationStatus,
  Length,
  PipelineOutputs,
  ReviewNote,
  Tone,
  WorkerId,
  WorkerOutput,
  WorkerStatus,
} from './contracts'
import {
  assembleFinalOutputs,
  buildContentWorkerBundle,
  buildFinalPost,
  buildIntegrationReview,
  buildOrchestratorPlan,
  buildStateWorkerOutput,
  buildUiWorkerOutput,
} from './generator'
import {
  deliverables,
  evaluationChecklist,
  reviewLenses,
  topicPresets,
  workerProfiles,
  workflowStages,
} from './starterData'

type ScreenId = 'brief' | 'board' | 'result'
type MotionDirection = 'forward' | 'backward'

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
      type: 'set-plan'
      plan: NonNullable<GenerationState['orchestratorPlan']>
      message: string
    }
  | { type: 'set-worker-working'; workerId: WorkerId; message: string }
  | { type: 'set-worker-output'; workerOutput: WorkerOutput; message: string }
  | {
      type: 'set-output'
      stage: GenerationState['currentStage']
      key: keyof Omit<PipelineOutputs, 'orchestrator_plan' | 'worker_outputs' | 'integration_review'>
      value:
        | PipelineOutputs['research_summary']
        | PipelineOutputs['outline']
        | PipelineOutputs['section_drafts']
        | PipelineOutputs['review_notes']
        | PipelineOutputs['final_post']
      status: GenerationStatus
      message: string
    }
  | {
      type: 'set-integration-review'
      review: PipelineOutputs['integration_review']
      message: string
    }
  | {
      type: 'finalize-run'
      finalOutputs: PipelineOutputs
      message: string
    }
  | { type: 'set-copy-feedback'; message: string }
  | { type: 'set-error'; message: string }

const screenOrder: ScreenId[] = ['brief', 'board', 'result']

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

function emptyWorkerStatuses() {
  return {
    ui_worker: 'pending',
    state_worker: 'pending',
    content_worker: 'pending',
  } as GenerationState['workerStatuses']
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentStage: null,
  completedStages: [],
  workerStatuses: emptyWorkerStatuses(),
  orchestratorPlan: null,
  outputs: {},
  statusMessage: '오케스트레이터가 브리프를 기다리고 있습니다. 시작 버튼으로 분해를 잠그면 워커 지휘 보드가 열립니다.',
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
                statusMessage: '브리프를 업데이트했습니다. 다시 시작하면 오케스트레이터가 새 분해 기준으로 지휘를 재개합니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 이제 오케스트레이터가 워커 번들을 잠글 수 있습니다.',
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
          workerStatuses: emptyWorkerStatuses(),
          orchestratorPlan: null,
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
      }
    case 'set-plan':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'outline',
          completedStages: unique([...state.generation.completedStages, 'research']),
          orchestratorPlan: action.plan,
          outputs: {
            ...state.generation.outputs,
            orchestrator_plan: action.plan,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-worker-working':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'drafts',
          workerStatuses: {
            ...state.generation.workerStatuses,
            [action.workerId]: 'working',
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-worker-output': {
      const outputs = [...(state.generation.outputs.worker_outputs ?? []), action.workerOutput]
        .filter(
          (value, index, list) => list.findIndex((item) => item.workerId === value.workerId) === index,
        )
        .sort((left, right) => left.workerId.localeCompare(right.workerId))

      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'drafts',
          workerStatuses: {
            ...state.generation.workerStatuses,
            [action.workerOutput.workerId]: 'complete',
          },
          outputs: {
            ...state.generation.outputs,
            worker_outputs: outputs,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    }
    case 'set-output':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentStage: action.stage,
          completedStages: action.stage
            ? unique([...state.generation.completedStages, action.stage])
            : state.generation.completedStages,
          outputs: {
            ...state.generation.outputs,
            [action.key]: action.value,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-integration-review':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'review-complete',
          currentStage: 'review',
          completedStages: unique([...state.generation.completedStages, 'review']),
          outputs: {
            ...state.generation.outputs,
            integration_review: action.review,
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
          outputs: action.finalOutputs,
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
          workerStatuses: emptyWorkerStatuses(),
          orchestratorPlan: null,
          outputs: {},
          statusMessage: '워커 소유 범위를 잠그기 전에 계획이 멈췄습니다.',
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
    loading: '지휘 중',
    populated: '초안 준비됨',
    'review-complete': '리뷰 완료',
    'export-ready': '릴리스 준비 완료',
    error: '복구 필요',
  }
  return labels[status]
}

function workerStatusLabel(status: WorkerStatus) {
  const labels: Record<WorkerStatus, string> = {
    pending: '대기',
    working: '진행 중',
    complete: '전달 완료',
    error: '오류',
  }
  return labels[status]
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const runRef = useRef(0)
  const [activeScreen, setActiveScreen] = useState<ScreenId>('brief')
  const [motionDirection, setMotionDirection] = useState<MotionDirection>('forward')
  const [screenKey, setScreenKey] = useState(0)

  function navigateScreen(nextScreen: ScreenId) {
    if (nextScreen === activeScreen) {
      return
    }

    const currentIndex = screenOrder.indexOf(activeScreen)
    const nextIndex = screenOrder.indexOf(nextScreen)

    setMotionDirection(nextIndex > currentIndex ? 'forward' : 'backward')
    setScreenKey((value) => value + 1)
    setActiveScreen(nextScreen)
  }

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    navigateScreen('board')

    dispatch({
      type: 'start-run',
      message: '오케스트레이터가 제품을 워커 번들과 통합 체크포인트로 분해하고 있습니다.',
    })

    await sleep(240)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message: '계획 단계에서 유효한 분해안을 만들지 못했습니다. 주제를 다듬은 뒤 다시 시작하세요.',
      })
      return
    }

    const plan = buildOrchestratorPlan(state.inputs)
    dispatch({
      type: 'set-plan',
      plan,
      message: '오케스트레이터 계획이 확정되었습니다. 이제 워커 소유 범위와 통합 체크리스트가 보드에 나타납니다.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'ui_worker',
      message: '화면 워커가 첫 화면 밀도와 상태 문구를 정리하고 있습니다.',
    })
    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    const uiWorkerOutput = buildUiWorkerOutput(state.inputs, plan)
    dispatch({
      type: 'set-worker-output',
      workerOutput: uiWorkerOutput,
      message: '화면 워커가 구조 제안을 전달했습니다. 다음은 상태 계약을 맞추는 순서입니다.',
    })

    await sleep(140)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'state_worker',
      message: '상태 워커가 진행률, 완료 조건, 복구 경로를 고정하고 있습니다.',
    })
    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    const stateWorkerOutput = buildStateWorkerOutput(state.inputs)
    dispatch({
      type: 'set-worker-output',
      workerOutput: stateWorkerOutput,
      message: '상태 워커가 전이 계약을 마쳤습니다. 이제 콘텐츠 워커가 글의 골격을 완성합니다.',
    })

    await sleep(140)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'content_worker',
      message: '콘텐츠 워커가 리서치, 아웃라인, 초안, 리뷰 메모를 생성하고 있습니다.',
    })
    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    const contentBundle = buildContentWorkerBundle(state.inputs)
    dispatch({
      type: 'set-worker-output',
      workerOutput: contentBundle.workerOutput,
      message: '콘텐츠 워커가 글의 뼈대를 완성했습니다. 이제 통합 데스크가 한 편의 글로 묶습니다.',
    })

    dispatch({
      type: 'set-output',
      stage: 'research',
      key: 'research_summary',
      value: contentBundle.researchSummary,
      status: 'loading',
      message: '리서치 핵심이 고정되었습니다. 다음은 아웃라인과 작업 분해를 정렬하는 단계입니다.',
    })

    await sleep(150)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-output',
      stage: 'outline',
      key: 'outline',
      value: contentBundle.outline,
      status: 'loading',
      message: '아웃라인이 연결되었습니다. 이제 워커 보드에 초안과 핸드오프를 공개합니다.',
    })

    await sleep(150)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-output',
      stage: 'drafts',
      key: 'section_drafts',
      value: contentBundle.sectionDrafts,
      status: 'populated',
      message: '워커 산출물과 초안이 채워졌습니다. 이제 통합 리뷰로 넘어갑니다.',
    })

    await sleep(150)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-output',
      stage: 'review',
      key: 'review_notes',
      value: contentBundle.reviewNotes,
      status: 'review-complete',
      message: '리뷰 메모가 준비되었습니다. 통합 데스크가 레이아웃과 상태를 최종 조율하고 있습니다.',
    })

    const integrationReview = buildIntegrationReview(state.inputs)
    dispatch({
      type: 'set-integration-review',
      review: integrationReview,
      message: '통합 리뷰가 끝났습니다. 이제 한 편의 릴리스 후보로 조립합니다.',
    })

    await sleep(150)
    if (runRef.current !== runId) {
      return
    }

    const finalPost = buildFinalPost(state.inputs, contentBundle.rawFinalPost, integrationReview)
    const finalOutputs = assembleFinalOutputs(
      plan,
      [uiWorkerOutput, stateWorkerOutput, contentBundle.workerOutput],
      contentBundle.researchSummary,
      contentBundle.outline,
      contentBundle.sectionDrafts,
      contentBundle.reviewNotes,
      finalPost,
      integrationReview,
    )

    dispatch({
      type: 'finalize-run',
      finalOutputs,
      message: '오케스트레이터 파이프라인이 완료되었습니다. 결과 화면에서 최종 글을 읽고 내보낼 수 있습니다.',
    })
  }

  async function copyMarkdown() {
    const payload = state.generation.outputs.final_post
    if (!payload) {
      dispatch({
        type: 'set-copy-feedback',
        message: '먼저 결과 화면까지 진행하세요. 내보내기는 최종 글이 준비된 뒤에만 열립니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 마크다운을 클립보드로 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '클립보드 복사는 실패했지만, 아래 결과 화면에서 내용을 그대로 확인할 수 있습니다.',
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
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({
      type: 'apply-preset',
      payload: { topic: title, audience, tone, length },
    })
  }

  function recoverBriefFromError() {
    const recoveredTopic = state.inputs.topic.replace(/^\s*(fail|error)\b[:\-\s]*/i, '').trim()
    updateField('topic', recoveredTopic || '문제를 다시 정의한 브리프를 여기에 적어 주세요.')
    navigateScreen('brief')
    dispatch({
      type: 'set-copy-feedback',
      message: '브리프를 복구했습니다. 주제를 다듬은 뒤 다시 오케스트레이션을 시작하세요.',
    })
  }

  const plan = state.generation.orchestratorPlan
  const workerOutputs = state.generation.outputs.worker_outputs ?? []
  const reviewNotes = state.generation.outputs.review_notes as ReviewNote[] | undefined
  const sectionDrafts = state.generation.outputs.section_drafts ?? []
  const outline = state.generation.outputs.outline ?? []
  const researchSummary = state.generation.outputs.research_summary
  const integrationReview = state.generation.outputs.integration_review
  const finalPost = state.generation.outputs.final_post
  const canCopy = Boolean(finalPost)
  const boardEnabled = state.generation.status !== 'initial'
  const resultEnabled = canCopy
  const completedWorkerCount = workerOutputs.length
  const currentMoment = !plan
    ? '오케스트레이터가 아직 워커 소유 범위를 잠그지 않았습니다.'
    : completedWorkerCount < workerProfiles.length
      ? `${completedWorkerCount}/${workerProfiles.length}개 워커가 산출물을 전달했습니다. 남은 소유 범위를 수집하는 중입니다.`
      : !integrationReview
        ? '모든 워커 산출물이 도착했습니다. 통합 데스크가 하나의 경험으로 맞추는 중입니다.'
        : finalPost
          ? '통합이 완료되었습니다. 결과 화면에서 읽고 내보내면 됩니다.'
          : '통합 리뷰는 끝났고 최종 조립만 남았습니다.'
  const nextAction = !plan
    ? '브리프 화면에서 오케스트레이션을 시작하세요.'
    : completedWorkerCount < workerProfiles.length
      ? '지휘 보드에서 남은 워커의 핸드오프를 기다리세요.'
      : !integrationReview
        ? '통합 체크포인트를 검토하며 지휘 보드를 유지하세요.'
        : !finalPost
          ? '결과 화면으로 넘어갈 준비를 하세요.'
          : '결과 화면에서 글을 읽고 마크다운을 복사하세요.'
  const checkpointLabel = !plan
    ? '브리프 대기'
    : completedWorkerCount < workerProfiles.length
      ? '워커 전달 수집 중'
      : !integrationReview
        ? '통합 체크포인트'
        : finalPost
          ? '릴리스 후보 준비 완료'
          : '최종 조립 진행 중'
  const activeWorker =
    workerProfiles.find((profile) => state.generation.workerStatuses[profile.id] === 'working') ??
    workerProfiles.find((profile) => state.generation.workerStatuses[profile.id] === 'pending') ??
    null
  const stageIndex = state.generation.currentStage
    ? workflowStages.findIndex((stage) => stage.id === state.generation.currentStage)
    : -1
  const inFlightWeight =
    state.generation.status === 'loading' && stageIndex >= 0 && !state.generation.completedStages.includes(workflowStages[stageIndex].id)
      ? 0.55
      : 0
  const progressPercent = finalPost
    ? 100
    : Math.max(
        plan ? 18 : 0,
        Math.round(((state.generation.completedStages.length + inFlightWeight) / workflowStages.length) * 100),
      )
  const boardPrimaryLabel =
    state.generation.status === 'error'
      ? '브리프로 돌아가기'
      : finalPost
        ? '결과 화면으로 이동'
        : '최종 조립 대기 중'

  return (
    <main className="workspace-shell">
      <aside className="command-rail">
        <div className="rail-brand entrance-item" style={{ animationDelay: '0ms' }}>
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">오케스트레이터 워커</p>
            <h1>기술 지휘자</h1>
          </div>
        </div>

        <nav className="screen-nav" aria-label="화면 이동">
          <button
            type="button"
            className={`screen-nav-button ${activeScreen === 'brief' ? 'is-active' : ''}`}
            aria-current={activeScreen === 'brief' ? 'page' : undefined}
            onClick={() => navigateScreen('brief')}
          >
            <span className="screen-nav-step">01</span>
            <span className="screen-nav-copy">
              <strong>브리프</strong>
              <small>입력과 분해 기준</small>
            </span>
          </button>
          <button
            type="button"
            className={`screen-nav-button ${activeScreen === 'board' ? 'is-active' : ''}`}
            aria-current={activeScreen === 'board' ? 'page' : undefined}
            disabled={!boardEnabled}
            onClick={() => navigateScreen('board')}
          >
            <span className="screen-nav-step">02</span>
            <span className="screen-nav-copy">
              <strong>지휘 보드</strong>
              <small>워커 흐름과 통합 압력</small>
            </span>
          </button>
          <button
            type="button"
            className={`screen-nav-button ${activeScreen === 'result' ? 'is-active' : ''}`}
            aria-current={activeScreen === 'result' ? 'page' : undefined}
            disabled={!resultEnabled}
            onClick={() => navigateScreen('result')}
          >
            <span className="screen-nav-step">03</span>
            <span className="screen-nav-copy">
              <strong>결과 화면</strong>
              <small>릴리스 후보와 내보내기</small>
            </span>
          </button>
        </nav>

        <article className="rail-status entrance-item" style={{ animationDelay: '80ms' }}>
          <p className="eyebrow">현재 지점</p>
          <h2>{checkpointLabel}</h2>
          <p>{currentMoment}</p>
          <div className="rail-status-bar" aria-hidden="true">
            <span className="rail-status-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="rail-status-meta">
            <span>{progressPercent}%</span>
            <span>{statusLabel(state.generation.status)}</span>
          </div>
        </article>

        <article className="rail-note-card entrance-item" style={{ animationDelay: '140ms' }}>
          <p className="eyebrow">핵심 메모</p>
          <p>
            첫 화면은 브리프와 다음 행동만 보여주고, 리서치와 증거는 지휘 보드와 결과 화면의
            보조 레이어로 보냅니다.
          </p>
        </article>
      </aside>

      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">상태 피드</p>
            <h2>{statusLabel(state.generation.status)}</h2>
          </div>
          <div className="header-status" aria-live="polite">
            <span className="sr-only" aria-hidden="true">
              Generation status: {state.generation.status}
            </span>
            <p>{state.generation.statusMessage}</p>
            {state.copyFeedback ? <small>{state.copyFeedback}</small> : null}
          </div>
        </header>

        <section className="screen-shell">
          <article
            key={`${activeScreen}-${screenKey}`}
            className={`screen-panel direction-${motionDirection} screen-${activeScreen} ${
              state.generation.status === 'error' ? 'has-error' : ''
            }`}
          >
            {activeScreen === 'brief' ? (
              <div className="screen-grid brief-grid">
                <section className="hero-surface entrance-item" style={{ animationDelay: '0ms' }}>
                  <p className="eyebrow">브리프 스테이지</p>
                  <h3>세 명의 워커로 끊고, 한 편의 글로 다시 모읍니다.</h3>
                  <p className="lead-copy">
                    이 화면은 주제와 톤을 정하는 자리입니다. 시작 버튼을 누르면 오케스트레이터가
                    분해 기준을 잠그고, 지휘 보드에서 워커 전달 흐름을 순차적으로 보여줍니다.
                  </p>
                  <div className="hero-chip-row">
                    <span className="hero-chip">한국어 우선 카피</span>
                    <span className="hero-chip">3-스크린 플로우</span>
                    <span className="hero-chip">복구 가능한 오류 상태</span>
                  </div>
                  <div className="hero-metric-band">
                    <article>
                      <strong>01</strong>
                      <span>브리프 입력</span>
                    </article>
                    <article>
                      <strong>02</strong>
                      <span>워커 지휘</span>
                    </article>
                    <article>
                      <strong>03</strong>
                      <span>결과 내보내기</span>
                    </article>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    data-testid="generate-post"
                    aria-label="Generate post"
                    disabled={state.generation.status === 'loading'}
                    onClick={handleGenerate}
                  >
                    {state.generation.status === 'loading' ? '지휘 시작 중' : '오케스트레이션 시작'}
                  </button>
                  <p className="action-caption">{nextAction}</p>
                  {state.generation.errorMessage ? (
                    <div className="error-banner" role="alert">
                      <strong>복구 필요</strong>
                      <p>{state.generation.errorMessage}</p>
                      <div className="error-banner-actions">
                        <button type="button" className="ghost-link" onClick={recoverBriefFromError}>
                          브리프 정리하기
                        </button>
                        <small>실패 접두사를 걷어내고 같은 화면에서 다시 시작할 수 있습니다.</small>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="brief-surface entrance-item" style={{ animationDelay: '60ms' }}>
                  <div className="section-heading">
                    <p className="eyebrow">지휘 입력</p>
                    <h3>짧고 선명한 브리프</h3>
                    <p>입력 노드는 ghost underline 패턴으로 유지해 내용 자체가 먼저 보이게 합니다.</p>
                  </div>
                  <form className="brief-form">
                    <label className="field-shell field-shell-wide">
                      <span className="field-label">주제</span>
                      <textarea
                        aria-label="Topic"
                        data-testid="topic-input"
                        name="topic"
                        placeholder=" "
                        rows={4}
                        value={state.inputs.topic}
                        onChange={(event) => updateField('topic', event.target.value)}
                      />
                      <small>오케스트레이터가 분해 기준을 정할 한 줄 문제를 적습니다.</small>
                    </label>
                    <label className="field-shell">
                      <span className="field-label">독자층</span>
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
                      <small>설명 밀도와 용어 난도를 결정합니다.</small>
                    </label>
                    <label className="field-shell">
                      <span className="field-label">톤</span>
                      <select
                        aria-label="Tone"
                        name="tone"
                        value={state.inputs.tone}
                        onChange={(event) => updateField('tone', event.target.value as Tone)}
                      >
                        <option value="clear">명료함</option>
                        <option value="pragmatic">실무형</option>
                        <option value="opinionated">주장형</option>
                      </select>
                      <small>화면 문구와 결론의 강도를 결정합니다.</small>
                    </label>
                    <label className="field-shell">
                      <span className="field-label">분량</span>
                      <select
                        aria-label="Length"
                        name="length"
                        value={state.inputs.length}
                        onChange={(event) => updateField('length', event.target.value as Length)}
                      >
                        <option value="short">짧게</option>
                        <option value="medium">보통</option>
                        <option value="long">길게</option>
                      </select>
                      <small>워커가 생성할 섹션 수와 리듬을 조절합니다.</small>
                    </label>
                  </form>

                  <details className="drawer-card preset-drawer">
                    <summary>
                      <div>
                        <strong>빠른 시작 프리셋</strong>
                        <p>브리프를 빠르게 맞추고 싶을 때만 여는 보조 레이어입니다.</p>
                      </div>
                      <span className="summary-pill">선택형</span>
                    </summary>
                    <div className="preset-grid">
                      {topicPresets.map((preset, index) => (
                        <button
                          key={preset.title}
                          type="button"
                          className="preset-card"
                          onClick={() => applyPreset(preset.title, preset.audience, preset.tone, preset.length)}
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <strong>{preset.title}</strong>
                          <span>{preset.rationale}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                </section>

                <section className="story-surface entrance-item" style={{ animationDelay: '120ms' }}>
                  <div className="section-heading">
                    <p className="eyebrow">흐름 미리보기</p>
                    <h3>한 화면에 한 가지 압력만 남깁니다</h3>
                  </div>
                  <div className="story-track">
                    {[
                      '브리프에서 분해 기준을 잠근다',
                      '지휘 보드에서 워커 전달을 본다',
                      '결과 화면에서 최종 글만 읽고 복사한다',
                    ].map((item, index) => (
                      <article
                        key={item}
                        className="story-card"
                        style={{ animationDelay: `${index * 60}ms` }}
                      >
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <p>{item}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeScreen === 'board' ? (
              <div className="screen-grid board-grid">
                <section className="route-surface entrance-item" style={{ animationDelay: '0ms' }}>
                  <div className="route-header">
                    <div className="section-heading compact">
                      <p className="eyebrow">지휘 보드</p>
                      <h3>{checkpointLabel}</h3>
                      <p>{currentMoment}</p>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={state.generation.status !== 'error' && !finalPost}
                      onClick={() =>
                        state.generation.status === 'error' ? navigateScreen('brief') : navigateScreen('result')
                      }
                    >
                      {boardPrimaryLabel}
                    </button>
                  </div>

                  <div className="route-progress">
                    <div className="route-progress-meta">
                      <span>지휘 진행률</span>
                      <strong>{progressPercent}%</strong>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>

                  <div className="stage-strip">
                    {workflowStages.map((stage, index) => {
                      const isComplete = state.generation.completedStages.includes(stage.id)
                      const isCurrent =
                        state.generation.currentStage === stage.id && state.generation.status !== 'error'
                      const isDormant = !isCurrent && !isComplete
                      return (
                        <article
                          key={stage.id}
                          className={`stage-pill ${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''} ${
                            isDormant ? 'is-dormant' : ''
                          }`}
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <span className="stage-pill-index">{String(index + 1).padStart(2, '0')}</span>
                          <div className="stage-pill-copy">
                            <strong>{stage.label}</strong>
                            <p>{stage.description}</p>
                          </div>
                          <svg className="stage-checkmark" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6.5 12.5 10.25 16.25 18 8.5" />
                          </svg>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="worker-surface entrance-item" style={{ animationDelay: '60ms' }}>
                  <div className="section-heading">
                    <p className="eyebrow">워커 전달 보드</p>
                    <h3>현재 필요한 워커만 밝히고 나머지는 뒤로 눕힙니다</h3>
                    <p>각 카드에는 상태, 소유 범위, 핸드오프 메모만 남기고 자세한 근거는 접습니다.</p>
                  </div>

                  <div className="worker-grid">
                    {workerProfiles.map((profile, index) => {
                      const bundle = plan?.bundles.find((item) => item.workerId === profile.id)
                      const output = workerOutputs.find((item) => item.workerId === profile.id)
                      const status = state.generation.workerStatuses[profile.id]
                      const isActive = activeWorker?.id === profile.id && status === 'working'
                      const isDimmed = !isActive && status === 'pending'

                      return (
                        <article
                          key={profile.id}
                          className={`worker-card worker-${status} ${isActive ? 'is-spotlight' : ''} ${
                            isDimmed ? 'is-dimmed' : ''
                          }`}
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <div className="worker-card-top">
                            <div>
                              <div className="worker-card-meta">
                                <span className={`worker-dot ${isActive ? 'is-pulsing' : ''}`} aria-hidden="true" />
                                <span>{profile.label}</span>
                              </div>
                              <h4>{profile.reviewLens}</h4>
                            </div>
                            <span className={`status-badge status-${status}`}>{workerStatusLabel(status)}</span>
                          </div>

                          <p className="worker-focus">{profile.focus}</p>

                          {bundle ? (
                            <div className="worker-stack">
                              <div>
                                <strong>소유 범위</strong>
                                <p>{bundle.scope}</p>
                              </div>
                              <div className="token-row">
                                {bundle.ownedDeliverables.map((item) => (
                                  <span key={item} className="ghost-token">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : state.generation.status === 'loading' ? (
                            <div className="skeleton-stack" aria-hidden="true">
                              <span className="skeleton-line" />
                              <span className="skeleton-line short" />
                              <span className="skeleton-line" />
                            </div>
                          ) : (
                            <div className="empty-state-card">
                              <div className="empty-icon" aria-hidden="true">
                                ◎
                              </div>
                              <strong>대기 중인 워커</strong>
                              <p>브리프를 잠그면 이 카드에 소유 범위가 채워집니다.</p>
                              <button type="button" className="ghost-link" onClick={() => navigateScreen('brief')}>
                                브리프로 돌아가기
                              </button>
                            </div>
                          )}

                          {output ? (
                            <details className="drawer-card">
                              <summary>
                                <div>
                                  <strong>핸드오프 메모</strong>
                                  <p>전달된 산출물과 통합 리스크를 확인합니다.</p>
                                </div>
                                <span className="summary-pill">열기</span>
                              </summary>
                              <div className="drawer-body">
                                <p>{output.summary}</p>
                                <ul className="detail-list">
                                  {output.deliverablePreview.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                                {bundle ? (
                                  <ul className="detail-list detail-list-muted">
                                    {bundle.integrationRisks.map((risk) => (
                                      <li key={risk}>{risk}</li>
                                    ))}
                                  </ul>
                                ) : null}
                                <p className="handoff-note">{output.handoffNote}</p>
                              </div>
                            </details>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </section>

                <aside className="board-aside">
                  <article className="checkpoint-surface entrance-item" style={{ animationDelay: '120ms' }}>
                    <p className="eyebrow">통합 체크포인트</p>
                    <h3>{activeWorker ? `${activeWorker.label} 집중 구간` : '통합 준비 구간'}</h3>
                    <p>{nextAction}</p>
                    <div className="checkpoint-list">
                      {(plan?.integrationChecklist ?? reviewLenses).slice(0, 4).map((item) => (
                        <article key={item}>
                          <span aria-hidden="true">•</span>
                          <p>{item}</p>
                        </article>
                      ))}
                    </div>
                  </article>

                  <details className="drawer-card entrance-item" style={{ animationDelay: '180ms' }}>
                    <summary>
                      <div>
                        <strong>리서치와 아웃라인</strong>
                        <p>배경 프레임이 필요할 때만 여는 보조 레이어입니다.</p>
                      </div>
                      <span className="summary-pill">보조</span>
                    </summary>
                    <div className="drawer-body">
                      {researchSummary ? (
                        <article className="drawer-section">
                          <strong>{researchSummary.thesis}</strong>
                          <p>{researchSummary.angle}</p>
                          <ul className="detail-list">
                            {researchSummary.focusBullets.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          <p className="handoff-note">{researchSummary.supportNote}</p>
                        </article>
                      ) : (
                        <p className="drawer-empty">리서치 결과는 오케스트레이션이 시작되면 이곳에 나타납니다.</p>
                      )}

                      {outline.length > 0 ? (
                        <div className="outline-stack">
                          {outline.map((section) => (
                            <article key={section.id} className="outline-card">
                              <strong>{section.title}</strong>
                              <p>{section.goal}</p>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>

                  <details className="drawer-card entrance-item" style={{ animationDelay: '240ms' }}>
                    <summary>
                      <div>
                        <strong>초안 프리뷰</strong>
                        <p>한 번에 하나의 섹션 리듬만 읽게 설계합니다.</p>
                      </div>
                      <span className="summary-pill">초안</span>
                    </summary>
                    <div className="drawer-body">
                      {sectionDrafts.length > 0 ? (
                        <div className="draft-stack">
                          {sectionDrafts.map((draft) => (
                            <article key={draft.id} className="draft-card">
                              <strong>{draft.title}</strong>
                              <p>{draft.summary}</p>
                              <p className="handoff-note">{draft.takeaway}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="drawer-empty">콘텐츠 워커가 전달을 시작하면 여기에 섹션 프리뷰가 쌓입니다.</p>
                      )}
                    </div>
                  </details>
                </aside>
              </div>
            ) : null}

            {activeScreen === 'result' ? (
              <div className="screen-grid result-grid">
                <section className="result-surface entrance-item" style={{ animationDelay: '0ms' }}>
                  <div className="result-header">
                    <div className="section-heading compact">
                      <p className="eyebrow">결과 화면</p>
                      <h3>{finalPost ? '릴리스 후보가 준비되었습니다' : '최종 결과를 기다리는 중입니다'}</h3>
                      <p>이 화면은 최종 글과 복사 행동만 전면에 둡니다.</p>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      data-testid="copy-markdown"
                      aria-label="Copy markdown"
                      disabled={!canCopy}
                      onClick={copyMarkdown}
                    >
                      마크다운 복사
                    </button>
                  </div>

                  <div className="result-meta">
                    <span className={`status-badge status-${state.generation.status}`}>
                      {statusLabel(state.generation.status)}
                    </span>
                    <span className="ghost-token">워커 {completedWorkerCount}명 전달 완료</span>
                    <span className="ghost-token">최종 단계 {progressPercent}%</span>
                  </div>

                  <div className="markdown-canvas">
                    {finalPost ? (
                      <pre>{finalPost}</pre>
                    ) : (
                      <div className="empty-state-card empty-state-large">
                        <div className="empty-icon" aria-hidden="true">
                          ↗
                        </div>
                        <strong>아직 결과가 없습니다</strong>
                        <p>지휘 보드에서 워커 전달을 마치면 이 화면이 자동으로 준비됩니다.</p>
                        <button type="button" className="ghost-link" onClick={() => navigateScreen('board')}>
                          지휘 보드로 돌아가기
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                <aside className="result-aside">
                  <article className="release-card entrance-item" style={{ animationDelay: '60ms' }}>
                    <p className="eyebrow">출시 메모</p>
                    <h3>{integrationReview ? '통합 리뷰 반영 완료' : '통합 대기 중'}</h3>
                    <p>{integrationReview ? integrationReview.finalizationNote : '통합 리뷰가 끝나면 이 카드가 활성화됩니다.'}</p>
                    {state.copyFeedback ? <small>{state.copyFeedback}</small> : null}
                  </article>

                  <details className="drawer-card entrance-item" style={{ animationDelay: '120ms' }}>
                    <summary>
                      <div>
                        <strong>리뷰 메모</strong>
                        <p>교정 포인트와 적용된 수정만 묶어 보여줍니다.</p>
                      </div>
                      <span className="summary-pill">리뷰</span>
                    </summary>
                    <div className="drawer-body">
                      {reviewNotes && integrationReview ? (
                        <>
                          <div className="review-summary">
                            <p>
                              <strong>레이아웃</strong>
                              {integrationReview.layoutConsistency}
                            </p>
                            <p>
                              <strong>상태</strong>
                              {integrationReview.stateConsistency}
                            </p>
                            <p>
                              <strong>콘텐츠</strong>
                              {integrationReview.contentConsistency}
                            </p>
                          </div>
                          <div className="review-stack">
                            {reviewNotes.map((note) => (
                              <article key={note.label} className={`review-card severity-${note.severity}`}>
                                <strong>{note.label}</strong>
                                <p>{note.detail}</p>
                              </article>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="drawer-empty">리뷰 메모는 결과 조립 직전에 이 레이어로 들어옵니다.</p>
                      )}
                    </div>
                  </details>

                  <details className="drawer-card entrance-item" style={{ animationDelay: '180ms' }}>
                    <summary>
                      <div>
                        <strong>아카이브와 평가</strong>
                        <p>근거 파일과 검토 기준은 기본 흐름 뒤에 숨깁니다.</p>
                      </div>
                      <span className="summary-pill">근거</span>
                    </summary>
                    <div className="drawer-body">
                      <div className="archive-grid">
                        {deliverables.map((item) => (
                          <article key={item.id} className="archive-card">
                            <strong>{item.title}</strong>
                            <p>{item.description}</p>
                          </article>
                        ))}
                      </div>
                      <div className="checklist-block">
                        <strong>후속 검토 기준</strong>
                        <ul className="detail-list">
                          {evaluationChecklist.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="checklist-block">
                        <strong>리뷰 렌즈</strong>
                        <ul className="detail-list detail-list-muted">
                          {reviewLenses.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                </aside>
              </div>
            ) : null}
          </article>
        </section>
      </section>
    </main>
  )
}

export default App
