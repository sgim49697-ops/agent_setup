import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStatus,
  IterationPhase,
  IterationRecord,
  Length,
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
  outputs: ReturnType<typeof generatePipelineOutputs> | null
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
  | { type: 'start_generation'; outputs: ReturnType<typeof generatePipelineOutputs> }
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
  advanced: '고급 사용자',
}

const toneCopy: Record<Tone, string> = {
  clear: '명료하게',
  pragmatic: '실무적으로',
  opinionated: '단호하게',
}

const lengthCopy: Record<Length, string> = {
  short: '짧게',
  medium: '균형 있게',
  long: '깊게',
}

const phaseCopy: Record<IterationPhase, string> = {
  writer: '초안 작성',
  reviewer: '리뷰 중',
  optimizer: '수정 적용',
  ready: '승인 완료',
}

const statusBadgeCopy: Record<GenerationStatus, string> = {
  initial: '시작 전',
  loading: '진행 중',
  populated: '검토 중',
  'review-complete': '검토 완료',
  'export-ready': '복사 가능',
  error: '복구 필요',
}

const verdictCopy = {
  PASS: '통과',
  PARTIAL: '보류',
  FAIL: '실패',
} as const

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialState: AppState = {
  inputs: initialInputs,
  status: 'initial',
  statusMessage: '초안 대기 중입니다. 브리프를 확인한 뒤 생성 버튼으로 첫 루프를 시작하세요.',
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
        statusMessage: '프리셋을 불러왔습니다. 다음 생성 실행에서 평가 루프가 이 브리프를 다시 재생합니다.',
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
        statusMessage: '초안 작성자가 거친 후보안을 만들고 있습니다. 리뷰어와 수정자가 곧 순차적으로 따라붙습니다.',
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
        statusMessage: `복구가 필요합니다. ${action.message}`,
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
    return '대기 중'
  }

  return `통과 ${record.passCount} · 보류 ${record.partialCount} · 실패 ${record.failCount}`
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [readerSurface, setReaderSurface] = useState<ReaderSurface>('research')
  const runTokenRef = useRef(0)
  const readerTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const iterationButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

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
  const heroLead = hasLoopStarted
    ? '지금은 기준 수정본 하나와 승인 게이트만 먼저 보이게 두고, 반복별 근거와 수정 이력은 아래 승인 리본으로 넘겼습니다.'
    : '브리프, 승인 루프, 복사 잠금만 먼저 보여 주는 편집 데스크입니다. 세 번째 승인본이 닫히기 전까지는 최종 원고가 열리지 않습니다.'
  const loopStatus =
    state.status === 'initial'
      ? '아직 첫 초안이 시작되지 않았습니다.'
      : state.status === 'loading'
        ? '작성자, 리뷰어, 수정자가 순서대로 루프를 재생하는 중입니다.'
        : state.status === 'error'
          ? '토픽 검수에서 멈췄습니다. 브리프를 손본 뒤 다시 생성해야 합니다.'
          : state.status === 'export-ready'
            ? `3차 반복이 완료되어 ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 게이트를 통과했습니다.`
            : `${selectedIteration?.iteration ?? 0}차 루프가 현재 화면에 열려 있습니다.`
  const currentGateTitle =
    state.status === 'initial'
      ? '브리프 확인'
      : state.status === 'loading' && state.revealedIterations === 0
        ? '1차 초안 작성 중'
        : state.status === 'loading'
          ? `${Math.min(state.revealedIterations + 1, 3)}차 검토 진행 중`
          : state.status === 'error'
            ? '브리프 수정 필요'
            : state.status === 'export-ready'
              ? '최종 원고 검토'
              : `${state.revealedIterations}차 수정 확인`
  const currentGateBody =
    state.status === 'initial'
      ? '첫 초안을 열기 전에 주제와 독자 방향을 맞추는 단계입니다.'
      : state.status === 'loading' && state.revealedIterations === 0
        ? '작성자가 1차 초안을 만들고 있어 아직 반복 기록이 열리지 않았습니다.'
        : state.status === 'loading'
          ? `${Math.min(state.revealedIterations + 1, 3)}차에서 남은 문제를 순서대로 정리하는 중입니다.`
          : state.status === 'error'
            ? '토픽 분류에서 멈췄습니다. 브리프를 고친 뒤 다시 시작해야 합니다.'
            : state.status === 'export-ready'
              ? '수정보다 최종 원고 흐름과 복사 시점 확인이 중심입니다.'
              : `${selectedIteration?.iteration ?? state.revealedIterations}차에서 막힘 항목과 수정 응답을 대조하는 중입니다.`
  const nextActionTitle =
    state.status === 'initial'
      ? '첫 루프 시작'
      : state.status === 'loading'
        ? '루프 재생 대기'
        : state.status === 'error'
          ? '토픽 수정 후 재실행'
          : state.status === 'export-ready'
            ? '원고 검토 또는 복사'
            : `${selectedIteration?.iteration ?? state.revealedIterations}차 내용 확인`
  const nextActionBody =
    state.status === 'initial'
      ? '브리프를 확인한 뒤 생성 버튼을 눌러 작성자-리뷰어-수정자 루프를 시작하세요.'
      : state.status === 'loading'
        ? '지금은 리뷰어와 수정자가 같은 브리프를 이어받아 수정을 쌓는 중입니다.'
      : state.status === 'error'
          ? '주제 앞의 강제 실패 접두어를 제거하고 다시 생성해 복구하세요.'
        : state.status === 'export-ready'
            ? '복사 경로가 열렸으니 최종 원고를 읽고 바로 복사하면 됩니다.'
            : '반복 기록에서 원하는 차수를 선택한 뒤, 수정 응답이 충분한지 확인하세요.'
  const remainingLoops = Math.max(3 - state.revealedIterations, 0)
  const exportLockTitle =
    finalArticle || state.status === 'export-ready'
      ? '지금 복사 가능'
      : `${remainingLoops}회 더 필요`
  const exportLockBody =
    finalArticle || state.status === 'export-ready'
      ? `3차 반복이 ${state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 기준을 통과해 복사 경로를 열었습니다.`
      : '세 번째 반복이 끝나기 전까지는 복사와 승인 원고 공개가 잠긴 상태로 유지됩니다.'
  const gateCards = [
    {
      id: 'current',
      label: '현재 상태',
      title: currentGateTitle,
      body: currentGateBody,
      note: loopStatus,
    },
    {
      id: 'action',
      label: '다음 할 일',
      title: nextActionTitle,
      body: nextActionBody,
      note: state.isGenerating
        ? '작성자, 리뷰어, 수정자가 같은 브리프를 이어받아 순차적으로 재생합니다.'
        : '브리프를 확인하고 첫 생성을 누르면 반복 기록이 열립니다.',
    },
    {
      id: 'export',
      label: '복사 잠금',
      title: exportLockTitle,
      body: exportLockBody,
      note:
        finalArticle || state.status === 'export-ready'
          ? '승인 요약과 마크다운 원문이 모두 열렸습니다.'
          : '세 번째 반복이 닫히기 전에는 승인 원고와 복사 경로가 잠깁니다.',
    },
  ] as const
  const readerTabs = [
    { id: 'research', label: '연구 결과' },
    { id: 'outline', label: '개요' },
    { id: 'drafts', label: '섹션 초안' },
    { id: 'review', label: '리뷰 메모' },
  ] as const
  const iterationSteps = [1, 2, 3] as const
  const heroSignals = [
    {
      label: '복사 가능 시점',
      value: exportLockTitle,
      note: finalArticle ? '3차 승인본에서만 복사가 열립니다.' : '승인 전에는 복사 경로가 잠겨 있습니다.',
    },
    {
      label: '현재 진행',
      value: selectedIteration ? `${selectedIteration.iteration}차 반복` : '첫 루프 대기',
      note: selectedIteration ? formatCounts(selectedIteration) : '브리프를 맞춘 뒤 첫 초안을 엽니다.',
    },
  ] as const
  const loopRailSteps = iterationSteps.map((iterationNumber) => {
    const record = visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
    const stateClass = !record
      ? 'queued'
      : selectedIteration?.iteration === iterationNumber
        ? 'selected'
        : state.status === 'export-ready' || iterationNumber < state.revealedIterations
          ? 'complete'
          : 'revealed'

    return {
      iterationNumber,
      stateClass,
      label:
        iterationNumber === 1
          ? '거친 초안'
          : iterationNumber === 2
            ? '리뷰 압축'
            : '승인 잠금',
      note: record ? formatCounts(record) : '이전 반복이 끝나면 열립니다.',
    }
  })
  const deliverableSurfaceCopy: Record<string, { eyebrow: string; scent: string }> = {
    'iteration-log': {
      eyebrow: '반복 로그 장부',
      scent: '작성 · 리뷰 · 수정 누적 기록',
    },
    manifest: {
      eyebrow: '실행 식별 묶음',
      scent: '런 ID · 시각 · 종료 상태',
    },
    scorecard: {
      eyebrow: '세부 채점 묶음',
      scent: 'UX · 접근성 · 프로세스 점수',
    },
    evaluation: {
      eyebrow: '통합 판정 리포트',
      scent: 'L1 · L2 · L3 최종 결과',
    },
  }
  const selectedLoopLabel = selectedIteration ? `기준 수정본 · ${selectedIteration.iteration}차` : '기준 수정본 대기'
  const selectedLoopTitle = selectedIteration
    ? repairRows.length > 0
      ? `${repairRows.length}개 막힘 항목이 아직 남아 있습니다.`
      : '승인 게이트를 막는 항목이 없습니다.'
    : '브리프를 맞춘 뒤 첫 반복을 열면 여기에서 기준 수정본이 고정됩니다.'
  const selectedLoopBody = selectedIteration
    ? `${selectedIteration.optimizerChanges.length}개 수정 응답과 ${formatCounts(selectedIteration)}를 한 묶음으로 먼저 읽도록 압축했습니다.`
    : '1차 초안, 2차 리뷰 압축, 3차 승인 완료 순서로 기준 수정본이 단계적으로 채워집니다.'

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

  function focusReaderTab(index: number) {
    const safeIndex = (index + readerTabs.length) % readerTabs.length
    const nextTab = readerTabs[safeIndex]
    setReaderSurface(nextTab.id)
    readerTabRefs.current[safeIndex]?.focus()
  }

  function activateIterationButton(index: number) {
    const nextIteration = iterationSteps[index]
    const hasRecord = visibleIterations.some((item) => item.iteration === nextIteration)

    if (!hasRecord) {
      return
    }

    dispatch({ type: 'select_iteration', iteration: nextIteration })
    iterationButtonRefs.current[index]?.focus()
  }

  function handleIterationSelectorKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabledIndexes = iterationSteps
      .map((iterationNumber, iterationIndex) => ({
        iterationIndex,
        hasRecord: visibleIterations.some((item) => item.iteration === iterationNumber),
      }))
      .filter((item) => item.hasRecord)
      .map((item) => item.iterationIndex)

    if (enabledIndexes.length === 0) {
      return
    }

    const currentEnabledIndex = Math.max(enabledIndexes.indexOf(index), 0)

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      const nextEnabled = enabledIndexes[(currentEnabledIndex + 1) % enabledIndexes.length]
      activateIterationButton(nextEnabled)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const nextEnabled =
        enabledIndexes[(currentEnabledIndex - 1 + enabledIndexes.length) % enabledIndexes.length]
      activateIterationButton(nextEnabled)
    } else if (event.key === 'Home') {
      event.preventDefault()
      activateIterationButton(enabledIndexes[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      activateIterationButton(enabledIndexes[enabledIndexes.length - 1])
    }
  }

  function handleReaderTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusReaderTab(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusReaderTab(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusReaderTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusReaderTab(readerTabs.length - 1)
    }
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
          '토픽 분류 단계에서 리뷰어가 이 브리프를 막았습니다. 강제 실패 접두어를 지우고 다시 실행하세요.',
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
      statusMessage:
        '1차 반복 기록 완료. 통과 0 · 보류 3 · 실패 6 상태로 초안 기준선을 다시 쓰는 중입니다.',
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
      statusMessage:
        '2차 반복에서 큰 막힘 항목을 대부분 회수했습니다. 지금은 통과 6 · 보류 3 상태입니다.',
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
      statusMessage: '3차 반복이 모든 리뷰 게이트를 닫았고, 승인 후보안을 최종 승인안으로 올렸습니다.',
    })

    await sleep(280)
    if (runTokenRef.current !== runToken) {
      return
    }
    dispatch({
      type: 'finish_generation',
      statusMessage: `승인 게이트 완료. 3차 반복이 ${outputs.loop_summary.lastIterationPassCount}/9 체크리스트를 통과했습니다.`,
    })
  }

  async function handleCopyMarkdown() {
    if (!finalArticle || state.status !== 'export-ready') {
      dispatch({
        type: 'set_copy_feedback',
        feedback: '아직 3차 반복이 끝나지 않아 복사를 열 수 없습니다. 승인 게이트가 닫힌 뒤에만 복사 버튼이 열립니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalArticle.markdown)
      dispatch({
        type: 'set_copy_feedback',
        feedback: '최종 마크다운을 복사했습니다. 현재 내보내기는 3차 승인안에만 고정됩니다.',
      })
    } catch {
      dispatch({
        type: 'set_copy_feedback',
        feedback: '브라우저 문맥에서 복사가 실패했습니다. 아래 승인 원고에서 마크다운 내용을 직접 확인할 수 있습니다.',
      })
    }
  }

  return (
    <main className="loop-shell">
      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-copy-block">
            <p className="eyebrow">현재 상태 요약</p>
            <h1>반복 수정 데스크</h1>
            <p className="hero-lead">{heroLead}</p>
            <div className="hero-loop-rail" aria-label="승인 루프 진행">
              {loopRailSteps.map((step) => (
                <article key={step.iterationNumber} className={`loop-rail-step is-${step.stateClass}`}>
                  <span className="loop-rail-index">{step.iterationNumber}차</span>
                  <div className="loop-rail-copy">
                    <strong>{step.label}</strong>
                    <span>{step.note}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="brief-pills hero-brief-pills" aria-label="현재 브리프 요약">
              <span className="meta-pill">독자 {audienceCopy[state.inputs.audience]}</span>
              <span className="meta-pill">톤 {toneCopy[state.inputs.tone]}</span>
              <span className="meta-pill">분량 {lengthCopy[state.inputs.length]}</span>
            </div>
            <div className="hero-actions">
              <button
                type="button"
                className="primary-button"
                aria-label="승인 루프 시작"
                data-testid="generate-post-button"
                onClick={handleGenerate}
                disabled={state.isGenerating}
              >
                {state.isGenerating ? '루프 재생 중...' : '승인 루프 시작'}
              </button>
              <button
                type="button"
                className="secondary-button"
                aria-label="승인 원고 복사"
                data-testid="copy-markdown-button"
                onClick={handleCopyMarkdown}
                disabled={state.status !== 'export-ready'}
              >
                승인 원고 복사
              </button>
            </div>
            <div className={`status-banner is-${state.status}`} aria-live="polite">
              <strong>{statusBadgeCopy[state.status]}</strong>
              <span>{state.statusMessage}</span>
            </div>
          </div>

          <div
            className={`hero-priority-grid ${hasLoopStarted ? 'is-live' : 'is-prelaunch'}`}
            aria-label={hasLoopStarted ? '승인 우선순위' : '승인 준비 신호'}
          >
            {hasLoopStarted
              ? (
                  <>
                    {gateCards.map((card) => (
                      <article key={card.id} className={`panel gate-card is-${card.id}`}>
                        <p className="panel-label">{card.label}</p>
                        <strong>{card.title}</strong>
                        <p>{card.body}</p>
                        <span className="gate-note">{card.note}</span>
                      </article>
                    ))}
                  </>
                )
              : heroSignals.map((signal) => (
                  <article key={signal.label} className="metric-chip hero-signal">
                    <span>{signal.label}</span>
                    <strong>{signal.value}</strong>
                    <small>{signal.note}</small>
                  </article>
                ))}
          </div>
        </article>

        <aside className="input-card editorial-rail">
          <div className="section-head">
            <p className="panel-label">브리프 입력</p>
            <h2>이번 글 브리프</h2>
            <p>첫 화면에서는 방향만 확인하고, 세부 조정은 접힌 입력 레이어 안에서만 엽니다.</p>
          </div>
          <details className="brief-drawer">
            <summary>
              <div>
                <p className="panel-label">현재 브리프</p>
                <h3>{state.inputs.topic}</h3>
              </div>
              <div className="brief-pills">
                <span className="meta-pill">독자 {audienceCopy[state.inputs.audience]}</span>
                <span className="meta-pill">톤 {toneCopy[state.inputs.tone]}</span>
                <span className="meta-pill">분량 {lengthCopy[state.inputs.length]}</span>
              </div>
            </summary>
            <form className="input-grid" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="topic">
                <span>주제</span>
                <textarea
                  id="topic"
                  name="topic"
                  data-testid="topic-field"
                  rows={4}
                  value={state.inputs.topic}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('topic', event.target.value)}
                />
              </label>
              <label htmlFor="audience">
                <span>독자 수준</span>
                <select
                  id="audience"
                  name="audience"
                  data-testid="audience-field"
                  value={state.inputs.audience}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('audience', event.target.value as Audience)}
                >
                  <option value="beginner">입문자</option>
                  <option value="practitioner">실무자</option>
                  <option value="advanced">고급 사용자</option>
                </select>
              </label>
              <label htmlFor="tone">
                <span>문체 톤</span>
                <select
                  id="tone"
                  name="tone"
                  data-testid="tone-field"
                  value={state.inputs.tone}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('tone', event.target.value as Tone)}
                >
                  <option value="clear">명료하게</option>
                  <option value="pragmatic">실무적으로</option>
                  <option value="opinionated">단호하게</option>
                </select>
              </label>
              <label htmlFor="length">
                <span>글 분량</span>
                <select
                  id="length"
                  name="length"
                  data-testid="length-field"
                  value={state.inputs.length}
                  disabled={state.isGenerating}
                  onChange={(event) => updateField('length', event.target.value as Length)}
                >
                  <option value="short">짧게</option>
                  <option value="medium">균형 있게</option>
                  <option value="long">깊게</option>
                </select>
              </label>
            </form>
          </details>
          <p className="copy-feedback">
            {state.copyFeedback ||
              (hasLoopStarted
                ? '세부 입력은 펼쳤을 때만 조정하고, 현재 상태와 복사 가능 시점은 상단 카드에서 확인합니다.'
                : '브리프를 확인한 뒤 첫 루프를 시작하세요.')}
          </p>
        </aside>
      </section>

      {hasLoopStarted ? (
        <>
          <section className="loop-stage">
            <article className="panel workbench-panel">
              <div className="section-head">
                <p className="panel-label">승인 루프 이력</p>
                <h2>반복 선택 기록</h2>
                <p>
                  카드 모음처럼 나열하지 않고, 지금 선택한 수정본 하나만 기준으로 막힘 항목과 수정
                  응답을 이어서 읽게 만들었습니다. 근거 표는 접힘 레이어에만 남깁니다.
                </p>
              </div>
              <article className="revision-snapshot">
                <div className="brief-pills">
                  <span className="meta-pill">{selectedLoopLabel}</span>
                  <span className="meta-pill">
                    {selectedIteration ? formatCounts(selectedIteration) : '첫 생성 후 열림'}
                  </span>
                </div>
                <h3>{selectedLoopTitle}</h3>
                <p>{selectedLoopBody}</p>
              </article>
              <p className="timeline-selector-note">
                열린 수정본만 선택되며, 키보드에서는 위아래 화살표와 Home, End로 기준 수정본을
                바로 바꿀 수 있습니다.
              </p>
              <div className="timeline-grid" role="group" aria-label="승인 루프 선택">
                {iterationSteps.map((iterationNumber, index) => {
                  const record =
                    visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
                  const isSelected = selectedIteration?.iteration === iterationNumber
                  const isRevealed = Boolean(record)

                  return (
                    <button
                      key={iterationNumber}
                      type="button"
                      id={`iteration-button-${iterationNumber}`}
                      ref={(node) => {
                        iterationButtonRefs.current[index] = node
                      }}
                      className={`timeline-card ${isSelected ? 'is-selected' : ''} ${
                        isRevealed ? 'is-revealed' : 'is-queued'
                      }`}
                      aria-pressed={isSelected}
                      aria-current={isSelected ? 'step' : undefined}
                      data-testid={`iteration-selector-${iterationNumber}`}
                      onKeyDown={(event) => handleIterationSelectorKeyDown(event, index)}
                      onClick={() =>
                        record && dispatch({ type: 'select_iteration', iteration: iterationNumber })
                      }
                      disabled={!record}
                    >
                      <div className="timeline-head">
                        <div className="timeline-title-block">
                          <p className="timeline-kicker">{iterationNumber}차 반복</p>
                          <strong>{record ? record.buildStatus : '리뷰 대기 중'}</strong>
                          <p className="timeline-summary-copy">
                            {record
                              ? iterationNumber === 1
                                ? '초안의 빈틈과 첫 실패 항목을 빠르게 수집하는 차수입니다.'
                                : iterationNumber === 2
                                  ? '막힘 항목을 줄이며 구조와 근거 밀도를 다시 조이는 차수입니다.'
                                  : '승인 조건을 잠그고 복사 시점을 여는 마지막 차수입니다.'
                              : '이전 반복이 끝나면 이 보드가 자동으로 열립니다.'}
                          </p>
                        </div>
                        {isSelected ? <span className="meta-pill current-loop-pill">기준 수정본</span> : null}
                      </div>
                      <div className="timeline-meta-row">
                        <p className="timeline-counts">{formatCounts(record)}</p>
                        <span className={`phase-pill is-${record?.phase ?? 'writer'}`}>
                          {record ? phaseCopy[record.phase] : '대기'}
                        </span>
                      </div>
                      <div className="phase-track" aria-hidden="true">
                        {['작성', '리뷰', '수정'].map((label, index) => {
                          const depth = !record ? 0 : iterationNumber === 1 ? 1 : iterationNumber === 2 ? 2 : 3
                          const stateClass =
                            depth === 0
                              ? 'is-waiting'
                              : index + 1 < depth
                                ? 'is-complete'
                                : index + 1 === depth
                                  ? 'is-active'
                                  : 'is-waiting'
                          return (
                            <span key={label} className={`phase-track-pill ${stateClass}`}>
                              {label}
                            </span>
                          )
                        })}
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedIteration ? (
                <div
                  className="inline-detail-bay"
                  role="region"
                  id={`iteration-panel-${selectedIteration.iteration}`}
                  aria-labelledby={`iteration-button-${selectedIteration.iteration}`}
                >
                  <div className="iteration-meta">
                    <span className="meta-pill">시작 시각 {selectedIteration.startedAt}</span>
                    <span className="meta-pill">{formatCounts(selectedIteration)}</span>
                    <span className="meta-pill">
                      다음 루프 필요 {selectedIteration.needsAnotherLoop ? '예' : '아니오'}
                    </span>
                  </div>

                  <div className="workbench-signal-grid">
                    <article className="subpanel review-signal-panel">
                      <p className="panel-label">리뷰어 신호</p>
                      <h3>{repairRows.length > 0 ? '아직 막고 있는 항목' : '승인 게이트 통과'}</h3>
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
                          3차 승인안에는 더 이상 열린 수리 항목이 없습니다. 지금은 내보내기 검토로
                          넘어갈 수 있습니다.
                        </div>
                      )}
                    </article>

                    <article className="subpanel optimizer-response-panel">
                      <p className="panel-label">수정자 응답</p>
                      <h3>이번 반복에 반영한 변경</h3>
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
                        <p className="panel-label">체크리스트 근거</p>
                        <h2>근거 표 열기</h2>
                        <p>
                          통과·보류·실패 매트릭스는 필요할 때만 펼쳐 보고, 기본 화면에서는
                          막힘 항목과 응답만 남겨 정보 밀도를 낮춥니다.
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
                </div>
              ) : (
                <div className="empty-state">
                  첫 초안을 생성하면 리뷰 신호와 수정 응답이 여기에 쌓입니다.
                </div>
              )}
            </article>

            <article className="panel reader-panel">
              <div className="section-head">
                <p className="panel-label">이 수정본의 원고</p>
                <h2>현재 원고 보기</h2>
                <p>
                  가운데 리본에서 고른 수정본 하나만 오른쪽 작업면에 고정해, 다음 수정 포인트를
                  놓치지 않게 붙잡아 둡니다.
                </p>
              </div>

              <div className="reader-tabs" role="tablist" aria-label="원고 표면 선택">
                {readerTabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    id={`reader-tab-${tab.id}`}
                    role="tab"
                    ref={(node) => {
                      readerTabRefs.current[index] = node
                    }}
                    className={`reader-tab ${readerSurface === tab.id ? 'is-active' : ''}`}
                    aria-selected={readerSurface === tab.id}
                    aria-controls={`reader-panel-${tab.id}`}
                    tabIndex={readerSurface === tab.id ? 0 : -1}
                    onKeyDown={(event) => handleReaderTabKeyDown(event, index)}
                    onClick={() => setReaderSurface(tab.id)}
                  >
                    <span className="reader-tab-copy">{tab.label}</span>
                  </button>
                ))}
              </div>

              {selectedIteration ? (
                <article
                  className="reader-card"
                  role="tabpanel"
                  id={`reader-panel-${readerSurface}`}
                  aria-labelledby={`reader-tab-${readerSurface}`}
                >
                  <div className="reader-heading">
                    <p className="reader-kicker">
                      {selectedIteration.iteration === 3
                        ? '승인 후보 원고'
                        : `${selectedIteration.iteration}차 작업 원고`}
                    </p>
                    <span className="hook-chip">
                      {readerTabs.find((tab) => tab.id === readerSurface)?.label}
                    </span>
                  </div>

                  {readerSurface === 'research' ? (
                    <>
                      <h3>연구 결과</h3>
                      <ul className="bullet-list">
                        {selectedIteration.researchSummary.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {readerSurface === 'outline' ? (
                    <>
                      <h3>개요</h3>
                      <ol className="outline-list">
                        {selectedIteration.outline.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}

                  {readerSurface === 'drafts' ? (
                    <>
                      <h3>섹션 초안</h3>
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
                      <h3>리뷰 메모</h3>
                      <ol className="review-notes">
                        {selectedIteration.reviewNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                </article>
              ) : (
                <div className="empty-state">첫 초안을 생성하면 현재 읽기 표면이 열립니다.</div>
              )}
            </article>

            <aside className="side-rail" aria-label="승인 루프 보조 레일">
              <details className="panel supporting-panel rail-panel">
                <summary>
                  <div>
                    <p className="panel-label">보조 정보</p>
                    <h2>되돌려 쓰는 브리프 묶음</h2>
                    <p>기준 수정본을 유지한 채 보조 레일에서만 다시 꺼내 봅니다.</p>
                  </div>
                  <span>4개 프리셋</span>
                </summary>
                <div className="preset-strip" aria-label="프리셋 브리프 목록">
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

              <details className="panel supporting-panel rail-panel">
                <summary>
                  <div>
                    <p className="panel-label">승인 루프 규칙</p>
                    <h2>승인에 도달하는 단계</h2>
                    <p>{workflowStages.map((stage) => stage.label).join(' · ')}</p>
                  </div>
                  <span>필수 5단계</span>
                </summary>
                <div className="workflow-strip" aria-label="필수 단계 계약">
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
            </aside>
          </section>

          <section className="final-layout">
            <article className="panel final-panel">
              <div className="section-head">
                <p className="panel-label">최종 원고</p>
                <div className="panel-heading">
                  <h2>출시 직전 승인본</h2>
                  <span className="hook-chip">최종 원고</span>
                </div>
                <p>
                  승인된 3차 루프만 내보내기를 엽니다. 상세 본문은 접힘 레이어로 뒤로 미뤄
                  첫 화면의 집중도를 지킵니다.
                </p>
              </div>

              {finalArticle ? (
                <>
                  <div className="final-summary-strip">
                    <div className="metric-chip">
                      <span>승인 루프</span>
                      <strong>3차 반복</strong>
                    </div>
                    <div className="metric-chip">
                      <span>리뷰 게이트</span>
                      <strong>{state.outputs?.loop_summary.lastIterationPassCount ?? 0}/9 통과</strong>
                    </div>
                    <div className="metric-chip">
                      <span>다음 행동</span>
                      <strong>원고 검토 후 복사</strong>
                    </div>
                  </div>

                  <div className="release-spotlight">
                    <p className="article-kicker">3차 승인 후보</p>
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
                        <p className="panel-label">전체 본문</p>
                        <h2>승인된 전체 미리보기</h2>
                        <p>모든 섹션과 클로징은 필요할 때만 펼쳐 확인합니다.</p>
                      </div>
                      <span>3개 섹션</span>
                    </summary>
                    <div className="detail-body">
                      <div className="article-preview">
                        <p className="article-kicker">승인 원고 미리보기</p>
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
                  <details className="panel detail-drawer export-drawer">
                    <summary>
                      <div>
                        <p className="panel-label">내보내기 원문</p>
                        <h2>복사용 마크다운 열기</h2>
                        <p>
                          기본 화면에서는 승인 요약과 복사 행동만 남기고, 실제 마크다운은 필요할
                          때만 펼쳐 확인합니다.
                        </p>
                      </div>
                      <span>마크다운</span>
                    </summary>
                    <div className="detail-body">
                      <pre className="markdown-export">{finalArticle.markdown}</pre>
                    </div>
                  </details>
                </>
              ) : (
                <div className="empty-state">최종 원고는 3차 루프가 끝나기 전까지 잠겨 있습니다.</div>
              )}
            </article>

            <details className="panel readiness-drawer">
              <summary>
                <div>
                  <p className="panel-label">최종 승인 뒤 참고 자료</p>
                  <h2>참고 자료 묶음</h2>
                  <p>
                    산출물과 점수는 승인 원고가 먼저 보인 뒤에만 열리도록 뒤쪽 보조 레이어에
                    격리합니다.
                  </p>
                </div>
                <span>{state.outputs ? '요약 준비됨' : '기본 접힘'}</span>
              </summary>
              <div className="deliverable-grid">
                {deliverables.map((item) => (
                  <article key={item.id} className="deliverable-card">
                    <div className="deliverable-meta-row">
                      <p className="deliverable-path" aria-label={`파일 경로 ${item.path}`}>
                        {deliverableSurfaceCopy[item.id]?.eyebrow ?? '참고 자료'}
                      </p>
                      <span className="meta-pill">
                        {deliverableSurfaceCopy[item.id]?.scent ?? '보조 자료'}
                      </span>
                    </div>
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
                <p className="readiness-label">루프 요약</p>
                {state.outputs ? (
                  <>
                    <strong>
                      마지막 루프에서 {state.outputs.loop_summary.lastIterationPassCount}/9 통과
                      게이트 확보
                    </strong>
                    <span>
                      최소 반복 충족 {state.outputs.loop_summary.minimumLoopsMet ? '예' : '아니오'} ·
                      내보내기 가능 {state.outputs.loop_summary.readyForExport ? '예' : '아니오'}
                    </span>
                  </>
                ) : (
                  <div className="empty-state compact">
                    루프를 한 번이라도 실행하면 승인 요약과 근거 체크리스트가 열립니다.
                  </div>
                )}
              </div>
            </details>
          </section>

        </>
      ) : null}

      {state.errorMessage ? (
        <section className="error-panel" role="alert">
          <strong>루프가 차단되었습니다.</strong>
          <p>{state.errorMessage}</p>
          <span>정상적인 토픽 제목으로 바꾼 뒤 다시 생성하면 복구할 수 있습니다.</span>
        </section>
      ) : null}
    </main>
  )
}

export default App
