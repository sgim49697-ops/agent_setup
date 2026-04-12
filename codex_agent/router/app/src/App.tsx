import { useEffect, useReducer, useRef, useState } from 'react'
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
  statusMessage: 'Router is waiting for a brief. Generate the article to classify the topic first.',
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
                statusMessage: 'Brief updated. Generate again to rerun the router decision.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: 'Preset loaded. The router can now choose a specialist path.',
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
          statusMessage: 'Router stopped before a specialist path could be chosen.',
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
  const [activeSurface, setActiveSurface] = useState<FocusSurface>('research')

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId

    dispatch({
      type: 'start-run',
      message: 'Router is classifying the topic and choosing the best specialist path.',
    })

    await sleep(240)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message: 'Router classification stage could not produce a valid specialist path. Update the topic and rerun the harness.',
      })
      return
    }

    const routingDecision = routeTopic(state.inputs.topic)

    dispatch({
      type: 'set-routing',
      routingDecision,
      message: `${getSpecialistProfile(routingDecision.specialist).label} selected with ${(routingDecision.confidence * 100).toFixed(0)}% confidence.`,
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
      message: 'Research results are ready. The chosen specialist is shaping the outline.',
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
      message: 'Outline is locked. Section drafts are now being written through the selected specialist lens.',
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
      message: 'Section drafts are populated. Review notes are being assembled next.',
    })

    dispatch({
      type: 'set-output',
      stage: 'drafts',
      key: 'voice_notes',
      value: specialistOutput.voiceNotes,
      status: 'populated',
      message: 'Section drafts are populated. Review notes are being assembled next.',
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
      message: 'Review notes are complete. Final post is being packaged for export.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'finalize-run',
      finalPost: specialistOutput.finalPost,
      message: 'Router pipeline is complete. Final post and evaluation checklist are ready.',
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
        message: 'Final markdown copied from the routed specialist output.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Clipboard copy failed here, but the final markdown is still visible below.',
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
    ? 'Waiting for the router to classify the topic.'
    : finalPost
      ? 'Chosen route is complete and export is unlocked.'
      : state.generation.currentStage === 'research'
        ? 'Router confidence is locked while the specialist builds the research brief.'
        : state.generation.currentStage === 'outline'
          ? 'The specialist path is shaping the outline around the selected lens.'
          : state.generation.currentStage === 'drafts'
            ? 'Section drafting is underway through the routed specialist lens.'
            : 'Review notes are tightening the route before the final export opens.'
  const nextAction = !routingDecision
    ? 'Generate the article so the router can choose a specialist path.'
    : !researchSummary
      ? 'Hold on the route shell while the chosen specialist frames the brief.'
      : !outline.length
        ? 'Wait for the outline to lock before comparing section direction.'
        : !sectionDrafts.length
          ? 'Track the routed specialist as section drafts appear.'
          : !reviewNotes.length
            ? 'Let the review lens finish before promoting the final post.'
            : 'Read the final post, then copy the markdown when the route looks right.'
  const routeSignals =
    routingDecision?.matchedSignals.length
      ? routingDecision.matchedSignals.join(', ')
      : 'No strong signals were found, so the router stayed conservative.'

  useEffect(() => {
    if (finalPost || state.generation.currentStage === 'review') {
      setActiveSurface('review')
      return
    }

    if (state.generation.currentStage === 'drafts') {
      setActiveSurface('drafts')
      return
    }

    if (state.generation.currentStage === 'outline') {
      setActiveSurface('outline')
      return
    }

    setActiveSurface('research')
  }, [finalPost, state.generation.currentStage])

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
          <p className="eyebrow">Router Harness</p>
          <h1>Tech Blog Post Generator</h1>
          <p className="lead">
            The router classifies the topic, chooses the best specialist path, records why
            it made that decision, and keeps a fallback route when the signals are weak.
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
            <h2>{routingDecision ? 'Stay on the chosen route' : 'Classify the brief first'}</h2>
            <p>{nextAction}</p>
            <div className="token-row">
              <span>Chosen route</span>
              <span>Fallback route</span>
              <span>Final post</span>
            </div>
          </div>

          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>Routing failed</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <aside className="hero-panel input-rail">
          <p className="panel-label">Input brief</p>
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
            This harness stays frontend-only and uses deterministic local routing so the
            decision shell is what you are evaluating first.
          </p>
          <details className="quick-briefs">
            <summary className="quick-briefs-summary">
              <span>Quick briefs</span>
              <div>
                <strong>Load a preset only when you want a faster routing signal.</strong>
                <p>Presets stay secondary so the route shell leads the product story.</p>
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
            <p className="eyebrow">Routing Desk</p>
            <h2>Chosen route, fallback route, and why-routing</h2>
          </div>
          {routingDecision && chosenSpecialist ? (
            <div className="route-body">
              <div className="route-card">
                <div className="route-head">
                  <div>
                    <p className="eyebrow">Chosen specialist</p>
                    <h3>{chosenSpecialist.label}</h3>
                  </div>
                  <span className={`route-pill route-${routingDecision.specialist}`}>
                    {(routingDecision.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p>{routingDecision.reason}</p>
                <p><strong>Writing focus:</strong> {chosenSpecialist.writingFocus}</p>
                <p><strong>UI lens:</strong> {chosenSpecialist.uiLens}</p>
                <p><strong>Review lens:</strong> {chosenSpecialist.reviewLens}</p>
              </div>

              <div className="route-card">
                <h3>Why this route</h3>
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
                <h3>Fallback route</h3>
                <p>{routingDecision.fallbackReason ?? 'Fallback route stays parked because the chosen specialist is strong enough.'}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>Router is idle</h3>
              <p>Generate the article to see which specialist the router selects and why.</p>
            </div>
          )}
        </article>

        <aside className="panel route-rail">
          <div className="section-head">
            <p className="eyebrow">Route control</p>
            <h2>Current route pressure and next action</h2>
          </div>
          <div className="route-summary-stack">
            <article className="info-card">
              <h3>Current moment</h3>
              <p>{routeMoment}</p>
            </article>
            <article className="info-card">
              <h3>Chosen route</h3>
              <p>{chosenSpecialist ? chosenSpecialist.label : 'No specialist chosen yet.'}</p>
              <p className="lens-note">
                {routingDecision
                  ? `${(routingDecision.confidence * 100).toFixed(0)}% confidence routed through ${routingDecision.specialist}.`
                  : 'Router confidence appears here after the first classification.'}
              </p>
            </article>
            <article className="info-card">
              <h3>Next action</h3>
              <p>{nextAction}</p>
            </article>
          </div>
        </aside>
      </section>

      <section className="grid-two">
        <article className="panel final-panel">
          <div className="section-head">
            <p className="eyebrow">Final post</p>
            <h2>Routed Markdown export</h2>
          </div>
          {finalPost ? (
            <pre className="markdown-preview">{finalPost}</pre>
          ) : (
            <div className="empty-state">
              <p>The final post appears here after the selected specialist finishes review.</p>
            </div>
          )}
        </article>

        <article className="panel focus-panel">
          <div className="section-head">
            <p className="eyebrow">Specialist workspace</p>
            <h2>Only one routed surface stays open at a time</h2>
          </div>
          <div className="surface-tabs" role="tablist" aria-label="Routed workspace">
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'research' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'research'}
              onClick={() => setActiveSurface('research')}
            >
              Research results
            </button>
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'outline' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'outline'}
              onClick={() => setActiveSurface('outline')}
            >
              Outline
            </button>
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'drafts' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'drafts'}
              onClick={() => setActiveSurface('drafts')}
            >
              Section drafts
            </button>
            <button
              type="button"
              className={`surface-tab ${activeSurface === 'review' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={activeSurface === 'review'}
              onClick={() => setActiveSurface('review')}
            >
              Review notes
            </button>
          </div>

          {activeSurface === 'research' ? (
            chosenSpecialist && researchSummary ? (
              <div className="workspace-body">
                <div className="info-card">
                  <h3>Research results</h3>
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
                  <h3>Voice notes</h3>
                  <ul className="review-list compact-list">
                    {voiceNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>The chosen specialist profile, research summary, and voice notes appear here after routing.</p>
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
                <p>Outline appears after the router locks a specialist path.</p>
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
                <p>Section drafts appear here once the selected specialist starts writing.</p>
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
                <p>Review notes appear after section drafts are generated.</p>
              </div>
            )
          ) : null}
        </article>
      </section>

      <section className="panel stage-panel">
        <div className="section-head">
          <p className="eyebrow">Stage Tracker</p>
          <h2>One router, one chosen specialist, one fallback path</h2>
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
          <span>Evidence + Evaluation</span>
          <div>
            <strong>Open the benchmark contract only when you need the audit layer.</strong>
            <p>The chosen route, route control rail, and routed post stay on the primary surface.</p>
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
            <ul className="review-list compact-list">
              {evaluationChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="info-card">
            <h3>Review lenses</h3>
            <ul className="review-list compact-list">
              {reviewLenses.map((lens) => (
                <li key={lens}>{lens}</li>
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
