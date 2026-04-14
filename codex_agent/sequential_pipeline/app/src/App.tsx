import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationStageId,
  GenerationState,
  GenerationStatus,
  Length,
  PipelineOutputs,
  PipelineRole,
  Scorecard,
  Tone,
} from './contracts'
import {
  assembleFinalOutputs,
  runOutliner,
  runResearcher,
  runReviewer,
  runWriter,
} from './generator'
import { deliverables, pipelineRoles, reviewLenses, topicPresets } from './starterData'

type OutputKey = 'research_summary' | 'outline' | 'section_drafts' | 'review_notes'
type TrackerStatus = 'complete' | 'current' | 'pending'
type ScreenId = 'brief' | 'handoff' | 'publish'
type StageTone = 'complete' | 'current' | 'next' | 'pending' | 'error'

type AppState = {
  inputs: BlogGeneratorInputs
  generation: GenerationState
  copyFeedback: string
  selectedRole: PipelineRole
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
      type: 'set-output'
      role: PipelineRole
      stage: GenerationStageId
      nextRole: PipelineRole | null
      nextStage: GenerationStageId | null
      key: OutputKey
      value: PipelineOutputs[OutputKey]
      handoffs?: PipelineOutputs['handoffs']
      status: GenerationStatus
      message: string
      focusRole?: PipelineRole
    }
  | { type: 'finalize-run'; finalPost: string; message: string }
  | { type: 'set-copy-feedback'; message: string }
  | {
      type: 'set-error'
      role: PipelineRole
      stage: GenerationStageId
      message: string
    }
  | { type: 'select-role'; role: PipelineRole }

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentRole: null,
  currentStage: null,
  completedRoles: [],
  completedStages: [],
  outputs: {},
  statusMessage:
    '대기 | 브리프가 아직 잠기지 않았습니다. 글 생성 시작으로 자료 요약부터 열어 주세요.',
  errorMessage: null,
}

const roleStageMap: Record<PipelineRole, GenerationStageId> = {
  researcher: 'research',
  outliner: 'outline',
  writer: 'drafts',
  reviewer: 'review',
}

const stageHookLabels: Record<GenerationStageId, string> = {
  research: 'Research results',
  outline: 'Outline',
  drafts: 'Section drafts',
  review: 'Review notes',
  final: 'Final post',
}

const stageLabels: Record<GenerationStageId, string> = {
  research: '자료 요약',
  outline: '구조 설계',
  drafts: '섹션 초안',
  review: '검토 메모',
  final: '최종 원고',
}

const statusLabels: Record<GenerationStatus, string> = {
  initial: '대기',
  loading: '진행 중',
  populated: '초안 확보',
  'review-complete': '검토 완료',
  'export-ready': '내보내기 준비',
  error: '중단',
}

const roleLabels: Record<PipelineRole, string> = {
  researcher: '리서처',
  outliner: '아웃라이너',
  writer: '라이터',
  reviewer: '리뷰어',
}

const audienceUiLabels: Record<Audience, string> = {
  beginner: '입문자',
  practitioner: '실무자',
  advanced: '고급 사용자',
}

const toneUiLabels: Record<Tone, string> = {
  clear: '명료하게',
  pragmatic: '실무적으로',
  opinionated: '단호하게',
}

const lengthUiLabels: Record<Length, string> = {
  short: '짧게',
  medium: '보통',
  long: '길게',
}

const reviewSeverityLabels: Record<'good' | 'watch' | 'improve', string> = {
  good: '안정',
  watch: '주의',
  improve: '보완',
}

const baseScorePreview: Scorecard = {
  task_success: 9,
  ux_score: 8,
  flow_clarity: 9,
  visual_quality: 8,
  responsiveness: 8,
  a11y_score: 8,
  process_adherence: 10,
  overall_score: 8.6,
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
                statusMessage:
                  '브리프를 수정했습니다. 다시 생성하면 자료 요약부터 순차 인계를 재개합니다.',
              }
            : state.generation,
        copyFeedback: '',
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          errorMessage: null,
          statusMessage:
            '프리셋을 불러왔습니다. 글 생성 시작으로 리서처부터 리뷰어까지 다시 잠글 수 있습니다.',
        },
        copyFeedback: '',
        selectedRole: 'researcher',
      }
    case 'start-run':
      return {
        ...state,
        generation: {
          status: 'loading',
          currentRole: 'researcher',
          currentStage: 'research',
          completedRoles: [],
          completedStages: [],
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
        selectedRole: 'researcher',
      }
    case 'set-output':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: action.status,
          currentRole: action.nextRole,
          currentStage: action.nextStage,
          completedRoles: unique([...state.generation.completedRoles, action.role]),
          completedStages: unique([...state.generation.completedStages, action.stage]),
          outputs: {
            ...state.generation.outputs,
            [action.key]: action.value,
            ...(action.handoffs ? { handoffs: action.handoffs } : {}),
          },
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedRole: action.focusRole ?? action.role,
      }
    case 'finalize-run':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'export-ready',
          currentRole: null,
          currentStage: 'final',
          completedRoles: unique([...state.generation.completedRoles, 'reviewer']),
          completedStages: unique([...state.generation.completedStages, 'final']),
          outputs: {
            ...state.generation.outputs,
            final_post: action.finalPost,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
        selectedRole: 'reviewer',
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
          currentRole: action.role,
          currentStage: action.stage,
          completedRoles: [],
          completedStages: [],
          outputs: {},
          statusMessage: '첫 인계가 닫히기 전에 흐름이 멈췄습니다.',
          errorMessage: action.message,
        },
        copyFeedback: '',
        selectedRole: action.role,
      }
    case 'select-role':
      return {
        ...state,
        selectedRole: action.role,
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatRoleLabel(role: PipelineRole) {
  return roleLabels[role]
}

function roleStatusLabel(status: TrackerStatus) {
  switch (status) {
    case 'complete':
      return '닫힘'
    case 'current':
      return '진행 중'
    default:
      return '대기'
  }
}

function nextActionText(generation: GenerationState) {
  if (generation.status === 'error') {
    return '주제를 다듬은 뒤 자료 요약부터 다시 잠가 주세요.'
  }

  if (generation.status === 'initial') {
    return '글 생성 시작으로 첫 자료 요약 인계를 열어 주세요.'
  }

  if (generation.status === 'loading') {
    switch (generation.currentRole) {
      case 'researcher':
        return '리서처 요약이 닫히면 아웃라이너가 섹션 순서를 바로 잠급니다.'
      case 'outliner':
        return '지금은 논지와 흐름을 고정하는 구간입니다. 구조 설계가 끝나면 초안으로 넘어갑니다.'
      case 'writer':
        return '라이터가 구조를 읽는 순서대로 초안을 펼치고 있습니다.'
      case 'reviewer':
        return '리뷰어 편집이 진행 중이라 최종 원고는 아직 잠겨 있습니다.'
      default:
        return '다음 인계를 준비하는 중입니다.'
    }
  }

  if (generation.status === 'review-complete') {
    return '검토 메모를 확인한 뒤 최종 원고 잠금을 여세요.'
  }

  if (generation.status === 'export-ready') {
    return '마크다운을 복사하고, 필요할 때만 전체 원고와 근거 서랍을 여세요.'
  }

  return '현재 단계를 읽고 다음 인계로 이동할 준비를 해 주세요.'
}

function buildFinalPreview(markdown?: string) {
  if (!markdown) {
    return null
  }

  const lines = markdown
    .split('\n')
    .filter((line, index, source) => line.trim() !== '' || source[index - 1]?.trim() !== '')
  const excerptLines = lines.slice(0, 10)

  return {
    excerpt: excerptLines.join('\n'),
    hiddenLineCount: Math.max(lines.length - excerptLines.length, 0),
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
    selectedRole: 'researcher',
  })
  const [activeScreen, setActiveScreen] = useState<ScreenId>('brief')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const runRef = useRef(0)
  const screenHeadingRefs = useRef<Record<ScreenId, HTMLHeadingElement | null>>({
    brief: null,
    handoff: null,
    publish: null,
  })
  const roleTabRefs = useRef<Record<PipelineRole, HTMLButtonElement | null>>({
    researcher: null,
    outliner: null,
    writer: null,
    reviewer: null,
  })

  const research = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline
  const writerOutput = state.generation.outputs.section_drafts
  const reviewerOutput = state.generation.outputs.review_notes
  const handoffs = state.generation.outputs.handoffs ?? []

  useEffect(() => {
    if (state.generation.status === 'initial') {
      setActiveScreen('brief')
    }
  }, [state.generation.status])

  useEffect(() => {
    if (activeScreen === 'publish' && !state.generation.outputs.final_post) {
      setActiveScreen(state.generation.status === 'initial' ? 'brief' : 'handoff')
    }
  }, [activeScreen, state.generation.outputs.final_post, state.generation.status])

  useEffect(() => {
    screenHeadingRefs.current[activeScreen]?.focus()
  }, [activeScreen])

  const nextPendingRoleId =
    state.generation.status === 'export-ready' || state.generation.status === 'review-complete'
      ? null
      : pipelineRoles.find(
          (role) =>
            !state.generation.completedRoles.includes(role.id) && role.id !== state.generation.currentRole,
        )?.id ?? null

  const roleTracker = pipelineRoles.map((role) => {
    const isComplete = state.generation.completedRoles.includes(role.id)
    const isCurrent = state.generation.currentRole === role.id && state.generation.status !== 'error'
    const isError = state.generation.status === 'error' && state.generation.currentRole === role.id
    const handoff = handoffs.find((item) => item.from === role.id)
    const status: TrackerStatus = isComplete ? 'complete' : isCurrent ? 'current' : 'pending'
    const tone: StageTone = isError
      ? 'error'
      : isComplete
        ? 'complete'
        : isCurrent
          ? 'current'
          : nextPendingRoleId === role.id
            ? 'next'
            : 'pending'

    return {
      ...role,
      status,
      tone,
      handoffSummary:
        role.id === 'reviewer'
          ? reviewerOutput?.finalizationNote ??
            '리뷰어가 마지막 잠금을 끝내면 발행 데스크로 넘기는 메모가 남습니다.'
          : handoff?.outputSummary ?? '이 단계가 닫히면 다음 데스크로 넘길 메모가 남습니다.',
    }
  })

  const selectedRoleMeta = roleTracker.find((role) => role.id === state.selectedRole) ?? roleTracker[0]
  const currentRoleMeta =
    roleTracker.find((role) => role.id === state.generation.currentRole) ??
    (state.generation.status === 'export-ready'
      ? {
          id: 'reviewer',
          label: '리뷰어',
          stageLabel: '발행 잠금',
          description: '리뷰어가 최종 편집을 닫아 이제 발행 데스크만 남았습니다.',
          handoffLabel: '발행 데스크',
          handoffSummary: reviewerOutput?.finalizationNote ?? '복사 가능한 발행본이 준비되었습니다.',
          status: 'complete' as const,
          tone: 'complete' as const,
        }
      : selectedRoleMeta)

  const nextRoleMeta =
    state.generation.status === 'export-ready'
      ? null
      : state.generation.status === 'review-complete'
        ? {
            label: '발행 데스크',
            stageLabel: '최종 원고',
            handoffSummary:
              '리뷰 메모를 반영한 뒤 최종 원고를 펼치면 발행 요약과 복사 버튼이 열립니다.',
          }
        : roleTracker.find((role) => role.tone === 'next') ?? null

  const statusLabel = statusLabels[state.generation.status]
  const actionHint = nextActionText(state.generation)
  const completedCount = roleTracker.filter((role) => role.status === 'complete').length
  const progressPercent =
    state.generation.status === 'export-ready'
      ? 100
      : state.generation.status === 'review-complete'
        ? 88
        : state.generation.status === 'loading'
          ? Math.min(92, completedCount * 25 + 16)
          : Math.max(8, completedCount * 25)
  const finalPreview = buildFinalPreview(state.generation.outputs.final_post)
  const finalLineCount = state.generation.outputs.final_post
    ? state.generation.outputs.final_post.split('\n').length
    : 0
  const briefPressureLabel = `${audienceUiLabels[state.inputs.audience]} · ${toneUiLabels[state.inputs.tone]} · ${lengthUiLabels[state.inputs.length]}`
  const canOpenPublish = Boolean(state.generation.outputs.final_post)
  const handoffPrimaryLabel =
    state.generation.status === 'error'
      ? '브리프로 돌아가기'
      : canOpenPublish
        ? '발행대로 이동'
        : '인계 진행 중'

  const manifestPreview: Record<string, unknown> = {
    워크스페이스: '순차 파이프라인',
    현재_단계: state.generation.currentStage ? stageLabels[state.generation.currentStage] : '브리프 잠금 전',
    상태: statusLabel,
    완료_역할: state.generation.completedRoles.map((role) => formatRoleLabel(role)),
  }

  const artifactPreview: Record<string, unknown> = {
    준비된_화면: canOpenPublish ? ['데스크톱 미리보기', '모바일 미리보기'] : [],
    발행_상태: canOpenPublish ? ['최종 원고 잠금 해제'] : ['리뷰 잠금 전'],
    다음_메모: [actionHint],
    남길_묶음: deliverables.map((item) => item.title),
  }

  const scorePreview: Record<string, number> = {
    과업_적합도: baseScorePreview.task_success,
    경험_선명도: canOpenPublish ? 9 : baseScorePreview.ux_score,
    흐름_가독성: baseScorePreview.flow_clarity,
    시각_완성도: baseScorePreview.visual_quality,
    반응형_준비도: baseScorePreview.responsiveness,
    접근성_기본점수: baseScorePreview.a11y_score,
    프로세스_준수도: baseScorePreview.process_adherence,
    종합_점수: canOpenPublish ? 8.9 : baseScorePreview.overall_score,
  }

  const screenRail = [
    {
      id: 'brief' as const,
      label: '브리프 잠금실',
      detail: '입력 기준 봉인',
      enabled: true,
    },
    {
      id: 'handoff' as const,
      label: '인계 관제실',
      detail: '단계별 잠금 추적',
      enabled: state.generation.status !== 'initial',
    },
    {
      id: 'publish' as const,
      label: '발행 데스크',
      detail: '최종 원고와 복사',
      enabled: canOpenPublish,
    },
  ]

  const passportCards = [
    {
      label: '01 자료 요약',
      title: '리서처가 논지와 근거 축을 먼저 봉인합니다.',
      note: '주제, 독자, 톤, 분량이 같은 압력으로 넘어가며 첫 인계의 기준이 됩니다.',
    },
    {
      label: '02 구조 설계',
      title: '아웃라이너가 읽기 순서와 장면 전환을 고정합니다.',
      note: '한 화면에 다 펼치지 않고, 다음 단계가 읽어야 할 구조만 압축해 넘깁니다.',
    },
    {
      label: '03 초안 작성',
      title: '라이터가 섹션별 초안을 카드 묶음으로 확장합니다.',
      note: '긴 원고는 뒤로 미루고, 지금 필요한 요약만 전면에 남깁니다.',
    },
    {
      label: '04 발행 잠금',
      title: '리뷰어가 메모를 닫은 뒤 발행 데스크가 열립니다.',
      note: '최종 원고는 마지막 화면에서만 드러나며 복사도 그때 한 번만 허용합니다.',
    },
  ]

  const screenFacts = [
    { label: '잠긴 계약', value: briefPressureLabel },
    { label: '완료 단계', value: canOpenPublish ? '4 / 4 단계' : `${completedCount} / 4 단계` },
    { label: '다음 인계', value: nextRoleMeta ? nextRoleMeta.label : canOpenPublish ? '발행 데스크' : '리서처' },
  ]

  const publishFacts = [
    {
      label: '발행 상태',
      value: canOpenPublish ? '복사 가능' : '리뷰 잠금 전',
      note: '리뷰어가 닫히기 전에는 발행 데스크가 열리지 않습니다.',
    },
    {
      label: '첫 읽기',
      value: '요약 우선',
      note: '긴 본문보다 발행 메모와 요약을 먼저 읽도록 배치했습니다.',
    },
    {
      label: '보조 면',
      value: '원고 · 근거 서랍',
      note: '전체 원고와 증거 묶음은 필요할 때만 여는 이차 레이어입니다.',
    },
  ]

  const selectedRoleTabId = `role-tab-${selectedRoleMeta.id}`

  function handleRoleKeyDown(role: PipelineRole, event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = roleTracker.findIndex((item) => item.id === role)

    if (currentIndex === -1) {
      return
    }

    let nextIndex = currentIndex

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % roleTracker.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + roleTracker.length) % roleTracker.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = roleTracker.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const nextRole = roleTracker[nextIndex].id
    dispatch({ type: 'select-role', role: nextRole })
    roleTabRefs.current[nextRole]?.focus()
  }

  function handleNavigateScreen(target: ScreenId) {
    if (target === 'handoff' && state.generation.status === 'initial') {
      return
    }

    if (target === 'publish' && !canOpenPublish) {
      return
    }

    setActiveScreen(target)
  }

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    setEvidenceOpen(false)
    setActiveScreen('handoff')

    if (state.inputs.topic.trim().toLowerCase().includes('fail')) {
      dispatch({
        type: 'set-error',
        role: 'researcher',
        stage: 'research',
        message:
          '`fail` 키워드가 감지되어 자료 요약 단계에서 의도적으로 중단했습니다. 키워드를 지우고 다시 생성하세요.',
      })
      return
    }

    dispatch({
      type: 'start-run',
      message: '진행 중 | 리서처가 브리프를 읽고 첫 자료 요약 인계를 준비합니다.',
    })

    const nextResearch = runResearcher(state.inputs)
    const nextOutline = runOutliner(state.inputs, nextResearch)
    const nextWriterOutput = runWriter(state.inputs, nextResearch, nextOutline)
    const nextReviewerOutput = runReviewer(
      state.inputs,
      nextResearch,
      nextOutline,
      nextWriterOutput,
    )
    const finalOutputs = assembleFinalOutputs(
      state.inputs,
      nextResearch,
      nextOutline,
      nextWriterOutput,
      nextReviewerOutput,
    )

    await sleep(320)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'researcher',
      stage: 'research',
      nextRole: 'outliner',
      nextStage: 'outline',
      key: 'research_summary',
      value: nextResearch,
      status: 'loading',
      message: '진행 중 | 자료 요약이 전달되었습니다. 아웃라이너가 읽기 경로를 고정하는 중입니다.',
    })

    await sleep(320)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'outliner',
      stage: 'outline',
      nextRole: 'writer',
      nextStage: 'drafts',
      key: 'outline',
      value: nextOutline,
      status: 'loading',
      message: '진행 중 | 구조 설계가 잠겼습니다. 라이터가 섹션 초안을 펼치고 있습니다.',
    })

    await sleep(360)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'writer',
      stage: 'drafts',
      nextRole: 'reviewer',
      nextStage: 'review',
      key: 'section_drafts',
      value: nextWriterOutput,
      status: 'loading',
      message: '진행 중 | 초안이 전달되었습니다. 리뷰어가 발행 직전 밀도를 다듬고 있습니다.',
    })

    await sleep(360)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'set-output',
      role: 'reviewer',
      stage: 'review',
      nextRole: null,
      nextStage: 'final',
      key: 'review_notes',
      value: nextReviewerOutput,
      handoffs: finalOutputs.handoffs,
      status: 'review-complete',
      message: '검토 완료 | 리뷰어가 수정 메모를 반영했습니다. 최종 원고 잠금을 준비합니다.',
    })

    await sleep(220)
    if (runRef.current !== runId) {
      return
    }
    dispatch({
      type: 'finalize-run',
      finalPost: finalOutputs.final_post,
      message: '내보내기 준비 | 최종 원고가 잠겼습니다. 발행 데스크로 이동해 요약을 확인하고 복사하세요.',
    })
  }

  async function handleCopyMarkdown() {
    if (!state.generation.outputs.final_post || state.generation.status !== 'export-ready') {
      dispatch({
        type: 'set-copy-feedback',
        message: '복사는 리뷰어 단계가 닫혀 최종 원고가 준비된 뒤에만 열립니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(state.generation.outputs.final_post)
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 마크다운을 복사했습니다. 발행 데스크의 잠금본과 같은 내용입니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message:
          '이 브라우저 맥락에서는 클립보드 복사가 실패했지만, 아래 원고 문서는 그대로 읽을 수 있습니다.',
      })
    }
  }

  function handleHandoffPrimary() {
    if (state.generation.status === 'error') {
      setActiveScreen('brief')
      return
    }

    if (canOpenPublish) {
      setActiveScreen('publish')
    }
  }

  return (
    <main className="pipeline-app">
      <header className="screen-rail-shell">
        <div className="screen-rail-copy">
          <p className="eyebrow">순차 파이프라인</p>
          <h1>단계가 봉인되는 릴레이 편집실</h1>
          <p className="lead">
            브리프, 인계, 발행을 세 화면으로 분리해 지금 켜져 있는 데스크만 읽히게 합니다. 각
            화면에는 대표 동작을 하나만 두고, 긴 산출물은 뒤쪽 레이어로 밀어 넣었습니다.
          </p>
        </div>

        <nav className="screen-rail" aria-label="화면 단계">
          {screenRail.map((screen, index) => (
            <button
              key={screen.id}
              type="button"
              className={`screen-rail-button ${activeScreen === screen.id ? 'is-active' : ''}`}
              onClick={() => handleNavigateScreen(screen.id)}
              disabled={!screen.enabled}
            >
              <span className="screen-rail-step">{`0${index + 1}`}</span>
              <span className="screen-rail-text">
                <strong>{screen.label}</strong>
                <span>{screen.detail}</span>
              </span>
            </button>
          ))}
        </nav>
      </header>

      {activeScreen === 'brief' ? (
        <section key="brief" className="screen-panel" aria-labelledby="brief-screen-title">
          <div className="screen-panel-head stagger-item" style={{ animationDelay: '0ms' }}>
            <p className="signal-label">화면 1</p>
            <h2
              id="brief-screen-title"
              ref={(node) => {
                screenHeadingRefs.current.brief = node
              }}
              tabIndex={-1}
            >
              브리프 잠금실
            </h2>
            <p>
              같은 기준표가 리서처부터 리뷰어까지 흔들리지 않도록 먼저 봉인합니다. 시작 전에는
              입력 계약과 인계 시나리오만 보여 줍니다.
            </p>
          </div>

          <div className="brief-layout">
            <article className="panel-card brief-hero stagger-item" style={{ animationDelay: '60ms' }}>
              <div className="brief-hero-copy">
                <span className="signal-label">릴레이 패스포트</span>
                <strong>한 번 잠근 브리프가 네 데스크를 순서대로 통과합니다.</strong>
                <p>
                  현재 화면은 입력 계약만 보여 주고, 다음 화면에서만 인계 상태를 추적합니다.
                  마지막 화면이 열릴 때까지 최종 원고와 근거는 접혀 있습니다.
                </p>
              </div>

              <div className="passport-grid">
                {passportCards.map((card, index) => (
                  <article
                    key={card.label}
                    className="passport-card"
                    style={{ animationDelay: `${120 + index * 50}ms` }}
                  >
                    <span className="passport-step">{card.label}</span>
                    <strong>{card.title}</strong>
                    <p>{card.note}</p>
                  </article>
                ))}
              </div>

              <div className="fact-strip">
                {screenFacts.map((item, index) => (
                  <article
                    key={item.label}
                    className="fact-card"
                    style={{ animationDelay: `${280 + index * 50}ms` }}
                  >
                    <span className="signal-label">{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel-card brief-form-card stagger-item" style={{ animationDelay: '120ms' }}>
              <div className="section-head">
                <p className="eyebrow">입력 계약</p>
                <h3>첫 화면에서는 브리프, 단계 미리보기, 시작 CTA만 남깁니다.</h3>
                <p className="summary-text">단계가 열리기 전에는 주제, 독자, 톤, 분량만 조정할 수 있습니다.</p>
              </div>

              {state.generation.errorMessage ? (
                <div className="error-panel motion-shake" role="alert">
                  <strong>이전 인계가 중단되었습니다.</strong>
                  <p>{state.generation.errorMessage}</p>
                </div>
              ) : null}

              <form className="brief-form">
                <label className={`field ${state.inputs.topic ? 'is-filled' : ''}`}>
                  <span className="field-label">주제</span>
                  <textarea
                    name="topic"
                    aria-label="주제"
                    placeholder=" "
                    value={state.inputs.topic}
                    onChange={(event) =>
                      dispatch({
                        type: 'update-input',
                        field: 'topic',
                        value: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="field-row">
                  <label className="field is-filled">
                    <span className="field-label">독자</span>
                    <select
                      name="audience"
                      aria-label="독자"
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

                  <label className="field is-filled">
                    <span className="field-label">톤</span>
                    <select
                      name="tone"
                      aria-label="톤"
                      value={state.inputs.tone}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-input',
                          field: 'tone',
                          value: event.target.value as Tone,
                        })
                      }
                    >
                      <option value="clear">명료하게</option>
                      <option value="pragmatic">실무적으로</option>
                      <option value="opinionated">단호하게</option>
                    </select>
                  </label>

                  <label className="field is-filled">
                    <span className="field-label">분량</span>
                    <select
                      name="length"
                      aria-label="분량"
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
                      <option value="medium">보통</option>
                      <option value="long">길게</option>
                    </select>
                  </label>
                </div>

                <div className="brief-contract-sheet">
                  <span className="signal-label">지금 잠길 기준</span>
                  <strong>{state.inputs.topic}</strong>
                  <div className="chip-row">
                    <span className="chip">독자 · {audienceUiLabels[state.inputs.audience]}</span>
                    <span className="chip">톤 · {toneUiLabels[state.inputs.tone]}</span>
                    <span className="chip">분량 · {lengthUiLabels[state.inputs.length]}</span>
                  </div>
                </div>

                <div className="screen-actions">
                  <button
                    type="button"
                    className="primary-button"
                    aria-label="글 생성 시작"
                    data-testid="Generate post"
                    onClick={handleGenerate}
                    disabled={state.generation.status === 'loading'}
                  >
                    {state.generation.status === 'loading' ? '인계 잠금 중' : '글 생성 시작'}
                  </button>
                </div>
              </form>
            </article>
          </div>

          <details
            className="preset-drawer stagger-item"
            open={presetOpen}
            onToggle={(event) => setPresetOpen((event.currentTarget as HTMLDetailsElement).open)}
            style={{ animationDelay: '180ms' }}
          >
            <summary className="preset-summary">
              <div className="preset-summary-copy">
                <p className="eyebrow">추천 브리프</p>
                <h3>테스트용 주제는 접힌 서랍 안에만 둡니다.</h3>
                <p>첫 화면의 정보 밀도를 지키기 위해 샘플 브리프는 필요한 순간에만 펼칩니다.</p>
              </div>
              <span className="preset-toggle">{presetOpen ? '접기' : '열기'}</span>
            </summary>

            <section className="preset-row" aria-label="Benchmark topics">
              {topicPresets.map((preset, index) => (
                <button
                  key={preset.title}
                  type="button"
                  className="preset-card"
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
                  style={{ animationDelay: `${220 + index * 40}ms` }}
                >
                  <strong>{preset.title}</strong>
                  <span>{preset.rationale}</span>
                </button>
              ))}
            </section>
          </details>
        </section>
      ) : null}

      {activeScreen === 'handoff' ? (
        <section key="handoff" className="screen-panel" aria-labelledby="handoff-screen-title">
          <div className="screen-panel-head stagger-item" style={{ animationDelay: '0ms' }}>
            <p className="signal-label">화면 2</p>
            <h2
              id="handoff-screen-title"
              ref={(node) => {
                screenHeadingRefs.current.handoff = node
              }}
              tabIndex={-1}
            >
              인계 관제실
            </h2>
            <p>
              지금 진행 중인 데스크와 다음 데스크만 전면에 올립니다. 각 단계는 카드를 눌러 읽고,
              긴 산출물은 선택한 작업면 안에서만 확인합니다.
            </p>
          </div>

          <div className="handoff-layout">
            <article className="panel-card handoff-hero stagger-item" style={{ animationDelay: '60ms' }}>
              <div className="handoff-hero-top">
                <div className="handoff-hero-copy">
                  <span className="signal-label">현재 관제</span>
                  <strong>
                    {state.generation.status === 'export-ready'
                      ? '모든 인계가 잠겨 발행 데스크만 남았습니다.'
                      : `${currentRoleMeta.label}에서 ${nextRoleMeta?.label ?? '발행 데스크'}로 이어지는 구간을 추적합니다.`}
                  </strong>
                  <p>{actionHint}</p>
                </div>
                <div className="progress-badge" aria-label="잠금 진행도">
                  <span>잠금 진행</span>
                  <strong>{Math.round(progressPercent)}%</strong>
                </div>
              </div>

              <div className="progress-track" aria-hidden="true">
                <span className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>

              <div
                className={`status-banner ${state.generation.status === 'error' ? 'motion-shake' : ''}`}
                aria-live="polite"
              >
                <span className="sr-only">
                  {state.generation.status === 'export-ready'
                    ? 'export-ready'
                    : state.generation.status === 'review-complete'
                      ? 'review-complete'
                      : stageHookLabels[state.generation.currentStage ?? 'research']}
                </span>
                <strong>
                  <span className={`status-pill status-${state.generation.status}`}>{statusLabel}</span>
                  {state.generation.currentStage ? stageLabels[state.generation.currentStage] : '브리프 잠금 전'}
                </strong>
                <p>{state.generation.statusMessage}</p>
                <p>{state.copyFeedback || actionHint}</p>
              </div>

              <div className="handoff-snapshot-grid">
                <article className="snapshot-card snapshot-card-current">
                  <span className="signal-label">현재 데스크</span>
                  <strong>
                    {state.generation.status === 'initial'
                      ? '리서처 대기'
                      : canOpenPublish
                        ? '발행 데스크 준비'
                        : `${currentRoleMeta.label} · ${currentRoleMeta.stageLabel}`}
                  </strong>
                  <p>
                    {state.generation.status === 'initial'
                      ? '브리프가 잠기면 리서처가 논지와 근거 축을 먼저 묶습니다.'
                      : currentRoleMeta.description}
                  </p>
                </article>

                <article className="snapshot-card snapshot-card-next">
                  <span className="signal-label">다음 데스크</span>
                  <strong>{nextRoleMeta ? `${nextRoleMeta.label} · ${nextRoleMeta.stageLabel}` : '발행 데스크'}</strong>
                  <p>{nextRoleMeta?.handoffSummary ?? '복사와 발행 요약 확인만 남았습니다.'}</p>
                </article>
              </div>

              <div className="screen-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleHandoffPrimary}
                  disabled={state.generation.status !== 'error' && !canOpenPublish}
                >
                  {handoffPrimaryLabel}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveScreen('brief')}
                >
                  브리프 다시 보기
                </button>
              </div>
            </article>

            <article className="panel-card stage-rail-card stagger-item" style={{ animationDelay: '120ms' }}>
              <div className="section-head">
                <p className="eyebrow">단계 레일</p>
                <h3 aria-label="단계 레일">
                  지금 필요한 작업면만 카드로 고릅니다.
                </h3>
                <p className="summary-text">
                  완료된 카드는 봉인 도장으로 남기고, 진행 중인 단계만 발광시켜 현재/다음 흐름을
                  빠르게 읽히게 했습니다.
                </p>
              </div>

              <div className="stage-grid" role="tablist" aria-label="인계 단계 선택">
                {roleTracker.map((role, index) => (
                  <button
                    key={role.id}
                    id={`role-tab-${role.id}`}
                    type="button"
                    ref={(node) => {
                      roleTabRefs.current[role.id] = node
                    }}
                    role="tab"
                    className={`stage-card stage-card-${role.tone} ${state.selectedRole === role.id ? 'is-selected' : ''}`}
                    aria-selected={state.selectedRole === role.id}
                    aria-current={role.status === 'current' ? 'step' : undefined}
                    aria-controls="role-detail-panel"
                    aria-label={`${role.label} ${role.stageLabel}`}
                    data-testid={stageHookLabels[roleStageMap[role.id]]}
                    tabIndex={state.selectedRole === role.id ? 0 : -1}
                    onClick={() => dispatch({ type: 'select-role', role: role.id })}
                    onKeyDown={(event) => handleRoleKeyDown(role.id, event)}
                    style={{ animationDelay: `${170 + index * 50}ms` }}
                  >
                    <div className="stage-card-top">
                      <StageBadge tone={role.tone} index={index} />
                      <span className="stage-card-status">{roleStatusLabel(role.status)}</span>
                    </div>
                    <strong>{role.label}</strong>
                    <span>{role.stageLabel}</span>
                    <p>{role.handoffSummary}</p>
                  </button>
                ))}
              </div>
            </article>
          </div>

          <RolePanel
            panelId="role-detail-panel"
            labelledById={selectedRoleTabId}
            title={selectedRoleMeta.label}
            stageLabel={selectedRoleMeta.stageLabel}
            status={state.generation.status}
            activeRole={state.generation.currentRole}
            role={selectedRoleMeta.id}
            inputSummary={inputSummaryForRole(state.inputs, selectedRoleMeta.id, research, outline, writerOutput)}
            handoffNote={handoffNoteForRole(selectedRoleMeta.id, research, outline, writerOutput, reviewerOutput)}
            emptyText={emptyTextForRole(selectedRoleMeta.id)}
            emptyActionLabel={
              state.generation.status === 'error'
                ? '브리프로 돌아가기'
                : state.generation.currentRole
                  ? `${formatRoleLabel(state.generation.currentRole)} 보기`
                  : '브리프 다시 보기'
            }
            onEmptyAction={() => {
              if (state.generation.status === 'error' || !state.generation.currentRole) {
                setActiveScreen('brief')
                return
              }

              dispatch({ type: 'select-role', role: state.generation.currentRole })
            }}
          >
            {renderRoleSurface(selectedRoleMeta.id, research, outline, writerOutput, reviewerOutput)}
          </RolePanel>
        </section>
      ) : null}

      {activeScreen === 'publish' ? (
        <section key="publish" className="screen-panel" aria-labelledby="publish-screen-title">
          <div className="screen-panel-head stagger-item" style={{ animationDelay: '0ms' }}>
            <p className="signal-label">화면 3</p>
            <h2
              id="publish-screen-title"
              ref={(node) => {
                screenHeadingRefs.current.publish = node
              }}
              tabIndex={-1}
            >
              발행 데스크
            </h2>
            <p>
              마지막 화면에서만 발행 요약과 복사를 엽니다. 전체 원고와 근거 묶음은 기본 접힘
              상태로 두어 읽기 압력을 끝까지 관리합니다.
            </p>
          </div>

          {state.generation.outputs.final_post ? (
            <div className="publish-layout">
              <article className="panel-card publish-hero stagger-item" style={{ animationDelay: '60ms' }}>
                <div className="publish-hero-copy">
                  <span className="signal-label">발행 메모</span>
                  <strong>{reviewerOutput?.finalizationNote ?? '발행본 잠금이 완료되었습니다.'}</strong>
                  <p>
                    긴 본문을 바로 전면에 펼치지 않고, 발행 요약과 상태 카드를 먼저 읽게 만든 뒤
                    전체 원고는 별도 문서면으로 분리했습니다.
                  </p>
                </div>

                <div className="screen-actions">
                  <button
                    type="button"
                    className="primary-button"
                    aria-label="최종 원고 복사"
                    data-testid="Copy markdown"
                    onClick={handleCopyMarkdown}
                  >
                    최종 원고 복사
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setActiveScreen('handoff')}
                  >
                    관제실 보기
                  </button>
                </div>

                <div className="fact-strip publish-facts">
                  {publishFacts.map((item, index) => (
                    <article
                      key={item.label}
                      className="fact-card"
                      style={{ animationDelay: `${120 + index * 50}ms` }}
                    >
                      <span className="signal-label">{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>
              </article>

              <article className="panel-card publish-preview-card stagger-item" style={{ animationDelay: '120ms' }}>
                <div className="section-head">
                  <p className="eyebrow">발행 요약</p>
                  <h3>복사 전에 읽는 짧은 원고 요약</h3>
                </div>
                {finalPreview ? <pre className="markdown-preview">{finalPreview.excerpt}</pre> : null}
                {finalPreview && finalPreview.hiddenLineCount > 0 ? (
                  <p className="summary-text">
                    아래 요약 뒤에 본문 {finalPreview.hiddenLineCount}줄이 더 잠겨 있습니다. 전체
                    확인이 필요할 때만 펼치세요.
                  </p>
                ) : null}
                <p className="copy-feedback copy-feedback-inline">{state.copyFeedback || actionHint}</p>
              </article>
            </div>
          ) : (
            <div className="empty-state stagger-item" style={{ animationDelay: '60ms' }}>
              <span className="empty-glyph">원고</span>
              <strong>아직 발행 데스크를 열 수 없습니다.</strong>
              <p>리뷰어 잠금이 끝나면 이 화면에서 발행 요약과 복사가 함께 열립니다.</p>
              <button type="button" className="primary-button" onClick={() => setActiveScreen('handoff')}>
                관제실로 돌아가기
              </button>
            </div>
          )}

          <details className="inline-details final-preview-details stagger-item" style={{ animationDelay: '180ms' }}>
            <summary>전체 원고 문서 펼치기</summary>
            {state.generation.outputs.final_post ? (
              <div className="reader-document-shell">
                <div className="reader-document-head">
                  <div className="reader-document-copy">
                    <span className="signal-label">원문 보관함</span>
                    <strong>리뷰 완료 후 전체 원고</strong>
                    <p>긴 본문은 별도 문서면으로 분리해 세 번째 화면의 읽기 밀도를 지켰습니다.</p>
                  </div>
                  <span className="reader-document-count">총 {finalLineCount}줄</span>
                </div>
                <div className="markdown-block reader-document-body" tabIndex={0} aria-label="최종 원고 전체">
                  <pre>{state.generation.outputs.final_post}</pre>
                </div>
              </div>
            ) : null}
          </details>

          <details
            className="panel-card evidence-drawer stagger-item"
            open={evidenceOpen}
            onToggle={(event) => setEvidenceOpen((event.currentTarget as HTMLDetailsElement).open)}
            style={{ animationDelay: '240ms' }}
          >
            <summary className="drawer-summary">
              <div>
                <p className="eyebrow">보조 근거</p>
                <h3>추적과 점수 맥락이 필요할 때만 여는 서랍</h3>
              </div>
              <span>{evidenceOpen ? '서랍 닫기' : '서랍 열기'}</span>
            </summary>

            <div className="panel-grid">
              <article className="panel-card">
                <div className="section-head">
                  <p className="eyebrow">인계 장부</p>
                  <h3>전달된 전환 기록</h3>
                </div>

                <div className="artifact-list">
                  {handoffs.length > 0 ? (
                    handoffs.map((handoff) => (
                      <article key={`${handoff.from}-${handoff.to}`} className="artifact-card">
                        <h3>
                          {formatRoleLabel(handoff.from)} → {formatRoleLabel(handoff.to)}
                        </h3>
                        <p>{handoff.inputSummary}</p>
                        <p>{handoff.outputSummary}</p>
                      </article>
                    ))
                  ) : (
                    <div className="handoff-empty">
                      <p>첫 역할이 닫히기 전까지는 인계 장부가 비어 있습니다.</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="panel-card">
                <div className="section-head">
                  <p className="eyebrow">산출물과 루브릭</p>
                  <h3>이번 실행에서 남길 근거 묶음</h3>
                </div>

                <div className="artifact-list">
                  {deliverables.map((item) => (
                    <article key={item.id} className="artifact-card">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>

                <ul className="lens-list">
                  {reviewLenses.map((lens) => (
                    <li key={lens}>{lens}</li>
                  ))}
                </ul>

                <div className="preview-grid">
                  <PreviewBlock
                    title="실행 장부 미리보기"
                    hookLabel="run_manifest.json"
                    payload={manifestPreview}
                  />
                  <PreviewBlock
                    title="산출물 묶음 미리보기"
                    hookLabel="artifact_index.json"
                    payload={artifactPreview}
                  />
                  <PreviewBlock
                    title="점수 카드 미리보기"
                    hookLabel="scorecard.json"
                    payload={scorePreview}
                  />
                </div>
              </article>
            </div>
          </details>
        </section>
      ) : null}
    </main>
  )
}

function StageBadge(props: { tone: StageTone; index: number }) {
  if (props.tone === 'complete') {
    return (
      <span className={`stage-badge stage-badge-${props.tone}`} aria-hidden="true">
        <svg className="stage-badge-svg" viewBox="0 0 24 24">
          <path className="stage-badge-path" d="M5.5 12.5L10 17l8.5-9" />
        </svg>
      </span>
    )
  }

  if (props.tone === 'current') {
    return (
      <span className={`stage-badge stage-badge-${props.tone}`} aria-hidden="true">
        <span className="stage-badge-dot" />
      </span>
    )
  }

  return (
    <span className={`stage-badge stage-badge-${props.tone}`} aria-hidden="true">
      {`0${props.index + 1}`}
    </span>
  )
}

function inputSummaryForRole(
  inputs: BlogGeneratorInputs,
  role: PipelineRole,
  research?: PipelineOutputs['research_summary'],
  outline?: PipelineOutputs['outline'],
  writerOutput?: PipelineOutputs['section_drafts'],
) {
  switch (role) {
    case 'researcher':
      return `주제: ${inputs.topic} / 독자: ${audienceUiLabels[inputs.audience]} / 톤: ${toneUiLabels[inputs.tone]} / 분량: ${lengthUiLabels[inputs.length]}`
    case 'outliner':
      return research
        ? `리서처가 넘긴 중심 논지: ${research.thesis}`
        : '리서처가 논지와 핵심 발견을 넘기기를 기다리는 중입니다.'
    case 'writer':
      return outline
        ? `아웃라이너가 ${outline.sections.length}개 섹션 구조와 설계 이유를 넘겼습니다.`
        : '아웃라이너가 섹션 순서를 잠그기를 기다리는 중입니다.'
    case 'reviewer':
      return writerOutput
        ? '라이터 요약과 검토 전 마크다운이 도착해 편집 밀도를 조정할 수 있습니다.'
        : '라이터 인계를 기다리는 중입니다.'
  }
}

function handoffNoteForRole(
  role: PipelineRole,
  research?: PipelineOutputs['research_summary'],
  outline?: PipelineOutputs['outline'],
  writerOutput?: PipelineOutputs['section_drafts'],
  reviewerOutput?: PipelineOutputs['review_notes'],
) {
  switch (role) {
    case 'researcher':
      return research?.handoffNote
    case 'outliner':
      return outline?.handoffNote
    case 'writer':
      return writerOutput?.handoffNote
    case 'reviewer':
      return reviewerOutput?.finalizationNote
  }
}

function emptyTextForRole(role: PipelineRole) {
  switch (role) {
    case 'researcher':
      return '첫 브리프가 잠기면 리서처 출력이 이 작업면에 나타납니다.'
    case 'outliner':
      return '자료 요약 인계가 닫히면 아웃라이너 작업면이 열립니다.'
    case 'writer':
      return '구조 설계 인계가 닫히면 라이터 초안이 나타납니다.'
    case 'reviewer':
      return '라이터 인계가 닫히면 리뷰어 메모와 수정 기록이 나타납니다.'
  }
}

function renderRoleSurface(
  role: PipelineRole,
  research?: PipelineOutputs['research_summary'],
  outline?: PipelineOutputs['outline'],
  writerOutput?: PipelineOutputs['section_drafts'],
  reviewerOutput?: PipelineOutputs['review_notes'],
) {
  switch (role) {
    case 'researcher':
      return research ? (
        <>
          <article className="surface-lead-card">
            <span className="signal-label">핵심 논지</span>
            <strong>{research.thesis}</strong>
            <p>{research.angle}</p>
          </article>
          <div className="insight-grid">
            {research.keyFindings.map((finding, index) => (
              <article key={finding} className="insight-card" style={{ animationDelay: `${index * 50}ms` }}>
                <span className="signal-label">{`발견 0${index + 1}`}</span>
                <p>{finding}</p>
              </article>
            ))}
          </div>
          <div className="chip-row">
            {research.searchTerms.map((term) => (
              <span key={term} className="chip">
                {term}
              </span>
            ))}
          </div>
          <div className="support-grid">
            {research.supportingFacts.map((fact, index) => (
              <article key={fact} className="support-card" style={{ animationDelay: `${100 + index * 50}ms` }}>
                <span className="signal-label">근거 축</span>
                <p>{fact}</p>
              </article>
            ))}
          </div>
        </>
      ) : null
    case 'outliner':
      return outline ? (
        <>
          <article className="surface-lead-card">
            <span className="signal-label">구조 설계 원칙</span>
            <strong>문제 정의에서 체크리스트까지 읽기 압력을 단계적으로 높입니다.</strong>
            <p>{outline.structureRationale}</p>
          </article>
          <ol className="outline-grid">
            {outline.sections.map((section, index) => (
              <li key={section.id} className="outline-card" style={{ animationDelay: `${index * 50}ms` }}>
                <span className="outline-step">{`0${index + 1}`}</span>
                <strong>{section.title}</strong>
                <p>{section.goal}</p>
              </li>
            ))}
          </ol>
        </>
      ) : null
    case 'writer':
      return writerOutput ? (
        <>
          <article className="surface-lead-card">
            <span className="signal-label">초안 묶음</span>
            <strong>{writerOutput.writerSummary}</strong>
            <p>섹션별 초안은 카드로 잘라 검토 전에 필요한 부분만 빠르게 읽을 수 있게 두었습니다.</p>
          </article>
          <div className="draft-board">
            {writerOutput.sectionDrafts.map((draft, index) => (
              <article key={draft.id} className="draft-card" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="draft-card-head">
                  <span className="draft-step">{`0${index + 1}`}</span>
                  <span className="signal-label">섹션 초안</span>
                </div>
                <h3>{draft.title}</h3>
                <p>{draft.summary}</p>
                <p className="takeaway">{draft.takeaway}</p>
              </article>
            ))}
          </div>
          <details className="inline-details">
            <summary>검토 전 초안 펼치기</summary>
            <div className="markdown-block">
              <pre>{writerOutput.preReviewMarkdown}</pre>
            </div>
          </details>
        </>
      ) : null
    case 'reviewer':
      return reviewerOutput ? (
        <>
          <article className="surface-lead-card">
            <span className="signal-label">발행 잠금 메모</span>
            <strong>{reviewerOutput.finalizationNote}</strong>
            <p>검토 메모는 위험도별 카드로 정리하고, 실제 적용 편집은 별도 접힘 목록으로 분리했습니다.</p>
          </article>
          <div className="review-board">
            {reviewerOutput.reviewNotes.map((note, index) => (
              <article
                key={note.label}
                className={`review-note review-${note.severity}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="review-note-head">
                  <strong>{note.label}</strong>
                  <span>{reviewSeverityLabels[note.severity]}</span>
                </div>
                <p>{note.detail}</p>
              </article>
            ))}
          </div>
          <details className="inline-details">
            <summary>적용된 편집 {reviewerOutput.appliedEdits.length}건 펼치기</summary>
            <div className="artifact-list">
              {reviewerOutput.appliedEdits.map((edit) => (
                <article key={edit.label} className="artifact-card">
                  <h3>{edit.label}</h3>
                  <p>
                    <strong>이전:</strong> {edit.before}
                  </p>
                  <p>
                    <strong>이후:</strong> {edit.after}
                  </p>
                </article>
              ))}
            </div>
          </details>
        </>
      ) : null
  }
}

function RolePanel(props: {
  panelId: string
  labelledById: string
  title: string
  stageLabel: string
  status: GenerationStatus
  activeRole: PipelineRole | null
  role: PipelineRole
  inputSummary: string
  handoffNote?: string
  emptyText: string
  emptyActionLabel: string
  onEmptyAction: () => void
  children: ReactNode
}) {
  const isLoading = props.status === 'loading' && props.activeRole === props.role
  const isError = props.status === 'error' && props.activeRole === props.role
  const hasContent = Boolean(props.children)

  return (
    <article
      id={props.panelId}
      className="panel-card role-panel-shell stagger-item"
      role="tabpanel"
      aria-labelledby={props.labelledById}
      style={{ animationDelay: '180ms' }}
    >
      <div className="section-head">
        <p className="eyebrow">{props.stageLabel}</p>
        <h3>{props.title}</h3>
      </div>

      <div className="role-meta">
        <div>
          <strong>받은 입력</strong>
          <p>{props.inputSummary}</p>
        </div>
        <div>
          <strong>다음 인계 메모</strong>
          <p>{props.handoffNote ?? '이 역할이 닫히면 다음 인계 메모가 여기에 나타납니다.'}</p>
        </div>
      </div>

      {hasContent ? (
        <div className="role-surface">{props.children}</div>
      ) : isLoading ? (
        <div className="empty-state loading-state" aria-live="polite">
          <span className="empty-glyph">처리</span>
          <strong>{props.title} 작업면을 채우는 중입니다.</strong>
          <div className="loading-rack" aria-hidden="true">
            <span className="loading-skeleton" />
            <span className="loading-skeleton loading-skeleton-short" />
            <span className="loading-skeleton" />
          </div>
        </div>
      ) : isError ? (
        <div className="empty-state error-state motion-shake">
          <span className="empty-glyph">중단</span>
          <strong>이 역할은 유효한 산출물을 넘기기 전에 중단되었습니다.</strong>
          <p>브리프를 다듬고 다시 잠그면 정상 경로로 복구할 수 있습니다.</p>
          <button type="button" className="secondary-button empty-action" onClick={props.onEmptyAction}>
            {props.emptyActionLabel}
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-glyph">대기</span>
          <strong>아직 이 작업면이 열리지 않았습니다.</strong>
          <p>{props.emptyText}</p>
          <button type="button" className="secondary-button empty-action" onClick={props.onEmptyAction}>
            {props.emptyActionLabel}
          </button>
        </div>
      )}
    </article>
  )
}

function PreviewBlock(props: { title: string; hookLabel: string; payload: unknown }) {
  return (
    <article
      className="preview-block"
      aria-label={`${props.title} 미리보기`}
      data-testid={props.hookLabel}
    >
      <h3>{props.title}</h3>
      <span className="sr-only">{props.hookLabel}</span>
      <pre>{JSON.stringify(props.payload, null, 2)}</pre>
    </article>
  )
}

export default App
