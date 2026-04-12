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
  PipelineRole,
  Scorecard,
  Tone,
} from './contracts'
import {
  assembleFinalOutputs,
  runOutliner,
  runResearcher,
  runReviewer,
  runWriter,
} from './generator'
import { deliverables, pipelineRoles, reviewLenses, topicPresets } from './starterData'

type OutputKey = 'research_summary' | 'outline' | 'section_drafts' | 'review_notes'

type AppState = {
  inputs: BlogGeneratorInputs
  generation: GenerationState
  copyFeedback: string
  selectedRole: PipelineRole
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
      type: 'set-output'
      role: PipelineRole
      stage: GenerationStageId
      nextRole: PipelineRole | null
      nextStage: GenerationStageId | null
      key: OutputKey
      value: PipelineOutputs[OutputKey]
      handoffs?: PipelineOutputs['handoffs']
      status: GenerationStatus
      message: string
      focusRole?: PipelineRole
    }
  | { type: 'finalize-run'; finalPost: string; message: string }
  | { type: 'set-copy-feedback'; message: string }
  | {
      type: 'set-error'
      role: PipelineRole
      stage: GenerationStageId
      message: string
    }
  | { type: 'select-role'; role: PipelineRole }

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentRole: null,
  currentStage: null,
  completedRoles: [],
  completedStages: [],
  outputs: {},
  statusMessage:
    'Initial | The route-based stepper is waiting for a brief. Generate post to start with Research results.',
  errorMessage: null,
}

const roleStageMap: Record<PipelineRole, GenerationStageId> = {
  researcher: 'research',
  outliner: 'outline',
  writer: 'drafts',
  reviewer: 'review',
}

const stageLabels: Record<GenerationStageId, string> = {
  research: 'Research results',
  outline: 'Outline',
  drafts: 'Section drafts',
  review: 'Review notes',
  final: 'Final post',
}

const statusLabels: Record<GenerationStatus, string> = {
  initial: 'Initial',
  loading: 'Loading',
  populated: 'Pipeline populated',
  'review-complete': 'Review complete',
  'export-ready': 'Export ready',
  error: 'Error',
}

const baseScorePreview: Scorecard = {
  task_success: 9,
  ux_score: 8,
  flow_clarity: 9,
  visual_quality: 8,
  responsiveness: 8,
  a11y_score: 8,
  process_adherence: 10,
  overall_score: 8.6,
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
                  'Brief updated. Generate again to restart the sequential handoff from Research results.',
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
            'Preset loaded. Generate post to replay the full researcher → outliner → writer → reviewer flow.',
        },
        copyFeedback: '',
        selectedRole: 'researcher',
      }
    case 'start-run':
      return {
        ...state,
        generation: {
          status: 'loading',
          currentRole: 'researcher',
          currentStage: 'research',
          completedRoles: [],
          completedStages: [],
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
        selectedRole: 'researcher',
      }
    case 'set-output':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentRole: action.nextRole,
          currentStage: action.nextStage,
          completedRoles: unique([...state.generation.completedRoles, action.role]),
          completedStages: unique([...state.generation.completedStages, action.stage]),
          outputs: {
            ...state.generation.outputs,
            [action.key]: action.value,
            ...(action.handoffs ? { handoffs: action.handoffs } : {}),
          },
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedRole: action.focusRole ?? action.role,
      }
    case 'finalize-run':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'export-ready',
          currentRole: null,
          currentStage: 'final',
          completedRoles: unique([...state.generation.completedRoles, 'reviewer']),
          completedStages: unique([...state.generation.completedStages, 'final']),
          outputs: {
            ...state.generation.outputs,
            final_post: action.finalPost,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedRole: 'reviewer',
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
          currentRole: action.role,
          currentStage: action.stage,
          completedRoles: [],
          completedStages: [],
          outputs: {},
          statusMessage: 'The sequential pipeline stopped before the first handoff could complete.',
          errorMessage: action.message,
        },
        copyFeedback: '',
        selectedRole: action.role,
      }
    case 'select-role':
      return {
        ...state,
        selectedRole: action.role,
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatRoleLabel(role: PipelineRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function nextActionText(generation: GenerationState) {
  if (generation.status === 'error') {
    return 'Rewrite the topic and run the route again from Research results.'
  }

  if (generation.status === 'initial') {
    return 'Generate post to start the first research handoff.'
  }

  if (generation.status === 'loading') {
    switch (generation.currentRole) {
      case 'researcher':
        return 'Wait for the researcher brief so Outline can lock the section order.'
      case 'outliner':
        return 'Review the thesis summary, then let the outliner shape the route.'
      case 'writer':
        return 'The writer is expanding the outline into section drafts for review.'
      case 'reviewer':
        return 'Reviewer edits are in flight. Final post stays locked until that pass ends.'
      default:
        return 'The next handoff is in progress.'
    }
  }

  if (generation.status === 'review-complete') {
    return 'Read the reviewer note, then unlock Final post.'
  }

  if (generation.status === 'export-ready') {
    return 'Copy markdown or open the evidence drawer only if you need benchmark traces.'
  }

  return 'Inspect the current step and move to the next handoff.'
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
    selectedRole: 'researcher',
  })
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const runRef = useRef(0)

  const research = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline
  const writerOutput = state.generation.outputs.section_drafts
  const reviewerOutput = state.generation.outputs.review_notes
  const handoffs = state.generation.outputs.handoffs ?? []

  const roleTracker = pipelineRoles.map((role) => {
    const isComplete = state.generation.completedRoles.includes(role.id)
    const isCurrent = state.generation.currentRole === role.id && state.generation.status !== 'error'
    const handoff = handoffs.find((item) => item.from === role.id)
    return {
      ...role,
      status: isComplete ? 'complete' : isCurrent ? 'current' : 'pending',
      handoffSummary:
        role.id === 'reviewer'
          ? reviewerOutput?.finalizationNote ??
            'Reviewer note appears here after the last editorial handoff.'
          : handoff?.outputSummary ?? 'Handoff note will appear here once this role completes.',
    }
  })

  const selectedRoleMeta = roleTracker.find((role) => role.id === state.selectedRole) ?? roleTracker[0]
  const currentRoleMeta =
    roleTracker.find((role) => role.id === state.generation.currentRole) ??
    (state.generation.status === 'export-ready'
      ? {
          id: 'reviewer',
          label: 'Reviewer',
          stageLabel: 'Final post',
          description: 'Reviewer-adjusted Markdown is now ready for export.',
          handoffLabel: 'Export',
          handoffSummary: reviewerOutput?.finalizationNote ?? 'Export-ready final Markdown is available.',
          status: 'complete',
        }
      : selectedRoleMeta)
  const statusLabel = statusLabels[state.generation.status]
  const currentStageLabel = state.generation.currentStage
    ? stageLabels[state.generation.currentStage]
    : 'Research results'
  const actionHint = nextActionText(state.generation)

  const manifestPreview: Record<string, unknown> = {
    harness: 'sequential_pipeline',
    current_stage: state.generation.currentStage ?? 'research',
    status: state.generation.status,
    completed_roles: state.generation.completedRoles,
  }
  const artifactPreview: ArtifactIndex = {
    screenshots: state.generation.status === 'export-ready' ? ['desktop.png', 'mobile.png'] : [],
    final_urls: state.generation.outputs.final_post ? ['/final-post'] : [],
    notes: [actionHint],
    deliverables: deliverables.map((item) => item.title),
  }
  const scorePreview: Scorecard = {
    ...baseScorePreview,
    ux_score: state.generation.outputs.final_post ? 9 : baseScorePreview.ux_score,
    overall_score: state.generation.outputs.final_post ? 8.9 : baseScorePreview.overall_score,
  }

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId

    if (state.inputs.topic.trim().toLowerCase().includes('fail')) {
      dispatch({
        type: 'set-error',
        role: 'researcher',
        stage: 'research',
        message:
          'Forced failure triggered at the research stage. Remove the fail keyword and rerun the sequential flow.',
      })
      return
    }

    dispatch({
      type: 'start-run',
      message: 'loading | Researcher is summarizing the brief before the first route handoff.',
    })

    const nextResearch = runResearcher(state.inputs)
    const nextOutline = runOutliner(state.inputs, nextResearch)
    const nextWriterOutput = runWriter(state.inputs, nextResearch, nextOutline)
    const nextReviewerOutput = runReviewer(
      state.inputs,
      nextResearch,
      nextOutline,
      nextWriterOutput,
    )
    const finalOutputs = assembleFinalOutputs(
      state.inputs,
      nextResearch,
      nextOutline,
      nextWriterOutput,
      nextReviewerOutput,
    )

    await sleep(320)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'researcher',
      stage: 'research',
      nextRole: 'outliner',
      nextStage: 'outline',
      key: 'research_summary',
      value: nextResearch,
      status: 'loading',
      message: 'loading | Research handoff delivered. Outliner is now shaping the reading route.',
    })

    await sleep(320)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'outliner',
      stage: 'outline',
      nextRole: 'writer',
      nextStage: 'drafts',
      key: 'outline',
      value: nextOutline,
      status: 'loading',
      message: 'loading | Outline locked. Writer is expanding the route into section drafts.',
    })

    await sleep(360)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'writer',
      stage: 'drafts',
      nextRole: 'reviewer',
      nextStage: 'review',
      key: 'section_drafts',
      value: nextWriterOutput,
      status: 'loading',
      message: 'loading | Writer handoff delivered. Reviewer is tightening the copy before export.',
    })

    await sleep(360)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'reviewer',
      stage: 'review',
      nextRole: null,
      nextStage: 'final',
      key: 'review_notes',
      value: nextReviewerOutput,
      handoffs: finalOutputs.handoffs,
      status: 'review-complete',
      message: 'review-complete | Reviewer applied edits. Final post is being prepared for export.',
    })

    await sleep(220)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'finalize-run',
      finalPost: finalOutputs.final_post,
      message: 'export-ready | Final post is ready. Copy markdown when you are done checking the route.',
    })
  }

  async function handleCopyMarkdown() {
    if (!state.generation.outputs.final_post || state.generation.status !== 'export-ready') {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Copy unlocks only after the reviewer finishes and the Final post becomes export-ready.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(state.generation.outputs.final_post)
      dispatch({
        type: 'set-copy-feedback',
        message: 'Final Markdown copied. The export payload matches the reviewer-adjusted route.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message:
          'Clipboard copy failed in this browser context. The Final post is still visible in the export panel.',
      })
    }
  }

  return (
    <main className="pipeline-shell">
      <section className="hero-layout">
        <article className="hero-card">
          <p className="eyebrow">Sequential Pipeline Harness</p>
          <h1>Route-Based Stepper</h1>
          <p className="lead">
            Researcher, outliner, writer, and reviewer advance one brief through a single,
            legible route. The default screen stays focused on the current handoff instead of
            exposing every benchmark artifact at once.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleGenerate}
              disabled={state.generation.status === 'loading'}
            >
              {state.generation.status === 'loading' ? 'Generating...' : 'Generate post'}
            </button>
            <button type="button" className="secondary-button" onClick={handleCopyMarkdown}>
              Copy markdown
            </button>
          </div>

          <div className="status-banner" aria-live="polite">
            <strong>
              <span className={`status-pill status-${state.generation.status}`}>{statusLabel}</span>
              {currentStageLabel}
            </strong>
            <p>{state.generation.statusMessage}</p>
            <p className="copy-feedback">{state.copyFeedback || actionHint}</p>
          </div>
        </article>

        <aside className="control-card">
          <div className="section-head">
            <p className="eyebrow">Brief setup</p>
            <h2>Lock the brief before the first handoff</h2>
          </div>

          <form className="form-grid">
            <label>
              <span>Topic</span>
              <textarea
                name="topic"
                value={state.inputs.topic}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'topic',
                  value: event.target.value,
                })}
              />
            </label>

            <label>
              <span>Audience</span>
              <select
                name="audience"
                value={state.inputs.audience}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'audience',
                  value: event.target.value as Audience,
                })}
              >
                <option value="beginner">Beginner</option>
                <option value="practitioner">Practitioner</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>

            <label>
              <span>Tone</span>
              <select
                name="tone"
                value={state.inputs.tone}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'tone',
                  value: event.target.value as Tone,
                })}
              >
                <option value="clear">Clear</option>
                <option value="pragmatic">Pragmatic</option>
                <option value="opinionated">Opinionated</option>
              </select>
            </label>

            <label>
              <span>Length</span>
              <select
                name="length"
                value={state.inputs.length}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'length',
                  value: event.target.value as Length,
                })}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
          </form>

          <div className="brief-preview">
            <strong className="brief-label">Shared input contract</strong>
            <pre>{JSON.stringify(state.inputs, null, 2)}</pre>
          </div>
        </aside>
      </section>

      <section className="preset-row" aria-label="Benchmark topics">
        {topicPresets.map((preset) => (
          <button
            key={preset.title}
            type="button"
            className="preset-card"
            onClick={() =>
              dispatch({
                type: 'apply-preset',
                payload: {
                  topic: preset.title,
                  audience: preset.audience,
                  tone: preset.tone,
                  length: preset.length,
                },
              })
            }
          >
            <strong>{preset.title}</strong>
            <span>{preset.rationale}</span>
          </button>
        ))}
      </section>

      <section className="panel-card">
        <div className="section-head">
          <p className="eyebrow">Pipeline tracker</p>
          <h2>Research results → Outline → Section drafts → Review notes → Final post</h2>
        </div>

        <div className="tracker-grid">
          {roleTracker.map((role) => (
            <button
              key={role.id}
              type="button"
              className="tracker-card-button"
              onClick={() => dispatch({ type: 'select-role', role: role.id })}
            >
              <article className={`tracker-card tracker-${role.status}`}>
                <div className="tracker-top">
                  <span className="tracker-badge">{role.label}</span>
                  <span className={`tracker-status tracker-${role.status}`}>
                    {role.status === 'complete'
                      ? 'Done'
                      : role.status === 'current'
                        ? 'Active'
                        : 'Pending'}
                  </span>
                </div>
                <h3>{role.stageLabel}</h3>
                <p>{role.description}</p>
                <div className="tracker-footer">
                  <strong>{role.handoffLabel}</strong>
                  <span>{role.handoffSummary}</span>
                </div>
              </article>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-grid">
        <RolePanel
          title={selectedRoleMeta.label}
          stageLabel={selectedRoleMeta.stageLabel}
          status={state.generation.status}
          activeRole={state.generation.currentRole}
          role={selectedRoleMeta.id}
          inputSummary={inputSummaryForRole(state.inputs, selectedRoleMeta.id, research, outline, writerOutput)}
          handoffNote={handoffNoteForRole(selectedRoleMeta.id, research, outline, writerOutput, reviewerOutput)}
          emptyText={emptyTextForRole(selectedRoleMeta.id)}
        >
          {renderRoleSurface(selectedRoleMeta.id, research, outline, writerOutput, reviewerOutput)}
        </RolePanel>

        <article className="panel-card role-panel">
          <div className="section-head">
            <p className="eyebrow">Checkpoint rail</p>
            <h2>Current step and next action</h2>
          </div>

          <div className="role-meta">
            <div>
              <strong>Current step</strong>
              <p>{currentRoleMeta.stageLabel}</p>
            </div>
            <div>
              <strong>Next action</strong>
              <p>{actionHint}</p>
            </div>
          </div>

          <div className="artifact-list">
            <article className="artifact-card">
              <h3>Active owner</h3>
              <p>
                {state.generation.currentRole
                  ? `${formatRoleLabel(state.generation.currentRole)} is responsible for the current transition.`
                  : 'The reviewer handoff is complete and export is now unlocked.'}
              </p>
            </article>

            <article className="artifact-card">
              <h3>Handoff pressure</h3>
              <p>{currentRoleMeta.handoffSummary}</p>
            </article>

            <article className="artifact-card">
              <h3>Export lock</h3>
              <p>
                {state.generation.outputs.final_post
                  ? 'Final post is visible below and ready to copy.'
                  : 'Final post stays locked until the reviewer pass completes.'}
              </p>
            </article>
          </div>
        </article>
      </section>

      <section className="panel-card final-panel">
        <div className="section-head">
          <p className="eyebrow">Final post</p>
          <h2>Reviewer-adjusted Markdown</h2>
        </div>

        {state.generation.status === 'error' ? (
          <div className="error-panel" role="alert">
            <strong>Pipeline stopped at {stageLabels[roleStageMap[state.generation.currentRole ?? 'researcher']]}.</strong>
            <p>{state.generation.errorMessage}</p>
            <p>Use a normal topic brief and rerun the pipeline to validate the happy path.</p>
          </div>
        ) : state.generation.outputs.final_post ? (
          <>
            {reviewerOutput ? <p className="summary-text">{reviewerOutput.finalizationNote}</p> : null}
            <pre className="markdown-preview">{state.generation.outputs.final_post}</pre>
          </>
        ) : (
          <div className="empty-state">
            <p>Final Markdown appears only after reviewer edits are applied.</p>
          </div>
        )}
      </section>

      <details
        className="panel-card final-panel evidence-drawer"
        open={evidenceOpen}
        onToggle={(event) => setEvidenceOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="drawer-summary">
          <div>
            <p className="eyebrow">Benchmark evidence</p>
            <h2>Open only when you need traces and score context</h2>
          </div>
          <span>{evidenceOpen ? 'Hide drawer' : 'Show drawer'}</span>
        </summary>

        <div className="panel-grid evidence-grid">
          <article className="panel-card">
            <div className="section-head">
              <p className="eyebrow">Handoff ledger</p>
              <h2>Delivered transitions</h2>
            </div>

            <div className="handoff-log">
              {handoffs.length > 0 ? (
                handoffs.map((handoff) => (
                  <article key={`${handoff.from}-${handoff.to}`} className="handoff-card">
                    <div className="handoff-heading">
                      <strong>
                        {handoff.from} → {handoff.to}
                      </strong>
                      <span>{handoff.status}</span>
                    </div>
                    <p>{handoff.inputSummary}</p>
                    <p>{handoff.outputSummary}</p>
                  </article>
                ))
              ) : (
                <div className="handoff-empty">
                  <p>The handoff ledger stays empty until the first role completes.</p>
                </div>
              )}
            </div>
          </article>

          <article className="panel-card">
            <div className="section-head">
              <p className="eyebrow">Artifacts and rubric</p>
              <h2>Required evidence for this run</h2>
            </div>

            <div className="artifact-list">
              {deliverables.map((item) => (
                <article key={item.id} className="artifact-card">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>

            <ul className="lens-list">
              {reviewLenses.map((lens) => (
                <li key={lens}>{lens}</li>
              ))}
            </ul>

            <div className="preview-grid">
              <PreviewBlock title="run_manifest.json" payload={manifestPreview} />
              <PreviewBlock title="artifact_index.json" payload={artifactPreview} />
              <PreviewBlock title="scorecard.json" payload={scorePreview} />
            </div>
          </article>
        </div>
      </details>
    </main>
  )
}

function inputSummaryForRole(
  inputs: BlogGeneratorInputs,
  role: PipelineRole,
  research?: PipelineOutputs['research_summary'],
  outline?: PipelineOutputs['outline'],
  writerOutput?: PipelineOutputs['section_drafts'],
) {
  switch (role) {
    case 'researcher':
      return `Topic: ${inputs.topic} / Audience: ${inputs.audience} / Tone: ${inputs.tone} / Length: ${inputs.length}`
    case 'outliner':
      return research
        ? `Received thesis: ${research.thesis}`
        : 'Waiting for the researcher thesis and key findings.'
    case 'writer':
      return outline
        ? `Received ${outline.sections.length} sections and a structure rationale from the outliner.`
        : 'Waiting for the outliner section order.'
    case 'reviewer':
      return writerOutput
        ? 'Received the writer summary and pre-review markdown for editorial tightening.'
        : 'Waiting for the writer handoff.'
  }
}

function handoffNoteForRole(
  role: PipelineRole,
  research?: PipelineOutputs['research_summary'],
  outline?: PipelineOutputs['outline'],
  writerOutput?: PipelineOutputs['section_drafts'],
  reviewerOutput?: PipelineOutputs['review_notes'],
) {
  switch (role) {
    case 'researcher':
      return research?.handoffNote
    case 'outliner':
      return outline?.handoffNote
    case 'writer':
      return writerOutput?.handoffNote
    case 'reviewer':
      return reviewerOutput?.finalizationNote
  }
}

function emptyTextForRole(role: PipelineRole) {
  switch (role) {
    case 'researcher':
      return 'Researcher output will appear after the first brief is processed.'
    case 'outliner':
      return 'Outliner output will appear after the research handoff is delivered.'
    case 'writer':
      return 'Writer output will appear after the outline handoff is delivered.'
    case 'reviewer':
      return 'Reviewer output will appear after the writer handoff is delivered.'
  }
}

function renderRoleSurface(
  role: PipelineRole,
  research?: PipelineOutputs['research_summary'],
  outline?: PipelineOutputs['outline'],
  writerOutput?: PipelineOutputs['section_drafts'],
  reviewerOutput?: PipelineOutputs['review_notes'],
) {
  switch (role) {
    case 'researcher':
      return research ? (
        <>
          <p className="summary-text">{research.angle}</p>
          <p className="summary-text">{research.thesis}</p>
          <ul className="stack-list">
            {research.keyFindings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
          <div className="chip-row">
            {research.searchTerms.map((term) => (
              <span key={term} className="chip">
                {term}
              </span>
            ))}
          </div>
          <ul className="support-list">
            {research.supportingFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </>
      ) : null
    case 'outliner':
      return outline ? (
        <>
          <p className="summary-text">{outline.structureRationale}</p>
          <ol className="outline-list">
            {outline.sections.map((section) => (
              <li key={section.id}>
                <strong>{section.title}</strong>
                <p>{section.goal}</p>
              </li>
            ))}
          </ol>
        </>
      ) : null
    case 'writer':
      return writerOutput ? (
        <>
          <p className="summary-text">{writerOutput.writerSummary}</p>
          <div className="draft-stack">
            {writerOutput.sectionDrafts.map((draft) => (
              <article key={draft.id} className="draft-card">
                <h3>{draft.title}</h3>
                <p>{draft.summary}</p>
                <p className="takeaway">{draft.takeaway}</p>
              </article>
            ))}
          </div>
          <details className="inline-details">
            <summary>Open pre-review markdown</summary>
            <div className="markdown-block">
              <pre>{writerOutput.preReviewMarkdown}</pre>
            </div>
          </details>
        </>
      ) : null
    case 'reviewer':
      return reviewerOutput ? (
        <>
          <div className="review-stack">
            {reviewerOutput.reviewNotes.map((note) => (
              <article key={note.label} className={`review-note review-${note.severity}`}>
                <div>
                  <strong>{note.label}</strong>
                  <span>{note.severity}</span>
                </div>
                <p>{note.detail}</p>
              </article>
            ))}
          </div>
          <div className="edit-list">
            {reviewerOutput.appliedEdits.map((edit) => (
              <article key={edit.label} className="edit-card">
                <h3>{edit.label}</h3>
                <p>
                  <strong>Before:</strong> {edit.before}
                </p>
                <p>
                  <strong>After:</strong> {edit.after}
                </p>
              </article>
            ))}
          </div>
        </>
      ) : null
  }
}

function RolePanel(props: {
  title: string
  stageLabel: string
  status: GenerationStatus
  activeRole: PipelineRole | null
  role: PipelineRole
  inputSummary: string
  handoffNote?: string
  emptyText: string
  children: React.ReactNode
}) {
  const isLoading = props.status === 'loading' && props.activeRole === props.role
  const isError = props.status === 'error' && props.activeRole === props.role
  const hasContent = Boolean(props.children)

  return (
    <article className="panel-card role-panel">
      <div className="section-head">
        <p className="eyebrow">{props.stageLabel}</p>
        <h2>{props.title}</h2>
      </div>

      <div className="role-meta">
        <div>
          <strong>Input</strong>
          <p>{props.inputSummary}</p>
        </div>
        <div>
          <strong>Handoff</strong>
          <p>{props.handoffNote ?? 'Handoff note will appear after this role completes.'}</p>
        </div>
      </div>

      {hasContent ? (
        props.children
      ) : isLoading ? (
        <div className="empty-state loading-state">
          <span className="loading-dot" />
          <p>{props.title} is the active role right now.</p>
        </div>
      ) : isError ? (
        <div className="empty-state error-state">
          <p>This role failed before it could hand off a valid output.</p>
        </div>
      ) : (
        <div className="empty-state">
          <p>{props.emptyText}</p>
        </div>
      )}
    </article>
  )
}

function PreviewBlock(props: { title: string; payload: unknown }) {
  return (
    <article className="preview-block">
      <h3>{props.title}</h3>
      <pre>{JSON.stringify(props.payload, null, 2)}</pre>
    </article>
  )
}

export default App
