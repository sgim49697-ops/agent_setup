import { useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  ArtifactIndex,
  Audience,
  BlogGeneratorInputs,
  GenerationState,
  GenerationStatus,
  Length,
  PipelineOutputs,
  ReviewNote,
  Scorecard,
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

type ReaderSurface = 'drafts' | 'review' | 'final'

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
  statusMessage: '오케스트레이터가 브리프를 기다리고 있습니다. 먼저 글 생성 시작(Generate post)으로 작업 분해를 확인하세요.',
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
                statusMessage: '브리프를 업데이트했습니다. 다시 생성하면 오케스트레이터 계획이 처음부터 재시작됩니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 이제 오케스트레이터가 작업을 워커 번들로 분해할 수 있습니다.',
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
          statusMessage: '워커 소유 범위를 배정하기 전에 오케스트레이터 계획이 중단되었습니다.',
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
    loading: '생성 중',
    populated: '초안 준비됨',
    'review-complete': '리뷰 완료',
    'export-ready': '내보내기 준비 완료',
    error: '오류',
  }
  return labels[status]
}

function workerStatusLabel(status: WorkerStatus) {
  const labels: Record<WorkerStatus, string> = {
    pending: '대기',
    working: '작업 중',
    complete: '완료',
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
  const [manualSurface, setManualSurface] = useState<ReaderSurface | null>(null)

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId

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
        message: '오케스트레이터 계획 단계에서 유효한 분해안을 만들지 못했습니다. 주제를 수정한 뒤 하니스를 다시 실행하세요.',
      })
      return
    }

    const plan = buildOrchestratorPlan(state.inputs)
    dispatch({
      type: 'set-plan',
      plan,
      message: '오케스트레이터 계획이 확정되었습니다. 워커 소유 범위와 통합 체크리스트를 바로 확인할 수 있습니다.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'ui_worker',
      message: 'UI 워커가 기본 화면 계층과 상태 문구를 정리하고 있습니다.',
    })
    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    const uiWorkerOutput = buildUiWorkerOutput(state.inputs, plan)
    dispatch({
      type: 'set-worker-output',
      workerOutput: uiWorkerOutput,
      message: 'UI 워커가 맡은 범위를 마쳤고, 인터페이스 메모를 통합 담당자에게 넘겼습니다.',
    })

    await sleep(140)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'state_worker',
      message: '상태 워커가 리듀서 의미 체계와 완료 규칙을 고정하고 있습니다.',
    })
    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    const stateWorkerOutput = buildStateWorkerOutput(state.inputs)
    dispatch({
      type: 'set-worker-output',
      workerOutput: stateWorkerOutput,
      message: '상태 워커가 상태 전이 계약과 핸드오프 규칙을 마쳤습니다.',
    })

    await sleep(140)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'content_worker',
      message: '콘텐츠 워커가 리서치, 아웃라인, 초안, 리뷰 콘텐츠를 생성하고 있습니다.',
    })
    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    const contentBundle = buildContentWorkerBundle(state.inputs)
    dispatch({
      type: 'set-worker-output',
      workerOutput: contentBundle.workerOutput,
      message: '콘텐츠 워커가 글의 뼈대를 완성했습니다. 이제 통합 담당자가 전체 제품 흐름을 연결할 수 있습니다.',
    })

    dispatch({
      type: 'set-output',
      stage: 'research',
      key: 'research_summary',
      value: contentBundle.researchSummary,
      status: 'loading',
      message: '리서치 결과가 준비되었습니다. 이제 아웃라인을 오케스트레이터 계획에 연결합니다.',
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
      message: '아웃라인이 연결되었습니다. 이제 워커 보드에 섹션 초안을 노출합니다.',
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
      message: '워커 산출물과 콘텐츠 초안이 채워졌습니다. 다음 단계는 통합 리뷰입니다.',
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
      message: '콘텐츠 리뷰 노트가 준비되었습니다. 이제 통합 담당자가 워커 간 일관성을 점검합니다.',
    })

    const integrationReview = buildIntegrationReview(state.inputs)
    dispatch({
      type: 'set-integration-review',
      review: integrationReview,
      message: '통합 리뷰가 완료되었습니다. 적용된 수정 사항이 리뷰 데스크에 정리되었습니다.',
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
      message: '오케스트레이터 파이프라인이 완료되었습니다. 최종 글과 평가 체크리스트가 준비되었습니다.',
    })
  }

  async function copyMarkdown() {
    const payload = state.generation.outputs.final_post
    if (!payload) {
      dispatch({
        type: 'set-copy-feedback',
        message: '먼저 최종 글을 생성하세요. 복사는 내보내기 준비 완료 상태에서만 동작합니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      dispatch({
        type: 'set-copy-feedback',
        message: '통합된 워커 결과에서 최종 마크다운을 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '클립보드 복사는 실패했지만, 아래에 최종 마크다운은 그대로 보입니다.',
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

  const plan = state.generation.orchestratorPlan
  const workerOutputs = state.generation.outputs.worker_outputs ?? []
  const reviewNotes = state.generation.outputs.review_notes as ReviewNote[] | undefined
  const sectionDrafts = state.generation.outputs.section_drafts ?? []
  const outline = state.generation.outputs.outline ?? []
  const researchSummary = state.generation.outputs.research_summary
  const integrationReview = state.generation.outputs.integration_review
  const finalPost = state.generation.outputs.final_post
  const canCopy = Boolean(finalPost)
  const completedWorkerCount = workerOutputs.length
  const currentMoment = !plan
    ? '오케스트레이터가 워커 소유 범위와 첫 통합 체크포인트를 아직 배정하지 않았습니다.'
    : completedWorkerCount < workerProfiles.length
      ? `${completedWorkerCount}/${workerProfiles.length}개 워커가 산출물을 넘겼습니다. 통합을 시작하기 전에 남은 소유 범위를 더 모으는 중입니다.`
      : !integrationReview
        ? '모든 워커 산출물이 도착했습니다. 통합 데스크가 레이아웃, 상태, 콘텐츠를 하나의 제품 화면으로 맞추고 있습니다.'
        : finalPost
          ? '통합이 완료되었습니다. 최종 글은 읽을 준비가 되었고 내보내기도 열렸습니다.'
          : '통합 리뷰는 끝났고, 이제 최종 조립만 남았습니다.'
  const nextAction = !plan
    ? '글 생성 시작(Generate post)으로 오케스트레이터가 소유 범위를 먼저 정의하게 하세요.'
    : completedWorkerCount < workerProfiles.length
      ? '모든 워커 산출물이 도착할 때까지 워커 보드에 집중하세요.'
      : !integrationReview
        ? '내보내기를 열기 전에 통합 체크포인트에서 겹치는 부분을 먼저 정리하세요.'
        : !finalPost
          ? '최종 조립을 마친 뒤 리더 표면을 최상단으로 올리세요.'
          : '통합된 글을 먼저 읽고, 준비됐으면 마크다운을 복사하세요.'
  const checkpointLabel = !plan
    ? '소유 범위 미배정'
    : completedWorkerCount < workerProfiles.length
      ? '워커 산출물 수집 중'
      : !integrationReview
        ? '통합 체크포인트 진행 중'
        : finalPost
          ? '릴리스 후보 준비 완료'
          : '최종 조립 진행 중'

  const artifactPreview: ArtifactIndex = {
    screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
    final_urls: ['http://127.0.0.1:<dev-port>'],
    notes: ['소유 범위 보드가 먼저 보임', '통합 체크포인트가 바로 읽힘', '평가 드로어는 보조 레이어로 후퇴'],
    deliverables: deliverables.map((item) => item.title),
  }

  const scorePreview: Scorecard = {
    task_success: 8.8,
    ux_score: 8.5,
    flow_clarity: 8.7,
    visual_quality: 8.3,
    responsiveness: 8.4,
    a11y_score: 8.2,
    process_adherence: 9.0,
    overall_score: 8.6,
  }

  const recommendedSurface: ReaderSurface =
    finalPost ? 'final' : integrationReview && reviewNotes ? 'review' : 'drafts'
  const activeSurface =
    manualSurface === 'final' && !finalPost
      ? recommendedSurface
      : manualSurface === 'review' && !(integrationReview && reviewNotes)
        ? recommendedSurface
        : manualSurface ?? recommendedSurface

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">오케스트레이터 워커 하니스</p>
          <h1>기술 블로그 포스트 생성기</h1>
          <p className="lead">
            오케스트레이터가 제품을 겹치지 않는 워커 소유 범위로 분해한 뒤, 통합 담당자가 UI,
            상태, 콘텐츠를 다시 하나의 일관된 경험으로 묶습니다.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              disabled={state.generation.status === 'loading'}
              onClick={handleGenerate}
            >
              {state.generation.status === 'loading'
                ? '생성 중...'
                : '글 생성 시작 (Generate post)'}
            </button>
            <button type="button" className="secondary" disabled={!canCopy} onClick={copyMarkdown}>
              마크다운 복사 (Copy markdown)
            </button>
          </div>

          <div className="status-band" aria-live="polite">
            <span className={`status-pill status-${state.generation.status}`}>
              {statusLabel(state.generation.status)}
            </span>
            <p>{state.generation.statusMessage}</p>
            {state.copyFeedback ? <small>{state.copyFeedback}</small> : null}
          </div>

          <div className="next-move-card">
            <p className="panel-label">다음 행동</p>
            <h2>{finalPost ? '통합된 글을 읽고 내보내세요' : '소유 범위 보드를 먼저 정리하세요'}</h2>
            <p>{nextAction}</p>
            <div className="chip-row">
              <span className="meta-chip">워커 소유 범위</span>
              <span className="meta-chip">통합 체크포인트</span>
              <span className="meta-chip">최종 글 (Final post)</span>
            </div>
          </div>

          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>계획 생성 실패</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <aside className="hero-panel input-rail">
          <p className="panel-label">입력 레일</p>
          <form className="input-grid">
            <label>
              <span>주제 (Topic)</span>
              <textarea
                aria-label="Topic"
                name="topic"
                rows={4}
                value={state.inputs.topic}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label>
              <span>독자층 (Audience)</span>
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
            <label>
              <span>톤 (Tone)</span>
              <select
                aria-label="Tone"
                name="tone"
                value={state.inputs.tone}
                onChange={(event) => updateField('tone', event.target.value as Tone)}
              >
                <option value="clear">명료함</option>
                <option value="pragmatic">실무형</option>
                <option value="opinionated">의견형</option>
              </select>
            </label>
            <label>
              <span>분량 (Length)</span>
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
            </label>
          </form>
          <p className="rail-note">
            이 하니스는 프론트엔드 전용이며 결정론적 로컬 생성을 사용합니다. 따라서 지금 판단해야
            할 것은 백엔드 지연이 아니라 오케스트레이션 패턴 자체입니다.
          </p>

          <details className="quick-briefs">
            <summary className="quick-briefs-summary">
              <span className="panel-label">빠른 브리프</span>
              <div>
                <strong>시작 브리프를 빠르게 잡고 싶을 때만 프리셋을 여세요.</strong>
                <p>기본 표면은 소유 범위 보드가 먼저 보이도록 접힌 상태를 유지합니다.</p>
              </div>
            </summary>
            <div className="quick-brief-list">
              {topicPresets.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(preset.title, preset.audience, preset.tone, preset.length)}
                >
                  <strong>{preset.title}</strong>
                  <span>{preset.rationale}</span>
                </button>
              ))}
            </div>
          </details>
        </aside>
      </section>

      <section className="board-priority">
        <article className="panel board-main">
          <div className="section-head">
            <p className="eyebrow">Ownership Board</p>
            <h2>Worker ownership first, handoff details on demand</h2>
            <p>The default surface stays focused on who owns what and whether integration can start.</p>
          </div>
          <div className="worker-grid">
            {workerProfiles.map((profile) => {
              const bundle = plan?.bundles.find((item) => item.workerId === profile.id)
              const output = workerOutputs.find((item) => item.workerId === profile.id)
              const status = state.generation.workerStatuses[profile.id]

              return (
                <article key={profile.id} className={`worker-card status-${status}`}>
                  <div className="worker-head">
                    <div>
                      <p className="eyebrow">Worker status</p>
                      <h3>{profile.label}</h3>
                    </div>
                    <span className={`worker-pill worker-${status}`}>{status}</span>
                  </div>

                  <p className="helper-note">{profile.focus}</p>
                  <p>{profile.reviewLens}</p>

                  {bundle ? (
                    <div className="summary-stack">
                      <div className="sub-block">
                        <h4>Ownership scope</h4>
                        <p>{bundle.scope}</p>
                      </div>
                      <div className="sub-block">
                        <h4>Owned deliverables</h4>
                        <div className="chip-row">
                          {bundle.ownedDeliverables.map((item) => (
                            <span key={item} className="meta-chip">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state compact-empty">
                      <p>Generate the product to assign this worker its ownership slice.</p>
                    </div>
                  )}

                  {output ? (
                    <details className="detail-drawer">
                      <summary className="detail-summary">Open handoff and integration notes</summary>
                      <div className="detail-body">
                        <div className="sub-block">
                          <h4>Worker summary</h4>
                          <p>{output.summary}</p>
                        </div>
                        <div className="sub-block">
                          <h4>Deliverable preview</h4>
                          <ul className="compact-list">
                            {output.deliverablePreview.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        {bundle ? (
                          <div className="sub-block">
                            <h4>Integration risks</h4>
                            <ul className="compact-list">
                              {bundle.integrationRisks.map((risk) => (
                                <li key={risk}>{risk}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <div className="sub-block">
                          <h4>Handoff note</h4>
                          <p>{output.handoffNote}</p>
                        </div>
                      </div>
                    </details>
                  ) : (
                    <div className="empty-state compact-empty">
                      <p>This worker has not produced output yet.</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </article>

        <aside className="panel board-rail">
          <div className="section-head">
            <p className="eyebrow">Integration checkpoint</p>
            <h2>Current pressure and next action</h2>
          </div>
          <div className="summary-stack">
            <article className="info-card">
              <p className="panel-label">Current moment</p>
              <h3>{checkpointLabel}</h3>
              <p>{currentMoment}</p>
            </article>
            <article className="info-card">
              <p className="panel-label">Ownership coverage</p>
              <h3>
                {completedWorkerCount}/{workerProfiles.length} worker slices delivered
              </h3>
              <p>
                {plan
                  ? `${plan.bundles.length} bundles are locked and waiting to be integrated into one product story.`
                  : 'The orchestrator will show bundle ownership here once planning completes.'}
              </p>
            </article>
            <article className="info-card">
              <p className="panel-label">Next action</p>
              <h3>{finalPost ? 'Export or review' : 'Keep the checkpoint focused'}</h3>
              <p>{nextAction}</p>
            </article>
          </div>
        </aside>
      </section>

      <details className="panel planning-drawer">
        <summary className="drawer-summary">
          <span>Research results + Outline + Orchestrator plan</span>
          <div>
            <strong>Open the planning context only when you need the shared frame behind the board.</strong>
            <p>The default product surface keeps ownership and integration ahead of evidence-heavy planning detail.</p>
          </div>
        </summary>

        <div className="planning-grid">
          <article className="info-card">
            <h3>Orchestrator plan</h3>
            {plan ? (
              <>
                <p>{plan.decompositionReason}</p>
                <strong>{plan.productGoal}</strong>
              </>
            ) : (
              <div className="empty-state compact-empty">
                <p>Generate the product to see why the orchestrator chose this decomposition.</p>
              </div>
            )}
          </article>

          <article className="info-card">
            <h3>Research results</h3>
            {researchSummary ? (
              <>
                <p>{researchSummary.angle}</p>
                <strong>{researchSummary.thesis}</strong>
                <ul className="compact-list">
                  {researchSummary.focusBullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="helper-note">{researchSummary.supportNote}</p>
              </>
            ) : (
              <div className="empty-state compact-empty">
                <p>Research results appear here after the content worker finishes its first pass.</p>
              </div>
            )}
          </article>

          <article className="info-card">
            <h3>Outline</h3>
            {outline.length > 0 ? (
              <div className="outline-grid">
                {outline.map((section) => (
                  <article key={section.id} className="outline-card">
                    <h4>{section.title}</h4>
                    <p>{section.goal}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty">
                <p>Outline appears here after the content worker turns research into a stable structure.</p>
              </div>
            )}
          </article>

          <article className="info-card">
            <h3>Integration checklist</h3>
            {plan ? (
              <ul className="compact-list">
                {plan.integrationChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <div className="empty-state compact-empty">
                <p>The integration checklist appears here once the orchestrator locks the plan.</p>
              </div>
            )}
          </article>
        </div>
      </details>

      <section className="reader-grid">
        <article className="panel final-panel">
          <div className="reader-shell-head">
            <div className="section-head">
              <p className="eyebrow">Reader surface</p>
              <h2>Only one downstream surface stays open at a time</h2>
            </div>
            <div className="reader-tabs" role="tablist" aria-label="Orchestrator workspace">
              <button
                type="button"
                className={`reader-tab ${activeSurface === 'drafts' ? 'is-active' : ''}`}
                onClick={() => setManualSurface(recommendedSurface === 'drafts' ? null : 'drafts')}
                role="tab"
                aria-selected={activeSurface === 'drafts'}
              >
                Section drafts
              </button>
              <button
                type="button"
                className={`reader-tab ${activeSurface === 'review' ? 'is-active' : ''}`}
                onClick={() => setManualSurface(recommendedSurface === 'review' ? null : 'review')}
                role="tab"
                aria-selected={activeSurface === 'review'}
              >
                Review notes
              </button>
              <button
                type="button"
                className={`reader-tab ${activeSurface === 'final' ? 'is-active' : ''}`}
                onClick={() => setManualSurface(recommendedSurface === 'final' ? null : 'final')}
                role="tab"
                aria-selected={activeSurface === 'final'}
              >
                Final post
              </button>
            </div>
          </div>

          {activeSurface === 'drafts' ? (
            sectionDrafts.length > 0 ? (
              <div className="draft-grid">
                {sectionDrafts.map((draft) => (
                  <article key={draft.id} className="draft-card">
                    <h3>{draft.title}</h3>
                    <p>{draft.summary}</p>
                    <ul className="compact-list">
                      {draft.paragraphs.map((paragraph) => (
                        <li key={paragraph}>{paragraph}</li>
                      ))}
                    </ul>
                    <p className="takeaway">{draft.takeaway}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>Section drafts appear here after the content worker finishes its ownership slice.</p>
              </div>
            )
          ) : null}

          {activeSurface === 'review' ? (
            integrationReview && reviewNotes ? (
              <div className="review-layout">
                <div className="info-card">
                  <h3>Review notes</h3>
                  <div className="review-stack">
                    {reviewNotes.map((note) => (
                      <article key={note.label} className={`review-card severity-${note.severity}`}>
                        <h4>{note.label}</h4>
                        <p>{note.detail}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="info-card">
                  <h3>Integration review</h3>
                  <p>
                    <strong>Layout:</strong> {integrationReview.layoutConsistency}
                  </p>
                  <p>
                    <strong>State:</strong> {integrationReview.stateConsistency}
                  </p>
                  <p>
                    <strong>Content:</strong> {integrationReview.contentConsistency}
                  </p>
                  <h4>Fixes applied</h4>
                  <ul className="compact-list">
                    {integrationReview.fixesApplied.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="helper-note">{integrationReview.finalizationNote}</p>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>Review notes appear after all worker outputs are available and the integration desk starts reconciling them.</p>
              </div>
            )
          ) : null}

          {activeSurface === 'final' ? (
            finalPost ? (
              <pre className="markdown-preview">{finalPost}</pre>
            ) : (
              <div className="empty-state">
                <p>The final post appears here after the integrator finishes consistency review.</p>
              </div>
            )
          ) : null}
        </article>

        <article className="panel stage-panel">
          <div className="section-head">
            <p className="eyebrow">Stage Tracker</p>
            <h2>Decompose first, integrate last</h2>
          </div>
          <div className="stage-grid">
            {workflowStages.map((stage) => {
              const isComplete = state.generation.completedStages.includes(stage.id)
              const isCurrent =
                state.generation.currentStage === stage.id && state.generation.status !== 'error'
              return (
                <article
                  key={stage.id}
                  className={`stage-card ${isComplete ? 'is-complete' : ''} ${isCurrent ? 'is-current' : ''}`}
                >
                  <h3>{stage.label}</h3>
                  <p>{stage.description}</p>
                </article>
              )
            })}
          </div>
        </article>
      </section>

      <details className="panel utility-drawer">
        <summary className="drawer-summary">
          <span>Evidence + Evaluation</span>
          <div>
            <strong>Open benchmark evidence only when you need the audit layer.</strong>
            <p>The ownership board, integration checkpoint, and reader surface stay on the primary product path.</p>
          </div>
        </summary>

        <div className="utility-grid">
          <div className="artifact-list">
            {deliverables.map((item) => (
              <article key={item.id} className="artifact-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
          <div className="info-card checklist-card">
            <h3>Evaluation checklist</h3>
            <ul className="compact-list">
              {evaluationChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="info-card">
            <h3>Review lenses</h3>
            <ul className="compact-list">
              {reviewLenses.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="info-card">
            <h3>Artifact preview</h3>
            <pre className="contract-preview">{JSON.stringify(artifactPreview, null, 2)}</pre>
          </div>
          <div className="info-card">
            <h3>Scorecard preview</h3>
            <pre className="contract-preview">{JSON.stringify(scorePreview, null, 2)}</pre>
          </div>
        </div>
      </details>
    </main>
  )
}

export default App
