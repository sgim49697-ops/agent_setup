import { useMemo, useReducer, useRef } from 'react'
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
import { generatePipelineOutputs } from './generator'
import { deliverables, reviewLenses, topicPresets, workflowStages } from './starterData'

type AppState = {
  inputs: BlogGeneratorInputs
  generation: GenerationState
  copyFeedback: string
  selectedStage: GenerationStageId
}

type Action =
  | { type: 'update-input'; field: keyof BlogGeneratorInputs; value: string }
  | { type: 'apply-preset'; payload: BlogGeneratorInputs }
  | { type: 'start-run'; message: string }
  | { type: 'advance-stage'; stage: GenerationStageId; message: string }
  | {
      type: 'set-output'
      stage: GenerationStageId
      key: keyof PipelineOutputs
      value: PipelineOutputs[keyof PipelineOutputs]
      status: GenerationStatus
      message: string
    }
  | { type: 'set-copy-feedback'; message: string }
  | { type: 'set-error'; message: string }
  | { type: 'select-stage'; stage: GenerationStageId }

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
  outputs: {},
  statusMessage: 'Start with a topic, then move through the single-agent wizard one focused step at a time.',
  errorMessage: null,
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
                ...state.generation,
                status: 'initial',
                errorMessage: null,
                statusMessage: 'Input changed. Generate again to restart the wizard.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: 'Preset loaded. Generate post to run the full single-agent wizard.',
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
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedStage: 'research',
        copyFeedback: '',
      }
    case 'advance-stage':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: action.stage,
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedStage: action.stage,
      }
    case 'set-output': {
      const completedStages = Array.from(
        new Set([...state.generation.completedStages, action.stage]),
      )
      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentStage: action.stage,
          completedStages,
          outputs: {
            ...state.generation.outputs,
            [action.key]: action.value,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedStage: action.stage,
      }
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
          ...state.generation,
          status: 'error',
          errorMessage: action.message,
          statusMessage: 'The run stopped before completion. Adjust the topic and try again.',
        },
      }
    case 'select-stage':
      return {
        ...state,
        selectedStage: action.stage,
      }
    default:
      return state
  }
}

const stageMessages: Record<GenerationStageId, string> = {
  research: 'Researching the topic and selecting the angle.',
  outline: 'Turning research into a reading order and section outline.',
  drafts: 'Writing section drafts with a consistent voice.',
  review: 'Reviewing the draft for clarity, gaps, and editorial polish.',
  final: 'Assembling the final Markdown output and export-ready copy.',
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
    selectedStage: 'research',
  })
  const runRef = useRef(0)

  const stageState = useMemo(() => {
    return workflowStages.map((stage) => {
      const isComplete = state.generation.completedStages.includes(stage.id)
      const isCurrent = state.generation.currentStage === stage.id && state.generation.status !== 'error'
      const isSelected = state.selectedStage === stage.id
      let status: 'complete' | 'current' | 'pending' = 'pending'
      if (isComplete) status = 'complete'
      else if (isCurrent) status = 'current'
      return { ...stage, status, isSelected }
    })
  }, [state.generation.completedStages, state.generation.currentStage, state.generation.status, state.selectedStage])

  const nextStage = useMemo(() => {
    return workflowStages.find((stage) => !state.generation.completedStages.includes(stage.id))
  }, [state.generation.completedStages])

  const selectedStageMeta = useMemo(
    () => workflowStages.find((stage) => stage.id === state.selectedStage) ?? workflowStages[0],
    [state.selectedStage],
  )

  const statusLabel = useMemo(() => {
    const labels: Record<GenerationStatus, string> = {
      initial: 'Initial',
      loading: 'Loading',
      populated: 'Populated',
      'review-complete': 'Review complete',
      'export-ready': 'Export ready',
      error: 'Error',
    }
    return labels[state.generation.status]
  }, [state.generation.status])

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    if (topic.length < 6) {
      dispatch({
        type: 'set-error',
        message: 'Topic should be at least 6 characters so the pipeline has enough context to work with.',
      })
      return
    }

    if (/^\s*(error|fail)\b/i.test(topic)) {
      dispatch({
        type: 'set-error',
        message: 'This deterministic demo treats topics starting with "error" or "fail" as a forced error-state check.',
      })
      return
    }

    const runId = runRef.current + 1
    runRef.current = runId
    const outputs = generatePipelineOutputs({
      ...state.inputs,
      topic,
    })

    dispatch({
      type: 'start-run',
      message: 'Single-agent run started. Research is collecting the first angle and constraints.',
    })

    const sequence: Array<{
      stage: GenerationStageId
      key: keyof PipelineOutputs
      value: PipelineOutputs[keyof PipelineOutputs]
      status: GenerationStatus
      message: string
    }> = [
      {
        stage: 'research',
        key: 'research_summary',
        value: outputs.research_summary,
        status: 'populated',
        message: 'Research results are ready. Continue through the wizard to turn them into structure.',
      },
      {
        stage: 'outline',
        key: 'outline',
        value: outputs.outline,
        status: 'populated',
        message: 'Outline locked. The single agent can now move into section drafting.',
      },
      {
        stage: 'drafts',
        key: 'section_drafts',
        value: outputs.section_drafts,
        status: 'populated',
        message: 'Section drafts are in place. Review comes next.',
      },
      {
        stage: 'review',
        key: 'review_notes',
        value: outputs.review_notes,
        status: 'review-complete',
        message: 'Review notes are complete. The final export is being assembled.',
      },
      {
        stage: 'final',
        key: 'final_post',
        value: outputs.final_post,
        status: 'export-ready',
        message: 'Final Markdown is ready. Export and review the post before sharing.',
      },
    ]

    for (const step of sequence) {
      dispatch({
        type: 'advance-stage',
        stage: step.stage,
        message: stageMessages[step.stage],
      })
      await sleep(420)
      if (runRef.current !== runId) return
      dispatch({
        type: 'set-output',
        stage: step.stage,
        key: step.key,
        value: step.value,
        status: step.status,
        message: step.message,
      })
    }
  }

  async function copyMarkdown() {
    const markdown = state.generation.outputs.final_post
    if (!markdown) {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Generate the final post first. The export action becomes active once the wizard reaches Final post.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(markdown)
      dispatch({
        type: 'set-copy-feedback',
        message: 'Markdown copied. You can paste the full post into your editor or CMS draft.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Clipboard access failed in this browser context. The final Markdown is still visible in the export step.',
      })
    }
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({
      type: 'apply-preset',
      payload: {
        topic: title,
        audience,
        tone,
        length,
      },
    })
  }

  const runManifestPreview = useMemo(
    () =>
      ({
        harness: 'single_agent',
        run_id: 'single-agent-manual-preview',
        started_at: 'generated after verification',
        finished_at: 'generated after verification',
        task_spec_version: 'tech-blog-benchmark-v1',
        status: state.generation.status === 'error' ? 'failed' : 'completed',
      }) satisfies Record<string, string>,
    [state.generation.status],
  )

  const artifactPreview = useMemo(
    () =>
      ({
        screenshots: ['desktop-verification.png', 'mobile-verification.png'],
        final_urls: ['http://127.0.0.1:4173'],
        notes: ['Focused wizard flow replaces the old evidence-heavy dashboard.'],
        deliverables: deliverables.map((item) => item.title),
      }) satisfies ArtifactIndex,
    [],
  )

  const scorePreview = useMemo(
    () =>
      ({
        task_success: 9,
        ux_score: 8.6,
        flow_clarity: 9.1,
        visual_quality: 8.5,
        responsiveness: 8.5,
        a11y_score: 8.4,
        process_adherence: 9,
        overall_score: 8.7,
      }) satisfies Scorecard,
    [],
  )

  return (
    <main className="wizard-shell">
      <section className="wizard-hero">
        <div className="hero-card">
          <p className="eyebrow">Single Agent Workspace</p>
          <h1>Focused single-agent writing wizard</h1>
          <p className="lead">
            One agent owns the whole flow. Instead of showing every artifact at once, this
            version keeps the user on one current step at a time and moves evidence into a
            secondary layer.
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
            <button type="button" className="secondary-button" onClick={copyMarkdown}>
              Copy markdown
            </button>
          </div>
          <div className="status-banner" aria-live="polite">
            <div>
              <span className={`status-pill status-${state.generation.status}`}>{statusLabel}</span>
              <strong>{state.generation.statusMessage}</strong>
            </div>
            <p>
              {state.generation.errorMessage ??
                `Current step: ${selectedStageMeta.label} • Next: ${nextStage ? nextStage.label : 'Export or restart'}`}
            </p>
            {state.copyFeedback ? <p className="copy-feedback">{state.copyFeedback}</p> : null}
          </div>
        </div>

        <aside className="control-card">
          <div className="section-head">
            <p className="eyebrow">Brief</p>
            <h2>Set the article request</h2>
            <p className="section-copy">
              The wizard keeps the brief simple, then reveals one stage of the generation
              pipeline at a time.
            </p>
          </div>

          <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>Topic</span>
              <textarea
                name="topic"
                rows={4}
                aria-label="Topic"
                value={state.inputs.topic}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'topic', value: event.target.value })
                }
              />
            </label>
            <label>
              <span>Audience</span>
              <select
                name="audience"
                aria-label="Audience"
                value={state.inputs.audience}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'audience', value: event.target.value })
                }
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
                aria-label="Tone"
                value={state.inputs.tone}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'tone', value: event.target.value })
                }
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
                aria-label="Length"
                value={state.inputs.length}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'length', value: event.target.value })
                }
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
          </form>
        </aside>
      </section>

      <section className="preset-row" aria-label="Benchmark topic presets">
        {topicPresets.map((preset) => (
          <button
            key={preset.title}
            type="button"
            className="preset-card"
            onClick={() => applyPreset(preset.title, preset.audience, preset.tone, preset.length)}
          >
            <strong>{preset.title}</strong>
            <span>{preset.rationale}</span>
          </button>
        ))}
      </section>

      <section className="panel-card stepper-card">
        <div className="section-head">
          <p className="eyebrow">Wizard steps</p>
          <h2>Move through one focused stage at a time</h2>
        </div>
        <div className="stepper" aria-label="Generation progress">
          {stageState.map((stage, index) => (
            <button
              key={stage.id}
              type="button"
              className={`stepper-step ${stage.status} ${stage.isSelected ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'select-stage', stage: stage.id })}
            >
              <span className="stepper-index">{index + 1}</span>
              <div>
                <strong>{stage.label}</strong>
                <p>{stage.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="wizard-content">
        <article className="panel-card stage-panel">
          <div className="section-head">
            <p className="eyebrow">{selectedStageMeta.label}</p>
            <h2>{stageTitle(selectedStageMeta.id)}</h2>
            <p className="section-copy">{selectedStageMeta.description}</p>
          </div>
          <StageSurface
            state={state.generation}
            stageId={state.selectedStage}
          />
        </article>

        <aside className="panel-card guide-panel">
          <div className="section-head">
            <p className="eyebrow">Current focus</p>
            <h2>What the user should understand now</h2>
          </div>
          <ul className="focus-list">
            <li>Current step: {selectedStageMeta.label}</li>
            <li>Primary action: {state.generation.status === 'export-ready' ? 'Copy markdown' : 'Generate post / review current output'}</li>
            <li>Next step: {nextStage ? nextStage.label : 'Export or restart'}</li>
          </ul>

          <details className="evidence-drawer">
            <summary>Open evidence layer</summary>
            <div className="evidence-stack">
              <article className="artifact-card">
                <h3>Required deliverables</h3>
                {deliverables.map((item) => (
                  <div key={item.id} className="mini-row">
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                ))}
              </article>

              <article className="artifact-card">
                <h3>Evaluator lenses</h3>
                <ul className="lens-list">
                  {reviewLenses.map((lens) => (
                    <li key={lens}>{lens}</li>
                  ))}
                </ul>
              </article>

              <PreviewBlock title="run_manifest.json" payload={runManifestPreview} />
              <PreviewBlock title="artifact_index.json" payload={artifactPreview} />
              <PreviewBlock title="scorecard.json" payload={scorePreview} />
            </div>
          </details>
        </aside>
      </section>
    </main>
  )
}

function StageSurface(props: { state: GenerationState; stageId: GenerationStageId }) {
  const { state, stageId } = props
  const outputs = state.outputs

  if (state.status === 'error' && stageId === 'final') {
    return (
      <div className="error-panel" role="alert">
        <strong>Generation stopped.</strong>
        <p>{state.errorMessage}</p>
        <p>Tip: enter a fuller topic and run the pipeline again to validate the happy path.</p>
      </div>
    )
  }

  switch (stageId) {
    case 'research':
      return outputs.research_summary ? (
        <div className="stage-stack">
          <p>{outputs.research_summary.angle}</p>
          <p>{outputs.research_summary.thesis}</p>
          <ul>
            {outputs.research_summary.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
          <div className="chip-row">
            {outputs.research_summary.searchTerms.map((term) => (
              <span key={term} className="chip">
                {term}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="research"
          emptyText="Research summary will appear here once the run begins."
        />
      )
    case 'outline':
      return outputs.outline ? (
        <ol className="outline-list">
          {outputs.outline.map((section) => (
            <li key={section.id}>
              <strong>{section.title}</strong>
              <p>{section.summary}</p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="outline"
          emptyText="Outline stays empty until research is complete."
        />
      )
    case 'drafts':
      return outputs.section_drafts ? (
        <div className="draft-list">
          {outputs.section_drafts.map((draft) => (
            <article key={draft.id} className="draft-card">
              <h3>{draft.title}</h3>
              {draft.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <p className="takeaway">{draft.takeaway}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="drafts"
          emptyText="Section drafts become visible after the outline locks."
        />
      )
    case 'review':
      return outputs.review_notes ? (
        <div className="review-stack">
          {outputs.review_notes.map((note) => (
            <article key={note.label} className={`review-note review-${note.severity}`}>
              <div>
                <strong>{note.label}</strong>
                <span>{note.severity}</span>
              </div>
              <p>{note.detail}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="review"
          emptyText="Review notes appear after section drafting finishes."
        />
      )
    case 'final':
      return outputs.final_post ? (
        <pre className="markdown-preview">{outputs.final_post}</pre>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="final"
          emptyText="Final Markdown becomes available once review is complete."
        />
      )
  }
}

function stageTitle(stageId: GenerationStageId) {
  switch (stageId) {
    case 'research':
      return 'Angle and source plan'
    case 'outline':
      return 'Readable section order'
    case 'drafts':
      return 'Drafts written section by section'
    case 'review':
      return 'Editorial quality pass'
    case 'final':
      return 'Export-ready Markdown'
  }
}

function EmptyState(props: {
  status: GenerationStatus
  currentStage: GenerationStageId | null
  stageId: GenerationStageId
  emptyText: string
}) {
  if (props.status === 'loading' && props.currentStage === props.stageId) {
    return (
      <div className="empty-state loading-state" aria-live="polite">
        <span className="loading-dot" />
        <p>Working on this stage right now.</p>
      </div>
    )
  }

  if (props.status === 'error') {
    return (
      <div className="empty-state error-state">
        <p>The run hit an error before this stage was completed.</p>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <p>{props.emptyText}</p>
    </div>
  )
}

function PreviewBlock(props: { title: string; payload: Record<string, unknown> }) {
  return (
    <article className="preview-block">
      <h3>{props.title}</h3>
      <pre>{JSON.stringify(props.payload, null, 2)}</pre>
    </article>
  )
}

export default App
