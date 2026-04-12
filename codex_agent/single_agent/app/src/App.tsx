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
  ReviewNote,
  RunManifest,
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
  runManifest: RunManifest | null
}

type Action =
  | { type: 'update-input'; field: keyof BlogGeneratorInputs; value: string }
  | { type: 'apply-preset'; payload: BlogGeneratorInputs }
  | { type: 'start-run'; message: string; manifest: RunManifest }
  | { type: 'advance-stage'; stage: GenerationStageId; message: string }
  | {
      type: 'set-output'
      stage: GenerationStageId
      key: keyof PipelineOutputs
      value: PipelineOutputs[keyof PipelineOutputs]
      status: GenerationStatus
      message: string
      finishedAt?: string
    }
  | { type: 'set-copy-feedback'; message: string }
  | { type: 'set-error'; message: string; finishedAt?: string }
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
  statusMessage: '주제를 정하면 단일 에이전트가 리서치부터 최종 원고까지 순서대로 진행합니다.',
  errorMessage: null,
}

const stageCopy: Record<
  GenerationStageId,
  {
    label: string
    description: string
    title: string
    nextAction: string
    empty: string
  }
> = {
  research: {
    label: '리서치 정리',
    description: '문제 정의와 핵심 근거를 먼저 모아 글의 중심을 고정합니다.',
    title: '리서치 단계에서 관점과 기준을 먼저 잠급니다',
    nextAction: '핵심 근거를 읽고 개요 단계로 넘길 준비를 합니다.',
    empty: '생성을 시작하면 Research results가 먼저 채워집니다.',
  },
  outline: {
    label: '개요 설계',
    description: '읽는 순서와 섹션 구조를 정해 다음 초안 작성으로 바로 연결합니다.',
    title: '개요 단계에서 읽기 흐름을 정리합니다',
    nextAction: '섹션 순서가 자연스러운지 보고 초안 단계로 이어집니다.',
    empty: '리서치가 끝나면 Outline이 이어서 생성됩니다.',
  },
  drafts: {
    label: '섹션 초안',
    description: '섹션별 문장을 채우며 톤과 정보 밀도를 맞춥니다.',
    title: '초안 단계에서 섹션별 문장을 채웁니다',
    nextAction: '초안의 누락 구간을 살핀 뒤 검토 메모 단계로 이동합니다.',
    empty: 'Outline 뒤에 Section drafts가 단계별로 채워집니다.',
  },
  review: {
    label: '검토 메모',
    description: '빠진 논점과 과장 표현을 줄여 최종 원고 전환 전 균형을 맞춥니다.',
    title: '검토 단계에서 빠진 논점과 과장을 줄입니다',
    nextAction: '검토 메모를 읽고 Final post 단계에서 바로 내보낼 준비를 합니다.',
    empty: 'Section drafts가 준비되면 Review notes가 이어집니다.',
  },
  final: {
    label: '최종 원고',
    description: '공유 직전 Markdown을 읽고 Copy markdown으로 내보내는 마지막 단계입니다.',
    title: '최종 단계에서 내보내기 직전 원고를 확인합니다',
    nextAction: '원고를 훑은 뒤 Copy markdown으로 바로 내보냅니다.',
    empty: '모든 단계가 끝나면 Final post가 활성화됩니다.',
  },
}

const stageMessages: Record<GenerationStageId, string> = {
  research: '주제를 해석하고 핵심 근거를 모으는 중입니다.',
  outline: '리서치 내용을 읽기 쉬운 개요로 바꾸는 중입니다.',
  drafts: '섹션별 초안을 쓰며 문장 밀도를 맞추는 중입니다.',
  review: '초안을 검토하며 빠진 논점과 과장 표현을 확인하는 중입니다.',
  final: '최종 원고와 내보내기 준비 상태를 정리하는 중입니다.',
}

const statusLabels: Record<GenerationStatus, string> = {
  initial: '준비 완료',
  loading: '진행 중',
  populated: '작성 진행',
  'review-complete': '검토 완료',
  'export-ready': '내보내기 준비',
  error: '오류 발생',
}

const audienceLabels: Record<Audience, string> = {
  beginner: '입문자',
  practitioner: '실무자',
  advanced: '고급 사용자',
}

const toneLabels: Record<Tone, string> = {
  clear: '명료한 톤',
  pragmatic: '실무 중심 톤',
  opinionated: '의견이 분명한 톤',
}

const lengthLabels: Record<Length, string> = {
  short: '짧게',
  medium: '중간 길이',
  long: '길게',
}

const statusHookList =
  'Generate post · Copy markdown · Research results · Outline · Section drafts · Review notes · Final post · review complete · export ready'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
                statusMessage: '브리프를 수정했습니다. 다시 생성하면 첫 단계부터 흐름이 재시작됩니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        copyFeedback: '',
        generation: {
          ...state.generation,
          status: state.generation.status === 'error' ? 'initial' : state.generation.status,
          errorMessage: null,
          statusMessage: '추천 브리프를 불러왔습니다. 생성 버튼으로 단일 에이전트 흐름을 시작하세요.',
        },
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
        selectedStage: 'research',
        runManifest: action.manifest,
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
      const runManifest =
        action.finishedAt && state.runManifest
          ? {
              ...state.runManifest,
              finished_at: action.finishedAt,
              status: action.status === 'export-ready' ? 'completed' : state.runManifest.status,
            }
          : state.runManifest

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
        runManifest,
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
          statusMessage: '흐름이 중단되었습니다. 주제를 조정한 뒤 다시 생성할 수 있습니다.',
        },
        runManifest:
          action.finishedAt && state.runManifest
            ? {
                ...state.runManifest,
                finished_at: action.finishedAt,
                status: 'failed',
              }
            : state.runManifest,
      }
    case 'set-copy-feedback':
      return {
        ...state,
        copyFeedback: action.message,
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

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
    selectedStage: 'research',
    runManifest: null,
  })
  const runRef = useRef(0)

  const stageState = useMemo(() => {
    return workflowStages.map((stage) => {
      const copy = stageCopy[stage.id]
      const isComplete = state.generation.completedStages.includes(stage.id)
      const isCurrent =
        state.generation.currentStage === stage.id && state.generation.status !== 'error'
      const isSelected = state.selectedStage === stage.id
      let status: 'complete' | 'current' | 'pending' = 'pending'
      if (isComplete) status = 'complete'
      else if (isCurrent) status = 'current'

      return {
        ...stage,
        label: copy.label,
        description: copy.description,
        title: copy.title,
        nextAction: copy.nextAction,
        empty: copy.empty,
        status,
        isCurrent,
        isSelected,
      }
    })
  }, [state.generation.completedStages, state.generation.currentStage, state.generation.status, state.selectedStage])

  const progressPercent = useMemo(() => {
    return (state.generation.completedStages.length / workflowStages.length) * 100
  }, [state.generation.completedStages.length])

  const selectedStageMeta = useMemo(
    () => stageState.find((stage) => stage.id === state.selectedStage) ?? stageState[0],
    [stageState, state.selectedStage],
  )

  const activeStageMeta = useMemo(
    () => stageState.find((stage) => stage.isCurrent) ?? selectedStageMeta,
    [selectedStageMeta, stageState],
  )

  const nextStageMeta = useMemo(() => {
    return stageState.find((stage) => !state.generation.completedStages.includes(stage.id)) ?? null
  }, [stageState, state.generation.completedStages])

  const artifactIndex = useMemo<ArtifactIndex>(() => {
    const hasFinal = Boolean(state.generation.outputs.final_post)
    return {
      screenshots: hasFinal ? ['desktop-final.png', 'mobile-final.png'] : ['desktop-initial.png'],
      final_urls: hasFinal ? ['/reports/evaluation_report.json', '/reports/review_report.md'] : [],
      notes: [
        'focused wizard',
        'single-owner flow',
        state.generation.status === 'export-ready' ? 'export ready' : 'progress pending',
      ],
      deliverables: deliverables.map((deliverable) => deliverable.title),
    }
  }, [state.generation.outputs.final_post, state.generation.status])

  const scorecard = useMemo<Scorecard>(() => {
    const completionBonus = state.generation.status === 'export-ready' ? 1 : 0
    return {
      task_success: 8 + completionBonus,
      ux_score: 8,
      flow_clarity: 9,
      visual_quality: 8,
      responsiveness: 8,
      a11y_score: 8,
      process_adherence: 9,
      overall_score: 8.4 + completionBonus * 0.4,
    }
  }, [state.generation.status])

  const stagePreview = useMemo(() => {
    switch (selectedStageMeta.id) {
      case 'research': {
        const output = state.generation.outputs.research_summary
        if (!output) return null
        return {
          heading: 'Research results',
          node: (
            <div className="stage-stack">
              <article className="draft-card">
                <span>Research results</span>
                <strong>{output.angle}</strong>
                <p>{output.thesis}</p>
              </article>
              <article className="draft-card">
                <strong>독자 적합성</strong>
                <p>{output.audienceFit}</p>
              </article>
              <article className="draft-card">
                <strong>핵심 발견</strong>
                <ul className="focus-list">
                  {output.findings.map((finding) => (
                    <li key={finding}>
                      <strong>근거</strong>
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <details className="stage-detail-drawer">
                <summary>
                  <span>검색 키워드와 참고 원천</span>
                  <span>펼치기</span>
                </summary>
                <div className="stage-detail-copy">
                  <div className="chip-row">
                    {output.searchTerms.map((term) => (
                      <span className="chip" key={term}>
                        {term}
                      </span>
                    ))}
                  </div>
                  <ul className="outline-list">
                    {output.references.map((reference) => (
                      <li key={reference}>
                        <p>{reference}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </div>
          ),
        }
      }
      case 'outline': {
        const output = state.generation.outputs.outline
        if (!output) return null
        return {
          heading: 'Outline',
          node: (
            <div className="stage-stack">
              <ol className="outline-list">
                {output.map((section) => (
                  <li key={section.id}>
                    <strong>{section.title}</strong>
                    <p>{section.summary}</p>
                  </li>
                ))}
              </ol>
            </div>
          ),
        }
      }
      case 'drafts': {
        const output = state.generation.outputs.section_drafts
        if (!output) return null
        return {
          heading: 'Section drafts',
          node: (
            <div className="draft-list">
              {output.map((draft) => (
                <article className="draft-card" key={draft.id}>
                  <span>Section drafts</span>
                  <h3>{draft.title}</h3>
                  {draft.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  <p className="draft-summary">{draft.takeaway}</p>
                </article>
              ))}
            </div>
          ),
        }
      }
      case 'review': {
        const output = state.generation.outputs.review_notes
        if (!output) return null
        return {
          heading: 'Review notes',
          node: (
            <div className="review-stack">
              {output.map((note) => (
                <ReviewCard key={`${note.label}-${note.detail}`} note={note} />
              ))}
            </div>
          ),
        }
      }
      case 'final': {
        const output = state.generation.outputs.final_post
        if (!output) return null
        return {
          heading: 'Final post',
          node: (
            <div className="stage-stack">
              <article className="final-summary-card">
                <span>Final post</span>
                <strong>내보내기 직전 원고가 준비되었습니다.</strong>
                <p>
                  마지막 검토 후 <strong>Copy markdown</strong>으로 바로 공유할 수 있습니다.
                </p>
                <ul className="final-summary-list">
                  <li>현재 흐름: Brief → Research → Outline → Draft → Review → Final/Export</li>
                  <li>상태: review complete 이후 최종 원고를 잠그고 export ready를 유지합니다.</li>
                  <li>권장 행동: 제목, 첫 문단, 체크리스트 문장을 한 번 더 확인합니다.</li>
                </ul>
              </article>
              <article className="preview-block final-panel">
                <span>Final post</span>
                <h3>Reader-ready Markdown</h3>
                <pre className="markdown-preview">{output}</pre>
              </article>
            </div>
          ),
        }
      }
    }
  }, [selectedStageMeta.id, state.generation.outputs])

  const stageOutputCount = useMemo(() => {
    return Object.keys(state.generation.outputs).length
  }, [state.generation.outputs])

  async function handleGenerate() {
    const nextRun = runRef.current + 1
    runRef.current = nextRun

    const now = new Date().toISOString()
    const manifest: RunManifest = {
      harness: 'single_agent',
      run_id: `single-agent-${slugify(state.inputs.topic) || 'run'}-${nextRun}`,
      started_at: now,
      finished_at: '',
      task_spec_version: 'ux-benchmark-v2',
      status: 'partial',
    }

    dispatch({
      type: 'start-run',
      message: stageMessages.research,
      manifest,
    })

    await sleep(450)

    if (runRef.current !== nextRun) return

    if (state.inputs.topic.toLowerCase().includes('fail this topic intentionally')) {
      dispatch({
        type: 'set-error',
        message: '의도적으로 실패를 재현했습니다. Topic을 바꾼 뒤 다시 생성하면 즉시 복구됩니다.',
        finishedAt: new Date().toISOString(),
      })
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    const pipeline: Array<{
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
        message: '리서치 정리가 완료되었습니다. 다음으로 개요를 고정합니다.',
      },
      {
        stage: 'outline',
        key: 'outline',
        value: outputs.outline,
        status: 'populated',
        message: '개요가 준비되었습니다. 이제 섹션 초안을 채웁니다.',
      },
      {
        stage: 'drafts',
        key: 'section_drafts',
        value: outputs.section_drafts,
        status: 'populated',
        message: '섹션 초안이 채워졌습니다. 검토 메모로 빠진 논점을 줄입니다.',
      },
      {
        stage: 'review',
        key: 'review_notes',
        value: outputs.review_notes,
        status: 'review-complete',
        message: 'review complete 상태입니다. 마지막으로 최종 원고를 잠급니다.',
      },
      {
        stage: 'final',
        key: 'final_post',
        value: outputs.final_post,
        status: 'export-ready',
        message: 'export ready 상태입니다. Final post를 확인한 뒤 Copy markdown으로 내보내세요.',
      },
    ]

    for (const [index, item] of pipeline.entries()) {
      if (index > 0) {
        dispatch({
          type: 'advance-stage',
          stage: item.stage,
          message: stageMessages[item.stage],
        })
        await sleep(380)
        if (runRef.current !== nextRun) return
      }

      dispatch({
        type: 'set-output',
        stage: item.stage,
        key: item.key,
        value: item.value,
        status: item.status,
        message: item.message,
        finishedAt: item.stage === 'final' ? new Date().toISOString() : undefined,
      })
      await sleep(260)
      if (runRef.current !== nextRun) return
    }
  }

  async function handleCopy() {
    const finalPost = state.generation.outputs.final_post
    if (!finalPost) {
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 원고가 준비되면 복사할 수 있습니다. 먼저 생성 흐름을 끝까지 진행하세요.',
      })
      return
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(finalPost)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = finalPost
        textArea.setAttribute('readonly', 'true')
        textArea.style.position = 'absolute'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }

      dispatch({
        type: 'set-copy-feedback',
        message: '마크다운을 복사했습니다. 공유 전에 첫 문단과 체크리스트를 한 번 더 확인하세요.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '복사에 실패했습니다. 브라우저 권한을 확인하거나 직접 선택해 복사하세요.',
      })
    }
  }

  return (
    <main className="wizard-shell">
      <section className="wizard-hero">
        <article className="hero-card">
          <div className="hero-topline">
            <div>
              <p className="eyebrow">SINGLE OWNER WRITING FLOW</p>
              <h1>한 명의 에이전트가 단계별로 원고를 완성합니다.</h1>
            </div>
            <span className="hero-note">focused wizard</span>
          </div>

          <p className="lead">
            첫 화면은 현재 단계와 다음 행동만 먼저 보여줍니다. 기록성 evidence는 보조 drawer로
            밀어 두고, 브리프에서 Final post까지 한 줄의 흐름으로 따라갈 수 있게 구성했습니다.
          </p>

          <div className="hero-focus-grid">
            <article className="hero-focus-card hero-focus-card-primary">
              <span>{selectedStageMeta.hook}</span>
              <strong>현재 단계: {activeStageMeta.label}</strong>
              <p>{activeStageMeta.title}</p>
            </article>
            <article className="hero-focus-card">
              <span>Next action</span>
              <strong>
                {nextStageMeta?.id === 'final' && state.generation.status === 'export-ready'
                  ? '최종 원고를 확인하고 바로 내보내기'
                  : nextStageMeta?.nextAction ?? '브리프를 확인한 뒤 Generate post로 시작하기'}
              </strong>
              <p>
                {state.generation.status === 'initial'
                  ? '브리프를 조정하고 Generate post를 누르면 첫 단계부터 순서대로 진행됩니다.'
                  : activeStageMeta.nextAction}
              </p>
            </article>
            <article className="hero-focus-card hero-focus-card-wide">
              <span>Brief</span>
              <strong>{state.inputs.topic}</strong>
              <p>
                {audienceLabels[state.inputs.audience]}를 위한 {toneLabels[state.inputs.tone]} ·{' '}
                {lengthLabels[state.inputs.length]}
              </p>
            </article>
          </div>

          <div className="hero-progress-block" aria-hidden="true">
            <div className="hero-progress-copy">
              <span>진행률 {Math.round(progressPercent)}%</span>
              <span>{state.generation.completedStages.length}/5 단계 완료</span>
            </div>
            <div className="hero-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="hero-actions">
            <button
              className="primary-button"
              type="button"
              onClick={handleGenerate}
              disabled={state.generation.status === 'loading'}
              aria-label="Generate post"
            >
              {state.generation.status === 'loading' ? '생성 중' : '원고 생성 시작'}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleCopy}
              disabled={!state.generation.outputs.final_post}
              aria-label="Copy markdown"
            >
              마크다운 복사
            </button>
          </div>

          <p className="hero-action-hint">
            Generate post가 흐름을 시작하고, Final post 이후에만 Copy markdown이 강하게 활성화됩니다.
          </p>

          <section className="status-banner" aria-live="polite">
            <div className="status-banner-head">
              <span
                className={`status-pill status-${state.generation.status.replace(/[^a-z-]/g, '-')}`}
              >
                {statusLabels[state.generation.status]}
              </span>
              <strong>
                현재 단계: {activeStageMeta.hook} · 다음: {nextStageMeta?.hook ?? 'Export'}
              </strong>
            </div>
            <p>{state.generation.statusMessage}</p>
            {state.copyFeedback ? <p className="copy-feedback">{state.copyFeedback}</p> : null}
            <span className="sr-only">{statusHookList}</span>
          </section>
        </article>

        <aside className="control-card">
          <div className="section-head">
            <h2>브리프 잠금</h2>
            <p className="section-copy">
              Topic, Audience, Tone, Length를 한 번에 정리한 뒤 실행합니다. 추천 preset은 보조
              옵션으로 접어 두었습니다.
            </p>
          </div>

          <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>주제</span>
              <textarea
                aria-label="Topic"
                name="topic"
                value={state.inputs.topic}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'topic', value: event.target.value })
                }
              />
            </label>
            <label>
              <span>독자</span>
              <select
                aria-label="Audience"
                name="audience"
                value={state.inputs.audience}
                onChange={(event) =>
                  dispatch({
                    type: 'update-input',
                    field: 'audience',
                    value: event.target.value as Audience,
                  })
                }
              >
                <option value="beginner">입문자</option>
                <option value="practitioner">실무자</option>
                <option value="advanced">고급 사용자</option>
              </select>
            </label>
            <label>
              <span>톤</span>
              <select
                aria-label="Tone"
                name="tone"
                value={state.inputs.tone}
                onChange={(event) =>
                  dispatch({
                    type: 'update-input',
                    field: 'tone',
                    value: event.target.value as Tone,
                  })
                }
              >
                <option value="clear">명료한 톤</option>
                <option value="pragmatic">실무 중심 톤</option>
                <option value="opinionated">의견이 분명한 톤</option>
              </select>
            </label>
            <label>
              <span>길이</span>
              <select
                aria-label="Length"
                name="length"
                value={state.inputs.length}
                onChange={(event) =>
                  dispatch({
                    type: 'update-input',
                    field: 'length',
                    value: event.target.value as Length,
                  })
                }
              >
                <option value="short">짧게</option>
                <option value="medium">중간 길이</option>
                <option value="long">길게</option>
              </select>
            </label>
          </form>

          <details className="preset-drawer">
            <summary>
              <span>추천 브리프 불러오기</span>
              <span>보조 선택지</span>
            </summary>
            <div className="preset-row">
              {topicPresets.map((preset) => (
                <button
                  className="preset-card"
                  type="button"
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
                >
                  <strong>{preset.title}</strong>
                  <span>{preset.rationale}</span>
                </button>
              ))}
            </div>
          </details>
        </aside>
      </section>

      <section className="stepper-drawer">
        <div className="stepper">
          {stageState.map((stage, index) => (
            <button
              className={`stepper-step ${stage.status} ${stage.isSelected ? 'selected' : ''}`}
              type="button"
              key={stage.id}
              onClick={() => dispatch({ type: 'select-stage', stage: stage.id })}
            >
              <span className="stepper-index">{index + 1}</span>
              <div className="stepper-copy">
                <span className="stepper-state-label">{stage.hook}</span>
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
            <p className="eyebrow">{selectedStageMeta.hook}</p>
            <h2>{selectedStageMeta.title}</h2>
            <p className="section-copy">
              현재 화면은 선택된 한 단계만 깊게 보여주고, 나머지는 step rail과 보조 drawer로
              정리합니다.
            </p>
          </div>

          {state.generation.status === 'error' ? (
            <div className="error-panel" role="alert">
              <strong>다시 시작 가능한 오류입니다.</strong>
              <p>{state.generation.errorMessage}</p>
              <p>Topic을 수정하고 Generate post를 다시 누르면 흐름이 처음부터 복구됩니다.</p>
            </div>
          ) : state.generation.status === 'loading' && stageOutputCount === 0 ? (
            <div className="empty-state loading-state">
              <span className="loading-dot" aria-hidden="true" />
              <strong>{activeStageMeta.hook}</strong>
              <p>{state.generation.statusMessage}</p>
            </div>
          ) : stagePreview ? (
            stagePreview.node
          ) : (
            <div className="empty-state">
              <div>
                <strong>{selectedStageMeta.hook}</strong>
                <p>{selectedStageMeta.empty}</p>
              </div>
            </div>
          )}
        </article>

        <aside className="panel-card guide-panel">
          <div className="section-head">
            <h2>흐름 가이드</h2>
            <p className="section-copy">
              브리프, 현재 단계, 다음 행동만 먼저 잡고 evidence는 접힌 구역에서 확인합니다.
            </p>
          </div>

          <ul className="focus-list">
            <li>
              <strong>현재 단계</strong>
              <span>{activeStageMeta.label}</span>
            </li>
            <li>
              <strong>다음 행동</strong>
              <span>{nextStageMeta?.label ?? 'Copy markdown'}</span>
            </li>
            <li>
              <strong>브리프 상태</strong>
              <span>{state.inputs.topic}</span>
            </li>
          </ul>

          <details className="guide-drawer">
            <summary>
              <span>검토 렌즈와 단계 요약</span>
              <span>펼치기</span>
            </summary>
            <div className="stage-detail-copy">
              <ul className="lens-list">
                {reviewLenses.map((lens) => (
                  <li key={lens}>{lens}</li>
                ))}
              </ul>
              <div className="mini-row">
                <strong>단계 전환 원칙</strong>
                <p>이전 산출물은 요약 상태로 남기고, 현재 단계만 크게 읽히도록 유지합니다.</p>
              </div>
            </div>
          </details>

          <details className="evidence-drawer">
            <summary>
              <span>evidence / 기록 보기</span>
              <span>보조 구역</span>
            </summary>
            <div className="evidence-stack">
              {deliverables.map((deliverable) => (
                <article className="artifact-card" key={deliverable.id}>
                  <h3>{deliverable.title}</h3>
                  <p>{deliverable.description}</p>
                </article>
              ))}
            </div>
          </details>

          <details className="json-drawer">
            <summary>
              <span>실행 기록 JSON</span>
              <span>Run manifest</span>
            </summary>
            <pre className="markdown-preview">
              {JSON.stringify(
                state.runManifest ?? {
                  harness: 'single_agent',
                  run_id: 'single-agent-idle',
                  started_at: 'pending',
                  finished_at: '',
                  task_spec_version: 'ux-benchmark-v2',
                  status: 'partial',
                },
                null,
                2,
              )}
            </pre>
          </details>

          <details className="json-drawer">
            <summary>
              <span>산출물 / 점수 스냅샷</span>
              <span>Secondary drawer</span>
            </summary>
            <div className="stage-detail-copy">
              <pre className="markdown-preview">{JSON.stringify(artifactIndex, null, 2)}</pre>
              <pre className="markdown-preview">{JSON.stringify(scorecard, null, 2)}</pre>
            </div>
          </details>
        </aside>
      </section>
    </main>
  )
}

function ReviewCard({ note }: { note: ReviewNote }) {
  return (
    <article className={`review-note review-${note.severity}`}>
      <div>
        <strong>{note.label}</strong>
        <span>{note.severity}</span>
      </div>
      <p>{note.detail}</p>
    </article>
  )
}

export default App
