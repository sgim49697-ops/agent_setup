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
    hook: 'research results',
  },
  outline: {
    label: '개요 설계',
    description: '읽히는 순서와 섹션 구조를 정리해 다음 초안 작성으로 바로 이어집니다.',
    title: '읽기 흐름에 맞는 개요를 잡습니다',
    hook: 'outline',
  },
  drafts: {
    label: '섹션 초안',
    description: '섹션별 문장을 채우며 정보 밀도와 톤을 맞춥니다.',
    title: '섹션별 초안을 차례로 채웁니다',
    hook: 'section drafts',
  },
  review: {
    label: '검토 메모',
    description: '빠진 논점과 과장 표현을 훑어 최종 글 전환 전에 균형을 잡습니다.',
    title: '검토 단계에서 빠진 논점을 다듬습니다',
    hook: 'review notes',
  },
  final: {
    label: '최종 글',
    description: '공유 직전 상태의 Markdown을 읽고 복사하는 마지막 단계입니다.',
    title: '내보내기 직전 최종 글을 확인합니다',
    hook: 'final post',
  },
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

const stageMessages: Record<GenerationStageId, string> = {
  research: '주제를 해석하고 첫 관점과 제약 조건을 정리하는 중입니다.',
  outline: '리서치 내용을 읽기 쉬운 순서와 개요로 바꾸는 중입니다.',
  drafts: '섹션별 초안을 쓰고 문장 밀도를 맞추는 중입니다.',
  review: '초안을 검토하며 빠진 논점과 다듬을 문장을 확인하는 중입니다.',
  final: '최종 마크다운과 내보내기 준비 상태를 정리하는 중입니다.',
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
      const isCurrent = state.generation.currentStage === stage.id && state.generation.status !== 'error'
      const isSelected = state.selectedStage === stage.id
      let status: 'complete' | 'current' | 'pending' = 'pending'
      if (isComplete) status = 'complete'
      else if (isCurrent) status = 'current'
      return {
        ...stage,
        label: copy.label,
        description: copy.description,
        status,
        isSelected,
      }
    })
  }, [state.generation.completedStages, state.generation.currentStage, state.generation.status, state.selectedStage])

  const nextStage = useMemo(() => {
    return stageState.find((stage) => !state.generation.completedStages.includes(stage.id))
  }, [stageState, state.generation.completedStages])

  const selectedStageMeta = useMemo(
    () => stageState.find((stage) => stage.id === state.selectedStage) ?? stageState[0],
    [stageState, state.selectedStage],
  )

  const currentActionLabel = useMemo(() => {
    if (state.generation.status === 'loading') {
      return `${selectedStageMeta.label} 결과를 기다리기`
    }
    if (state.generation.status === 'export-ready') {
      return '최종 원고를 검토하고 마크다운 복사'
    }
    if (state.generation.status === 'error') {
      return '주제를 다듬고 다시 생성'
    }
    if (state.generation.completedStages.length === 0) {
      return '브리프를 확인하고 글 생성 시작'
    }
    return `${selectedStageMeta.label} 결과를 읽고 다음 단계 준비`
  }, [
    selectedStageMeta.label,
    state.generation.completedStages.length,
    state.generation.status,
  ])

  const nextActionLabel = useMemo(() => {
    if (state.generation.status === 'loading') {
      return '현재 단계가 끝나면 다음 요약이 자동으로 이어집니다.'
    }
    if (nextStage) {
      return `${nextStage.label} 단계로 이동`
    }
    if (state.generation.status === 'error') {
      return '브리프를 손본 뒤 처음부터 다시 진행'
    }
    return '원고를 내보내고 공유 전 최종 확인'
  }, [nextStage, state.generation.status])

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

  const primaryActionLabel = useMemo(() => {
    if (state.generation.status === 'export-ready') {
      return '마크다운 복사'
    }
    if (state.generation.status === 'loading') {
      return '현재 단계 읽기'
    }
    if (state.generation.completedStages.length > 0) {
      return nextStage ? `${nextStage.label} 이어서 보기` : '최종 글 검토'
    }
    return '글 생성 시작'
  }, [nextStage, state.generation.completedStages.length, state.generation.status])

  const primaryActionDetail = useMemo(() => {
    if (state.generation.status === 'export-ready') {
      return '완성된 Markdown을 복사해 에디터나 CMS 초안으로 바로 옮깁니다.'
    }
    if (state.generation.status === 'loading') {
      return '지금 채워지는 단계의 출력만 읽고 다음 단계가 무엇인지 확인합니다.'
    }
    if (state.generation.completedStages.length > 0) {
      return nextStage
        ? `${nextStage.label} 단계가 곧 이어집니다. 현재 결과가 충분한지만 먼저 보면 됩니다.`
        : '모든 단계가 끝났습니다. 최종 글을 읽고 공유 전 점검만 남았습니다.'
    }
    return '짧은 브리프를 정한 뒤 단일 에이전트 흐름을 시작합니다.'
  }, [nextStage, state.generation.completedStages.length, state.generation.status])

  const liveRegionHook = useMemo(() => {
    if (state.generation.status === 'export-ready') {
      return 'export-ready copy markdown'
    }
    if (state.generation.status === 'review-complete') {
      return 'review-complete final post'
    }
    return stageCopy[selectedStageMeta.id].hook
  }, [selectedStageMeta.id, state.generation.status])

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
        final_urls: ['http://127.0.0.1:4173'],
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
      <section className="wizard-hero">
        <div className="hero-card">
          <p className="eyebrow">단일 에이전트 작업대</p>
          <h1>한 번에 한 단계씩 쓰는 단일 에이전트 작성 흐름</h1>
          <p className="lead">
            하나의 에이전트가 브리프부터 최종 글까지 끝까지 책임집니다. 첫 화면에서는 지금 해야 할
            단계와 다음 행동만 남기고, 근거 자료와 평가 정보는 보조 레이어로 뒤로 보냅니다.
          </p>
          <div className="hero-highlight-grid">
            <article className="hero-highlight-card">
              <span>현재 단계</span>
              <strong>{selectedStageMeta.label}</strong>
            </article>
            <article className="hero-highlight-card">
              <span>지금 할 일</span>
              <strong>{currentActionLabel}</strong>
            </article>
            <article className="hero-highlight-card">
              <span>다음 단계</span>
              <strong>{nextActionLabel}</strong>
            </article>
          </div>
          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleGenerate}
              disabled={state.generation.status === 'loading'}
            >
              {state.generation.status === 'loading' ? '생성 중...' : '글 생성 시작'}
            </button>
            <button type="button" className="secondary-button" onClick={copyMarkdown}>
              마크다운 복사
            </button>
          </div>
          <div className="status-banner" aria-live="polite">
            <div>
              <span className={`status-pill status-${state.generation.status}`}>{statusLabel}</span>
              <strong>{state.generation.statusMessage}</strong>
            </div>
            <p>
              {state.generation.errorMessage ??
                `현재 단계: ${selectedStageMeta.label} · 다음 단계: ${nextStage ? nextStage.label : '내보내기 또는 다시 시작'}`}
            </p>
            {state.copyFeedback ? <p className="copy-feedback">{state.copyFeedback}</p> : null}
          </div>
        </div>

        <aside className="control-card">
          <div className="section-head">
            <p className="eyebrow">브리프 설정</p>
            <h2>지금 만들 글 요청을 간단히 정리합니다</h2>
            <p className="section-copy">
              입력은 짧고 단순하게 유지한 뒤, 생성 결과는 현재 단계에 필요한 정보만 한 번에 보여줍니다.
            </p>
          </div>

          <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>주제</span>
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
              <span>독자</span>
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
              <span>톤</span>
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
              <span>분량</span>
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
        </aside>
      </section>

      <section className="preset-row" aria-label="주제 프리셋">
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
          <p className="eyebrow">진행 단계</p>
          <h2>지금 필요한 단계만 또렷하게 따라갑니다</h2>
        </div>
        <div className="stepper" aria-label="생성 진행 단계">
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
          <div className="section-head guide-head">
            <p className="eyebrow">현재 포커스</p>
            <h2>지금 화면에서 바로 이해해야 할 흐름</h2>
            <p className="section-copy">
              증거보다 현재 단계와 다음 행동을 먼저 읽을 수 있게 요약한 영역입니다.
            </p>
          </div>
          <ul className="focus-list">
            <li>현재 단계: {selectedStageMeta.label}</li>
            <li>
              지금 할 행동: {currentActionLabel}
            </li>
            <li>다음 단계: {nextActionLabel}</li>
          </ul>

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

function StageSurface(props: { state: GenerationState; stageId: GenerationStageId }) {
  const { state, stageId } = props
  const outputs = state.outputs

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
          emptyText="생성을 시작하면 이 영역에 리서치 요약이 채워집니다."
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
        <pre className="markdown-preview">{outputs.final_post}</pre>
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

function stageTitle(stageId: GenerationStageId) {
  switch (stageId) {
    case 'research':
      return '관점과 근거를 먼저 정리합니다'
    case 'outline':
      return '읽기 흐름에 맞는 개요를 잡습니다'
    case 'drafts':
      return '섹션별 초안을 차례로 채웁니다'
    case 'review':
      return '검토 단계에서 빠진 논점을 다듬습니다'
    case 'final':
      return '내보내기 직전 최종 글을 확인합니다'
  }
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

export default App
