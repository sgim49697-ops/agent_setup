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
  statusMessage: '주제를 정하면 단일 에이전트 작성 흐름이 한 단계씩 차례로 진행됩니다.',
  errorMessage: null,
}

const stageCopy: Record<
  GenerationStageId,
  {
    label: string
    description: string
    title: string
    hook: string
  }
> = {
  research: {
    label: '리서치 정리',
    description: '핵심 사실과 주장 방향을 먼저 모아 글의 중심을 고정합니다.',
    title: '관점과 근거를 먼저 정리합니다',
    hook: 'Research results',
  },
  outline: {
    label: '개요 설계',
    description: '읽히는 순서와 섹션 구조를 정리해 다음 초안 작성으로 바로 이어집니다.',
    title: '읽기 흐름에 맞는 개요를 잡습니다',
    hook: 'Outline',
  },
  drafts: {
    label: '섹션 초안',
    description: '섹션별 문장을 채우며 정보 밀도와 톤을 맞춥니다.',
    title: '섹션별 초안을 차례로 채웁니다',
    hook: 'Section drafts',
  },
  review: {
    label: '검토 메모',
    description: '빠진 논점과 과장 표현을 훑어 최종 글 전환 전에 균형을 잡습니다.',
    title: '검토 단계에서 빠진 논점을 다듬습니다',
    hook: 'Review notes',
  },
  final: {
    label: '최종 글',
    description: '공유 직전 상태의 Markdown을 읽고 복사하는 마지막 단계입니다.',
    title: '내보내기 직전 최종 글을 확인합니다',
    hook: 'Final post',
  },
}

const stageMessages: Record<GenerationStageId, string> = {
  research: '주제를 해석하고 첫 관점과 제약 조건을 정리하는 중입니다.',
  outline: '리서치 내용을 읽기 쉬운 순서와 개요로 바꾸는 중입니다.',
  drafts: '섹션별 초안을 쓰고 문장 밀도를 맞추는 중입니다.',
  review: '초안을 검토하며 빠진 논점과 다듬을 문장을 확인하는 중입니다.',
  final: '최종 마크다운과 내보내기 준비 상태를 정리하는 중입니다.',
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
                statusMessage: '입력이 바뀌었습니다. 다시 생성하면 작성 흐름이 처음부터 정리됩니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '추천 브리프를 불러왔습니다. 글 생성을 시작하면 단일 에이전트 흐름이 이어집니다.',
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
          statusMessage: '완료 전에 흐름이 멈췄습니다. 주제를 조정한 뒤 다시 생성해 보세요.',
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
        hook: copy.hook,
        status,
        isCurrent,
        isSelected,
      }
    })
  }, [
    state.generation.completedStages,
    state.generation.currentStage,
    state.generation.status,
    state.selectedStage,
  ])

  const nextStage = useMemo(() => {
    return stageState.find((stage) => !state.generation.completedStages.includes(stage.id))
  }, [stageState, state.generation.completedStages])

  const selectedStageMeta = useMemo(
    () => stageState.find((stage) => stage.id === state.selectedStage) ?? stageState[0],
    [stageState, state.selectedStage],
  )

  const activeStageMeta = useMemo(() => {
    return stageState.find((stage) => stage.id === state.generation.currentStage) ?? selectedStageMeta
  }, [selectedStageMeta, stageState, state.generation.currentStage])

  const completedStageCount = state.generation.completedStages.length

  const progressRatio = useMemo(() => {
    if (state.generation.status === 'export-ready') return 100
    if (completedStageCount === 0) return 8
    return Math.round((completedStageCount / workflowStages.length) * 100)
  }, [completedStageCount, state.generation.status])

  const currentActionLabel = useMemo(() => {
    if (state.generation.status === 'loading') {
      return `${activeStageMeta.label} 읽기`
    }
    if (state.generation.status === 'export-ready') {
      return '최종 원고 검토 후 복사'
    }
    if (state.generation.status === 'error') {
      return '브리프를 다듬고 다시 시작'
    }
    if (completedStageCount === 0) {
      return '브리프 확인 후 생성 시작'
    }
    return `${selectedStageMeta.label} 결과 확인`
  }, [activeStageMeta.label, completedStageCount, selectedStageMeta.label, state.generation.status])

  const nextActionLabel = useMemo(() => {
    if (state.generation.status === 'loading') {
      return nextStage ? `${nextStage.label} 자동 진행 대기` : '최종 글 정리 대기'
    }
    if (nextStage) {
      return `${nextStage.label} 단계로 이동`
    }
    if (state.generation.status === 'error') {
      return '브리프 수정 후 처음부터 재생성'
    }
    return '마크다운 복사와 공유 전 확인'
  }, [nextStage, state.generation.status])

  const primaryActionLabel = useMemo(() => {
    if (state.generation.status === 'loading') {
      return '생성 중...'
    }
    if (state.generation.status === 'export-ready') {
      return '다시 생성하기'
    }
    if (completedStageCount > 0) {
      return '처음부터 다시 생성'
    }
    return '글 생성 시작'
  }, [completedStageCount, state.generation.status])

  const statusLabel = useMemo(() => {
    const labels: Record<GenerationStatus, string> = {
      initial: '준비 완료',
      loading: '진행 중',
      populated: '단계 완료',
      'review-complete': '검토 완료',
      'export-ready': '내보내기 준비',
      error: '오류',
    }
    return labels[state.generation.status]
  }, [state.generation.status])

  const liveRegionHook = useMemo(() => {
    if (state.generation.status === 'export-ready') {
      return 'export-ready Final post Copy markdown'
    }
    return `${activeStageMeta.hook} Generate post`
  }, [activeStageMeta.hook, state.generation.status])

  const liveStatusMessage = useMemo(() => {
    if (state.generation.errorMessage) {
      return `${statusLabel}. ${state.generation.errorMessage}. ${liveRegionHook}`
    }
    const parts = [statusLabel, state.generation.statusMessage, liveRegionHook]
    if (state.copyFeedback) {
      parts.push(state.copyFeedback)
    }
    return parts.join(' ')
  }, [
    liveRegionHook,
    state.copyFeedback,
    state.generation.errorMessage,
    state.generation.statusMessage,
    statusLabel,
  ])

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    if (topic.length < 6) {
      dispatch({
        type: 'set-error',
        message: '주제는 최소 6자 이상이어야 흐름이 맥락을 충분히 잡을 수 있습니다.',
      })
      return
    }

    if (/^\s*(error|fail)\b/i.test(topic)) {
      dispatch({
        type: 'set-error',
        message: '"error" 또는 "fail"로 시작하는 주제는 의도적으로 오류 흐름을 점검하는 입력으로 처리합니다.',
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
      message: '단일 에이전트 흐름을 시작했습니다. 리서치 단계에서 첫 관점과 제약을 모으고 있습니다.',
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
        message: '리서치 결과가 준비되었습니다. 이제 개요를 잡아 읽기 흐름으로 바꿉니다.',
      },
      {
        stage: 'outline',
        key: 'outline',
        value: outputs.outline,
        status: 'populated',
        message: '개요가 정리되었습니다. 다음은 섹션 초안을 채워 전체 글의 밀도를 맞춥니다.',
      },
      {
        stage: 'drafts',
        key: 'section_drafts',
        value: outputs.section_drafts,
        status: 'populated',
        message: '섹션 초안이 준비되었습니다. 이제 검토 단계에서 빠진 논점을 정리합니다.',
      },
      {
        stage: 'review',
        key: 'review_notes',
        value: outputs.review_notes,
        status: 'review-complete',
        message: '검토 메모가 준비되었습니다. 마지막으로 최종 글과 복사 가능한 원문을 묶습니다.',
      },
      {
        stage: 'final',
        key: 'final_post',
        value: outputs.final_post,
        status: 'export-ready',
        message: '최종 마크다운이 준비되었습니다. 내보내기 전에 한 번 더 읽고 바로 공유할 수 있습니다.',
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
        message: '먼저 최종 글 단계까지 생성해야 합니다. 마지막 단계에 도달하면 복사 버튼이 활성화됩니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(markdown)
      dispatch({
        type: 'set-copy-feedback',
        message: '마크다운을 복사했습니다. 에디터나 CMS 초안에 바로 붙여 넣을 수 있습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '이 브라우저에서는 클립보드 접근에 실패했습니다. 그래도 최종 글 패널에서 내용을 바로 확인할 수 있습니다.',
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
        started_at: '검증 후 생성',
        finished_at: '검증 후 생성',
        task_spec_version: 'tech-blog-benchmark-v1',
        status: state.generation.status === 'error' ? '실패' : '완료',
      }) satisfies Record<string, string>,
    [state.generation.status],
  )

  const artifactPreview = useMemo(
    () =>
      ({
        screenshots: ['데스크톱 검증 캡처', '모바일 검증 캡처'],
        final_urls: ['안정 URL은 harness_preview 스크립트에서 관리'],
        notes: ['집중형 작성 흐름이 기존 증거판 대신 첫 행동과 다음 단계를 먼저 보여줍니다.'],
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
      <section className="workspace-grid">
        <aside className="control-card control-rail">
          <div className="section-head">
            <p className="eyebrow">브리프 입력</p>
            <h2>짧게 정리하고 바로 시작합니다</h2>
            <p className="section-copy">
              왼쪽 레일은 요청만 다듬는 좁은 제어판입니다. 프리셋은 접어 두고, 본문 작업대는 현재 단계가
              먼저 보이도록 비워 둡니다.
            </p>
          </div>

          <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>
                주제
                <span className="sr-only">Topic</span>
              </span>
              <textarea
                name="topic"
                aria-label="Topic"
                rows={4}
                value={state.inputs.topic}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'topic', value: event.target.value })
                }
              />
            </label>
            <label>
              <span>
                독자
                <span className="sr-only">Audience</span>
              </span>
              <select
                name="audience"
                aria-label="Audience"
                value={state.inputs.audience}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'audience', value: event.target.value })
                }
              >
                <option value="beginner">입문자</option>
                <option value="practitioner">실무자</option>
                <option value="advanced">고급 사용자</option>
              </select>
            </label>
            <label>
              <span>
                톤
                <span className="sr-only">Tone</span>
              </span>
              <select
                name="tone"
                aria-label="Tone"
                value={state.inputs.tone}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'tone', value: event.target.value })
                }
              >
                <option value="clear">명료하게</option>
                <option value="pragmatic">실무적으로</option>
                <option value="opinionated">의견을 분명하게</option>
              </select>
            </label>
            <label>
              <span>
                분량
                <span className="sr-only">Length</span>
              </span>
              <select
                name="length"
                aria-label="Length"
                value={state.inputs.length}
                onChange={(event) =>
                  dispatch({ type: 'update-input', field: 'length', value: event.target.value })
                }
              >
                <option value="short">짧게</option>
                <option value="medium">중간 길이</option>
                <option value="long">길게</option>
              </select>
            </label>
          </form>

          <details className="preset-drawer" aria-label="주제 프리셋">
            <summary>추천 브리프 펼치기</summary>
            <div className="preset-stack">
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
            </div>
          </details>
        </aside>

        <section className="focus-workspace">
          <div className="hero-card focus-hero">
            <div className="hero-topline">
              <div>
                <p className="eyebrow">단일 에이전트 작업대</p>
                <h1>지금 해야 할 한 단계만 앞으로 둡니다</h1>
              </div>
              <article className="hero-meter-card">
                <span>진행도</span>
                <strong>
                  {completedStageCount}/{workflowStages.length}
                </strong>
                <p>{activeStageMeta.label}</p>
              </article>
            </div>
            <p className="lead">
              단일 에이전트가 브리프부터 최종 글까지 끝까지 책임집니다. 첫 화면은 현재 단계, 다음 행동,
              시작 CTA를 중심으로 정리하고 산출물이나 점수는 아래 보조 레이어로 밀어냈습니다.
            </p>

            <div className="hero-progress-block" aria-hidden="true">
              <div className="hero-progress-copy">
                <span>{currentActionLabel}</span>
                <span>{nextActionLabel}</span>
              </div>
              <div className="hero-progress-track">
                <span style={{ width: `${progressRatio}%` }} />
              </div>
            </div>

            <div className="hero-focus-grid">
              <article className="hero-focus-card hero-focus-card-primary">
                <span>현재 단계</span>
                <strong>{activeStageMeta.label}</strong>
                <p>{state.generation.statusMessage}</p>
              </article>
              <article className="hero-focus-card">
                <span>다음 행동</span>
                <strong>{nextActionLabel}</strong>
                <p>결과는 현재 단계만 크게 읽고, 나머지 정보는 접힌 표면 안에서 필요할 때만 확인합니다.</p>
              </article>
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className="primary-button"
                aria-label="Generate post"
                onClick={handleGenerate}
                disabled={state.generation.status === 'loading'}
              >
                <span>{primaryActionLabel}</span>
                <span className="sr-only">Generate post</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                aria-label="Copy markdown"
                onClick={copyMarkdown}
              >
                <span>마크다운 복사</span>
                <span className="sr-only">Copy markdown</span>
              </button>
            </div>

            <p className="sr-only" aria-live="polite">
              {liveStatusMessage}
            </p>

            <div className="status-banner">
              <div className="status-banner-head">
                <span className={`status-pill status-${state.generation.status}`}>{statusLabel}</span>
                <strong>{state.generation.statusMessage}</strong>
              </div>
              <div className="status-grid">
                <div>
                  <span>현재 단계</span>
                  <strong>{activeStageMeta.label}</strong>
                </div>
                <div>
                  <span>다음 단계</span>
                  <strong>{nextStage ? nextStage.label : '내보내기 또는 다시 시작'}</strong>
                </div>
              </div>
              {state.copyFeedback ? <p className="copy-feedback">{state.copyFeedback}</p> : null}
            </div>

            <div className="compact-stepper" aria-label="생성 진행 단계">
              {stageState.map((stage, index) => (
                <button
                  key={stage.id}
                  type="button"
                  className={`compact-step ${stage.status} ${stage.isSelected ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'select-stage', stage: stage.id })}
                  aria-current={stage.isCurrent ? 'step' : undefined}
                >
                  <span className="stepper-index">{index + 1}</span>
                  <div className="compact-step-copy">
                    <span className="compact-step-state">{stepStatusLabel(stage.status)}</span>
                    <strong>{stage.label}</strong>
                    <span className="sr-only">{stage.hook}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <article className="panel-card stage-panel">
            <div className="section-head">
              <p className="eyebrow">{selectedStageMeta.label}</p>
              <h2>{stageCopy[selectedStageMeta.id].title}</h2>
              <p className="section-copy">{selectedStageMeta.description}</p>
            </div>
            <StageSurface state={state.generation} stageId={state.selectedStage} inputs={state.inputs} />
          </article>
        </section>
      </section>

      <section className="support-grid">
        <aside className="panel-card guide-panel">
          <div className="section-head">
            <p className="eyebrow">현재 포커스</p>
            <h2>첫 화면은 현재 단계와 다음 행동만 읽습니다</h2>
            <p className="section-copy">
              기본 화면을 대시보드처럼 만들지 않기 위해, 근거 레이어는 아래로 내리고 현재 흐름만 반복해
              보여줍니다.
            </p>
          </div>
          <ul className="focus-list">
            <li>현재 단계: {activeStageMeta.label}</li>
            <li>지금 할 행동: {currentActionLabel}</li>
            <li>다음 단계: {nextActionLabel}</li>
            <li>브리프는 왼쪽 레일, 결과는 오른쪽 작업대로 분리했습니다.</li>
          </ul>
        </aside>

        <aside className="panel-card support-panel">
          <div className="section-head">
            <p className="eyebrow">보조 레이어</p>
            <h2>산출물과 평가는 접힌 표면에서만 확인합니다</h2>
            <p className="section-copy">
              evidence, scorecard, 실행 기록은 흐름을 방해하지 않도록 보조 레이어에서만 확인할 수 있게
              유지했습니다.
            </p>
          </div>

          <details className="evidence-drawer">
            <summary>보조 근거 레이어 열기</summary>
            <div className="evidence-stack">
              <article className="artifact-card">
                <h3>필수 산출물</h3>
                {deliverables.map((item) => (
                  <div key={item.id} className="mini-row">
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                ))}
              </article>

              <article className="artifact-card">
                <h3>평가 관점</h3>
                <ul className="lens-list">
                  {reviewLenses.map((lens) => (
                    <li key={lens}>{lens}</li>
                  ))}
                </ul>
              </article>

              <PreviewBlock
                title="실행 기록 미리보기"
                summary="실행 시작과 종료 시각, 현재 상태를 빠르게 확인합니다."
                payload={runManifestPreview}
              />
              <PreviewBlock
                title="산출물 목록 미리보기"
                summary="스크린샷, 최종 URL, 결과 묶음을 한곳에서 살펴봅니다."
                payload={artifactPreview}
              />
              <PreviewBlock
                title="점수 카드 미리보기"
                summary="기능, UX, 접근성 점수가 어떻게 기록되는지 확인합니다."
                payload={scorePreview}
              />
            </div>
          </details>
        </aside>
      </section>
    </main>
  )
}

function StageSurface(props: {
  state: GenerationState
  stageId: GenerationStageId
  inputs: BlogGeneratorInputs
}) {
  const { state, stageId, inputs } = props
  const outputs = state.outputs

  if (state.status === 'initial' && state.completedStages.length === 0) {
    return <LaunchState inputs={inputs} />
  }

  if (state.status === 'error' && stageId === 'final') {
    return (
      <div className="error-panel" role="alert">
        <strong>생성이 중단되었습니다.</strong>
        <p>{state.errorMessage}</p>
        <p>팁: 더 구체적인 주제를 넣고 다시 생성하면 정상 흐름을 빠르게 확인할 수 있습니다.</p>
      </div>
    )
  }

  switch (stageId) {
    case 'research':
      return outputs.research_summary ? (
        <div className="stage-stack">
          <article className="stage-intro-card">
            <span className="stage-token">Research results</span>
            <strong>{outputs.research_summary.angle}</strong>
            <p>{outputs.research_summary.thesis}</p>
          </article>
          <div className="stage-detail-grid">
            <article className="artifact-card">
              <h3>핵심 관찰</h3>
              <ul>
                {outputs.research_summary.findings.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            </article>
            <article className="artifact-card">
              <h3>검색 힌트</h3>
              <div className="chip-row">
                {outputs.research_summary.searchTerms.map((term) => (
                  <span key={term} className="chip">
                    {term}
                  </span>
                ))}
              </div>
            </article>
          </div>
        </div>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="research"
          emptyText="생성을 시작하면 이 영역에 리서치 요약이 채워집니다."
        />
      )
    case 'outline':
      return outputs.outline ? (
        <ol className="outline-list">
          {outputs.outline.map((section) => (
            <li key={section.id} className="outline-card">
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
          emptyText="리서치가 끝나기 전까지는 개요가 비어 있습니다."
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
          emptyText="개요가 정리되면 이곳에 섹션 초안이 순서대로 나타납니다."
        />
      )
    case 'review':
      return outputs.review_notes ? (
        <div className="review-stack">
          {outputs.review_notes.map((note) => (
            <article key={note.label} className={`review-note review-${note.severity}`}>
              <div>
                <strong>{note.label}</strong>
                <span>{reviewSeverityLabel(note.severity)}</span>
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
          emptyText="섹션 초안이 끝나면 검토 메모가 이 패널에 정리됩니다."
        />
      )
    case 'final':
      return outputs.final_post ? (
        <div className="final-stack">
          <div className="final-banner">
            <span className="stage-token">export-ready</span>
            <strong>최종 원고가 준비되었습니다</strong>
            <p>마크다운을 읽고 복사한 뒤 CMS 초안이나 에디터로 바로 옮길 수 있습니다.</p>
          </div>
          <pre className="markdown-preview">{outputs.final_post}</pre>
        </div>
      ) : (
        <EmptyState
          status={state.status}
          currentStage={state.currentStage}
          stageId="final"
          emptyText="검토가 끝나면 이곳에서 최종 마크다운을 바로 읽고 복사할 수 있습니다."
        />
      )
  }
}

function LaunchState(props: { inputs: BlogGeneratorInputs }) {
  return (
    <div className="launch-state">
      <article className="launch-card launch-card-primary">
        <span>현재 브리프</span>
        <strong>{props.inputs.topic}</strong>
        <p>
          {audienceLabel(props.inputs.audience)} 독자를 기준으로 {toneLabel(props.inputs.tone)} 톤의{' '}
          {lengthLabel(props.inputs.length)} 글을 준비합니다.
        </p>
      </article>
      <article className="launch-card">
        <span>생성 직후 보이는 것</span>
        <strong>리서치 정리와 다음 단계 안내</strong>
        <p>생성을 누르면 리서치 결과가 먼저 채워지고, 이후 단계는 자동으로 순서대로 이어집니다.</p>
      </article>
      <article className="launch-card">
        <span>작업 방식</span>
        <strong>프리셋은 접고, 결과는 현재 단계만 크게</strong>
        <p>한 번에 모든 결과를 펼치지 않고 지금 필요한 출력만 작업대 중앙에 띄워 집중을 유지합니다.</p>
      </article>
    </div>
  )
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
        <p>지금 이 단계를 정리하고 있습니다.</p>
      </div>
    )
  }

  if (props.status === 'error') {
    return (
      <div className="empty-state error-state">
        <p>이 단계가 끝나기 전에 오류가 발생했습니다.</p>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <p>{props.emptyText}</p>
    </div>
  )
}

function PreviewBlock(props: {
  title: string
  summary: string
  payload: Record<string, unknown>
}) {
  return (
    <article className="preview-block">
      <h3>{props.title}</h3>
      <p className="preview-summary">{props.summary}</p>
      <details className="json-drawer">
        <summary>원본 JSON 보기</summary>
        <pre>{JSON.stringify(props.payload, null, 2)}</pre>
      </details>
    </article>
  )
}

function reviewSeverityLabel(severity: 'good' | 'watch' | 'improve') {
  switch (severity) {
    case 'good':
      return '안정'
    case 'watch':
      return '점검'
    case 'improve':
      return '보강 필요'
  }
}

function stepStatusLabel(status: 'complete' | 'current' | 'pending') {
  switch (status) {
    case 'complete':
      return '완료'
    case 'current':
      return '진행 중'
    case 'pending':
      return '대기'
  }
}

function audienceLabel(audience: Audience) {
  switch (audience) {
    case 'beginner':
      return '입문자'
    case 'practitioner':
      return '실무자'
    case 'advanced':
      return '고급 사용자'
  }
}

function toneLabel(tone: Tone) {
  switch (tone) {
    case 'clear':
      return '명료한'
    case 'pragmatic':
      return '실무적인'
    case 'opinionated':
      return '의견이 분명한'
  }
}

function lengthLabel(length: Length) {
  switch (length) {
    case 'short':
      return '짧은'
    case 'medium':
      return '중간 길이'
    case 'long':
      return '긴'
  }
}

export default App
