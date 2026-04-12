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
  statusMessage: 'Orchestrator is waiting for a brief. Generate the product to see task decomposition first.',
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
                statusMessage: 'Brief updated. Generate again to restart orchestrator planning.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: 'Preset loaded. The orchestrator can now decompose the product into worker bundles.',
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
          statusMessage: 'Orchestrator planning stopped before worker ownership could be assigned.',
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
    initial: 'Initial',
    loading: 'Generating...',
    populated: 'Pipeline populated',
    'review-complete': 'Review complete',
    'export-ready': 'Export ready',
    error: 'Error',
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
      message: 'Orchestrator is decomposing the product into worker bundles and integration checkpoints.',
    })

    await sleep(240)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message: 'Orchestrator planning stage could not produce a valid decomposition plan. Update the topic and rerun the harness.',
      })
      return
    }

    const plan = buildOrchestratorPlan(state.inputs)
    dispatch({
      type: 'set-plan',
      plan,
      message: 'Orchestrator plan is locked. Worker ownership and integration checklist are now visible.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'ui_worker',
      message: 'UI Worker is shaping the surface hierarchy and status copy.',
    })
    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    const uiWorkerOutput = buildUiWorkerOutput(state.inputs, plan)
    dispatch({
      type: 'set-worker-output',
      workerOutput: uiWorkerOutput,
      message: 'UI Worker finished its ownership slice and handed interface notes to the integrator.',
    })

    await sleep(140)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'state_worker',
      message: 'State Worker is locking the reducer semantics and completion rules.',
    })
    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    const stateWorkerOutput = buildStateWorkerOutput(state.inputs)
    dispatch({
      type: 'set-worker-output',
      workerOutput: stateWorkerOutput,
      message: 'State Worker finished the state transition contract and handoff rules.',
    })

    await sleep(140)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'set-worker-working',
      workerId: 'content_worker',
      message: 'Content Worker is generating research, outline, drafts, and review content.',
    })
    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    const contentBundle = buildContentWorkerBundle(state.inputs)
    dispatch({
      type: 'set-worker-output',
      workerOutput: contentBundle.workerOutput,
      message: 'Content Worker finished the article spine. Integrator can now connect the full product.',
    })

    dispatch({
      type: 'set-output',
      stage: 'research',
      key: 'research_summary',
      value: contentBundle.researchSummary,
      status: 'loading',
      message: 'Research results are ready. The outline is now being attached to the orchestrator plan.',
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
      message: 'Outline is connected. Section drafts are being surfaced through the worker board.',
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
      message: 'Worker outputs and content drafts are populated. Integration review is next.',
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
      message: 'Content review notes are ready. Integrator is now checking cross-worker consistency.',
    })

    const integrationReview = buildIntegrationReview(state.inputs)
    dispatch({
      type: 'set-integration-review',
      review: integrationReview,
      message: 'Integration review completed. Fixes applied are now visible in the review desk.',
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
      message: 'Orchestrator pipeline is complete. Final post and evaluation checklist are ready.',
    })
  }

  async function copyMarkdown() {
    const payload = state.generation.outputs.final_post
    if (!payload) {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Generate the final post first. Copy only works after export-ready state.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      dispatch({
        type: 'set-copy-feedback',
        message: 'Final markdown copied from the integrated worker output.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Clipboard copy failed here, but the final markdown remains visible below.',
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
    ? 'Waiting for the orchestrator to assign worker ownership and the first integration checkpoint.'
    : completedWorkerCount < workerProfiles.length
      ? `${completedWorkerCount}/${workerProfiles.length} workers have delivered. The orchestrator is still collecting ownership slices before integration can begin.`
      : !integrationReview
        ? 'All worker slices are in. The integration desk is reconciling layout, state, and content into one product surface.'
        : finalPost
          ? 'Integration is complete. The final post is reader-ready and export is unlocked.'
          : 'Integration review is complete. Final assembly is the only step left.'
  const nextAction = !plan
    ? 'Generate the post to let the orchestrator define ownership before any worker starts.'
    : completedWorkerCount < workerProfiles.length
      ? 'Keep the worker board focused until every ownership slice is delivered.'
      : !integrationReview
        ? 'Use the integration checkpoint to resolve overlap before opening export.'
        : !finalPost
          ? 'Finish the final assembly, then promote the reader surface.'
          : 'Read the integrated post, then copy the markdown when it looks ready.'
  const checkpointLabel = !plan
    ? 'Ownership not assigned'
    : completedWorkerCount < workerProfiles.length
      ? 'Collecting worker outputs'
      : !integrationReview
        ? 'Integration checkpoint active'
        : finalPost
          ? 'Release candidate ready'
          : 'Final assembly in progress'

  const artifactPreview: ArtifactIndex = {
    screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
    final_urls: ['http://127.0.0.1:<dev-port>'],
    notes: ['ownership board visible', 'integration checkpoint visible', 'evaluation drawer secondary'],
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
          <p className="eyebrow">Orchestrator Worker Harness</p>
          <h1>Tech Blog Post Generator</h1>
          <p className="lead">
            The orchestrator decomposes the product into disjoint worker ownership, then the
            integrator reconnects UI, state, and content into one coherent experience.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              disabled={state.generation.status === 'loading'}
              onClick={handleGenerate}
            >
              {state.generation.status === 'loading' ? 'Generating...' : 'Generate post'}
            </button>
            <button type="button" className="secondary" disabled={!canCopy} onClick={copyMarkdown}>
              Copy markdown
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
            <p className="panel-label">Next move</p>
            <h2>{finalPost ? 'Read and export the integrated post' : 'Keep the ownership board clean'}</h2>
            <p>{nextAction}</p>
            <div className="chip-row">
              <span className="meta-chip">Worker ownership</span>
              <span className="meta-chip">Integration checkpoint</span>
              <span className="meta-chip">Final post</span>
            </div>
          </div>

          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>Planning failed</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <aside className="hero-panel input-rail">
          <p className="panel-label">Input rail</p>
          <form className="input-grid">
            <label>
              <span>Topic</span>
              <textarea
                aria-label="Topic"
                name="topic"
                rows={4}
                value={state.inputs.topic}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label>
              <span>Audience</span>
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
              <span>Tone</span>
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
              <span>Length</span>
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
            This harness stays frontend-only and uses deterministic local generation so the
            orchestration pattern, not backend latency, is what you are judging.
          </p>

          <details className="quick-briefs">
            <summary className="quick-briefs-summary">
              <span className="panel-label">Quick briefs</span>
              <div>
                <strong>Open presets only when you want a faster starting brief.</strong>
                <p>They stay collapsed so the ownership board leads the default surface.</p>
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
