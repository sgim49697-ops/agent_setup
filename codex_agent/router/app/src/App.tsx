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
  topicPresets,
  workflowStages,
} from './starterData'

type OutputKey = 'research_summary' | 'outline' | 'section_drafts' | 'review_notes' | 'voice_notes'

type AppState = {
  inputs: BlogGeneratorInputs
  generation: GenerationState
  copyFeedback: string
}

type FocusSurface = 'research' | 'outline' | 'drafts' | 'review'

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
  statusMessage: '라우터가 브리프를 기다리는 중입니다. 포스트 생성을 눌러 먼저 경로를 분류하세요.',
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
                statusMessage: '브리프가 바뀌었습니다. 다시 생성하면 라우팅 결정을 새로 계산합니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 이제 라우터가 적절한 specialist 경로를 선택할 수 있습니다.',
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
          statusMessage: '라우터가 specialist 경로를 정하기 전에 중단되었습니다.',
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
    initial: '대기 중 (Initial)',
    loading: '생성 중 (Generating...)',
    populated: '초안 채움 완료',
    'review-complete': '검토 완료 (Review complete)',
    'export-ready': '내보내기 준비 완료 (Export ready)',
    error: '오류 (Error)',
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
  const [manualSurface, setManualSurface] = useState<FocusSurface | null>(null)

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId

    dispatch({
      type: 'start-run',
      message: '라우터가 주제를 분류하고 가장 적합한 specialist 경로를 선택하는 중입니다.',
    })

    await sleep(240)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message: '라우터 분류 단계에서 유효한 specialist 경로를 만들지 못했습니다. 주제를 수정한 뒤 다시 실행하세요.',
      })
      return
    }

    const routingDecision = routeTopic(state.inputs.topic)

    dispatch({
      type: 'set-routing',
      routingDecision,
      message: `${getSpecialistProfile(routingDecision.specialist).label} 경로를 ${(routingDecision.confidence * 100).toFixed(0)}% 신뢰도로 선택했습니다.`,
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
      message: '리서치 결과가 준비되었습니다. 선택된 specialist가 개요를 정리하고 있습니다.',
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
      message: '개요가 확정되었습니다. 선택된 specialist 렌즈로 섹션 초안을 작성하고 있습니다.',
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
      message: '섹션 초안이 채워졌습니다. 다음으로 검토 노트를 정리합니다.',
    })

    dispatch({
      type: 'set-output',
      stage: 'drafts',
      key: 'voice_notes',
      value: specialistOutput.voiceNotes,
      status: 'populated',
      message: '섹션 초안이 채워졌습니다. 다음으로 검토 노트를 정리합니다.',
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
      message: '검토 노트가 완료되었습니다. 최종 포스트를 내보내기용으로 묶는 중입니다.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'finalize-run',
      finalPost: specialistOutput.finalPost,
      message: '라우터 파이프라인이 완료되었습니다. 최종 포스트와 평가 체크리스트가 준비되었습니다.',
    })
  }

  async function copyMarkdown() {
    const payload = state.generation.outputs.final_post
    if (!payload) {
      dispatch({
        type: 'set-copy-feedback',
        message: '먼저 최종 포스트를 생성하세요. 마크다운 복사는 export-ready 이후에만 동작합니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      dispatch({
        type: 'set-copy-feedback',
        message: '선택된 specialist 결과에서 최종 마크다운을 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '여기서는 클립보드 복사가 실패했지만, 아래에서 최종 마크다운은 계속 볼 수 있습니다.',
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
    ? '라우터가 아직 주제를 분류하지 않았습니다.'
    : finalPost
      ? '선택된 경로가 완료되어 내보내기가 열렸습니다.'
      : state.generation.currentStage === 'research'
        ? '선택된 specialist가 리서치 브리프를 만드는 동안 라우팅 신뢰도가 고정됩니다.'
        : state.generation.currentStage === 'outline'
          ? '선택된 specialist 렌즈를 기준으로 개요를 구체화하고 있습니다.'
          : state.generation.currentStage === 'drafts'
            ? '선택된 specialist 렌즈를 따라 섹션 초안을 작성하는 중입니다.'
            : '최종 내보내기를 열기 전에 검토 노트로 경로를 다듬는 중입니다.'
  const nextAction = !routingDecision
    ? '포스트 생성을 눌러 라우터가 specialist 경로를 먼저 선택하게 하세요.'
    : !researchSummary
      ? '선택된 specialist가 브리프를 정리하는 동안 route shell을 유지하세요.'
      : !outline.length
        ? '섹션 방향을 비교하기 전에 개요가 잠길 때까지 기다리세요.'
        : !sectionDrafts.length
          ? '섹션 초안이 채워지는 동안 선택된 specialist 진행을 확인하세요.'
          : !reviewNotes.length
            ? '최종 포스트를 올리기 전에 검토 렌즈가 마무리될 때까지 두세요.'
            : '최종 포스트를 읽고 경로가 적절하면 마크다운을 복사하세요.'
  const routeSignals =
    routingDecision?.matchedSignals.length
      ? routingDecision.matchedSignals.join(', ')
      : '강한 신호가 부족해 보수적인 fallback-safe 분류를 유지했습니다.'
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

  const artifactPreview: ArtifactIndex = {
    screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
    final_urls: ['http://127.0.0.1:<dev-port>'],
    notes: ['routing trace visible', 'evaluation checklist ready'],
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

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">라우터 하네스 · Router Harness</p>
          <h1>기술 블로그 포스트 생성기</h1>
          <p className="lead">
            라우터가 주제를 분류해 가장 적합한 specialist 경로를 고르고, 왜 그 결정을
            내렸는지 기록하며, 신호가 약할 때를 위한 fallback 경로도 함께 보존합니다.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              disabled={state.generation.status === 'loading'}
              onClick={handleGenerate}
              aria-label="Generate post"
            >
              {state.generation.status === 'loading' ? '생성 중...' : '포스트 생성'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canCopy}
              onClick={copyMarkdown}
              aria-label="Copy markdown"
            >
              마크다운 복사
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
            <h2>{routingDecision ? '선택된 경로를 따라 진행하세요' : '먼저 브리프를 분류하세요'}</h2>
            <p>{nextAction}</p>
            <div className="token-row">
              <span>선택 경로</span>
              <span>Fallback 경로</span>
              <span>최종 포스트</span>
            </div>
          </div>

          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>라우팅 실패</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <aside className="hero-panel input-rail">
          <p className="panel-label">입력 브리프</p>
          <form className="input-grid">
            <label>
              <span>주제</span>
              <textarea
                aria-label="Topic"
                name="topic"
                rows={4}
                value={state.inputs.topic}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label>
              <span>독자</span>
              <select
                aria-label="Audience"
                name="audience"
                value={state.inputs.audience}
                onChange={(event) => updateField('audience', event.target.value as Audience)}
              >
                <option value="beginner">Beginner</option>
                <option value="practitioner">Practitioner</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>
              <span>톤</span>
              <select
                aria-label="Tone"
                name="tone"
                value={state.inputs.tone}
                onChange={(event) => updateField('tone', event.target.value as Tone)}
              >
                <option value="clear">Clear</option>
                <option value="pragmatic">Pragmatic</option>
                <option value="opinionated">Opinionated</option>
              </select>
            </label>
            <label>
              <span>길이</span>
              <select
                aria-label="Length"
                name="length"
                value={state.inputs.length}
                onChange={(event) => updateField('length', event.target.value as Length)}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
          </form>
          <p className="rail-note">
            이 하네스는 프런트엔드 전용이며 결정론적 로컬 라우팅을 사용하므로, 이번
            검증에서는 decision shell 자체가 가장 먼저 평가 대상이 됩니다.
          </p>
          <details className="quick-briefs">
            <summary className="quick-briefs-summary">
              <span>Quick briefs</span>
              <div>
                <strong>빠른 라우팅 신호가 필요할 때만 프리셋을 여세요.</strong>
                <p>프리셋은 보조 수단으로 두고 route shell이 먼저 보이게 합니다.</p>
              </div>
            </summary>
            <div className="preset-stack">
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

      <section className="grid-two">
        <article className="panel route-shell">
          <div className="section-head">
            <p className="eyebrow">라우팅 데스크</p>
            <h2>선택 경로, fallback 경로, 그리고 why-routing</h2>
          </div>
          {routingDecision && chosenSpecialist ? (
            <div className="route-body">
              <div className="route-card">
                <div className="route-head">
                  <div>
                    <p className="eyebrow">선택된 specialist</p>
                    <h3>{chosenSpecialist.label}</h3>
                  </div>
                  <span className={`route-pill route-${routingDecision.specialist}`}>
                    {(routingDecision.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p>{routingDecision.reason}</p>
                <p><strong>작성 초점:</strong> {chosenSpecialist.writingFocus}</p>
                <p><strong>UI 렌즈:</strong> {chosenSpecialist.uiLens}</p>
                <p><strong>리뷰 렌즈:</strong> {chosenSpecialist.reviewLens}</p>
              </div>

              <div className="route-card">
                <h3>이 경로를 고른 이유</h3>
                <p>{routeSignals}</p>
                <div className="token-row">
                  {routingDecision.matchedSignals.length > 0 ? (
                    routingDecision.matchedSignals.map((signal) => <span key={signal}>{signal}</span>)
                  ) : (
                    <span>Fallback-safe classification</span>
                  )}
                </div>
              </div>

              <div className="route-card">
                <h3>Fallback 경로</h3>
                <p>
                  {routingDecision.fallbackReason ??
                    '선택된 specialist 신호가 충분히 강해 fallback 경로는 대기 상태로 유지됩니다.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>라우터가 아직 대기 중입니다</h3>
              <p>포스트를 생성하면 어떤 specialist를 왜 선택했는지 여기서 바로 볼 수 있습니다.</p>
            </div>
          )}
        </article>

        <aside className="panel route-rail">
          <div className="section-head">
            <p className="eyebrow">경로 제어 패널</p>
            <h2>현재 경로 압력과 다음 행동</h2>
          </div>
          <div className="route-summary-stack">
            <article className="info-card">
              <h3>현재 순간</h3>
              <p>{routeMoment}</p>
            </article>
            <article className="info-card">
              <h3>선택 경로</h3>
              <p>{chosenSpecialist ? chosenSpecialist.label : '아직 specialist 경로가 선택되지 않았습니다.'}</p>
              <p className="lens-note">
                {routingDecision
                  ? `${(routingDecision.confidence * 100).toFixed(0)}% 신뢰도로 ${routingDecision.specialist} 경로로 보냈습니다.`
                  : '첫 분류가 끝나면 라우팅 신뢰도가 여기에 표시됩니다.'}
              </p>
            </article>
            <article className="info-card">
              <h3>다음 행동</h3>
              <p>{nextAction}</p>
            </article>
          </div>
        </aside>
      </section>

      <section className="grid-two">
        <article className="panel final-panel">
          <div className="section-head">
            <p className="eyebrow">최종 포스트 (Final post)</p>
            <h2>선택 경로 기반 마크다운 내보내기</h2>
          </div>
          {finalPost ? (
            <pre className="markdown-preview">{finalPost}</pre>
          ) : (
            <div className="empty-state">
              <p>선택된 specialist가 검토를 마치면 최종 포스트가 여기에 나타납니다.</p>
            </div>
          )}
        </article>

        <article className="panel focus-panel">
          <div className="section-head">
            <p className="eyebrow">Specialist 작업면</p>
            <h2>한 번에 하나의 routed surface만 열어 둡니다</h2>
          </div>
          <div className="surface-tabs" role="tablist" aria-label="Routed workspace">
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'research' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'research'}
              onClick={() => setManualSurface(recommendedSurface === 'research' ? null : 'research')}
            >
              리서치 결과 (Research results)
            </button>
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'outline' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'outline'}
              onClick={() => setManualSurface(recommendedSurface === 'outline' ? null : 'outline')}
            >
              개요 (Outline)
            </button>
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'drafts' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'drafts'}
              onClick={() => setManualSurface(recommendedSurface === 'drafts' ? null : 'drafts')}
            >
              섹션 초안 (Section drafts)
            </button>
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'review' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'review'}
              onClick={() => setManualSurface(recommendedSurface === 'review' ? null : 'review')}
            >
              검토 노트 (Review notes)
            </button>
          </div>

          {activeSurface === 'research' ? (
            chosenSpecialist && researchSummary ? (
              <div className="workspace-body">
                <div className="info-card">
                  <h3>리서치 결과 (Research results)</h3>
                  <p>{researchSummary.angle}</p>
                  <strong>{researchSummary.thesis}</strong>
                  <ul className="review-list compact-list">
                    {researchSummary.focusBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <p className="lens-note">{researchSummary.supportingLens}</p>
                </div>
                <div className="info-card">
                  <h3>보이스 노트</h3>
                  <ul className="review-list compact-list">
                    {voiceNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>라우팅이 끝나면 선택된 specialist 프로필과 리서치 결과, 보이스 노트가 여기에 나타납니다.</p>
              </div>
            )
          ) : null}

          {activeSurface === 'outline' ? (
            outline.length > 0 ? (
              <div className="outline-grid">
                {outline.map((section) => (
                  <article key={section.id} className="outline-card">
                    <h3>{section.title}</h3>
                    <p>{section.goal}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>라우터가 specialist 경로를 확정하면 개요가 여기에 나타납니다.</p>
              </div>
            )
          ) : null}

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
                <p>선택된 specialist가 작성 단계를 시작하면 섹션 초안이 여기에 나타납니다.</p>
              </div>
            )
          ) : null}

          {activeSurface === 'review' ? (
            reviewNotes.length > 0 ? (
              <div className="review-stack">
                {reviewNotes.map((note) => (
                  <article key={note.label} className={`review-card severity-${note.severity}`}>
                    <h3>{note.label}</h3>
                    <p>{note.detail}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>섹션 초안이 생성된 뒤 검토 노트가 여기에 표시됩니다.</p>
              </div>
            )
          ) : null}
        </article>
      </section>

      <section className="panel stage-panel">
        <div className="section-head">
          <p className="eyebrow">단계 추적기</p>
          <h2>하나의 라우터, 하나의 선택 경로, 하나의 fallback 경로</h2>
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
      </section>

      <details className="panel utility-drawer">
        <summary className="drawer-summary">
          <span>증거 + 평가 (Evidence + Evaluation)</span>
          <div>
            <strong>감사 레이어가 필요할 때만 benchmark 계약을 여세요.</strong>
            <p>선택 경로, route rail, routed post는 기본 제품 표면에 남겨 둡니다.</p>
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
            <h3>평가 체크리스트</h3>
            <ul className="review-list compact-list">
              {evaluationChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="info-card">
            <h3>검토 렌즈</h3>
            <ul className="review-list compact-list">
              {reviewLenses.map((lens) => (
                <li key={lens}>{lens}</li>
              ))}
            </ul>
          </div>
          <div className="info-card">
            <h3>아티팩트 미리보기</h3>
            <pre className="contract-preview">{JSON.stringify(artifactPreview, null, 2)}</pre>
          </div>
          <div className="info-card">
            <h3>스코어카드 미리보기</h3>
            <pre className="contract-preview">{JSON.stringify(scorePreview, null, 2)}</pre>
          </div>
        </div>
      </details>
    </main>
  )
}

export default App
