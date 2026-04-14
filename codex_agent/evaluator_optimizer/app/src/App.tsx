import { startTransition, useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
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
type StageSurface = 'brief' | 'loop' | 'release'

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
  const [activeSurface, setActiveSurface] = useState<StageSurface>('brief')
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward')
  const runTokenRef = useRef(0)
  const readerTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const iterationButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const surfaceIndex = { brief: 0, loop: 1, release: 2 } as const

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
  const releaseReady = Boolean(finalArticle) && state.status === 'export-ready'
  const repairRows = selectedIteration?.verdictRows.filter((row) => row.verdict !== 'PASS') ?? []
  const remainingLoops = Math.max(3 - state.revealedIterations, 0)
  const stageProgress =
    activeSurface === 'brief'
      ? 18
      : activeSurface === 'loop'
        ? releaseReady
          ? 74
          : state.isGenerating
            ? 56
            : 44
        : 100

  const heroLead = hasLoopStarted
    ? '반복 수정 이력을 세 장면으로 나눠, 지금 해야 할 일과 잠겨 있는 결과가 한눈에 구분되도록 다시 설계했습니다.'
    : '입력, 루프 재생, 최종 승인본을 한 장면씩 여는 승인실 구조입니다. 첫 접힘에서 모든 증거를 쏟아내지 않고, 다음 행동만 먼저 띄웁니다.'
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
            ? '승인 화면으로 이동'
            : `${selectedIteration?.iteration ?? state.revealedIterations}차 내용 확인`
  const nextActionBody =
    state.status === 'initial'
      ? '브리프를 확인한 뒤 생성 버튼을 눌러 작성자-리뷰어-수정자 루프를 시작하세요.'
      : state.status === 'loading'
        ? '지금은 리뷰어와 수정자가 같은 브리프를 이어받아 수정을 쌓는 중입니다.'
        : state.status === 'error'
          ? '주제 앞의 강제 실패 접두어를 제거하고 다시 생성해 복구하세요.'
          : state.status === 'export-ready'
            ? '모든 루프가 닫혔습니다. 승인 화면에서 최종 원고와 복사 경로를 검토하세요.'
            : '반복 기록에서 원하는 차수를 선택한 뒤, 수정 응답이 충분한지 확인하세요.'
  const exportLockTitle = releaseReady ? '지금 복사 가능' : `${remainingLoops}회 더 필요`
  const exportLockBody = releaseReady
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
        : '각 화면마다 하나의 주행 버튼만 남겨 다음 행동을 분명히 했습니다.',
    },
    {
      id: 'export',
      label: '복사 잠금',
      title: exportLockTitle,
      body: exportLockBody,
      note: releaseReady
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
  const loopRailSteps = iterationSteps.map((iterationNumber) => {
    const record = visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
    const stateClass = !record
      ? 'queued'
      : selectedIteration?.iteration === iterationNumber
        ? 'selected'
        : releaseReady || iterationNumber < state.revealedIterations
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
  const stageButtons = [
    {
      id: 'brief',
      label: '브리프 화면',
      detail: '입력과 복구',
      available: true,
    },
    {
      id: 'loop',
      label: '수정 루프',
      detail: '반복 재생',
      available: hasLoopStarted,
    },
    {
      id: 'release',
      label: '승인 결과',
      detail: '원고와 복사',
      available: releaseReady,
    },
  ] as const
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
  const selectedLoopLabel = selectedIteration
    ? `기준 수정본 · ${selectedIteration.iteration}차`
    : '기준 수정본 대기'
  const selectedLoopTitle = selectedIteration
    ? repairRows.length > 0
      ? `${repairRows.length}개 막힘 항목이 아직 남아 있습니다.`
      : '승인 게이트를 막는 항목이 없습니다.'
    : '브리프를 맞춘 뒤 첫 반복을 열면 여기에서 기준 수정본이 고정됩니다.'
  const selectedLoopBody = selectedIteration
    ? `${selectedIteration.optimizerChanges.length}개 수정 응답과 ${formatCounts(selectedIteration)}를 한 묶음으로 먼저 읽도록 압축했습니다.`
    : '1차 초안, 2차 리뷰 압축, 3차 승인 완료 순서로 기준 수정본이 단계적으로 채워집니다.'
  const releaseSignalCards = [
    {
      label: '승인 루프',
      value: finalArticle ? '3차 반복' : '잠금 중',
      note: finalArticle ? '최소 반복 조건을 채운 승인본만 공개됩니다.' : '아직 결과가 잠겨 있습니다.',
    },
    {
      label: '리뷰 게이트',
      value: state.outputs ? `${state.outputs.loop_summary.lastIterationPassCount}/9 통과` : '대기 중',
      note: '마지막 반복에서 남은 항목이 없을 때만 복사 경로가 열립니다.',
    },
    {
      label: '복구 상태',
      value: state.status === 'error' ? '수정 필요' : '안정적',
      note: state.status === 'error' ? '브리프 수정 후 다시 시작하세요.' : '오류 없이 다음 화면으로 이동할 수 있습니다.',
    },
  ] as const

  function goToSurface(nextSurface: StageSurface) {
    const isLocked =
      (nextSurface === 'loop' && !hasLoopStarted) || (nextSurface === 'release' && !releaseReady)

    if (isLocked) {
      dispatch({
        type: 'set_copy_feedback',
        feedback:
          nextSurface === 'loop'
            ? '수정 루프는 첫 생성 뒤에 열립니다. 먼저 브리프 화면에서 승인 루프를 시작하세요.'
            : '승인 결과는 세 번째 반복이 닫힌 뒤에 열립니다. 수정 루프 화면에서 반복을 끝내야 합니다.',
      })
      return
    }

    setTransitionDirection(surfaceIndex[nextSurface] > surfaceIndex[activeSurface] ? 'forward' : 'backward')
    startTransition(() => setActiveSurface(nextSurface))
  }

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
      goToSurface('brief')
      return
    }

    const outputs = generatePipelineOutputs(state.inputs)
    dispatch({ type: 'start_generation', outputs })
    goToSurface('loop')

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
    <main className={`vault-shell status-${state.status}`}>
      <div className="sr-only" role="status" aria-live="polite">
        {state.copyFeedback || state.statusMessage}
      </div>

      <header className="stage-shell panel-rise">
        <div className="stage-shell__copy">
          <p className="eyebrow">반복 수정 하네스</p>
          <h1>반복 수정 승인실</h1>
          <p>
            입력, 반복, 승인본을 한 장면씩 여는 3스크린 구조입니다. 첫 화면에서 모든 산출물을
            보여 주지 않고, 현재 단계와 다음 행동만 남깁니다.
          </p>
        </div>

        <div className="stage-shell__rail">
          <div className="stage-progress" aria-hidden="true">
            <span style={{ width: `${stageProgress}%` }} />
          </div>
          <nav className="stage-nav" aria-label="화면 단계">
            {stageButtons.map((stage) => {
              const isActive = activeSurface === stage.id
              const isComplete = surfaceIndex[stage.id] < surfaceIndex[activeSurface]
              const isLocked = !stage.available

              return (
                <button
                  key={stage.id}
                  type="button"
                  className={`stage-chip ${isActive ? 'is-active' : ''} ${
                    isComplete ? 'is-complete' : ''
                  } ${isLocked ? 'is-locked' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                  aria-disabled={isLocked}
                  onClick={() => goToSurface(stage.id)}
                >
                  <span className="stage-chip__icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" />
                      <path d="M6 10.2l2.5 2.6L14.5 7" />
                    </svg>
                  </span>
                  <span className="stage-chip__copy">
                    <strong>{stage.label}</strong>
                    <small>{stage.detail}</small>
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <section className="screen-viewport" data-direction={transitionDirection} aria-label="주요 화면 전환">
        <div className="screen-track">
          <section
            className={`screen-panel ${activeSurface === 'brief' ? 'is-active' : ''} is-${transitionDirection}`}
            hidden={activeSurface !== 'brief'}
          >
            <div className="screen-grid screen-grid--brief">
              <article className="glass-card brief-hero panel-rise">
                <p className="eyebrow">브리프 화면</p>
                <h2>루프를 시작하기 전에 방향을 한 번만 좁힙니다.</h2>
                <p className="hero-lead">{heroLead}</p>

                <div className={`status-banner is-${state.status}`}>
                  <strong>{statusBadgeCopy[state.status]}</strong>
                  <span>{state.statusMessage}</span>
                  <span className="sr-only">{`english-hook-${state.status}`}</span>
                </div>

                <div className="meta-row" aria-label="현재 브리프 요약">
                  <span className="meta-pill">독자 {audienceCopy[state.inputs.audience]}</span>
                  <span className="meta-pill">톤 {toneCopy[state.inputs.tone]}</span>
                  <span className="meta-pill">분량 {lengthCopy[state.inputs.length]}</span>
                </div>

                <div className="primary-action-row">
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
                  <p className="action-caption">
                    이 화면의 대표 버튼입니다. 누르면 1차 초안부터 3차 승인안까지 순차적으로
                    재생되며 다음 화면으로 이동합니다.
                  </p>
                </div>

                <div className="loop-rail" aria-label="반복 잠금 구조">
                  {loopRailSteps.map((step) => (
                    <article key={step.iterationNumber} className={`loop-rail-step is-${step.stateClass}`}>
                      <span className="loop-rail-step__badge">{step.iterationNumber}차</span>
                      <strong>{step.label}</strong>
                      <span>{step.note}</span>
                    </article>
                  ))}
                </div>

                <div className="signal-row">
                  <article className="signal-card">
                    <span>현재 상태</span>
                    <strong>{currentGateTitle}</strong>
                    <small>{loopStatus}</small>
                  </article>
                  <article className="signal-card">
                    <span>복사 잠금</span>
                    <strong>{exportLockTitle}</strong>
                    <small>{exportLockBody}</small>
                  </article>
                </div>

                {state.errorMessage ? (
                  <div className="error-panel is-visible" role="alert">
                    <strong>복구 안내</strong>
                    <p>{state.errorMessage}</p>
                    <span>토픽의 강제 실패 접두어를 지우고 다시 생성하면 같은 화면에서 바로 복구됩니다.</span>
                  </div>
                ) : null}
              </article>

              <article className="glass-card brief-form-card panel-rise">
                <div className="section-head">
                  <p className="panel-label">브리프 입력</p>
                  <h2>이번 글 브리프</h2>
                  <p>입력 필드는 고스트 언더라인 방식으로 정리해 편집 메모보다 내용 자체가 먼저 보이게 했습니다.</p>
                </div>

                <form className="brief-form" onSubmit={(event) => event.preventDefault()}>
                  <label htmlFor="topic" className="field-shell">
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

                  <div className="field-grid">
                    <label htmlFor="audience" className="field-shell">
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

                    <label htmlFor="tone" className="field-shell">
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

                    <label htmlFor="length" className="field-shell">
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
                  </div>
                </form>
              </article>

              <article className="glass-card preset-card panel-rise">
                <div className="section-head">
                  <p className="panel-label">프리셋 묶음</p>
                  <h2>바로 쓸 수 있는 브리프</h2>
                  <p>프리셋은 보조 조작으로만 남기고, 시각 계층은 언제나 메인 주행 버튼보다 아래에 둡니다.</p>
                </div>

                <div className="preset-grid" aria-label="프리셋 브리프 목록">
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
              </article>

              <article className="glass-card rubric-card panel-rise">
                <div className="section-head">
                  <p className="panel-label">실평가 우선순위</p>
                  <h2>이번 편집이 올려야 하는 기준</h2>
                  <p>접근성, 인터랙션, 사용자 플로우, 복구 가능성을 먼저 높이는 방향으로 화면을 설계했습니다.</p>
                </div>

                <div className="rubric-grid">
                  <article className="rubric-pill">
                    <span>접근성/반응형</span>
                    <strong>스크린 분리 + 키보드 흐름</strong>
                  </article>
                  <article className="rubric-pill">
                    <span>디자인/인터랙션</span>
                    <strong>톤 레이어 + 단계 전환</strong>
                  </article>
                  <article className="rubric-pill">
                    <span>사용자 플로우</span>
                    <strong>화면당 주행 버튼 1개</strong>
                  </article>
                  <article className="rubric-pill">
                    <span>복구 가능성</span>
                    <strong>오류 화면 내 즉시 재시도</strong>
                  </article>
                </div>
              </article>
            </div>
          </section>

          <section
            className={`screen-panel ${activeSurface === 'loop' ? 'is-active' : ''} is-${transitionDirection}`}
            hidden={activeSurface !== 'loop'}
          >
            <div className="screen-grid screen-grid--loop">
              <article className="glass-card loop-hero panel-rise">
                <div className="section-head">
                  <p className="panel-label">수정 루프 화면</p>
                  <h2>현재 반복 하나만 붙잡고 수정 근거를 읽습니다.</h2>
                  <p>전체 증거판을 펼치지 않고, 선택한 수정본과 그 응답만 먼저 보이게 설계했습니다.</p>
                </div>

                <div className="gate-grid">
                  {gateCards.map((card) => (
                    <article key={card.id} className={`gate-card is-${card.id}`}>
                      <p className="panel-label">{card.label}</p>
                      <strong>{card.title}</strong>
                      <p>{card.body}</p>
                      <span>{card.note}</span>
                    </article>
                  ))}
                </div>

                <div className="pulse-rail" aria-label="반복 진행 펄스">
                  {iterationSteps.map((iterationNumber) => {
                    const record =
                      visibleIterations.find((item) => item.iteration === iterationNumber) ?? null
                    const stateClass = !record
                      ? 'queued'
                      : iterationNumber === selectedIteration?.iteration
                        ? 'active'
                        : releaseReady || iterationNumber < state.revealedIterations
                          ? 'complete'
                          : 'revealed'

                    return (
                      <article key={iterationNumber} className={`pulse-node is-${stateClass}`}>
                        <span className="pulse-node__check" aria-hidden="true">
                          <svg viewBox="0 0 20 20">
                            <path d="M4.5 10.5 8.4 14l7.1-8.2" />
                          </svg>
                        </span>
                        <div className="pulse-node__copy">
                          <strong>{iterationNumber}차 반복</strong>
                          <span>{record ? formatCounts(record) : '곧 공개됩니다.'}</span>
                        </div>
                      </article>
                    )
                  })}
                </div>

                <div className="primary-action-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => goToSurface('release')}
                    disabled={!releaseReady}
                  >
                    {releaseReady ? '승인 화면으로 이동' : '승인 정리 중'}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => goToSurface('brief')}>
                    브리프로 돌아가기
                  </button>
                  <p className="action-caption">
                    이 화면의 대표 버튼은 승인본으로 넘어가는 것 하나뿐입니다. 결과는 세 번째 반복이
                    닫힐 때까지 잠긴 상태를 유지합니다.
                  </p>
                </div>
              </article>

              <article className="glass-card workbench-card panel-rise">
                <div className="section-head">
                  <p className="panel-label">반복 선택 기록</p>
                  <h2>기준 수정본</h2>
                  <p>{selectedLoopBody}</p>
                </div>

                <article className="snapshot-card">
                  <div className="meta-row">
                    <span className="meta-pill">{selectedLoopLabel}</span>
                    <span className="meta-pill">
                      {selectedIteration ? formatCounts(selectedIteration) : '첫 생성 후 열림'}
                    </span>
                  </div>
                  <h3>{selectedLoopTitle}</h3>
                  <p>{selectedLoopBody}</p>
                </article>

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
                          <div className="timeline-copy">
                            <p className="timeline-kicker">{iterationNumber}차 반복</p>
                            <strong>{record ? record.buildStatus : '리뷰 대기 중'}</strong>
                            <p>
                              {record
                                ? iterationNumber === 1
                                  ? '첫 실패 항목을 드러내는 거친 초안입니다.'
                                  : iterationNumber === 2
                                    ? '막힘 항목을 압축하며 구조를 다시 조이는 단계입니다.'
                                    : '승인 조건을 잠그고 복사 경로를 여는 마지막 단계입니다.'
                                : '아직 이 반복은 열리지 않았습니다.'}
                            </p>
                          </div>
                          {isSelected ? <span className="meta-pill current-loop-pill">지금 보고 있음</span> : null}
                        </div>

                        <div className="timeline-meta">
                          <span>{formatCounts(record)}</span>
                          <span className={`phase-pill is-${record?.phase ?? 'writer'}`}>
                            {record ? phaseCopy[record.phase] : '대기'}
                          </span>
                        </div>

                        <div className="phase-track" aria-hidden="true">
                          {['작성', '리뷰', '수정'].map((label, phaseIndex) => {
                            const depth = !record ? 0 : iterationNumber === 1 ? 1 : iterationNumber === 2 ? 2 : 3
                            const stateClass =
                              depth === 0
                                ? 'is-waiting'
                                : phaseIndex + 1 < depth
                                  ? 'is-complete'
                                  : phaseIndex + 1 === depth
                                    ? 'is-active'
                                    : 'is-waiting'

                            return (
                              <span key={label} className={`phase-track-pill ${stateClass}`}>
                                {label}
                              </span>
                            )
                          })}
                        </div>

                        {!record ? (
                          <div className="shimmer-stack" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>

                {selectedIteration ? (
                  <div
                    className="detail-bay"
                    role="region"
                    id={`iteration-panel-${selectedIteration.iteration}`}
                    aria-labelledby={`iteration-button-${selectedIteration.iteration}`}
                  >
                    <div className="meta-row">
                      <span className="meta-pill">시작 시각 {selectedIteration.startedAt}</span>
                      <span className="meta-pill">{formatCounts(selectedIteration)}</span>
                      <span className="meta-pill">
                        다음 루프 필요 {selectedIteration.needsAnotherLoop ? '예' : '아니오'}
                      </span>
                    </div>

                    <div className="detail-grid">
                      <article className="subpanel review-signal-panel">
                        <p className="panel-label">리뷰어 신호</p>
                        <h3>{repairRows.length > 0 ? '아직 막고 있는 항목' : '승인 게이트 통과'}</h3>
                        {repairRows.length > 0 ? (
                          <ul className="bullet-list compact">
                            {repairRows.map((row) => (
                              <li key={row.index}>
                                <strong>#{row.index}</strong>
                                <span>{row.note}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="empty-state compact">
                            <div className="empty-state__orb" aria-hidden="true" />
                            <p>3차 승인안에는 더 이상 열린 수리 항목이 없습니다.</p>
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

                    <details className="drawer-card">
                      <summary>
                        <div>
                          <p className="panel-label">체크리스트 근거</p>
                          <h3>근거 표 열기</h3>
                          <p>통과·보류·실패 매트릭스는 필요할 때만 펼칩니다.</p>
                        </div>
                        <span>{formatCounts(selectedIteration)}</span>
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
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state__orb" aria-hidden="true" />
                    <p>첫 초안을 생성하면 리뷰 신호와 수정 응답이 여기에 쌓입니다.</p>
                  </div>
                )}
              </article>

              <article className="glass-card reader-shell panel-rise">
                <div className="section-head">
                  <p className="panel-label">현재 원고 보기</p>
                  <h2>선택한 수정본의 읽기 면</h2>
                  <p>가운데에서 고른 수정본 하나만 오른쪽 작업면에 고정해, 다음 수정 포인트를 놓치지 않게 붙잡아 둡니다.</p>
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
                      <span>{tab.label}</span>
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
                      <span className="meta-pill">{readerTabs.find((tab) => tab.id === readerSurface)?.label}</span>
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
                        <ol className="outline-list">
                          {selectedIteration.reviewNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ol>
                      </>
                    ) : null}
                  </article>
                ) : (
                  <div className="empty-state compact">
                    <div className="empty-state__orb" aria-hidden="true" />
                    <p>첫 초안을 생성하면 현재 읽기 표면이 열립니다.</p>
                  </div>
                )}
              </article>

              <aside className="glass-card side-shell panel-rise">
                <div className="section-head">
                  <p className="panel-label">보조 레일</p>
                  <h2>계약과 참고</h2>
                  <p>필수 단계와 프리셋은 보조 레일로 분리해, 중앙 무대의 정보 밀도를 줄였습니다.</p>
                </div>

                <details className="drawer-card" open>
                  <summary>
                    <div>
                      <p className="panel-label">승인 루프 규칙</p>
                      <h3>필수 5단계</h3>
                      <p>{workflowStages.map((stage) => stage.label).join(' · ')}</p>
                    </div>
                    <span>단계 보기</span>
                  </summary>
                  <div className="drawer-body">
                    <div className="workflow-strip">
                      {workflowStages.map((stage, index) => {
                        const statusClass = stageState(index, state.status, state.revealedIterations)

                        return (
                          <article key={stage.id} className={`workflow-card is-${statusClass}`}>
                            <p className="workflow-step">0{index + 1}</p>
                            <h3>{stage.label}</h3>
                            <p>{stage.description}</p>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                </details>

                <details className="drawer-card">
                  <summary>
                    <div>
                      <p className="panel-label">프리셋 브리프</p>
                      <h3>되돌려 쓰는 브리프 묶음</h3>
                      <p>필요할 때만 펼쳐 브리프를 바꿉니다.</p>
                    </div>
                    <span>{topicPresets.length}개</span>
                  </summary>
                  <div className="drawer-body">
                    <div className="preset-grid">
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
                  </div>
                </details>
              </aside>
            </div>
          </section>

          <section
            className={`screen-panel ${activeSurface === 'release' ? 'is-active' : ''} is-${transitionDirection}`}
            hidden={activeSurface !== 'release'}
          >
            <div className="screen-grid screen-grid--release">
              <article className="glass-card release-hero panel-rise">
                <div className="section-head">
                  <p className="panel-label">승인 화면</p>
                  <h2>승인본만 여는 마지막 장면</h2>
                  <p>최종 화면은 승인 요약과 복사 경로에 집중합니다. 반복 근거와 참고 자료는 모두 뒤쪽 레이어에 남깁니다.</p>
                </div>

                <div className="signal-row">
                  {releaseSignalCards.map((signal) => (
                    <article key={signal.label} className="signal-card">
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <small>{signal.note}</small>
                    </article>
                  ))}
                </div>

                {finalArticle ? (
                  <div className="release-spotlight">
                    <p className="article-kicker">승인 후보</p>
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
                ) : (
                  <div className="empty-state">
                    <div className="empty-state__orb" aria-hidden="true" />
                    <p>아직 승인본이 잠겨 있습니다. 수정 루프 시어터에서 반복을 끝내야 이 금고가 열립니다.</p>
                  </div>
                )}

                <div className="primary-action-row">
                  <button
                    type="button"
                    className="primary-button"
                    aria-label="승인 원고 복사"
                    data-testid="copy-markdown-button"
                    onClick={handleCopyMarkdown}
                    disabled={!releaseReady}
                  >
                    승인 원고 복사
                  </button>
                  <button type="button" className="ghost-button" onClick={() => goToSurface('loop')}>
                    수정 화면으로 돌아가기
                  </button>
                  <p className="action-caption">
                    이 화면의 대표 버튼은 복사 하나뿐입니다. 복사는 승인된 3차 원고에만 연결됩니다.
                  </p>
                </div>

                {state.copyFeedback ? <p className="copy-feedback">{state.copyFeedback}</p> : null}
              </article>

              <article className="glass-card release-card panel-rise">
                <div className="section-head">
                  <p className="panel-label">출시 직전 승인본</p>
                  <h2>마지막으로 보는 핵심 요약</h2>
                  <p>첫 접힘에는 제목, 인트로, 핵심 섹션만 남기고 전체 본문은 별도 레이어로 미룹니다.</p>
                </div>

                {finalArticle ? (
                  <>
                    <div className="release-summary-strip">
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
                        <strong>검토 후 복사</strong>
                      </div>
                    </div>

                    <details className="drawer-card">
                      <summary>
                        <div>
                          <p className="panel-label">전체 본문</p>
                          <h3>승인된 전체 미리보기</h3>
                          <p>모든 섹션과 클로징은 필요할 때만 펼칩니다.</p>
                        </div>
                        <span>본문 열기</span>
                      </summary>
                      <div className="drawer-body">
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

                    <details className="drawer-card">
                      <summary>
                        <div>
                          <p className="panel-label">내보내기 원문</p>
                          <h3>복사용 마크다운 열기</h3>
                          <p>기본 화면에서는 승인 요약만 보이고, 실제 마크다운은 별도 레이어에 있습니다.</p>
                        </div>
                        <span>마크다운</span>
                      </summary>
                      <div className="drawer-body">
                        <pre className="markdown-export">{finalArticle.markdown}</pre>
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state__orb" aria-hidden="true" />
                    <p>루프가 끝나면 이 화면에 승인본이 자동으로 채워집니다.</p>
                  </div>
                )}
              </article>

              <aside className="glass-card release-side panel-rise">
                <div className="section-head">
                  <p className="panel-label">참고 자료 묶음</p>
                  <h2>보조 증거 레이어</h2>
                  <p>산출물과 점수는 승인 원고가 먼저 보인 뒤에만 뒤쪽 레이어에서 확인하게 합니다.</p>
                </div>

                <details className="drawer-card">
                  <summary>
                    <div>
                      <p className="panel-label">산출물 목록</p>
                      <h3>기록과 점수표</h3>
                      <p>최종 화면의 서브레이어입니다.</p>
                    </div>
                    <span>열기</span>
                  </summary>
                  <div className="drawer-body">
                    <div className="deliverable-grid">
                      {deliverables.map((item) => (
                        <article key={item.id} className="deliverable-card">
                          <div className="deliverable-meta-row">
                            <p className="deliverable-path">{deliverableSurfaceCopy[item.id]?.eyebrow ?? '참고 자료'}</p>
                            <span className="meta-pill">
                              {deliverableSurfaceCopy[item.id]?.scent ?? '보조 자료'}
                            </span>
                          </div>
                          <h3>{item.title}</h3>
                          <p>{item.description}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </details>

                <details className="drawer-card">
                  <summary>
                    <div>
                      <p className="panel-label">평가 목표</p>
                      <h3>마감 전 체크</h3>
                      <p>기능 검증 단계에서 다시 확인할 목록입니다.</p>
                    </div>
                    <span>{evaluationTargets.length}개</span>
                  </summary>
                  <div className="drawer-body">
                    <ul className="bullet-list">
                      {evaluationTargets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </details>
              </aside>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
