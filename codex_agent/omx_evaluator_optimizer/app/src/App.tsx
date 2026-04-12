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
import { deliverables, evaluationTargets, requiredLoops, topicPresets, workflowStages } from './starterData'

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
  topic: topicPresets[1].title,
  audience: 'advanced',
  tone: 'opinionated',
  length: 'long',
}

const initialState: AppState = {
  inputs: initialInputs,
  status: 'initial',
  statusMessage: 'initial | The gauntlet is idle. Generate to start the 10-loop evaluator run.',
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
        inputs: { ...state.inputs, [action.field]: action.value },
        copyFeedback: '',
        errorMessage: null,
      }
    case 'apply_preset':
      return {
        ...state,
        inputs: action.preset,
        statusMessage: 'Preset loaded. The next Generate run will replay the OMX gauntlet.',
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
        statusMessage: 'loading | Writer pass is drafting the rough candidate before the gauntlet starts scoring.',
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
      return { ...state, selectedIteration: action.iteration, copyFeedback: '' }
    case 'set_copy_feedback':
      return { ...state, copyFeedback: action.feedback, statusMessage: action.feedback }
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
  if (status === 'error') return index === 0 ? 'active' : 'waiting'
  if (status === 'initial') return index === 0 ? 'active' : 'waiting'
  if (revealedIterations === 0 || status === 'loading') return index === 0 ? 'active' : 'waiting'
  if (index < 4) return 'complete'
  return status === 'export-ready' ? 'complete' : 'active'
}

function formatCounts(record: IterationRecord | null) {
  if (!record) return 'Queued'
  return `${record.passCount} PASS / ${record.partialCount} PARTIAL / ${record.failCount} FAIL`
}

function statusForIteration(iteration: number, total: number): GenerationStatus {
  if (iteration < total) return 'populated'
  return 'review-complete'
}

function statusMessageForIteration(record: IterationRecord, total: number) {
  if (record.iteration === 1) {
    return `populated | Iteration 1 intentionally starts rough at ${record.passCount} PASS / ${record.partialCount} PARTIAL / ${record.failCount} FAIL.`
  }
  if (record.iteration < total) {
    return `populated | Iteration ${record.iteration} raises the bar to ${record.passCount} PASS / ${record.partialCount} PARTIAL / ${record.failCount} FAIL.`
  }
  return `review-complete | Iteration ${record.iteration} finally clears every reviewer gate and hands off the release candidate.`
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const runTokenRef = useRef(0)
  const [activeSurface, setActiveSurface] = useState<'research' | 'outline' | 'drafts' | 'review'>(
    'research',
  )

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
    state.outputs && state.revealedIterations >= requiredLoops ? state.outputs.final_article : null
  const repairRows = selectedIteration?.verdictRows.filter((row) => row.verdict !== 'PASS') ?? []
  const visibleVerificationCycles =
    state.outputs?.verification_cycles.slice(
      0,
      Math.min(state.revealedIterations + 2, state.outputs.verification_cycles.length),
    ) ?? []
  const remainingLoops = Math.max(requiredLoops - state.revealedIterations, 0)
  const remainingVerificationCycles = Math.max(requiredLoops - visibleVerificationCycles.length, 0)

  const loopStatus =
    state.status === 'initial'
      ? 'Waiting for the first writer pass.'
      : state.status === 'loading'
        ? 'Writer, reviewer, optimizer, and verification checks are replaying the gauntlet.'
        : state.status === 'error'
          ? 'The loop stopped before review because the topic triggered a forced failure.'
          : state.status === 'export-ready'
            ? `Gauntlet complete. ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 checklist gates cleared.`
        : `Loop ${selectedIteration?.iteration ?? 0}/${requiredLoops} is visible on screen.`

  const currentGateTitle =
    state.status === 'initial'
      ? 'Brief intake'
      : state.status === 'loading' && state.revealedIterations === 0
        ? 'Writer draft'
        : state.status === 'loading'
          ? `Loop ${Math.min(state.revealedIterations + 1, requiredLoops)} review gate`
          : state.status === 'error'
            ? 'Recovery gate'
            : state.status === 'export-ready'
              ? 'Release candidate'
              : `Loop ${state.revealedIterations} is staged`

  const nextActionTitle =
    state.status === 'initial'
      ? 'Generate the first pass'
      : state.status === 'loading'
        ? 'Wait for the gauntlet replay'
        : state.status === 'error'
          ? 'Fix the brief and rerun'
          : state.status === 'export-ready'
            ? 'Copy markdown or inspect proof'
            : `Inspect loop ${selectedIteration?.iteration ?? state.revealedIterations}`

  const nextActionBody =
    state.status === 'initial'
      ? 'Keep the primary action singular: set the brief, then start the gauntlet.'
      : state.status === 'loading'
        ? 'The writer, reviewer, optimizer, and verification checks are still replaying in sequence.'
        : state.status === 'error'
          ? 'Remove the forced-failure prefix from the topic and regenerate to reopen the product flow.'
          : state.status === 'export-ready'
            ? 'The release gate is open, so the product surface can shift from repair work to export.'
            : 'Use the selected loop snapshot below to see the blocking note and the latest optimizer response.'

  const exportLockTitle =
    finalArticle || state.status === 'export-ready'
      ? 'Export unlocked'
      : `${remainingLoops} loop${remainingLoops === 1 ? '' : 's'} + ${remainingVerificationCycles} checks left`

  const exportLockBody =
    finalArticle || state.status === 'export-ready'
      ? `Iteration ${requiredLoops} cleared ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 reviewer gates and unlocked copy.`
      : 'Copy stays visible for contract stability, but export remains locked until the tenth loop and repeated verification both land.'

  const readerTabs = [
    { id: 'research', label: '연구 결과 Research results' },
    { id: 'outline', label: '개요 Outline' },
    { id: 'drafts', label: '섹션 초안 Section drafts' },
    { id: 'review', label: '리뷰 메모 Review notes' },
  ] as const
  const stagedWorkflow = workflowStages.map((stage, index) => ({
    ...stage,
    stateClass: stageState(index, state.status, state.revealedIterations),
  }))
  const completedStageCount = stagedWorkflow.filter((stage) => stage.stateClass === 'complete').length
  const activeStageLabel =
    stagedWorkflow.find((stage) => stage.stateClass === 'active')?.label ?? workflowStages[0].label

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({ type: 'update_field', field, value })
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({ type: 'apply_preset', preset: { topic: title, audience, tone, length } })
  }

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken

    if (topic.length < 6) {
      dispatch({
        type: 'generation_error',
        message: 'Topic must be at least 6 characters so the writer has enough signal to start the gauntlet.',
      })
      return
    }

    if (isForcedErrorTopic(topic)) {
      dispatch({
        type: 'generation_error',
        message:
          'The reviewer blocked this topic at classification time. Remove the fail/error prefix and run the gauntlet again.',
      })
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    dispatch({ type: 'start_generation', outputs })

    for (const record of outputs.iterations) {
      await sleep(record.iteration === 1 ? 300 : 140)
      if (runTokenRef.current !== runToken) return

      dispatch({
        type: 'reveal_iteration',
        count: record.iteration,
        selectedIteration: record.iteration,
        status: statusForIteration(record.iteration, outputs.iterations.length),
        statusMessage: statusMessageForIteration(record, outputs.iterations.length),
      })
    }

    await sleep(180)
    if (runTokenRef.current !== runToken) return

    dispatch({
      type: 'finish_generation',
      statusMessage: `export-ready | Iteration ${requiredLoops} cleared ${outputs.loop_summary.lastIterationPassCount}/9 checklist gates after ${outputs.loop_summary.verificationCycles} verification cycles.`,
    })
  }

  async function handleCopyMarkdown() {
    if (!finalArticle || state.status !== 'export-ready') {
      dispatch({
        type: 'set_copy_feedback',
        feedback: `Copy unlocks after iteration ${requiredLoops} finishes and the release candidate is export-ready.`,
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalArticle.markdown)
      dispatch({
        type: 'set_copy_feedback',
        feedback: `Final markdown copied. Export is pinned to the iteration ${requiredLoops} release candidate.`,
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
    <main className="gauntlet-shell">
      <section className="hero-grid">
        <article className="hero-card">
          <p className="eyebrow">검증 건틀릿 OMX Evaluator Harness</p>
          <h1>검증 건틀릿 랩 Gauntlet Loop Lab</h1>
          <p className="hero-lead">
            이 버전은 같은 benchmark 계약을 지키되, 기본 화면에서는 현재 gate와 다음 행동만
            남기고 긴 검증 증거는 한 단계 뒤로 밀어 둡니다.
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
        </article>

        <aside className="input-card">
          <div className="section-head">
            <p className="panel-label">Input rail</p>
            <h2>Prompt the writer pass</h2>
            <p>
              The evaluator keeps the same product contract, but the OMX variant does not
              settle for an early “good enough” answer.
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
          <details className="drawer preset-drawer">
            <summary className="drawer-summary">
              <div>
                <p className="panel-label">Quick briefs</p>
                <h3>Optional starting presets</h3>
                <p>Keep presets secondary so the default surface stays focused on the current gate.</p>
              </div>
              <span className="meta-pill">{topicPresets.length} presets</span>
            </summary>
            <div className="drawer-body preset-grid">
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

      <section className="focus-strip">
        <article className="focus-card is-primary">
          <p className="panel-label">Current gate</p>
          <h2>{currentGateTitle}</h2>
          <p>{loopStatus}</p>
          <div className="focus-meta">
            <span className="meta-pill">
              Visible loops {state.revealedIterations}/{requiredLoops}
            </span>
            <span className="meta-pill">Last pass {state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9</span>
          </div>
        </article>
        <article className="focus-card">
          <p className="panel-label">Next action</p>
          <h2>{nextActionTitle}</h2>
          <p>{nextActionBody}</p>
          <div className="focus-meta">
            <span className="meta-pill">
              Verification {visibleVerificationCycles.length}/{requiredLoops}
            </span>
          </div>
        </article>
        <article className="focus-card">
          <p className="panel-label">Export lock</p>
          <h2>{exportLockTitle}</h2>
          <p>{exportLockBody}</p>
          <div className="focus-meta">
            <span className="meta-pill">
              Ready {state.outputs?.loop_summary.readyForExport ? 'Yes' : 'No'}
            </span>
          </div>
        </article>
      </section>

      <details className="drawer stage-drawer">
        <summary className="drawer-summary">
          <div>
            <p className="panel-label">단계 흐름 Required stages</p>
            <h3>필수 단계 지도는 접어 둡니다</h3>
            <p>기본 화면에서는 현재 gate만 읽고, 전체 단계 맵은 필요할 때 펼칩니다.</p>
          </div>
          <span className="meta-pill">
            {completedStageCount}/{workflowStages.length} passed · {activeStageLabel}
          </span>
        </summary>
        <div className="drawer-body">
          <section className="stage-strip" aria-label="Required stages">
            {stagedWorkflow.map((stage, index) => (
              <article key={stage.id} className={`stage-card is-${stage.stateClass}`}>
                <p className="workflow-step">0{index + 1}</p>
                <div>
                  <h3>{stage.label}</h3>
                  <p>
                    {stage.stateClass === 'active'
                      ? 'Current gate'
                      : stage.stateClass === 'complete'
                        ? 'Passed'
                        : 'Queued'}
                  </p>
                </div>
              </article>
            ))}
          </section>
        </div>
      </details>

      <section className="workbench-grid">
        <article className="panel review-panel">
          <div className="section-head">
            <p className="panel-label">Current loop</p>
            <h2>Selected loop snapshot</h2>
            <p>Keep the blocking note and the optimizer response close together, then tuck the raw table behind a drawer.</p>
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
              <div className="current-loop-grid">
                <article className="subpanel">
                  <p className="panel-label">Applied changes</p>
                  <h3>What the optimizer just shipped</h3>
                  <ul className="bullet-list">
                    {selectedIteration.optimizerChanges.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
                <article className="subpanel">
                  <p className="panel-label">Repair brief</p>
                  <h3>What still blocks release</h3>
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
                      Iteration {requiredLoops} has no open repair items. The optimizer can hand off the release candidate.
                    </div>
                  )}
                </article>
              </div>
              <details className="drawer detail-drawer">
                <summary className="drawer-summary">
                  <div>
                    <p className="panel-label">Reviewer detail</p>
                    <h3>Open the full verdict table</h3>
                    <p>Keep the strict evidence available without making it compete with the first reading surface.</p>
                  </div>
                  <span className="meta-pill">9 checks</span>
                </summary>
                <div className="drawer-body">
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
              Generate the first draft to populate the selected loop snapshot and unlock the gauntlet brief.
            </div>
          )}
        </article>

        <section className="panel reader-panel">
          <div className="section-head">
            <p className="panel-label">읽기 표면 Working surface</p>
            <h2>한 번에 하나의 읽기 표면만 유지합니다</h2>
            <p>리서치, 구조, 초안, 리뷰 메모는 한 장의 집중된 reader surface 안에서만 교체합니다.</p>
          </div>
          <div className="reader-tabs" role="tablist" aria-label="Loop surfaces">
            {readerTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`reader-tab ${activeSurface === tab.id ? 'is-active' : ''}`}
                onClick={() => setActiveSurface(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <article className="surface-card">
            <div className="section-head">
              <p className="panel-label">{readerTabs.find((tab) => tab.id === activeSurface)?.label}</p>
              <h2>{readerTabs.find((tab) => tab.id === activeSurface)?.label}</h2>
            </div>
            {selectedIteration ? (
              activeSurface === 'research' ? (
                <ul className="bullet-list">
                  {selectedIteration.researchSummary.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : activeSurface === 'outline' ? (
                <ol className="outline-list">
                  {selectedIteration.outline.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              ) : activeSurface === 'drafts' ? (
                <div className="draft-stack">
                  {selectedIteration.sectionDrafts.map((draft) => (
                    <article key={draft.title} className="draft-card">
                      <h3>{draft.title}</h3>
                      <p>{draft.body}</p>
                      <strong>{draft.takeaway}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <ol className="review-notes">
                  {selectedIteration.reviewNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ol>
              )
            ) : (
              <div className="empty-state">
                {activeSurface === 'research'
                  ? 'Research results will be staged once iteration 1 lands.'
                  : activeSurface === 'outline'
                    ? 'Outline order appears after the writer pass gets reviewed.'
                    : activeSurface === 'drafts'
                      ? 'Section drafts stay hidden until the loop has something real to grade.'
                      : 'Review notes will appear once the reviewer scores the first draft.'}
              </div>
            )}
          </article>
        </section>
      </section>

      <section className="panel final-panel">
        <div className="section-head">
          <p className="panel-label">최종 원고 Final post</p>
          <h2>최종 원고 Final post</h2>
          <p>열 번째 루프가 모든 gate를 통과할 때만 export가 열립니다. 전체 본문은 drawer 뒤에 둡니다.</p>
        </div>
        {finalArticle ? (
          <>
            <div className="release-spotlight">
              <p className="article-kicker">{requiredLoops}차 승인안 Iteration {requiredLoops} release candidate</p>
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
            <details className="drawer detail-drawer article-drawer">
              <summary className="drawer-summary">
                <div>
                  <p className="panel-label">전체 본문 Full article</p>
                  <h3>승인된 본문 전체 보기</h3>
                  <p>긴 본문은 기본 표면 밖으로 빼고, 필요할 때만 전체 섹션을 펼칩니다.</p>
                </div>
                <span className="meta-pill">{finalArticle.mergedSections.length} sections</span>
              </summary>
              <div className="drawer-body">
                <div className="article-preview">
                  <p className="article-kicker">Iteration {requiredLoops} release candidate</p>
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
            최종 원고는 {requiredLoops}차 루프가 끝나기 전까지 잠겨 있습니다.
          </div>
        )}
      </section>

      <details className="panel proof-panel proof-drawer">
        <summary className="drawer-summary">
          <div>
            <p className="panel-label">검증 증거 Gauntlet proof</p>
            <h2>증거 팩은 한 단계 뒤에 둡니다</h2>
            <p>비교, 평가, 검증 trail은 유지하되 기본 표면에서는 요약만 남깁니다.</p>
          </div>
          <span className="meta-pill">
            {visibleVerificationCycles.length}/{requiredLoops} checks
          </span>
        </summary>
        <div className="drawer-body">
          <div className="verification-summary">
            <article className="subpanel compact">
              <p className="panel-label">Visible cycles</p>
              <h3>
                {visibleVerificationCycles.length}/{requiredLoops}
              </h3>
              <p>The gauntlet still expects repeated compare, validate, and evaluate pulses before export.</p>
            </article>
            <article className="subpanel compact">
              <p className="panel-label">Latest delta</p>
              <h3>{visibleVerificationCycles.at(-1)?.label ?? 'Waiting for cycle 1'}</h3>
              <p>{visibleVerificationCycles.at(-1)?.delta ?? 'Generate the first pass to expose verification pressure.'}</p>
            </article>
            <article className="subpanel compact">
              <p className="panel-label">Loop summary</p>
              {state.outputs ? (
                <>
                  <h3>{state.outputs.loop_summary.lastIterationPassCount}/9 PASS gates</h3>
                  <p>
                    Minimum loops met: {state.outputs.loop_summary.minimumLoopsMet ? 'Yes' : 'No'} • Export ready:{' '}
                    {state.outputs.loop_summary.readyForExport ? 'Yes' : 'No'}
                  </p>
                </>
              ) : (
                <>
                  <h3>Waiting for loop 1</h3>
                  <p>Run the loop once to unlock the release summary and evidence checklist.</p>
                </>
              )}
            </article>
          </div>
          <details className="drawer detail-drawer">
          <summary className="drawer-summary">
            <div>
              <p className="panel-label">Loop timeline</p>
              <h3>Open ten visible review cycles</h3>
              <p>The gauntlet assumes the first answer is not trustworthy enough. Every loop has to earn its promotion.</p>
            </div>
            <span className="meta-pill">{visibleIterations.length}/{requiredLoops} revealed</span>
          </summary>
          <div className="drawer-body">
            <div className="timeline-grid">
              {Array.from({ length: requiredLoops }, (_, index) => index + 1).map((iterationNumber) => {
                const record = visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
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
          </div>
          </details>
          <details className="drawer detail-drawer">
          <summary className="drawer-summary">
            <div>
              <p className="panel-label">Verification detail</p>
              <h3>Open compare / evaluate / validate cycles</h3>
              <p>Review the proof trail only when you need to audit the gauntlet.</p>
            </div>
            <span className="meta-pill">{visibleVerificationCycles.length} visible</span>
          </summary>
          <div className="drawer-body">
            <div className="verification-grid">
              {visibleVerificationCycles.map((cycle) => (
                <article key={cycle.cycle} className="verification-card">
                  <p className="timeline-kicker">Cycle {cycle.cycle}</p>
                  <h3>{cycle.label}</h3>
                  <div className="verification-badges">
                    <span className="meta-pill">validate: {cycle.validate}</span>
                    <span className="meta-pill">compare: {cycle.compare}</span>
                    <span className="meta-pill">evaluate: {cycle.evaluate}</span>
                  </div>
                  <p>{cycle.delta}</p>
                </article>
              ))}
            </div>
          </div>
          </details>
          <details className="drawer detail-drawer">
          <summary className="drawer-summary">
            <div>
              <p className="panel-label">Evidence pack</p>
              <h3>Open deliverables and rubric targets</h3>
              <p>All proof stays available, but it no longer dominates the product surface.</p>
            </div>
            <span className="meta-pill">{deliverables.length} files</span>
          </summary>
          <div className="drawer-body">
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
          </div>
          </details>
        </div>
      </details>

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
