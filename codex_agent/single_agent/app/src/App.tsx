// App.tsx - focused wizard workspace for the single-agent benchmark harness

import { useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStageId,
  GenerationState,
  GenerationStatus,
  Length,
  PipelineOutputs,
  Tone,
  WorkflowStage,
} from './contracts'
import { generatePipelineOutputs } from './generator'
import { deliverables, topicPresets, workflowStages } from './starterData'

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
      type: 'set-stage'
      stage: GenerationStageId
      status: GenerationStatus
      message: string
      outputs: Partial<PipelineOutputs>
    }
  | {
      type: 'finalize-run'
      message: string
      outputs: PipelineOutputs
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
  outputs: {},
  statusMessage: '브리프를 정리한 뒤 포스트 생성을 누르면 단일 작성 흐름이 순서대로 진행됩니다.',
  errorMessage: null,
}

const audienceOptions: { value: Audience; label: string }[] = [
  { value: 'beginner', label: '입문자' },
  { value: 'practitioner', label: '실무자' },
  { value: 'advanced', label: '고급 사용자' },
]

const toneOptions: { value: Tone; label: string }[] = [
  { value: 'clear', label: '명료한 설명' },
  { value: 'pragmatic', label: '실무 중심' },
  { value: 'opinionated', label: '선명한 관점' },
]

const lengthOptions: { value: Length; label: string }[] = [
  { value: 'short', label: '짧게' },
  { value: 'medium', label: '중간' },
  { value: 'long', label: '길게' },
]

const stageMessages: Record<GenerationStageId, string> = {
  research: '리서치를 정리해 글의 논지와 참고 축을 먼저 잠급니다.',
  outline: '개요를 잡아 독자가 따라갈 순서를 명확하게 고정합니다.',
  drafts: '섹션 초안을 작성해 본문 밀도와 전환 흐름을 맞춥니다.',
  review: '검토 메모로 빠진 논점과 과장을 한 번 더 걷어냅니다.',
  final: '최종 마크다운을 준비해 내보내기 직전 상태로 정리합니다.',
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
                statusMessage: '브리프를 수정했습니다. 다시 생성하면 작성 흐름이 처음부터 재시작됩니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 이제 단일 작성 흐름을 바로 시작할 수 있습니다.',
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
        copyFeedback: '',
      }
    case 'set-stage':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentStage: action.stage,
          completedStages: unique([...state.generation.completedStages, action.stage]),
          outputs: {
            ...state.generation.outputs,
            ...action.outputs,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'finalize-run':
      return {
        ...state,
        generation: {
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
          outputs: {},
          statusMessage: '작성 흐름이 시작 단계에서 멈췄습니다. 브리프를 조정한 뒤 다시 시도하세요.',
          errorMessage: action.message,
        },
        copyFeedback: '',
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function statusLabel(status: GenerationStatus) {
  const labels: Record<GenerationStatus, string> = {
    initial: '대기 중',
    loading: '진행 중',
    populated: '생성 완료',
    'review-complete': '검토 완료',
    'export-ready': '내보내기 준비',
    error: '오류',
  }
  return labels[status]
}

function stageTone(stage: WorkflowStage, generation: GenerationState) {
  if (
    generation.currentStage === stage.id &&
    generation.status !== 'initial' &&
    generation.status !== 'export-ready' &&
    generation.status !== 'error'
  ) {
    return 'current'
  }

  if (generation.completedStages.includes(stage.id)) {
    return 'complete'
  }

  return ''
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const [selectedStage, setSelectedStage] = useState<GenerationStageId>('research')
  const runRef = useRef(0)

  const currentStage =
    workflowStages.find((stage) => stage.id === state.generation.currentStage) ?? workflowStages[0]
  const selectedStageMeta =
    workflowStages.find((stage) => stage.id === selectedStage) ?? workflowStages[0]
  const currentStageIndex = workflowStages.findIndex((stage) => stage.id === currentStage.id)
  const nextStage =
    state.generation.status === 'export-ready' || currentStage.id === 'final'
      ? null
      : workflowStages[Math.min(currentStageIndex + (state.generation.status === 'loading' ? 0 : 1), workflowStages.length - 1)]
  const progress =
    state.generation.status === 'initial'
      ? 0
      : state.generation.status === 'export-ready'
        ? 100
        : Math.round((state.generation.completedStages.length / workflowStages.length) * 100)

  const researchSummary = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline
  const sectionDrafts = state.generation.outputs.section_drafts
  const reviewNotes = state.generation.outputs.review_notes
  const finalPost = state.generation.outputs.final_post
  const liveRegionMessage = `${statusLabel(state.generation.status)}${state.generation.currentStage ? ` | ${currentStage.testHook}` : ''} | ${
    state.copyFeedback || state.generation.statusMessage
  }`

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    setSelectedStage('research')

    dispatch({
      type: 'start-run',
      message: '브리프를 읽고 리서치부터 최종 원고까지 단일 작성 흐름을 순서대로 전개하는 중입니다.',
    })

    await sleep(220)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message: '의도적으로 실패 조건이 포함된 주제입니다. 주제를 수정한 뒤 다시 생성하세요.',
      })
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    const stageSequence: Array<{
      stage: GenerationStageId
      status: GenerationStatus
      outputs: Partial<PipelineOutputs>
    }> = [
      {
        stage: 'research',
        status: 'loading',
        outputs: { research_summary: outputs.research_summary },
      },
      {
        stage: 'outline',
        status: 'loading',
        outputs: { outline: outputs.outline },
      },
      {
        stage: 'drafts',
        status: 'loading',
        outputs: { section_drafts: outputs.section_drafts },
      },
      {
        stage: 'review',
        status: 'review-complete',
        outputs: { review_notes: outputs.review_notes },
      },
      {
        stage: 'final',
        status: 'populated',
        outputs: { final_post: outputs.final_post },
      },
    ]

    for (const entry of stageSequence) {
      await sleep(210)
      if (runRef.current !== runId) {
        return
      }

      dispatch({
        type: 'set-stage',
        stage: entry.stage,
        status: entry.status,
        outputs: entry.outputs,
        message: stageMessages[entry.stage],
      })
      setSelectedStage(entry.stage)
    }

    await sleep(150)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'finalize-run',
      outputs,
      message: '최종 원고가 준비되었습니다. 내보내기 전에 원고와 검토 메모를 짧게 확인하세요.',
    })
    setSelectedStage('final')
  }

  async function handleCopyMarkdown() {
    if (!finalPost) {
      dispatch({
        type: 'set-copy-feedback',
        message: '먼저 포스트 생성을 완료해야 마크다운을 내보낼 수 있습니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalPost)
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 마크다운을 클립보드에 복사했습니다. 게시 전 마지막 문장만 가볍게 점검하세요.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '클립보드 접근이 막혀 복사에 실패했습니다. 브라우저 권한을 확인하세요.',
      })
    }
  }

  function renderStageBody() {
    if (selectedStage === 'research') {
      if (state.generation.status === 'error') {
        return (
          <section className="empty-block error-block">
            <div>
              <strong>브리프를 다시 정리해 주세요.</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          </section>
        )
      }

      if (!researchSummary) {
        return (
          <section className="empty-block">
            <div>
              <strong>리서치가 아직 시작되지 않았습니다.</strong>
              <p>포스트 생성을 누르면 핵심 논지와 참고 포인트를 먼저 정리합니다.</p>
            </div>
          </section>
        )
      }

      return (
        <div className="stage-stack">
          <article className="content-card">
            <p className="card-eyebrow">리서치 프레임</p>
            <h3>논지와 독자 적합도</h3>
            <p>{researchSummary.angle}</p>
            <p>{researchSummary.thesis}</p>
            <div className="takeaway-line">{researchSummary.audienceFit}</div>
          </article>
          <article className="content-card">
            <p className="card-eyebrow">검색 힌트</p>
            <h3>{workflowStages[0].testHook}</h3>
            <div className="tag-row">
              {researchSummary.searchTerms.map((term) => (
                <span className="soft-tag" key={term}>
                  {term}
                </span>
              ))}
            </div>
            <ul className="stack-list">
              {researchSummary.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </article>
        </div>
      )
    }

    if (selectedStage === 'outline') {
      if (!outline) {
        return (
          <section className="empty-block">
            <div>
              <strong>개요가 아직 준비되지 않았습니다.</strong>
              <p>리서치 단계가 끝나면 독자가 따라갈 흐름을 이곳에 압축해 보여줍니다.</p>
            </div>
          </section>
        )
      }

      return (
        <article className="content-card">
          <p className="card-eyebrow">{workflowStages[1].testHook}</p>
          <h3>문단 흐름</h3>
          <ol className="outline-stack">
            {outline.map((section, index) => (
              <li className="outline-item" key={section.id}>
                <span className="outline-index">{index + 1}</span>
                <div>
                  <strong>{section.title}</strong>
                  <p>{section.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>
      )
    }

    if (selectedStage === 'drafts') {
      if (!sectionDrafts) {
        return (
          <section className="empty-block">
            <div>
              <strong>섹션 초안을 작성하는 중입니다.</strong>
              <p>개요가 확정되면 각 섹션을 읽기 좋은 밀도로 이어서 전개합니다.</p>
            </div>
          </section>
        )
      }

      return (
        <div className="stage-stack">
          {sectionDrafts.map((draft) => (
            <article className="content-card" key={draft.id}>
              <p className="card-eyebrow">{workflowStages[2].testHook}</p>
              <h3>{draft.title}</h3>
              {draft.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <div className="takeaway-line">{draft.takeaway}</div>
            </article>
          ))}
        </div>
      )
    }

    if (selectedStage === 'review') {
      if (!reviewNotes) {
        return (
          <section className="empty-block">
            <div>
              <strong>검토 메모가 아직 없습니다.</strong>
              <p>초안이 모두 채워지면 빠진 논점과 문장 밀도를 이곳에서 점검합니다.</p>
            </div>
          </section>
        )
      }

      return (
        <div className="stage-stack">
          {reviewNotes.map((note) => (
            <article className={`content-card review-${note.severity}`} key={`${note.label}-${note.detail}`}>
              <div className="review-head">
                <h3>{note.label}</h3>
                <span>{workflowStages[3].testHook}</span>
              </div>
              <p>{note.detail}</p>
            </article>
          ))}
        </div>
      )
    }

    if (!finalPost) {
      return (
        <section className="empty-block">
          <div>
            <strong>최종 원고가 아직 잠겨 있습니다.</strong>
            <p>검토 메모까지 끝나면 이 영역이 최종 내보내기 전용 리더로 바뀝니다.</p>
          </div>
        </section>
      )
    }

    return (
      <div className="stage-stack">
        <article className="content-card final-summary-card">
          <p className="card-eyebrow">{workflowStages[4].testHook}</p>
          <h3>최종 원고 리더</h3>
          <p>원고 전체를 한 화면에 쏟아내지 않고, 내보내기 직전 확인에 필요한 본문만 압축해 보여줍니다.</p>
          <div className="takeaway-line">복사 버튼은 유지하되, 증거와 평가 자료는 아래 지원 서랍으로 분리했습니다.</div>
        </article>
        <article className="content-card">
          <p className="card-eyebrow">최종 마크다운</p>
          <pre className="markdown-preview">{finalPost}</pre>
        </article>
      </div>
    )
  }

  return (
    <main className="app-shell">
      <div className="assistive-live" aria-live="polite">
        {liveRegionMessage}
      </div>

      <section className="workspace-hero">
        <div className="hero-copy">
          <p className="section-kicker">단일 소유자 흐름</p>
          <h1>한 명의 작성자가 끝까지 밀고 가는 기술 블로그 워크벤치</h1>
          <p className="hero-lead">
            첫 화면에는 현재 단계와 다음 행동만 남기고, 리서치·개요·초안·검토·최종 원고는 한 번에
            하나씩만 펼칩니다. 증거 자료는 보조 서랍으로 밀어 제품 흐름을 먼저 읽게 했습니다.
          </p>
        </div>
        <div className="hero-actions">
          <button
            aria-label="Generate post"
            className="primary-action"
            disabled={state.generation.status === 'loading'}
            onClick={() => void handleGenerate()}
            type="button"
          >
            <span className="button-copy-kr">
              {state.generation.status === 'loading' ? '포스트 생성 중' : '포스트 생성'}
            </span>
            <span className="assistive-live">
              {state.generation.status === 'loading' ? 'Generating...' : 'Generate post'}
            </span>
          </button>
          <button
            aria-label="Copy markdown"
            className="secondary-action"
            disabled={!finalPost}
            onClick={() => void handleCopyMarkdown()}
            type="button"
          >
            <span className="button-copy-kr">마크다운 복사</span>
            <span className="assistive-live">Copy markdown</span>
          </button>
        </div>
      </section>

      <section className="workspace-frame">
        <aside className="brief-rail">
          <article className="rail-card rail-card-dark">
            <div className="status-row">
              <span className={`status-badge status-${state.generation.status}`}>{statusLabel(state.generation.status)}</span>
              <span className={state.generation.status === 'loading' ? 'loading-pulse' : 'active-dot'} />
            </div>
            <p className="rail-label">현재 단계</p>
            <h2>{currentStage.label}</h2>
            <p className="rail-hook">{currentStage.testHook}</p>
            <p className="rail-description">{state.generation.statusMessage}</p>
            <div className="progress-meta">
              <span>{state.generation.completedStages.length} / 5 단계 완료</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="status-detail">
              다음 행동:{' '}
              {nextStage
                ? `${nextStage.label} · ${nextStage.testHook}`
                : '마크다운을 복사하거나 새 브리프로 다시 시작'}
            </p>
          </article>

          <article className="rail-card">
            <div className="rail-section-head">
              <div>
                <p className="section-kicker">브리프 입력</p>
                <h3>브리프 입력</h3>
              </div>
              <p className="brief-inline">작성 흐름을 바꾸는 핵심 입력만 남겨 한 번에 읽히게 정리했습니다.</p>
            </div>

            <form className="brief-form">
              <label>
                <span>주제</span>
                <textarea
                  aria-label="Topic"
                  onChange={(event) =>
                    dispatch({
                      type: 'update-input',
                      field: 'topic',
                      value: event.target.value,
                    })
                  }
                  value={state.inputs.topic}
                />
              </label>
              <label>
                <span>독자</span>
                <select
                  aria-label="Audience"
                  onChange={(event) =>
                    dispatch({
                      type: 'update-input',
                      field: 'audience',
                      value: event.target.value as Audience,
                    })
                  }
                  value={state.inputs.audience}
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>톤</span>
                <select
                  aria-label="Tone"
                  onChange={(event) =>
                    dispatch({
                      type: 'update-input',
                      field: 'tone',
                      value: event.target.value as Tone,
                    })
                  }
                  value={state.inputs.tone}
                >
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>길이</span>
                <select
                  aria-label="Length"
                  onChange={(event) =>
                    dispatch({
                      type: 'update-input',
                      field: 'length',
                      value: event.target.value as Length,
                    })
                  }
                  value={state.inputs.length}
                >
                  {lengthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </form>

            <details className="support-drawer">
              <summary>
                <span>추천 주제 불러오기</span>
                <span>첫 화면 밀도 줄이기</span>
              </summary>
              <div className="preset-list">
                {topicPresets.map((preset) => (
                  <button
                    className="preset-tile"
                    key={preset.title}
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
                    type="button"
                  >
                    <strong>{preset.title}</strong>
                    <span>{preset.rationale}</span>
                  </button>
                ))}
              </div>
            </details>
          </article>
        </aside>

        <section className="workspace-main">
          <div className="spotlight-row">
            <article className="spotlight-card spotlight-card-primary">
              <p className="spotlight-label">현재 단계</p>
              <strong>{currentStage.label}</strong>
              <span className="spotlight-hook">{currentStage.testHook}</span>
              <p>{stageMessages[currentStage.id]}</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">다음 행동</p>
              <strong>{nextStage ? nextStage.label : '내보내기 또는 새 브리프'}</strong>
              <p>
                {nextStage
                  ? nextStage.description
                  : '최종 원고가 열렸습니다. 복사한 뒤 다음 주제로 새 흐름을 시작할 수 있습니다.'}
              </p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">브리프 범위</p>
              <strong>{state.inputs.topic || '주제를 입력해 주세요'}</strong>
              <div className="tag-row">
                <span className="soft-tag">
                  {audienceOptions.find((option) => option.value === state.inputs.audience)?.label}
                </span>
                <span className="soft-tag">
                  {toneOptions.find((option) => option.value === state.inputs.tone)?.label}
                </span>
                <span className="soft-tag">
                  {lengthOptions.find((option) => option.value === state.inputs.length)?.label}
                </span>
              </div>
            </article>
          </div>

          <div className="stage-rail">
            {workflowStages.map((stage, index) => (
              <button
                aria-label={stage.testHook}
                className={`stage-chip ${stageTone(stage, state.generation)} ${selectedStage === stage.id ? 'is-selected' : ''}`.trim()}
                key={stage.id}
                onClick={() => setSelectedStage(stage.id)}
                type="button"
              >
                <span className="stage-chip-index">{index + 1}</span>
                <span className="stage-chip-copy">
                  <strong>{stage.label}</strong>
                  <em>{stage.testHook}</em>
                </span>
                <span className="stage-chip-state">
                  {state.generation.currentStage === stage.id &&
                  state.generation.status !== 'export-ready' &&
                  state.generation.status !== 'error'
                    ? '진행 중'
                    : state.generation.completedStages.includes(stage.id)
                      ? '완료'
                      : '대기'}
                </span>
              </button>
            ))}
          </div>

          <article className="workspace-panel">
            <div className="workspace-panel-head">
              <div>
                <p className="panel-hook">{selectedStageMeta.testHook}</p>
                <h2>{selectedStageMeta.label}</h2>
              </div>
              <div className="panel-actions">
                <button
                  className="inline-action inline-action-ghost"
                  onClick={() => setSelectedStage(currentStage.id)}
                  type="button"
                >
                  <span className="button-copy-kr">현재 단계로 이동</span>
                </button>
              </div>
            </div>
            <div className="workspace-panel-copy">
              <p>{selectedStageMeta.description}</p>
              <p>단계별 산출물을 한 장씩만 보여줘서 집중이 흐트러지지 않게 했습니다.</p>
              {state.copyFeedback ? <p>{state.copyFeedback}</p> : null}
            </div>
            {renderStageBody()}
          </article>

          <details className="support-drawer evidence-drawer">
            <summary>
              <span>지원 자료 열기</span>
              <span>보조 기록</span>
            </summary>
            <div className="evidence-grid">
              <article className="evidence-card">
                <p className="card-eyebrow">산출물 목록</p>
                <h3>기록 위치</h3>
                <div className="evidence-row">
                  <strong>runs</strong>
                  <p>`run_manifest.json`, `artifact_index.json`에 실행 결과와 산출물 경로를 남깁니다.</p>
                </div>
                <div className="evidence-row">
                  <strong>reports</strong>
                  <p>`review_report.md`, `evaluation_report.json`, `scorecard.json`을 뒤쪽 검토 레이어로 유지합니다.</p>
                </div>
              </article>
              <article className="evidence-card">
                <p className="card-eyebrow">현재 상태</p>
                <h3>검토 지원</h3>
                <div className="evidence-row">
                  <strong>상태 메시지</strong>
                  <p>{state.generation.statusMessage}</p>
                </div>
                <div className="evidence-row">
                  <strong>내보내기</strong>
                  <p>{finalPost ? '최종 원고가 준비되어 복사 버튼이 활성화되었습니다.' : '최종 원고가 열릴 때까지 복사 버튼은 잠긴 상태입니다.'}</p>
                </div>
                <div className="evidence-row">
                  <strong>Deliverables</strong>
                  <ul className="stack-list">
                    {deliverables.map((item) => (
                      <li key={item.id}>
                        {item.title}: {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </div>
          </details>
        </section>
      </section>
    </main>
  )
}

export default App
