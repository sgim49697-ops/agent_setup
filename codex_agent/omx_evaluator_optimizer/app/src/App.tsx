import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStatus,
  IterationRecord,
  Length,
  PipelineOutputs,
  Tone,
  WorkflowStage,
} from './contracts'
import { generatePipelineOutputs, isForcedErrorTopic } from './generator'
import { deliverables, evaluationTargets, requiredLoops, topicPresets, workflowStages } from './starterData'

type ScreenId = 'brief' | 'gate' | 'reader' | 'release'
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

const audienceCopy: Record<Audience, string> = {
  beginner: '입문자',
  practitioner: '실무자',
  advanced: '고급 독자',
}

const toneCopy: Record<Tone, string> = {
  clear: '명료한 설명',
  pragmatic: '실무 중심',
  opinionated: '단호한 주장',
}

const lengthCopy: Record<Length, string> = {
  short: '짧은 압축본',
  medium: '균형형 초안',
  long: '심화 원고',
}

const phaseCopy = {
  writer: '초안 작성',
  reviewer: '판정 압박',
  optimizer: '수정 반영',
  ready: '승인 직전',
} as const

const statusBadgeCopy: Record<GenerationStatus, string> = {
  initial: '대기 중',
  loading: '건틀릿 재생 중',
  populated: '루프 점검 중',
  'review-complete': '리뷰 압박 완료',
  'export-ready': '승인 잠금 해제',
  error: '복구 필요',
}

const verdictCopy = {
  PASS: '통과',
  PARTIAL: '보류',
  FAIL: '실패',
} as const

const englishStageLabels: Record<WorkflowStage['id'], string> = {
  research: 'Research results',
  outline: 'Outline',
  drafts: 'Section drafts',
  review: 'Review notes',
  final: 'Final post',
}

const screenMeta = {
  brief: {
    label: '브리프 잠금',
    caption: '입력 계약',
    note: '주제와 기준을 잠가 가혹한 루프를 시작합니다.',
  },
  gate: {
    label: '활성 게이트',
    caption: '압박 관제',
    note: '현재 게이트와 다음 행동만 전면에 남깁니다.',
  },
  reader: {
    label: '집중 읽기',
    caption: '산출물 검토',
    note: '연구, 개요, 초안, 리뷰를 한 번에 하나씩 읽습니다.',
  },
  release: {
    label: '출고 승인',
    caption: '릴리스 씰',
    note: '마지막 승인안과 복사 준비만 남깁니다.',
  },
} as const

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[1].title,
  audience: 'advanced',
  tone: 'opinionated',
  length: 'long',
}

const initialState: AppState = {
  inputs: initialInputs,
  status: 'initial',
  statusMessage: '건틀릿이 대기 중입니다. 브리프를 잠근 뒤 생성 버튼으로 10회 평가 루프를 시작하세요.',
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
        statusMessage: '프리셋을 불러왔습니다. 다음 실행에서 같은 가혹도를 다시 재생합니다.',
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
        statusMessage: '작성자, 리뷰어, 수정자, 검증 사이클이 차례대로 게이트를 밀어 올리고 있습니다.',
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
        statusMessage: action.message,
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

function stageStateLabel(state: ReturnType<typeof stageState>) {
  if (state === 'active') return '현재 게이트'
  if (state === 'complete') return '통과'
  return '대기'
}

function formatCounts(record: IterationRecord | null) {
  if (!record) return '대기 중'
  return `통과 ${record.passCount} · 보류 ${record.partialCount} · 실패 ${record.failCount}`
}

function statusForIteration(iteration: number, total: number): GenerationStatus {
  if (iteration < total) return 'populated'
  return 'review-complete'
}

function statusMessageForIteration(record: IterationRecord, total: number) {
  if (record.iteration === 1) {
    return `${record.iteration}차는 의도적으로 거칠게 시작합니다. 통과 ${record.passCount}, 보류 ${record.partialCount}, 실패 ${record.failCount} 상태에서 첫 수정을 받습니다.`
  }
  if (record.iteration < total) {
    return `${record.iteration}차 루프가 기준을 더 끌어올렸습니다. 통과 ${record.passCount}, 보류 ${record.partialCount}, 실패 ${record.failCount}를 기록했습니다.`
  }
  return `${record.iteration}차 루프가 모든 리뷰 게이트를 통과해 승인 후보를 넘깁니다.`
}

function screenStyle(delayIndex: number): CSSProperties {
  return { animationDelay: `${delayIndex * 50}ms` }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const runTokenRef = useRef(0)
  const readerTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeSurface, setActiveSurface] = useState<ReaderSurface>('research')
  const [activeScreen, setActiveScreen] = useState<ScreenId>('brief')

  useEffect(() => {
    return () => {
      runTokenRef.current += 1
    }
  }, [])

  const visibleIterations = state.outputs?.iterations.slice(0, state.revealedIterations) ?? []
  const latestVisibleIteration = visibleIterations.at(-1) ?? null
  const selectedIteration =
    visibleIterations.find((record) => record.iteration === state.selectedIteration) ??
    latestVisibleIteration
  const finalArticle =
    state.outputs && state.revealedIterations >= requiredLoops ? state.outputs.final_article : null
  const releasePreview = finalArticle ? finalArticle.markdown.split('\n').slice(0, 8).join('\n') : ''
  const repairRows = selectedIteration?.verdictRows.filter((row) => row.verdict !== 'PASS') ?? []
  const visibleVerificationCycles =
    state.outputs?.verification_cycles.slice(
      0,
      Math.min(state.revealedIterations + 2, state.outputs.verification_cycles.length),
    ) ?? []
  const remainingLoops = Math.max(requiredLoops - state.revealedIterations, 0)
  const remainingVerificationCycles = Math.max(requiredLoops - visibleVerificationCycles.length, 0)
  const hasLoopOutputs = Boolean(state.outputs)
  const stageCards = workflowStages.map((stage, index) => ({
    ...stage,
    stateClass: stageState(index, state.status, state.revealedIterations),
  }))
  const screens = (Object.keys(screenMeta) as ScreenId[]).map((screen) => ({
    id: screen,
    ...screenMeta[screen],
    isLocked:
      screen === 'gate'
        ? state.status === 'initial' && !state.outputs
        : screen === 'reader'
          ? !hasLoopOutputs
          : screen === 'release'
            ? !finalArticle
            : false,
  }))

  const loopStatus =
    state.status === 'initial'
      ? '첫 초안이 아직 시작되지 않았습니다.'
      : state.status === 'loading'
        ? '작성자, 리뷰어, 수정자, 검증 사이클이 순서대로 건틀릿을 다시 재생하는 중입니다.'
        : state.status === 'error'
          ? '강제 실패 토픽 때문에 리뷰 전에 루프가 멈췄습니다.'
          : state.status === 'export-ready'
            ? `건틀릿이 끝났습니다. ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과했습니다.`
            : `${selectedIteration?.iteration ?? 0}차 루프가 현재 화면에 열려 있습니다.`

  const currentGateTitle =
    state.status === 'initial'
      ? '브리프 확인'
      : state.status === 'loading' && state.revealedIterations === 0
        ? '초안 작성'
        : state.status === 'loading'
          ? `${Math.min(state.revealedIterations + 1, requiredLoops)}차 리뷰 게이트`
          : state.status === 'error'
            ? '복구 게이트'
            : state.status === 'export-ready'
              ? '승인 후보'
              : `${state.revealedIterations}차 루프 점검`

  const nextActionTitle =
    state.status === 'initial'
      ? '첫 초안 시작'
      : state.status === 'loading'
        ? '건틀릿 재생 대기'
        : state.status === 'error'
          ? '브리프 수정 후 재실행'
          : state.status === 'export-ready'
            ? '원고 복사 또는 출고 점검'
            : `${selectedIteration?.iteration ?? state.revealedIterations}차 루프 읽기`

  const nextActionBody =
    state.status === 'initial'
      ? '첫 행동은 하나면 충분합니다. 브리프를 다듬고 바로 건틀릿을 시작하세요.'
      : state.status === 'loading'
        ? '가혹한 루프가 아직 재생되는 중이므로, 지금은 현재 게이트와 다음 행동만 추적합니다.'
        : state.status === 'error'
          ? '토픽에서 강제 실패 접두어를 지우고 다시 생성해 제품 흐름을 복구하세요.'
          : state.status === 'export-ready'
            ? '승인 게이트가 열렸으므로, 이제 화면의 중심을 수정 작업에서 출고 점검으로 옮길 수 있습니다.'
            : '선택된 루프 스냅샷에서 막히는 항목과 방금 반영된 수정을 함께 읽으세요.'

  const exportLockTitle =
    finalArticle || state.status === 'export-ready'
      ? '내보내기 해제'
      : `${remainingLoops}회 루프 + ${remainingVerificationCycles}회 검증 남음`

  const exportLockBody =
    finalArticle || state.status === 'export-ready'
      ? `${requiredLoops}차 루프가 ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과해 복사 잠금을 풀었습니다.`
      : '계약 안정성을 위해 복사 액션은 미리 보이되, 열 번째 루프와 반복 검증이 끝날 때까지 실제 출고는 잠가 둡니다.'

  const readerTabs = [
    {
      id: 'research',
      label: '연구 결과',
      note: '근거와 핵심 논점이 얼마나 압축됐는지 읽습니다.',
    },
    {
      id: 'outline',
      label: '개요',
      note: '글 구조가 어떤 순서로 잠기는지 빠르게 확인합니다.',
    },
    {
      id: 'drafts',
      label: '섹션 초안',
      note: '문단 톤, 전환, 결론 리듬을 한 장에서 점검합니다.',
    },
    {
      id: 'review',
      label: '리뷰 메모',
      note: '아직 출고를 막는 판정과 수정 압박만 남겨 둡니다.',
    },
  ] as const

  const activeReaderTab = readerTabs.find((tab) => tab.id === activeSurface) ?? readerTabs[0]

  const controlSignals = [
    {
      label: '독자 프레임',
      value: audienceCopy[state.inputs.audience],
      note: '얼마나 깊게 압박할지 정합니다.',
    },
    {
      label: '문장 온도',
      value: toneCopy[state.inputs.tone],
      note: '리뷰 기준의 공격성을 맞춥니다.',
    },
    {
      label: '분량 계약',
      value: lengthCopy[state.inputs.length],
      note: '초안 밀도와 수정 폭을 잠급니다.',
    },
    {
      label: '출고 기준',
      value: `${requiredLoops}회 루프`,
      note: `${requiredLoops}회 검증 뒤에만 복사를 엽니다.`,
    },
  ] as const

  const reviewSignals = [
    {
      label: '선택 루프',
      value: selectedIteration ? `${selectedIteration.iteration}차` : '생성 전',
      note: selectedIteration ? selectedIteration.startedAt : '아직 노출된 반복이 없습니다.',
    },
    {
      label: '현재 위상',
      value: selectedIteration ? phaseCopy[selectedIteration.phase] : '초안 대기',
      note: selectedIteration ? selectedIteration.buildStatus : '첫 초안을 시작하면 위상이 열립니다.',
    },
    {
      label: '열린 수정',
      value: repairRows.length > 0 ? `${repairRows.length}건` : '없음',
      note:
        repairRows.length > 0
          ? '출고를 막는 항목만 남겨 두었습니다.'
          : '현재 선택 루프에는 추가 수정 압박이 없습니다.',
    },
  ] as const

  const gatePressureCards = [
    {
      label: '열린 루프',
      value: `${state.revealedIterations}/${requiredLoops}`,
      note:
        state.status === 'initial'
          ? '첫 초안 전'
          : state.status === 'export-ready'
            ? '전체 루프 노출'
            : '현재 화면 기준',
    },
    {
      label: '열린 검증',
      value: `${visibleVerificationCycles.length}/${requiredLoops}`,
      note:
        remainingVerificationCycles === 0
          ? '반복 감사 완료'
          : `${remainingVerificationCycles}회 검증 남음`,
    },
    {
      label: '직전 판정',
      value: state.outputs ? `${state.outputs.loop_summary.lastIterationPassCount}/9` : '대기',
      note: state.outputs ? '마지막 루프 기준' : '첫 루프 대기',
    },
  ] as const

  const statusHookText =
    state.status === 'export-ready'
      ? 'export-ready'
      : state.status === 'review-complete'
        ? 'review-complete'
        : state.status === 'loading'
          ? 'loading'
          : state.status

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({ type: 'update_field', field, value })
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({ type: 'apply_preset', preset: { topic: title, audience, tone, length } })
  }

  function focusReaderTab(index: number) {
    const nextIndex = (index + readerTabs.length) % readerTabs.length
    const nextTab = readerTabs[nextIndex]
    setActiveSurface(nextTab.id)
    window.requestAnimationFrame(() => {
      readerTabRefs.current[nextIndex]?.focus()
    })
  }

  function handleReaderTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusReaderTab(index + 1)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusReaderTab(index - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusReaderTab(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusReaderTab(readerTabs.length - 1)
    }
  }

  async function handleGenerate() {
    const topic = state.inputs.topic.trim()
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken

    if (topic.length < 6) {
      setActiveScreen('brief')
      dispatch({
        type: 'generation_error',
        message: '주제는 최소 6자 이상이어야 작성자가 건틀릿을 시작할 충분한 단서를 얻을 수 있습니다.',
      })
      return
    }

    if (isForcedErrorTopic(topic)) {
      setActiveScreen('brief')
      dispatch({
        type: 'generation_error',
        message: '리뷰어가 이 주제를 분류 단계에서 차단했습니다. 강제 실패 표식을 지운 뒤 다시 실행하세요.',
      })
      return
    }

    setActiveSurface('research')
    setActiveScreen('gate')

    const outputs = generatePipelineOutputs(state.inputs)
    dispatch({ type: 'start_generation', outputs })

    for (const record of outputs.iterations) {
      await sleep(record.iteration === 1 ? 320 : 160)
      if (runTokenRef.current !== runToken) return

      dispatch({
        type: 'reveal_iteration',
        count: record.iteration,
        selectedIteration: record.iteration,
        status: statusForIteration(record.iteration, outputs.iterations.length),
        statusMessage: statusMessageForIteration(record, outputs.iterations.length),
      })
    }

    await sleep(220)
    if (runTokenRef.current !== runToken) return

    dispatch({
      type: 'finish_generation',
      statusMessage: `${requiredLoops}차 루프가 ${outputs.loop_summary.verificationCycles}회 검증 뒤에 ${outputs.loop_summary.lastIterationPassCount}/9 게이트를 통과했습니다. 승인 후보가 열렸습니다.`,
    })
    setActiveScreen('release')
  }

  async function handleCopyMarkdown() {
    if (!finalArticle || state.status !== 'export-ready') {
      dispatch({
        type: 'set_copy_feedback',
        feedback: `${requiredLoops}차 루프가 끝나고 승인 후보가 열려야 복사를 풀 수 있습니다.`,
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalArticle.markdown)
      dispatch({
        type: 'set_copy_feedback',
        feedback: `최종 마크다운을 복사했습니다. 현재 출고는 ${requiredLoops}차 승인 후보에 고정돼 있습니다.`,
      })
    } catch {
      dispatch({
        type: 'set_copy_feedback',
        feedback: '이 브라우저에서는 클립보드 복사가 실패했습니다. 대신 승인 패널에서 원문을 바로 확인할 수 있습니다.',
      })
    }
  }

  function navigateScreen(screen: ScreenId) {
    if (screen === 'gate' && !state.outputs) return
    if (screen === 'reader' && !hasLoopOutputs) return
    if (screen === 'release' && !finalArticle) return
    setActiveScreen(screen)
  }

  const screenPrimary =
    activeScreen === 'gate'
      ? {
          label: '현재 루프 읽기',
          onClick: () => setActiveScreen('reader'),
        }
      : activeScreen === 'reader'
        ? {
            label: finalArticle ? '승인안 점검' : '출고 잠금 확인',
            onClick: () => setActiveScreen('release'),
          }
        : null

  const isGeneratePrimary = activeScreen === 'brief'
  const isCopyPrimary = activeScreen === 'release'

  const utilityGenerateClass = `utility-button ${isGeneratePrimary ? 'is-primary' : 'is-utility'}`
  const utilityCopyClass = `utility-button ${isCopyPrimary ? 'is-primary' : 'is-utility'}`

  return (
    <main className="gauntlet-shell">
      <aside className="gate-spine" aria-label="품질 건틀릿 진행 상황">
        <div className="spine-frame">
          <div className="spine-head">
            <p className="eyebrow">품질 관제실</p>
            <h1>출고를 봉인하는 게이트 스파인</h1>
            <p className="spine-lead">
              기본 화면은 지금 중요한 행동만 남기고, 검증 증거는 뒤쪽 레이어로 밀어 둡니다.
            </p>
          </div>

          <div
            className={`status-banner is-${state.status}`}
            aria-live="polite"
            aria-label="현재 생성 상태"
            data-testid="generation-status"
          >
            <span className="sr-only">{statusHookText}</span>
            <strong>{statusBadgeCopy[state.status]}</strong>
            <p>{state.statusMessage}</p>
          </div>

          <nav className="screen-switcher" aria-label="화면 전환">
            {screens.map((screen, index) => {
              const disabled = screen.isLocked
              return (
                <button
                  key={screen.id}
                  type="button"
                  className={`screen-switch ${activeScreen === screen.id ? 'is-active' : ''} ${
                    disabled ? 'is-disabled' : ''
                  }`}
                  onClick={() => navigateScreen(screen.id)}
                  disabled={disabled}
                  style={screenStyle(index)}
                >
                  <span className="screen-switch-step">0{index + 1}</span>
                  <span className="screen-switch-copy">
                    <strong>{screen.label}</strong>
                    <small>{screen.caption}</small>
                  </span>
                </button>
              )
            })}
          </nav>

          <ol className="spine-notches" aria-label="10회 루프 진행">
            {Array.from({ length: requiredLoops }, (_, index) => {
              const iterationNumber = index + 1
              const isComplete = iterationNumber <= state.revealedIterations
              const isActive = !isComplete && iterationNumber === state.revealedIterations + 1
              return (
                <li
                  key={iterationNumber}
                  className={`spine-notch ${isComplete ? 'is-complete' : ''} ${
                    isActive && state.status !== 'export-ready' ? 'is-active' : ''
                  }`}
                  style={screenStyle(index)}
                >
                  <span className="spine-check" aria-hidden="true">
                    <svg viewBox="0 0 16 16" focusable="false">
                      <path d="M3 8.5 6.2 11.7 13 4.8" />
                    </svg>
                  </span>
                  <div className="spine-notch-copy">
                    <strong>{iterationNumber}차</strong>
                    <span>{isComplete ? '통과' : isActive ? '진행 중' : '대기'}</span>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="spine-summary">
            <article className="summary-card">
              <span>현재 게이트</span>
              <strong>{currentGateTitle}</strong>
              <small>{loopStatus}</small>
            </article>
            <article className="summary-card">
              <span>출고 잠금</span>
              <strong>{exportLockTitle}</strong>
              <small>{exportLockBody}</small>
            </article>
          </div>

          <div className="spine-seal" aria-hidden="true">
            <span className={`seal-core ${state.status === 'export-ready' ? 'is-armed' : ''}`} />
            <div>
              <strong>{state.status === 'export-ready' ? '릴리스 씰 잠금 해제' : '릴리스 씰 대기'}</strong>
              <span>{state.status === 'export-ready' ? '복사 가능' : `${remainingLoops}회 루프 남음`}</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="control-room">
        <header className="command-header">
          <div className="command-copy">
            <p className="eyebrow">{screenMeta[activeScreen].caption}</p>
            <h2>{screenMeta[activeScreen].label}</h2>
            <p>{screenMeta[activeScreen].note}</p>
          </div>
          <div className="utility-actions">
            <button
              type="button"
              className={utilityGenerateClass}
              aria-label="Generate post"
              data-testid="generate-post"
              onClick={handleGenerate}
              disabled={state.isGenerating}
            >
              {state.isGenerating ? '건틀릿 재생 중' : '원고 생성 시작'}
            </button>
            <button
              type="button"
              className={utilityCopyClass}
              aria-label="Copy markdown"
              data-testid="copy-markdown"
              onClick={handleCopyMarkdown}
            >
              {state.status === 'export-ready' ? '원고 복사' : '복사 잠금'}
            </button>
          </div>
        </header>

        <section className="journey-strip" aria-label="필수 단계">
          {stageCards.map((stage, index) => (
            <article
              key={stage.id}
              className={`journey-step is-${stage.stateClass}`}
              aria-label={englishStageLabels[stage.id]}
              data-testid={`stage-${stage.id}`}
              style={screenStyle(index)}
            >
              <p className="workflow-step">0{index + 1}</p>
              <div>
                <strong>{stage.label}</strong>
                <span>{stageStateLabel(stage.stateClass)}</span>
              </div>
            </article>
          ))}
        </section>

        <section
          key={`${activeScreen}-${state.status}-${state.revealedIterations}`}
          className={`screen-panel screen-panel-${activeScreen} ${
            state.status === 'error' ? 'is-error-state' : ''
          }`}
        >
          {activeScreen === 'brief' ? (
            <div className="screen-grid brief-grid">
              <article className="card brief-card stagger-item" style={screenStyle(0)}>
                <div className="section-head">
                  <p className="panel-label">브리프 잠금</p>
                  <h3>가혹한 루프를 버틸 입력 계약을 먼저 잠급니다</h3>
                  <p>
                    입력은 넓게 보이지만 느슨하면 안 됩니다. 독자 수준, 주장 강도, 분량 계약이 먼저
                    고정돼야 작성자와 리뷰어가 같은 기준으로 서로를 압박할 수 있습니다.
                  </p>
                </div>

                <form className="field-grid" onSubmit={(event) => event.preventDefault()}>
                  <label className={`field ${state.inputs.topic ? 'has-value' : ''}`}>
                    <span className="field-label">주제</span>
                    <textarea
                      id="topic"
                      name="topic"
                      aria-label="Topic"
                      rows={5}
                      value={state.inputs.topic}
                      disabled={state.isGenerating}
                      onChange={(event) => updateField('topic', event.target.value)}
                    />
                  </label>

                  <div className="field-row">
                    <label className="field has-value">
                      <span className="field-label">독자</span>
                      <select
                        id="audience"
                        name="audience"
                        aria-label="Audience"
                        value={state.inputs.audience}
                        disabled={state.isGenerating}
                        onChange={(event) => updateField('audience', event.target.value as Audience)}
                      >
                        <option value="beginner">입문자</option>
                        <option value="practitioner">실무자</option>
                        <option value="advanced">고급 독자</option>
                      </select>
                    </label>

                    <label className="field has-value">
                      <span className="field-label">톤</span>
                      <select
                        id="tone"
                        name="tone"
                        aria-label="Tone"
                        value={state.inputs.tone}
                        disabled={state.isGenerating}
                        onChange={(event) => updateField('tone', event.target.value as Tone)}
                      >
                        <option value="clear">명료하게</option>
                        <option value="pragmatic">실무적으로</option>
                        <option value="opinionated">단호하게</option>
                      </select>
                    </label>

                    <label className="field has-value">
                      <span className="field-label">분량</span>
                      <select
                        id="length"
                        name="length"
                        aria-label="Length"
                        value={state.inputs.length}
                        disabled={state.isGenerating}
                        onChange={(event) => updateField('length', event.target.value as Length)}
                      >
                        <option value="short">짧게</option>
                        <option value="medium">균형 있게</option>
                        <option value="long">깊게</option>
                      </select>
                    </label>
                  </div>
                </form>

                {state.errorMessage ? (
                  <div className="error-panel" role="alert">
                    <strong>복구 게이트가 개입했습니다</strong>
                    <p>{state.errorMessage}</p>
                    <span>실패 표식을 지우고 다시 생성하면 바로 같은 흐름으로 복구됩니다.</span>
                  </div>
                ) : null}

                <details className="drawer preset-drawer">
                  <summary className="drawer-summary">
                    <div>
                      <p className="panel-label">빠른 시작 프리셋</p>
                      <h3>검증용 브리프 후보 열기</h3>
                      <p>프리셋은 보조 레이어로만 남겨 첫 화면의 압력을 흐리지 않게 합니다.</p>
                    </div>
                    <span className="drawer-badge">{topicPresets.length}개</span>
                  </summary>
                  <div className="drawer-body preset-grid">
                    {topicPresets.map((preset, index) => (
                      <button
                        key={preset.title}
                        type="button"
                        className="preset-chip"
                        onClick={() =>
                          applyPreset(preset.title, preset.audience, preset.tone, preset.length)
                        }
                        style={screenStyle(index)}
                      >
                        <strong>{preset.title}</strong>
                        <span>{preset.rationale}</span>
                      </button>
                    ))}
                  </div>
                </details>
              </article>

              <aside className="brief-side">
                <article className="card signal-card-stack stagger-item" style={screenStyle(1)}>
                  <div className="section-head compact">
                    <p className="panel-label">브리프 신호</p>
                    <h3>이번 실행에서 고정되는 압박 조건</h3>
                  </div>
                  <div className="signal-grid">
                    {controlSignals.map((signal, index) => (
                      <article key={signal.label} className="signal-card" style={screenStyle(index)}>
                        <span>{signal.label}</span>
                        <strong>{signal.value}</strong>
                        <p>{signal.note}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="card empty-state release-placeholder stagger-item" style={screenStyle(2)}>
                  <div className="empty-icon" aria-hidden="true">
                    <span />
                  </div>
                  <div>
                    <p className="panel-label">출고 승인 대기</p>
                    <h3>승인 원고는 아직 봉인돼 있습니다</h3>
                    <p>
                      열 번째 루프와 검증이 모두 끝나기 전에는 최종 본문과 복사가 잠겨 있습니다. 먼저
                      브리프를 잠그고 건틀릿을 시작하세요.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-action"
                    onClick={() => setActiveScreen('gate')}
                    disabled={!state.outputs}
                  >
                    활성 게이트 보기
                  </button>
                </article>
              </aside>
            </div>
          ) : null}

          {activeScreen === 'gate' ? (
            <div className="screen-grid gate-grid">
              <article className="card gate-hero stagger-item" style={screenStyle(0)}>
                <div className="section-head">
                  <p className="panel-label">현재 게이트</p>
                  <h3>{currentGateTitle}</h3>
                  <p>{loopStatus}</p>
                </div>

                <div className="pressure-grid">
                  {gatePressureCards.map((item, index) => (
                    <article key={item.label} className="pressure-card" style={screenStyle(index)}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>

                <div className="gate-wave" aria-hidden="true">
                  {stageCards.map((stage) => (
                    <span
                      key={stage.id}
                      className={`wave-bar is-${stage.stateClass}`}
                    />
                  ))}
                </div>

                {screenPrimary ? (
                  <button
                    type="button"
                    className="screen-primary"
                    onClick={screenPrimary.onClick}
                  >
                    {screenPrimary.label}
                  </button>
                ) : null}
              </article>

              <article className="card gate-briefing stagger-item" style={screenStyle(1)}>
                <div className="section-head compact">
                  <p className="panel-label">다음 행동</p>
                  <h3>{nextActionTitle}</h3>
                  <p>{nextActionBody}</p>
                </div>
                <div className="signal-grid">
                  {reviewSignals.map((signal, index) => (
                    <article key={signal.label} className="signal-card" style={screenStyle(index)}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <p>{signal.note}</p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="card gate-snapshot stagger-item" style={screenStyle(2)}>
                <div className="section-head compact">
                  <p className="panel-label">현재 스냅샷</p>
                  <h3>막히는 항목과 수정 반응을 좁게 유지합니다</h3>
                </div>
                {selectedIteration ? (
                  <>
                    <div className="iteration-meta">
                      <span className="meta-pill">시작 {selectedIteration.startedAt}</span>
                      <span className="meta-pill">{formatCounts(selectedIteration)}</span>
                      <span className="meta-pill">
                        추가 반복 {selectedIteration.needsAnotherLoop ? '필요' : '불필요'}
                      </span>
                    </div>
                    <ul className="repair-list">
                      {repairRows.length > 0 ? (
                        repairRows.slice(0, 3).map((row) => (
                          <li key={row.index}>
                            <strong>#{row.index}</strong>
                            <span>{row.note}</span>
                          </li>
                        ))
                      ) : (
                        <li>
                          <strong>완료</strong>
                          <span>현재 선택 루프에는 열린 수정 압박이 없습니다.</span>
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <div className="loading-stack" aria-hidden="true">
                    <span className="loading-line" />
                    <span className="loading-line" />
                    <span className="loading-line short" />
                  </div>
                )}
              </article>

              <details className="card drawer gate-drawer stagger-item" style={screenStyle(3)}>
                <summary className="drawer-summary">
                  <div>
                    <p className="panel-label">검증 요약</p>
                    <h3>반복 검증 펄스 열기</h3>
                    <p>비교, 평가, 검증 기록은 필요할 때만 깊게 펼칩니다.</p>
                  </div>
                  <span className="drawer-badge">{visibleVerificationCycles.length}개</span>
                </summary>
                <div className="drawer-body verification-grid">
                  {visibleVerificationCycles.length > 0 ? (
                    visibleVerificationCycles.map((cycle) => (
                      <article key={cycle.cycle} className="verification-card">
                        <p className="panel-label">{cycle.cycle}차 검증</p>
                        <h3>{cycle.label}</h3>
                        <p>{cycle.delta}</p>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state compact">
                      첫 초안이 열리면 비교 · 평가 · 검증 사이클이 차례대로 이곳에 쌓입니다.
                    </div>
                  )}
                </div>
              </details>
            </div>
          ) : null}

          {activeScreen === 'reader' ? (
            <div className="screen-grid reader-grid">
              <article className="card reader-rail stagger-item" style={screenStyle(0)}>
                <div className="section-head compact">
                  <p className="panel-label">루프 선택</p>
                  <h3>한 번에 한 루프만 붙잡습니다</h3>
                </div>
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
                        <p className="timeline-kicker">{iterationNumber}차 반복</p>
                        <strong>{record ? phaseCopy[record.phase] : '대기'}</strong>
                        <span>{formatCounts(record)}</span>
                      </button>
                    )
                  })}
                </div>
              </article>

              <article className="card reader-surface stagger-item" style={screenStyle(1)}>
                <div className="section-head">
                  <p className="panel-label">집중 읽기</p>
                  <h3>한 번에 하나의 산출물만 전면에 남깁니다</h3>
                  <p>연구, 구조, 초안, 리뷰를 한 장의 읽기 표면 안에서만 교체합니다.</p>
                </div>

                <div className="reader-tabs" role="tablist" aria-label="읽기 표면">
                  {readerTabs.map((tab, index) => (
                    <button
                      key={tab.id}
                      ref={(node) => {
                        readerTabRefs.current[index] = node
                      }}
                      id={`surface-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activeSurface === tab.id}
                      aria-label={tab.label}
                      aria-controls={`surface-panel-${tab.id}`}
                      tabIndex={activeSurface === tab.id ? 0 : -1}
                      className={`reader-tab ${activeSurface === tab.id ? 'is-active' : ''}`}
                      onClick={() => setActiveSurface(tab.id)}
                      onKeyDown={(event) => handleReaderTabKeyDown(event, index)}
                    >
                      <span className="reader-tab-copy">
                        <strong>{tab.label}</strong>
                        <small>{tab.note}</small>
                      </span>
                    </button>
                  ))}
                </div>

                <article
                  id={`surface-panel-${activeReaderTab.id}`}
                  className="surface-card"
                  role="tabpanel"
                  aria-labelledby={`surface-tab-${activeReaderTab.id}`}
                >
                  <div className="section-head compact">
                    <p className="panel-label">{activeReaderTab.label}</p>
                    <h3>{activeReaderTab.label}</h3>
                    <p>{activeReaderTab.note}</p>
                  </div>

                  {selectedIteration ? (
                    activeSurface === 'research' ? (
                      <ul className="content-list">
                        {selectedIteration.researchSummary.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : activeSurface === 'outline' ? (
                      <ol className="content-list ordered">
                        {selectedIteration.outline.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    ) : activeSurface === 'drafts' ? (
                      <div className="draft-stack">
                        {selectedIteration.sectionDrafts.map((draft) => (
                          <article key={draft.title} className="draft-card">
                            <h4>{draft.title}</h4>
                            <p>{draft.body}</p>
                            <strong>{draft.takeaway}</strong>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <ol className="content-list ordered">
                        {selectedIteration.reviewNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ol>
                    )
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon" aria-hidden="true">
                        <span />
                      </div>
                      <div>
                        <h4>첫 루프가 아직 열리지 않았습니다</h4>
                        <p>건틀릿을 시작하면 선택한 읽기 표면에 맞는 산출물만 순서대로 채워집니다.</p>
                      </div>
                    </div>
                  )}
                </article>
              </article>

              <aside className="reader-side">
                <article className="card stagger-item" style={screenStyle(2)}>
                  <div className="section-head compact">
                    <p className="panel-label">수정 메모</p>
                    <h3>출고를 막는 지점만 옆에 붙잡습니다</h3>
                  </div>
                  {selectedIteration ? (
                    <>
                      <ul className="content-list compact-list">
                        {selectedIteration.optimizerChanges.slice(0, 4).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      <details className="drawer detail-drawer">
                        <summary className="drawer-summary">
                          <div>
                            <p className="panel-label">전체 판정표</p>
                            <h3>9개 체크 열기</h3>
                          </div>
                          <span className="drawer-badge">상세</span>
                        </summary>
                        <div className="drawer-body">
                          <div className="review-table-wrap">
                            <table className="review-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>체크 항목</th>
                                  <th>판정</th>
                                  <th>리뷰 메모</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedIteration.verdictRows.map((row) => (
                                  <tr key={row.index}>
                                    <td>{row.index}</td>
                                    <td>{row.label}</td>
                                    <td>
                                      <span className={`verdict-badge is-${row.verdict.toLowerCase()}`}>
                                        {verdictCopy[row.verdict]}
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
                    <div className="loading-stack" aria-hidden="true">
                      <span className="loading-line" />
                      <span className="loading-line" />
                      <span className="loading-line short" />
                    </div>
                  )}

                  {screenPrimary ? (
                    <button type="button" className="screen-primary" onClick={screenPrimary.onClick}>
                      {screenPrimary.label}
                    </button>
                  ) : null}
                </article>
              </aside>
            </div>
          ) : null}

          {activeScreen === 'release' ? (
            <div className="screen-grid release-grid">
              <section
                className="card final-panel stagger-item"
                aria-label={englishStageLabels.final}
                data-testid="final-post-panel"
                style={screenStyle(0)}
              >
                <div className="section-head">
                  <p className="panel-label">출고 승인</p>
                  <h3>승인 직전 원고만 전면에 남깁니다</h3>
                  <p>긴 본문과 원문 마크다운은 모두 뒤쪽 서랍에 두고, 승인 후보의 핵심만 먼저 읽게 합니다.</p>
                </div>

                {finalArticle ? (
                  <>
                    <div className="release-spotlight">
                      <p className="release-kicker">{requiredLoops}차 승인안</p>
                      <h4>{finalArticle.title}</h4>
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

                    <div className="release-preview">
                      <p className="panel-label">승인안 미리보기</p>
                      <pre className="markdown-preview">{releasePreview}</pre>
                    </div>

                    <details className="drawer detail-drawer">
                      <summary className="drawer-summary">
                        <div>
                          <p className="panel-label">전체 본문</p>
                          <h3>승인된 본문 전체 보기</h3>
                          <p>긴 본문은 필요할 때만 펼쳐 읽습니다.</p>
                        </div>
                        <span className="drawer-badge">섹션 {finalArticle.mergedSections.length}개</span>
                      </summary>
                      <div className="drawer-body">
                        <div className="article-preview">
                          <p className="release-kicker">{requiredLoops}차 승인 후보</p>
                          <h4>{finalArticle.title}</h4>
                          <p className="article-intro">{finalArticle.intro}</p>
                          <div className="article-sections">
                            {finalArticle.mergedSections.map((section) => (
                              <article key={section.title} className="article-section">
                                <h5>{section.title}</h5>
                                <p>{section.body}</p>
                                <strong>{section.takeaway}</strong>
                              </article>
                            ))}
                          </div>
                          <p className="article-closing">{finalArticle.closing}</p>
                        </div>
                      </div>
                    </details>

                    <details className="drawer detail-drawer">
                      <summary className="drawer-summary">
                        <div>
                          <p className="panel-label">마크다운 원문</p>
                          <h3>복사용 원문 열기</h3>
                          <p>복사 실패나 포맷 점검이 필요할 때만 원문을 펼칩니다.</p>
                        </div>
                        <span className="drawer-badge">원문</span>
                      </summary>
                      <div className="drawer-body">
                        <pre className="markdown-export">{finalArticle.markdown}</pre>
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <span />
                    </div>
                    <div>
                      <h4>승인 원고가 아직 잠겨 있습니다</h4>
                      <p>열 번째 루프와 반복 검증이 끝날 때까지는 최종 본문과 복사가 열리지 않습니다.</p>
                    </div>
                    <button type="button" className="inline-action" onClick={() => setActiveScreen('gate')}>
                      활성 게이트 보기
                    </button>
                  </div>
                )}
              </section>

              <aside className="release-side">
                <details className="card drawer stagger-item" style={screenStyle(1)} open>
                  <summary className="drawer-summary">
                    <div>
                      <p className="panel-label">증거 팩</p>
                      <h3>검증과 산출물 묶음 열기</h3>
                    </div>
                    <span className="drawer-badge">{deliverables.length}개</span>
                  </summary>
                  <div className="drawer-body">
                    <div className="deliverable-grid">
                      {deliverables.map((item) => (
                        <article key={item.id} className="deliverable-card">
                          <h4>{item.title}</h4>
                          <p>{item.description}</p>
                        </article>
                      ))}
                    </div>
                    <ul className="content-list compact-list target-list">
                      {evaluationTargets.map((target) => (
                        <li key={target}>{target}</li>
                      ))}
                    </ul>
                  </div>
                </details>

                <details className="card drawer stagger-item" style={screenStyle(2)}>
                  <summary className="drawer-summary">
                    <div>
                      <p className="panel-label">반복 검증</p>
                      <h3>검증 사이클 열기</h3>
                    </div>
                    <span className="drawer-badge">{visibleVerificationCycles.length}개</span>
                  </summary>
                  <div className="drawer-body verification-grid">
                    {visibleVerificationCycles.map((cycle) => (
                      <article key={cycle.cycle} className="verification-card">
                        <p className="panel-label">{cycle.cycle}차 검증</p>
                        <h4>{cycle.label}</h4>
                        <p>{cycle.delta}</p>
                      </article>
                    ))}
                  </div>
                </details>
              </aside>
            </div>
          ) : null}
        </section>

        <div className="feedback-ribbon" role="status" aria-live="polite">
          {state.copyFeedback || '복사 결과와 잠금 안내는 이 리본에서 바로 알려 줍니다.'}
        </div>
      </section>
    </main>
  )
}

export default App
