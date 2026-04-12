import { useEffect, useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  ArtifactIndex,
  Audience,
  BlogGeneratorInputs,
  GenerationState,
  GenerationStatus,
  LanePacket,
  Length,
  OutlineSection,
  PipelineOutputs,
  SectionAssignment,
  Tone,
  WriterLaneId,
} from './contracts'
import {
  assembleFinalOutputs,
  createCoordinatorBrief,
  createFinalArticle,
  createLanePacket,
  createMergeReport,
} from './generator'
import {
  deliverables,
  evaluationChecklist,
  reviewLenses,
  topicPresets,
  writerLanes,
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
      type: 'set-coordinator'
      brief: NonNullable<PipelineOutputs['research_summary']>
      outline: OutlineSection[]
      assignments: SectionAssignment[]
      message: string
    }
  | { type: 'start-lanes'; message: string }
  | { type: 'set-lane-packet'; packet: LanePacket; message: string }
  | { type: 'start-merge'; message: string }
  | {
      type: 'set-merge-report'
      report: NonNullable<PipelineOutputs['review_notes']>
      message: string
    }
  | {
      type: 'finalize-run'
      outputs: PipelineOutputs
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

function emptyUnitStatuses() {
  return {
    coordinator: 'pending',
    writer_a: 'pending',
    writer_b: 'pending',
    writer_c: 'pending',
    merge_reviewer: 'pending',
  } as GenerationState['unitStatuses']
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentStage: null,
  completedStages: [],
  unitStatuses: emptyUnitStatuses(),
  outputs: {},
  statusMessage: 'Coordinator is waiting for a brief. Generate the newsroom board to lock the common frame first.',
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
                statusMessage: 'Brief updated. Generate again to rebuild the newsroom board from the top.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: 'Preset loaded. Coordinator can now split the article into lane ownership.',
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
          unitStatuses: {
            ...emptyUnitStatuses(),
            coordinator: 'loading',
          },
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
      }
    case 'set-coordinator':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'populated',
          currentStage: 'outline',
          completedStages: unique(['research', 'outline']),
          unitStatuses: {
            ...state.generation.unitStatuses,
            coordinator: 'complete',
          },
          outputs: {
            ...state.generation.outputs,
            research_summary: action.brief,
            outline: action.outline,
            assignments: action.assignments,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'start-lanes':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'drafts',
          unitStatuses: {
            ...state.generation.unitStatuses,
            writer_a: 'loading',
            writer_b: 'loading',
            writer_c: 'loading',
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-lane-packet': {
      const packets = [...(state.generation.outputs.section_drafts ?? []), action.packet].sort((left, right) =>
        left.writerId.localeCompare(right.writerId),
      )

      const nextStatuses = {
        ...state.generation.unitStatuses,
        [action.packet.writerId]: 'complete',
      } as GenerationState['unitStatuses']

      const allLanesComplete =
        nextStatuses.writer_a === 'complete' &&
        nextStatuses.writer_b === 'complete' &&
        nextStatuses.writer_c === 'complete'

      return {
        ...state,
        generation: {
          ...state.generation,
          status: allLanesComplete ? 'populated' : 'loading',
          currentStage: 'drafts',
          completedStages: allLanesComplete
            ? unique([...state.generation.completedStages, 'drafts'])
            : state.generation.completedStages,
          unitStatuses: nextStatuses,
          outputs: {
            ...state.generation.outputs,
            section_drafts: packets,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    }
    case 'start-merge':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'review',
          unitStatuses: {
            ...state.generation.unitStatuses,
            merge_reviewer: 'loading',
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-merge-report':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'review-complete',
          currentStage: 'review',
          completedStages: unique([...state.generation.completedStages, 'review']),
          unitStatuses: {
            ...state.generation.unitStatuses,
            merge_reviewer: 'complete',
          },
          outputs: {
            ...state.generation.outputs,
            review_notes: action.report,
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
          outputs: action.outputs,
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
          unitStatuses: {
            ...emptyUnitStatuses(),
            coordinator: 'error',
          },
          outputs: {},
          statusMessage: 'Coordinator stopped before the common brief could be finalized.',
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
    loading: 'Building board',
    populated: 'Board populated',
    'review-complete': 'Review complete',
    'export-ready': 'Export ready',
    error: 'Error',
  }

  return labels[status]
}

function laneStatusLabel(id: WriterLaneId) {
  if (id === 'writer_a') {
    return 'Opening lane'
  }
  if (id === 'writer_b') {
    return 'Structure lane'
  }
  return 'Closing lane'
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const runRef = useRef(0)
  const [activeReaderPanel, setActiveReaderPanel] = useState<'review' | 'final'>('review')

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId

    dispatch({
      type: 'start-run',
      message: 'Coordinator is locking the common brief before the newsroom splits into three section lanes.',
    })

    await sleep(260)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message:
          'Coordinator research stage could not produce a valid brief. Update the topic and rerun the newsroom board.',
      })
      return
    }

    const { brief, outline, assignments } = createCoordinatorBrief(state.inputs)

    dispatch({
      type: 'set-coordinator',
      brief,
      outline,
      assignments,
      message: 'Coordinator brief is locked. Outline, lane assignments, and merge criteria are now visible.',
    })

    await sleep(220)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'start-lanes',
      message: 'Writer A, B, and C are drafting only their owned sections in parallel.',
    })

    const lanePackets = (
      await Promise.all(
        assignments.map(async (assignment, index) => {
          await sleep(240 + index * 160)
          if (runRef.current !== runId) {
            return null
          }

          const packet = createLanePacket(state.inputs, brief, assignment)
          dispatch({
            type: 'set-lane-packet',
            packet,
            message: `${laneStatusLabel(packet.writerId)} finished ${packet.draftPreview.length} preview block${packet.draftPreview.length > 1 ? 's' : ''}.`,
          })
          return packet
        }),
      )
    ).filter((packet): packet is LanePacket => Boolean(packet))

    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'start-merge',
      message: 'Merge desk is compressing repetition, inserting transitions, and aligning tone across the bundle.',
    })

    await sleep(300)
    if (runRef.current !== runId) {
      return
    }

    const mergeReport = createMergeReport(state.inputs, brief, lanePackets)

    dispatch({
      type: 'set-merge-report',
      report: mergeReport,
      message: 'Merge review is complete. The final article is ready to be assembled for reading and export.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    const finalArticle = createFinalArticle(state.inputs, brief, lanePackets, mergeReport)

    dispatch({
      type: 'finalize-run',
      outputs: assembleFinalOutputs(brief, outline, assignments, lanePackets, mergeReport, finalArticle),
      message: 'Newsroom board is complete. The final article is reader-ready and the export panel is live.',
    })
  }

  async function copyMarkdown() {
    const markdown = state.generation.outputs.final_post

    if (!markdown) {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Generate the merged article first. Copy only succeeds after export-ready state.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(markdown)
      dispatch({
        type: 'set-copy-feedback',
        message: 'Merged markdown copied from the final article export.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: 'Clipboard copy failed in this browser context, but the final Markdown remains visible below.',
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

  const brief = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline ?? []
  const assignments = state.generation.outputs.assignments ?? []
  const lanePackets = state.generation.outputs.section_drafts ?? []
  const mergeReport = state.generation.outputs.review_notes
  const finalArticle = state.generation.outputs.final_article
  const completedLaneCount = lanePackets.length
  const mergeMoment = !brief
    ? 'Waiting for the coordinator to lock the shared thesis.'
    : !completedLaneCount
      ? 'Coordinator is done. Lanes still need to deliver their section packets.'
      : !mergeReport
        ? 'All lane packets are in. The merge desk is condensing duplication and transitions.'
        : finalArticle
          ? 'Merge is complete. Export is unlocked and the article is ready to hand off.'
          : 'Merge review is complete. Final assembly is the last active move.'
  const nextAction = !brief
    ? 'Generate the newsroom board to create the common frame.'
    : completedLaneCount < writerLanes.length
      ? 'Wait for every lane to finish drafting before promoting the reader surface.'
      : !mergeReport
        ? 'Review the merge fixes and let the desk resolve overlap.'
        : 'Review the merged article, then export the markdown.'

  useEffect(() => {
    if (finalArticle) {
      setActiveReaderPanel('final')
      return
    }

    setActiveReaderPanel('review')
  }, [finalArticle, mergeReport])

  const artifactPreview: ArtifactIndex = {
    screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
    final_urls: ['http://127.0.0.1:<dev-port>'],
    notes: [
      'section ownership visible',
      'merge fixes visible',
      'reader-first final article verified',
      'evaluation completed after verification',
    ],
    deliverables: deliverables.map((item) => item.title),
  }

  return (
    <main className="newsroom-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Parallel Sections Harness</p>
          <h1>Tech Blog Post Generator</h1>
          <p className="lead">
            Coordinator fixes the brief, lanes draft in parallel, and the merge desk turns the
            bundle into one article people can actually read end to end.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              onClick={handleGenerate}
              disabled={state.generation.status === 'loading'}
            >
              {state.generation.status === 'loading' ? 'Generating...' : 'Generate post'}
            </button>
            <button type="button" className="secondary" onClick={copyMarkdown}>
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
            <p className="block-label">Next move</p>
            <h2>{finalArticle ? 'Review and export the merged article' : 'Keep the lane board moving'}</h2>
            <p>{nextAction}</p>
            <div className="chip-row">
              <span className="meta-chip">Research results + Outline</span>
              <span className="meta-chip">Section drafts</span>
              <span className="meta-chip">Review notes + Final post</span>
            </div>
          </div>

          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>Coordinator brief failed</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <aside className="panel-surface input-rail">
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
            orchestration pattern is what you are evaluating.
          </p>

          <details className="quick-briefs">
            <summary className="quick-briefs-summary">
              <span className="panel-label">Quick briefs</span>
              <div>
                <strong>Load a preset only when you want a faster starting brief</strong>
                <p>Presets are secondary to the board setup, so they stay collapsed by default.</p>
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
        <article className="panel-surface">
          <div className="section-head">
            <p className="eyebrow">Section drafts</p>
            <h2>Lane board first, merge readiness second</h2>
            <p>Each card stays compact until you open a specific lane packet.</p>
          </div>
          <div className="writer-board">
            {writerLanes.map((lane) => {
              const assignment = assignments.find((item) => item.writerId === lane.id)
              const packet = lanePackets.find((item) => item.writerId === lane.id)
              const laneStatus = state.generation.unitStatuses[lane.id]

              return (
                <article key={lane.id} className={`writer-card status-${laneStatus}`}>
                  <div className="writer-head">
                    <div>
                      <p className="block-label">Lane status</p>
                      <h3>{lane.label}</h3>
                    </div>
                    <span className={`lane-pill lane-${laneStatus}`}>{laneStatus}</span>
                  </div>

                  <p className="lane-focus">{lane.focus}</p>
                  <p className="subtle-copy">{lane.mergeDuty}</p>

                  {assignment ? (
                    <>
                      <div className="sub-block">
                        <h4>Owned sections</h4>
                        <div className="chip-row">
                          {assignment.sectionIds.map((sectionId) => {
                            const section = outline.find((item) => item.id === sectionId)
                            return (
                              <span key={sectionId} className="meta-chip">
                                {section?.title ?? sectionId}
                              </span>
                            )
                          })}
                        </div>
                        <p>{assignment.ownershipRule}</p>
                      </div>

                      {packet ? (
                        <>
                          <div className="sub-block">
                            <h4>Status summary</h4>
                            <p>{packet.statusSummary}</p>
                          </div>

                          <details className="lane-drawer">
                            <summary className="lane-drawer-summary">
                              Open {lane.label} packet
                            </summary>

                            <div className="preview-stack">
                              {packet.draftPreview.map((preview) => (
                                <article key={preview.id} className="preview-card">
                                  <h4>{preview.title}</h4>
                                  <p>{preview.deck}</p>
                                  <ul className="compact-list">
                                    {preview.bullets.map((bullet) => (
                                      <li key={bullet}>{bullet}</li>
                                    ))}
                                  </ul>
                                  <p className="takeaway">{preview.takeaway}</p>
                                </article>
                              ))}
                            </div>

                            <div className="sub-block">
                              <h4>Handoff note</h4>
                              <p>{packet.handoffNote}</p>
                            </div>
                          </details>
                        </>
                      ) : (
                        <div className="empty-state">
                          <p>This lane is assigned and waiting for the drafting phase.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <p>Coordinator has not assigned this lane yet.</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </article>

        <aside className="panel-surface merge-rail">
          <div className="section-head">
            <p className="eyebrow">Merge readiness</p>
            <h2>Current desk pressure and next action</h2>
          </div>

          <div className="merge-rail-stack">
            <article className="info-card">
              <p className="block-label">Current moment</p>
              <h3>{mergeReport ? 'Merge complete' : completedLaneCount ? 'Merge in progress' : 'Waiting on lanes'}</h3>
              <p>{mergeMoment}</p>
            </article>

            <article className="info-card">
              <p className="block-label">Lane coverage</p>
              <h3>
                {completedLaneCount}/{writerLanes.length} lanes delivered
              </h3>
              <p>
                {assignments.length
                  ? `${assignments.length} ownership rules are locked across the board.`
                  : 'Coordinator ownership rules will appear here once the board is initialized.'}
              </p>
            </article>

            <article className="info-card">
              <p className="block-label">Next action</p>
              <h3>{finalArticle ? 'Export or review' : 'Keep the merge desk focused'}</h3>
              <p>{nextAction}</p>
            </article>
          </div>
        </aside>
      </section>

      <details className="panel-surface secondary-panel">
        <summary className="secondary-summary">
          <span className="eyebrow">Research results + Outline</span>
          <div>
            <h2>Coordinator frame, lane ownership, and merge criteria</h2>
            <p>Open the planning context only when you need the shared brief behind the board.</p>
          </div>
        </summary>

        <div className="secondary-body">
          <div className="section-head">
            <p className="eyebrow">Orchestration strip</p>
            <h2>Common frame first, ownership before drafting</h2>
          </div>
          <div className="orchestration-grid">
            <article className="info-card">
              <p className="block-label">Research results</p>
              {brief ? (
                <>
                  <h3>Coordinator brief</h3>
                  <p>{brief.angle}</p>
                  <strong>{brief.thesis}</strong>
                  <p className="subtle-copy">{brief.audienceLens}</p>
                  <p className="subtle-copy">{brief.commonFrame}</p>
                </>
              ) : (
                <div className="empty-state">
                  <p>Generate the board to lock the common thesis and audience lens.</p>
                </div>
              )}
            </article>

            <article className="info-card">
              <p className="block-label">Outline</p>
              {outline.length > 0 ? (
                <>
                  <div className="outline-list">
                    {outline.map((section) => (
                      <article key={section.id} className="outline-item">
                        <div className="outline-top">
                          <h3>{section.title}</h3>
                          <span className="meta-chip">{section.writerHint}</span>
                        </div>
                        <p>{section.goal}</p>
                      </article>
                    ))}
                  </div>

                  <div className="assignment-strip">
                    <h4>Lane assignments</h4>
                    <div className="assignment-list">
                      {assignments.map((assignment) => (
                        <article key={assignment.writerId} className="assignment-card">
                          <strong>{laneStatusLabel(assignment.writerId)}</strong>
                          <p>{assignment.ownershipRule}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <p>Outline and lane assignments appear together once the coordinator finishes.</p>
                </div>
              )}
            </article>

            <article className="info-card">
              <p className="block-label">Merge criteria</p>
              {brief ? (
                <div className="criteria-list">
                  {brief.mergeCriteria.map((criterion) => (
                    <article key={criterion.label} className="criterion-card">
                      <h3>{criterion.label}</h3>
                      <p>{criterion.detail}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Merge criteria appear here before any lane starts drafting.</p>
                </div>
              )}
            </article>
          </div>
        </div>
      </details>

      <section className="reader-grid">
        {mergeReport || finalArticle ? (
          <article className="panel-surface final-panel">
            <div className="reader-shell-head">
              <div className="section-head">
                <p className="eyebrow">Reader surface</p>
                <h2>Only one post-merge surface stays open at a time</h2>
              </div>

              <div className="reader-tabs" role="tablist" aria-label="Post-merge surface">
                <button
                  type="button"
                  className={`reader-tab ${activeReaderPanel === 'review' ? 'is-active' : ''}`}
                  onClick={() => setActiveReaderPanel('review')}
                  role="tab"
                  aria-selected={activeReaderPanel === 'review'}
                >
                  Review notes
                </button>
                <button
                  type="button"
                  className={`reader-tab ${activeReaderPanel === 'final' ? 'is-active' : ''}`}
                  onClick={() => setActiveReaderPanel('final')}
                  role="tab"
                  aria-selected={activeReaderPanel === 'final'}
                >
                  Final post
                </button>
              </div>
            </div>

            {activeReaderPanel === 'review' ? (
              mergeReport ? (
                <div className="merge-layout">
                  <div className="merge-notes">
                    <h3>Review notes</h3>
                    <ul className="compact-list">
                      {mergeReport.reviewNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="fix-grid">
                    {[mergeReport.dedupeFix, mergeReport.transitionFix, mergeReport.toneFix].map((fix) => (
                      <article key={fix.label} className="fix-card">
                        <h3>{fix.label}</h3>
                        <p><strong>Before:</strong> {fix.before}</p>
                        <p><strong>After:</strong> {fix.after}</p>
                        <p className="subtle-copy">{fix.rationale}</p>
                      </article>
                    ))}
                  </div>

                  <div className="merge-summary">
                    <h3>Finalization note</h3>
                    <p>{mergeReport.finalizationNote}</p>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Merge notes appear after all three lanes finish and the review desk starts compressing the bundle.</p>
                </div>
              )
            ) : finalArticle ? (
              <>
                <div className="article-reader">
                  <p className="article-kicker">Newsroom merge complete</p>
                  <h3>{finalArticle.title}</h3>
                  <p className="article-intro">{finalArticle.intro}</p>

                  {finalArticle.mergedSections.map((section) => (
                    <section key={section.id} className="article-section">
                      <h4>{section.title}</h4>
                      <p className="article-deck">{section.deck}</p>
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      <p className="takeaway">{section.takeaway}</p>
                    </section>
                  ))}

                  <div className="article-closing">
                    <h4>Closing checklist</h4>
                    <p>{finalArticle.closing}</p>
                  </div>
                </div>

                <div className="export-card">
                  <h3>Markdown export</h3>
                  <pre className="markdown-preview">{finalArticle.markdown}</pre>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>The final article appears here after merge review closes duplication, transitions, and tone drift.</p>
              </div>
            )}
          </article>
        ) : (
          <article className="panel-surface final-panel">
            <div className="section-head">
              <p className="eyebrow">Reader surface</p>
              <h2>Review notes and the final post stay parked until merge is ready</h2>
            </div>
            <div className="reader-empty-grid">
              <article className="info-card">
                <p className="block-label">Review notes</p>
                <h3>Reserved for merge fixes</h3>
                <p>Keep the reader surface quiet until every lane hands off its packet.</p>
              </article>
              <article className="info-card">
                <p className="block-label">Final post</p>
                <h3>Unlocked after merge</h3>
                <p>The article and Markdown export only take over after the merge desk closes overlap.</p>
              </article>
            </div>
          </article>
        )}
      </section>

      <details className="panel-surface utility-drawer">
        <summary className="utility-summary">
          <span className="eyebrow">Evidence + Evaluation</span>
          <div>
            <h2>Open the benchmark contract only when you need the audit layer</h2>
            <p>
              The board, merge rail, and reader-ready article stay on the primary surface. This
              drawer keeps benchmark obligations available without leading the product story.
            </p>
          </div>
        </summary>

        <div className="utility-body evidence-grid">
          <article className="panel-surface utility-card">
            <div className="section-head">
              <p className="eyebrow">Evidence</p>
              <h2>Deliverables this harness must leave behind</h2>
            </div>
            <div className="artifact-list">
              {deliverables.map((item) => (
                <article key={item.id} className="artifact-card">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="panel-surface utility-card">
            <div className="section-head">
              <p className="eyebrow">Evaluation</p>
              <h2>Review lenses and run contract</h2>
            </div>

            <div className="sub-block">
              <h3>Review lenses</h3>
              <ul className="compact-list">
                {reviewLenses.map((lens) => (
                  <li key={lens}>{lens}</li>
                ))}
              </ul>
            </div>

            <div className="sub-block">
              <h3>Evaluation checklist</h3>
              <ul className="compact-list">
                {evaluationChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="sub-block">
              <h3>Artifact contract</h3>
              <div className="contract-card">
                <p>Expected screenshots: {artifactPreview.screenshots.join(', ')}</p>
                <p>Expected notes: {artifactPreview.notes.join(' / ')}</p>
                <p>Expected deliverables: {artifactPreview.deliverables.join(', ')}</p>
              </div>
            </div>
          </article>
        </div>
      </details>
    </main>
  )
}

export default App
