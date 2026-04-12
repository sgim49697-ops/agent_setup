import { useEffect, useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStatus,
  IterationRecord,
  Length,
  PipelineOutputs,
  Tone,
} from './contracts'
import { generatePipelineOutputs, isForcedErrorTopic } from './generator'
import { deliverables, evaluationTargets, topicPresets, workflowStages } from './starterData'

type ReaderSurface = 'research' | 'outline' | 'drafts' | 'review'

interface AppState {
  inputs: BlogGeneratorInputs
  status: GenerationStatus
  statusMessage: string
  copyFeedback: string
  outputs: PipelineOutputs | null
  revealedIterations: number
  selectedIteration: number
  isGenerating: boolean
  errorMessage: string | null
}

type Action =
  | {
      type: 'update_field'
      field: keyof BlogGeneratorInputs
      value: BlogGeneratorInputs[keyof BlogGeneratorInputs]
    }
  | { type: 'apply_preset'; preset: BlogGeneratorInputs }
  | { type: 'start_generation'; outputs: PipelineOutputs }
  | {
      type: 'reveal_iteration'
      count: number
      selectedIteration: number
      status: GenerationStatus
      statusMessage: string
    }
  | { type: 'finish_generation'; statusMessage: string }
  | { type: 'generation_error'; message: string }
  | { type: 'select_iteration'; iteration: number }
  | { type: 'set_copy_feedback'; feedback: string }

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialState: AppState = {
  inputs: initialInputs,
  status: 'initial',
  statusMessage: 'initial | Writer pass is idle. Generate to start the review loop.',
  copyFeedback: '',
  outputs: null,
  revealedIterations: 0,
  selectedIteration: 0,
  isGenerating: false,
  errorMessage: null,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'update_field':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          [action.field]: action.value,
        },
        copyFeedback: '',
        errorMessage: null,
      }
    case 'apply_preset':
      return {
        ...state,
        inputs: action.preset,
        statusMessage: 'Preset loaded. The next Generate run will replay the evaluator loop.',
        copyFeedback: '',
        errorMessage: null,
      }
    case 'start_generation':
      return {
        ...state,
        outputs: action.outputs,
        revealedIterations: 0,
        selectedIteration: 0,
        status: 'loading',
        statusMessage: 'loading | Writer pass is drafting the rough release candidate.',
        isGenerating: true,
        copyFeedback: '',
        errorMessage: null,
      }
    case 'reveal_iteration':
      return {
        ...state,
        revealedIterations: action.count,
        selectedIteration: action.selectedIteration,
        status: action.status,
        statusMessage: action.statusMessage,
      }
    case 'finish_generation':
      return {
        ...state,
        status: 'export-ready',
        statusMessage: action.statusMessage,
        isGenerating: false,
      }
    case 'generation_error':
      return {
        ...state,
        status: 'error',
        statusMessage: `error | ${action.message}`,
        copyFeedback: '',
        outputs: null,
        revealedIterations: 0,
        selectedIteration: 0,
        isGenerating: false,
        errorMessage: action.message,
      }
    case 'select_iteration':
      return {
        ...state,
        selectedIteration: action.iteration,
        copyFeedback: '',
      }
    case 'set_copy_feedback':
      return {
        ...state,
        copyFeedback: action.feedback,
        statusMessage: action.feedback,
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function stageState(
  index: number,
  status: GenerationStatus,
  revealedIterations: number,
): 'waiting' | 'active' | 'complete' {
  if (status === 'error') {
    return index === 0 ? 'active' : 'waiting'
  }

  if (status === 'initial') {
    return index === 0 ? 'active' : 'waiting'
  }

  if (revealedIterations === 0 || status === 'loading') {
    return index === 0 ? 'active' : 'waiting'
  }

  if (index < 4) {
    return 'complete'
  }

  return status === 'export-ready' ? 'complete' : 'active'
}

function formatCounts(record: IterationRecord | null) {
  if (!record) {
    return 'Queued'
  }

  return `${record.passCount} PASS / ${record.partialCount} PARTIAL / ${record.failCount} FAIL`
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [readerSurface, setReaderSurface] = useState<ReaderSurface>('research')
  const runTokenRef = useRef(0)

  useEffect(() => {
    return () => {
      runTokenRef.current += 1
    }
  }, [])

  const visibleIterations = state.outputs?.iterations.slice(0, state.revealedIterations) ?? []
  const latestVisibleIteration = visibleIterations[visibleIterations.length - 1] ?? null
  const selectedIteration =
    visibleIterations.find((record) => record.iteration === state.selectedIteration) ??
    latestVisibleIteration
  const finalArticle =
    state.outputs && state.revealedIterations >= 3 ? state.outputs.final_article : null
  const hasLoopStarted = state.status !== 'initial'
  const repairRows = selectedIteration?.verdictRows.filter((row) => row.verdict !== 'PASS') ?? []
  const loopStatus =
    state.status === 'initial'
      ? 'Waiting for the first writer pass.'
      : state.status === 'loading'
        ? 'Writer, reviewer, and optimizer are replaying the loop.'
        : state.status === 'error'
          ? 'The loop stopped before review because the topic triggered a forced failure.'
          : state.status === 'export-ready'
            ? `Loop complete. ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 checklist gates cleared.`
            : `Visible loop ${selectedIteration?.iteration ?? 0}/3 is on screen.`
  const currentGateTitle =
    state.status === 'initial'
      ? 'Brief intake'
      : state.status === 'loading' && state.revealedIterations === 0
        ? 'Writer draft'
        : state.status === 'loading'
          ? `Loop ${Math.min(state.revealedIterations + 1, 3)} review gate`
          : state.status === 'error'
            ? 'Recovery gate'
            : state.status === 'export-ready'
              ? 'Release candidate'
              : `Loop ${state.revealedIterations} is staged`
  const nextActionTitle =
    state.status === 'initial'
      ? 'Generate the first pass'
      : state.status === 'loading'
        ? 'Wait for the loop replay'
        : state.status === 'error'
          ? 'Fix the brief and rerun'
          : state.status === 'export-ready'
            ? 'Copy markdown or review the release'
            : `Inspect loop ${selectedIteration?.iteration ?? state.revealedIterations}`
  const nextActionBody =
    state.status === 'initial'
      ? 'Set the brief, then start the writer-reviewer-optimizer loop.'
      : state.status === 'loading'
        ? 'The reviewer and optimizer are still replaying the revision cycle in sequence.'
        : state.status === 'error'
          ? 'Remove the forced-failure prefix from the topic and generate again to recover.'
          : state.status === 'export-ready'
            ? 'The release gate is open, so the product surface can shift from repair work to export.'
            : 'Pick the visible loop, inspect the blocker, then confirm the optimizer response before exporting.'
  const remainingLoops = Math.max(3 - state.revealedIterations, 0)
  const exportLockTitle =
    finalArticle || state.status === 'export-ready'
      ? 'Export unlocked'
      : `${remainingLoops} loop${remainingLoops === 1 ? '' : 's'} remaining`
  const exportLockBody =
    finalArticle || state.status === 'export-ready'
      ? `Iteration 3 cleared ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 reviewer gates and unlocked copy.`
      : 'Copy stays visible for contract stability, but export remains locked until the third visible loop clears the release gate.'
  const readerTabs = [
    { id: 'research', label: '연구 결과 Research results' },
    { id: 'outline', label: '개요 Outline' },
    { id: 'drafts', label: '섹션 초안 Section drafts' },
    { id: 'review', label: '리뷰 메모 Review notes' },
  ] as const

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({ type: 'update_field', field, value })
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({
      type: 'apply_preset',
      preset: {
        topic: title,
        audience,
        tone,
        length,
      },
    })
  }

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken
    setReaderSurface('research')

    if (isForcedErrorTopic(topic)) {
      dispatch({
        type: 'generation_error',
        message:
          'The reviewer blocked this topic at classification time. Remove the fail/error prefix and run the loop again.',
      })
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    dispatch({ type: 'start_generation', outputs })

    await sleep(500)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'reveal_iteration',
      count: 1,
      selectedIteration: 1,
      status: 'populated',
      statusMessage: 'populated | Iteration 1 logged 0 PASS / 3 PARTIAL / 6 FAIL. Optimizer is rewriting the baseline.',
    })

    await sleep(650)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'reveal_iteration',
      count: 2,
      selectedIteration: 2,
      status: 'populated',
      statusMessage: 'populated | Iteration 2 recovered the major blockers and moved the loop to 6 PASS / 3 PARTIAL.',
    })

    await sleep(650)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'reveal_iteration',
      count: 3,
      selectedIteration: 3,
      status: 'review-complete',
      statusMessage: 'review-complete | Iteration 3 closed every reviewer gate and promoted the release candidate.',
    })

    await sleep(280)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'finish_generation',
      statusMessage: `export.ready | Iteration 3 cleared ${outputs.loop_summary.lastIterationPassCount}/9 checklist gates.`,
    })
  }

  async function handleCopyMarkdown() {
    if (!finalArticle || state.status !== 'export-ready') {
      dispatch({
        type: 'set_copy_feedback',
        feedback: 'Copy unlocks after iteration 3 finishes and the release candidate is export-ready.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalArticle.markdown)
      dispatch({
        type: 'set_copy_feedback',
        feedback: 'Final markdown copied. Export is pinned to the iteration 3 release candidate.',
      })
    } catch {
      dispatch({
        type: 'set_copy_feedback',
        feedback:
          'Clipboard copy failed in this browser context. The final Markdown is still visible in the release panel.',
      })
    }
  }

  return (
    <main className="loop-shell">
      <section className="hero-grid">
        <article className="hero-card">
          <p className="eyebrow">개선 루프 Evaluator Optimizer Harness</p>
          <h1>반복 개선 랩 Visible Loop Lab</h1>
          <p className="hero-lead">
            초안은 빠르게 만들고, 리뷰와 수정은 천천히 압축합니다. 기본 화면은 현재
            루프와 다음 행동만 남기고, 나머지 증거는 필요할 때만 펼칩니다.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleGenerate}
              disabled={state.isGenerating}
            >
              {state.isGenerating ? '생성 중...' : '생성 시작 Generate post'}
            </button>
            <button type="button" className="secondary-button" onClick={handleCopyMarkdown}>
              마크다운 복사 Copy markdown
            </button>
          </div>
          <div className={`status-banner is-${state.status}`} aria-live="polite">
            <strong>{state.status}</strong>
            <span>{state.statusMessage}</span>
          </div>
          <div className="loop-summary-strip">
            <div className="metric-chip">
              <span>Visible loops</span>
              <strong>{state.revealedIterations}/3</strong>
            </div>
            <div className="metric-chip">
              <span>Last pass count</span>
              <strong>{state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9</strong>
            </div>
            <div className="metric-chip">
              <span>Loop status</span>
              <strong>{loopStatus}</strong>
            </div>
          </div>
        </article>

        <aside className="input-card">
          <div className="section-head">
            <p className="panel-label">Input rail</p>
            <h2>Prompt the writer pass</h2>
            <p>
              The product brief stays stable while the evaluator decides whether each visible
              revision loop deserves release.
            </p>
          </div>
          <form className="input-grid" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="topic">
              <span>주제</span>
              <textarea
                id="topic"
                name="topic"
                aria-label="Topic"
                rows={4}
                value={state.inputs.topic}
                disabled={state.isGenerating}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label htmlFor="audience">
              <span>독자</span>
              <select
                id="audience"
                name="audience"
                aria-label="Audience"
                value={state.inputs.audience}
                disabled={state.isGenerating}
                onChange={(event) => updateField('audience', event.target.value as Audience)}
              >
                <option value="beginner">Beginner</option>
                <option value="practitioner">Practitioner</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label htmlFor="tone">
              <span>톤</span>
              <select
                id="tone"
                name="tone"
                aria-label="Tone"
                value={state.inputs.tone}
                disabled={state.isGenerating}
                onChange={(event) => updateField('tone', event.target.value as Tone)}
              >
                <option value="clear">Clear</option>
                <option value="pragmatic">Pragmatic</option>
                <option value="opinionated">Opinionated</option>
              </select>
            </label>
            <label htmlFor="length">
              <span>분량</span>
              <select
                id="length"
                name="length"
                aria-label="Length"
                value={state.inputs.length}
                disabled={state.isGenerating}
                onChange={(event) => updateField('length', event.target.value as Length)}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
          </form>
          <p className="copy-feedback">
            {state.copyFeedback || 'Copy feedback will appear here after export checks.'}
          </p>
        </aside>
      </section>

      <section className="gate-grid" aria-label="Loop guidance">
        <article className="panel gate-card">
          <p className="panel-label">Current gate</p>
          <h2>{hasLoopStarted ? 'Current gate' : 'Start the loop'}</h2>
          <strong>{hasLoopStarted ? currentGateTitle : 'Generate the first pass'}</strong>
          <p>
            {hasLoopStarted
              ? loopStatus
              : 'The first screen stays intentionally short until the writer produces a draft worth reviewing.'}
          </p>
        </article>
        <article className="panel gate-card">
          <p className="panel-label">Next action</p>
          <h2>{nextActionTitle}</h2>
          <p>{nextActionBody}</p>
        </article>
        <article className="panel gate-card">
          <p className="panel-label">Export lock</p>
          <h2>{exportLockTitle}</h2>
          <p>{exportLockBody}</p>
        </article>
      </section>

      <section className="supporting-grid">
        <details className="panel supporting-panel">
          <summary>
            <div>
              <p className="panel-label">Preset topics</p>
              <h2>Reusable benchmark briefs</h2>
              <p>Keep presets secondary so the writer prompt stays the dominant first action.</p>
            </div>
            <span>4 preset topics</span>
          </summary>
          <div className="preset-strip" aria-label="Benchmark topics">
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

        <details className="panel supporting-panel">
          <summary>
            <div>
              <p className="panel-label">Required stages</p>
              <h2>Product contract map</h2>
              <p>{workflowStages.map((stage) => stage.label).join(' · ')}</p>
            </div>
            <span>5 required stages</span>
          </summary>
          <div className="workflow-strip" aria-label="Required stages">
            {workflowStages.map((stage, index) => {
              const stateClass = stageState(index, state.status, state.revealedIterations)
              return (
                <article key={stage.id} className={`workflow-card is-${stateClass}`}>
                  <p className="workflow-step">0{index + 1}</p>
                  <h3>{stage.label}</h3>
                  <p>{stage.description}</p>
                </article>
              )
            })}
          </div>
        </details>
      </section>

      {!hasLoopStarted ? (
        <section className="panel launch-panel">
          <div className="section-head">
            <p className="panel-label">Workbench lock</p>
            <h2>Loop workbench unlocks after the first pass</h2>
            <p>
              Timeline, reviewer evidence, optimizer notes, and final export stay hidden until
              the writer produces something worth grading.
            </p>
          </div>
          <div className="empty-state">
            Generate the first draft to unlock the current loop workbench, the active reader
            surface, and the final release reader.
          </div>
        </section>
      ) : (
        <>
          <section className="workbench-grid">
            <article className="panel workbench-panel">
              <div className="section-head">
                <p className="panel-label">Current loop</p>
                <h2>Current loop workbench</h2>
                <p>
                  The loop surface stays narrow: choose the visible revision, inspect the blocker,
                  then confirm the optimizer response.
                </p>
              </div>
              <div className="timeline-grid">
                {[1, 2, 3].map((iterationNumber) => {
                  const record =
                    visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
                  const isSelected = selectedIteration?.iteration === iterationNumber
                  const isRevealed = Boolean(record)

                  return (
                    <button
                      key={iterationNumber}
                      type="button"
                      className={`timeline-card ${isSelected ? 'is-selected' : ''} ${
                        isRevealed ? 'is-revealed' : 'is-queued'
                      }`}
                      onClick={() =>
                        record && dispatch({ type: 'select_iteration', iteration: iterationNumber })
                      }
                      disabled={!record}
                    >
                      <div>
                        <p className="timeline-kicker">Iteration {iterationNumber}</p>
                        <strong>{record ? record.buildStatus : 'queued for review'}</strong>
                      </div>
                      <p className="timeline-counts">{formatCounts(record)}</p>
                      <span className={`phase-pill is-${record?.phase ?? 'writer'}`}>
                        {record?.phase ?? 'waiting'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {selectedIteration ? (
                <>
                  <div className="iteration-meta">
                    <span className="meta-pill">Started {selectedIteration.startedAt}</span>
                    <span className="meta-pill">{formatCounts(selectedIteration)}</span>
                    <span className="meta-pill">
                      Loop again: {selectedIteration.needsAnotherLoop ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div className="workbench-signal-grid">
                    <article className="subpanel">
                      <p className="panel-label">Reviewer signal</p>
                      <h3>
                        {repairRows.length > 0 ? 'Blocking notes remain' : 'Release gate cleared'}
                      </h3>
                      {repairRows.length > 0 ? (
                        <ul className="repair-list">
                          {repairRows.map((row) => (
                            <li key={row.index}>
                              <strong>#{row.index}</strong>
                              <span>{row.note}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="empty-state compact">
                          Iteration 3 has no open repair items. The release candidate is ready for
                          export review.
                        </div>
                      )}
                    </article>

                    <article className="subpanel">
                      <p className="panel-label">Optimizer response</p>
                      <h3>Latest applied changes</h3>
                      <ul className="bullet-list">
                        {selectedIteration.optimizerChanges.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  </div>

                  <details className="panel detail-drawer checklist-drawer">
                    <summary>
                      <div>
                        <p className="panel-label">Checklist evidence</p>
                        <h2>Full reviewer verdict table</h2>
                        <p>
                          Keep the detailed PASS/PARTIAL/FAIL matrix secondary unless the selected
                          loop still needs repair.
                        </p>
                      </div>
                      <span>{formatCounts(selectedIteration)}</span>
                    </summary>
                    <div className="detail-body">
                      <div className="review-table-wrap">
                        <table className="review-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Checklist item</th>
                              <th>Verdict</th>
                              <th>Reviewer note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedIteration.verdictRows.map((row) => (
                              <tr key={row.index}>
                                <td>{row.index}</td>
                                <td>{row.label}</td>
                                <td>
                                  <span className={`verdict-badge is-${row.verdict.toLowerCase()}`}>
                                    {row.verdict}
                                  </span>
                                </td>
                                <td>{row.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </>
              ) : (
                <div className="empty-state">
                  Generate the first draft to populate the reviewer signal and optimizer response.
                </div>
              )}
            </article>

            <article className="panel reader-panel">
              <div className="section-head">
                <p className="panel-label">읽기 표면 Reader surface</p>
                <h2>현재 읽기 표면 Active article surface</h2>
                <p>
                  루프가 진행 중일 때는 한 번에 하나의 읽기 결과만 보이게 해서 사용자를
                  현재 단계에 붙잡아 둡니다.
                </p>
              </div>

              <div className="reader-tabs" role="tablist" aria-label="Loop surfaces">
                {readerTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`reader-tab ${readerSurface === tab.id ? 'is-active' : ''}`}
                    aria-pressed={readerSurface === tab.id}
                    onClick={() => setReaderSurface(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {selectedIteration ? (
                <article className="reader-card">
                  <p className="reader-kicker">
                    {selectedIteration.iteration === 3
                      ? 'Release candidate surface'
                      : `Iteration ${selectedIteration.iteration} surface`}
                  </p>

                  {readerSurface === 'research' ? (
                    <>
                      <h3>Research results</h3>
                      <ul className="bullet-list">
                        {selectedIteration.researchSummary.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {readerSurface === 'outline' ? (
                    <>
                      <h3>Outline</h3>
                      <ol className="outline-list">
                        {selectedIteration.outline.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}

                  {readerSurface === 'drafts' ? (
                    <>
                      <h3>Section drafts</h3>
                      <div className="draft-stack">
                        {selectedIteration.sectionDrafts.map((draft) => (
                          <article key={draft.title} className="draft-card">
                            <h4>{draft.title}</h4>
                            <p>{draft.body}</p>
                            <strong>{draft.takeaway}</strong>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {readerSurface === 'review' ? (
                    <>
                      <h3>Review notes</h3>
                      <ol className="review-notes">
                        {selectedIteration.reviewNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                </article>
              ) : (
                <div className="empty-state">
                  Generate the first draft to unlock the active reader surface.
                </div>
              )}
            </article>
          </section>

          <section className="final-layout">
            <article className="panel final-panel">
              <div className="section-head">
                <p className="panel-label">최종 원고 Final post</p>
                <h2>최종 원고 Final post</h2>
                <p>승인된 3차 루프만 export를 엽니다. 상세 본문은 아래 drawer로 뒤로 미룹니다.</p>
              </div>

              {finalArticle ? (
                <>
                  <div className="final-summary-strip">
                    <div className="metric-chip">
                      <span>승인 루프</span>
                      <strong>3차 Iteration 3</strong>
                    </div>
                    <div className="metric-chip">
                      <span>리뷰 게이트</span>
                      <strong>{state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 PASS</strong>
                    </div>
                    <div className="metric-chip">
                      <span>다음 행동</span>
                      <strong>복사 또는 아래 Markdown 검토</strong>
                    </div>
                  </div>

                  <div className="release-spotlight">
                    <p className="article-kicker">3차 승인안 Iteration 3 release candidate</p>
                    <h3>{finalArticle.title}</h3>
                    <p className="article-intro">{finalArticle.intro}</p>
                    <ul className="release-highlights">
                      {finalArticle.mergedSections.slice(0, 3).map((section) => (
                        <li key={section.title}>
                          <strong>{section.title}</strong>
                          <span>{section.takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <details className="panel detail-drawer article-drawer">
                    <summary>
                      <div>
                        <p className="panel-label">전체 본문 Full article</p>
                        <h2>승인된 본문 미리보기</h2>
                        <p>전체 섹션과 클로징은 필요할 때만 펼쳐 확인합니다.</p>
                      </div>
                      <span>3개 섹션</span>
                    </summary>
                    <div className="detail-body">
                      <div className="article-preview">
                        <p className="article-kicker">Iteration 3 release candidate</p>
                        <h3>{finalArticle.title}</h3>
                        <p className="article-intro">{finalArticle.intro}</p>
                        <div className="article-sections">
                          {finalArticle.mergedSections.map((section) => (
                            <article key={section.title} className="article-section">
                              <h4>{section.title}</h4>
                              <p>{section.body}</p>
                              <strong>{section.takeaway}</strong>
                            </article>
                          ))}
                        </div>
                        <p className="article-closing">{finalArticle.closing}</p>
                      </div>
                    </div>
                  </details>
                  <pre className="markdown-export">{finalArticle.markdown}</pre>
                </>
              ) : (
                <div className="empty-state">
                  최종 원고는 3차 루프가 끝나기 전까지 잠겨 있습니다.
                </div>
              )}
            </article>

            <details className="panel readiness-drawer">
              <summary>
                <div>
                  <p className="panel-label">Evaluation readiness</p>
                  <h2>Evidence pack</h2>
                  <p>Keep artifacts secondary until the release candidate is already on screen.</p>
                </div>
                <span>{state.outputs ? 'Loop summary ready' : 'Hidden by default'}</span>
              </summary>
              <div className="deliverable-grid">
                {deliverables.map((item) => (
                  <article key={item.id} className="deliverable-card">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
              <ul className="target-list">
                {evaluationTargets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="loop-readiness">
                <p className="readiness-label">Loop summary</p>
                {state.outputs ? (
                  <>
                    <strong>
                      {state.outputs.loop_summary.lastIterationPassCount}/9 PASS gates on the last
                      loop
                    </strong>
                    <span>
                      Minimum loops met: {state.outputs.loop_summary.minimumLoopsMet ? 'Yes' : 'No'}{' '}
                      • Export ready: {state.outputs.loop_summary.readyForExport ? 'Yes' : 'No'}
                    </span>
                  </>
                ) : (
                  <div className="empty-state compact">
                    Run the loop once to unlock the release summary and evidence checklist.
                  </div>
                )}
              </div>
            </details>
          </section>
        </>
      )}

      {state.errorMessage ? (
        <section className="error-panel" role="alert">
          <strong>Loop blocked.</strong>
          <p>{state.errorMessage}</p>
          <span>Use a normal topic title and generate again to recover.</span>
        </section>
      ) : null}
    </main>
  )
}

export default App
