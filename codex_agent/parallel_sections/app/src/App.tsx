import { useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  Audience,
  BlogGeneratorInputs,
  GenerationState,
  GenerationStatus,
  LanePacket,
  Length,
  OutlineSection,
  PipelineOutputs,
  SectionAssignment,
  Tone,
  WriterLaneId,
} from './contracts'
import {
  assembleFinalOutputs,
  createCoordinatorBrief,
  createFinalArticle,
  createLanePacket,
  createMergeReport,
} from './generator'
import {
  deliverables,
  evaluationChecklist,
  reviewLenses,
  topicPresets,
  workflowStages,
  writerLanes,
} from './starterData'

type WorkspaceScreen = 'setup' | 'draft' | 'publish'
type ScreenDirection = 'forward' | 'backward'

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
      type: 'set-coordinator'
      brief: NonNullable<PipelineOutputs['research_summary']>
      outline: OutlineSection[]
      assignments: SectionAssignment[]
      message: string
    }
  | { type: 'start-lanes'; message: string }
  | { type: 'set-lane-packet'; packet: LanePacket; message: string }
  | { type: 'start-merge'; message: string }
  | {
      type: 'set-merge-report'
      report: NonNullable<PipelineOutputs['review_notes']>
      message: string
    }
  | {
      type: 'finalize-run'
      outputs: PipelineOutputs
      message: string
    }
  | { type: 'set-copy-feedback'; message: string }
  | { type: 'set-error'; message: string }

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0].title,
  audience: 'practitioner',
  tone: 'pragmatic',
  length: 'medium',
}

function emptyUnitStatuses() {
  return {
    coordinator: 'pending',
    writer_a: 'pending',
    writer_b: 'pending',
    writer_c: 'pending',
    merge_reviewer: 'pending',
  } as GenerationState['unitStatuses']
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentStage: null,
  completedStages: [],
  unitStatuses: emptyUnitStatuses(),
  outputs: {},
  statusMessage: '브리프를 잠그면 세 개 레인이 동시에 열리고, 마지막에 머지 데스크가 문장 흐름을 정리합니다.',
  errorMessage: null,
}

const stageHookLabels = {
  research: 'Research results',
  outline: 'Outline',
  drafts: 'Section drafts',
  review: 'Review notes',
  final: 'Final post',
} as const

const stageTestIds = {
  research: 'stage-research',
  outline: 'stage-outline',
  drafts: 'stage-drafts',
  review: 'stage-review',
  final: 'stage-final',
} as const

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

const screenOrder: WorkspaceScreen[] = ['setup', 'draft', 'publish']
const emptyOutline: OutlineSection[] = []
const emptyAssignments: SectionAssignment[] = []
const emptyLanePackets: LanePacket[] = []

const screenTitles: Record<
  WorkspaceScreen,
  { kicker: string; title: string; description: string }
> = {
  setup: {
    kicker: '브리프 설정',
    title: '주제와 독자 조건을 먼저 고정한 뒤, 세 개 레인 초안을 시작합니다',
    description: '첫 화면은 입력과 방향 결정만 남기고, 긴 산출물과 근거 레이어는 뒤 단계로 밀어냈습니다.',
  },
  draft: {
    kicker: '병렬 작성',
    title: '세 레인이 동시에 초안을 쓰고, 중앙 레일이 합류 준비 상태를 보여줍니다',
    description: '각 레인은 짧은 요약만 먼저 보이고, 자세한 패킷은 하나씩 골라 읽게 설계했습니다.',
  },
  publish: {
    kicker: '머지/발행',
    title: '리뷰 메모와 최종 글을 번갈아 확인한 뒤, 마지막에 마크다운을 내보냅니다',
    description: '리뷰 메모와 최종 글은 같은 자리에서 교대로 열리고, 내보내기는 짧은 미리보기 뒤에만 남깁니다.',
  },
}

const screenGuides: Record<
  WorkspaceScreen,
  { label: string; note: string; recovery: string }
> = {
  setup: {
    label: '화면 01 · 브리프 잠금',
    note: '입력값은 유지한 채 다음 화면으로 넘기고, 첫 화면에는 생성 전 판단만 남깁니다.',
    recovery: '막히면 대표 프리셋을 불러와 바로 재시작할 수 있습니다.',
  },
  draft: {
    label: '화면 02 · 병렬 레인',
    note: '세 레인은 동시에 움직이되, 사용자는 한 번에 한 레인만 깊게 읽습니다.',
    recovery: '비어 있는 레인은 skeleton으로 유지하고, 이전 브리프로 즉시 돌아갈 수 있습니다.',
  },
  publish: {
    label: '화면 03 · 머지/발행',
    note: '리뷰 메모와 최종 글은 같은 자리를 번갈아 쓰고, 내보내기는 마지막에만 강조합니다.',
    recovery: '머지가 덜 되었으면 작성 보드로 돌아가 상태를 다시 확인할 수 있습니다.',
  },
}

const screenEditions: Record<
  WorkspaceScreen,
  { label: string; title: string; note: string; tail: string }
> = {
  setup: {
    label: '입력 데스크',
    title: '브리프 잠금 전용 1면',
    note: '첫 화면은 판단과 시작 버튼만 남기고, 긴 산출물은 다음 지면으로 넘깁니다.',
    tail: '01 · 잠금',
  },
  draft: {
    label: '도킹 데스크',
    title: '세 레인이 중앙 스파인으로 합류하는 장면',
    note: '도착한 패킷만 밝게 열고, 나머지는 skeleton과 압력 신호로만 유지합니다.',
    tail: '02 · 병렬',
  },
  publish: {
    label: '발행 데스크',
    title: '리뷰와 최종 글이 같은 지면을 번갈아 점유합니다',
    note: '고스트식 sidecar 사고방식을 적용해, 발행 정보는 리더 surface를 압도하지 않게 유지합니다.',
    tail: '03 · 출고',
  },
}

const stageScreenMap = {
  research: 'setup',
  outline: 'setup',
  drafts: 'draft',
  review: 'publish',
  final: 'publish',
} as const satisfies Record<(typeof workflowStages)[number]['id'], WorkspaceScreen>

const laneFallbackSections: Record<WriterLaneId, string> = {
  writer_a: '도입 프레임',
  writer_b: '구조 판단',
  writer_c: '최종 체크',
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
                statusMessage: '입력을 바꿨습니다. 다시 생성하면 코디네이터가 브리프를 새로 고정합니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 브리프를 잠그면 세 레인이 바로 병렬로 나뉩니다.',
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
          unitStatuses: {
            ...emptyUnitStatuses(),
            coordinator: 'loading',
          },
          outputs: {},
          statusMessage: action.message,
          errorMessage: null,
        },
        copyFeedback: '',
      }
    case 'set-coordinator':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'populated',
          currentStage: 'outline',
          completedStages: unique(['research', 'outline']),
          unitStatuses: {
            ...state.generation.unitStatuses,
            coordinator: 'complete',
          },
          outputs: {
            ...state.generation.outputs,
            research_summary: action.brief,
            outline: action.outline,
            assignments: action.assignments,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'start-lanes':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'drafts',
          unitStatuses: {
            ...state.generation.unitStatuses,
            writer_a: 'loading',
            writer_b: 'loading',
            writer_c: 'loading',
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-lane-packet': {
      const packets = [...(state.generation.outputs.section_drafts ?? []), action.packet].sort((left, right) =>
        left.writerId.localeCompare(right.writerId),
      )

      const nextStatuses = {
        ...state.generation.unitStatuses,
        [action.packet.writerId]: 'complete',
      } as GenerationState['unitStatuses']

      const allLanesComplete =
        nextStatuses.writer_a === 'complete' &&
        nextStatuses.writer_b === 'complete' &&
        nextStatuses.writer_c === 'complete'

      return {
        ...state,
        generation: {
          ...state.generation,
          status: allLanesComplete ? 'populated' : 'loading',
          currentStage: 'drafts',
          completedStages: allLanesComplete
            ? unique([...state.generation.completedStages, 'drafts'])
            : state.generation.completedStages,
          unitStatuses: nextStatuses,
          outputs: {
            ...state.generation.outputs,
            section_drafts: packets,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    }
    case 'start-merge':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'loading',
          currentStage: 'review',
          unitStatuses: {
            ...state.generation.unitStatuses,
            merge_reviewer: 'loading',
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'set-merge-report':
      return {
        ...state,
        generation: {
          ...state.generation,
          status: 'review-complete',
          currentStage: 'review',
          completedStages: unique([...state.generation.completedStages, 'review']),
          unitStatuses: {
            ...state.generation.unitStatuses,
            merge_reviewer: 'complete',
          },
          outputs: {
            ...state.generation.outputs,
            review_notes: action.report,
          },
          statusMessage: action.message,
          errorMessage: null,
        },
      }
    case 'finalize-run':
      return {
        ...state,
        generation: {
          ...state.generation,
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
          unitStatuses: {
            ...emptyUnitStatuses(),
            coordinator: 'error',
          },
          outputs: {},
          statusMessage: '코디네이터가 브리프를 완성하지 못했습니다. 입력을 조정한 뒤 다시 시작하세요.',
          errorMessage: action.message,
        },
        copyFeedback: '',
      }
    default:
      return state
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusLabel(status: GenerationStatus) {
  const labels: Record<GenerationStatus, string> = {
    initial: '준비 전',
    loading: '진행 중',
    populated: '보드 준비 완료',
    'review-complete': '리뷰 정리 완료',
    'export-ready': '내보내기 준비 완료',
    error: '오류',
  }

  return labels[status]
}

function unitStatusLabel(status: GenerationState['unitStatuses'][keyof GenerationState['unitStatuses']]) {
  const labels = {
    pending: '대기',
    loading: '진행 중',
    complete: '완료',
    error: '오류',
  } as const

  return labels[status]
}

function laneStatusLabel(id: WriterLaneId) {
  if (id === 'writer_a') {
    return '도입 레인'
  }
  if (id === 'writer_b') {
    return '구조 레인'
  }
  return '마무리 레인'
}

function stageVisualState(stageId: (typeof workflowStages)[number]['id'], generation: GenerationState) {
  if (generation.status === 'error' && stageId === 'research') {
    return 'error'
  }
  if (generation.completedStages.includes(stageId)) {
    return 'complete'
  }
  if (generation.currentStage === stageId) {
    return 'current'
  }
  return 'pending'
}

function screenIndex(screen: WorkspaceScreen) {
  return screenOrder.indexOf(screen)
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const runRef = useRef(0)
  const [screenMotion, setScreenMotion] = useState<{
    current: WorkspaceScreen
    direction: ScreenDirection
    revision: number
  }>({
    current: 'setup',
    direction: 'forward',
    revision: 0,
  })
  const [manualReaderPanel, setManualReaderPanel] = useState<'review' | 'final' | null>(null)
  const [manualActiveLane, setManualActiveLane] = useState<WriterLaneId | null>(null)

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    setManualReaderPanel(null)
    setManualActiveLane(null)

    dispatch({
      type: 'start-run',
      message: '코디네이터가 공통 브리프를 잠그고, 세 개 레인의 소유 범위를 먼저 분리합니다.',
    })

    await sleep(260)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      moveToScreen('setup')
      dispatch({
        type: 'set-error',
        message: '코디네이터가 유효한 공통 브리프를 만들지 못했습니다. 주제를 조금 더 구체적으로 바꿔 다시 시작하세요.',
      })
      return
    }

    const { brief, outline, assignments } = createCoordinatorBrief(state.inputs)

    dispatch({
      type: 'set-coordinator',
      brief,
      outline,
      assignments,
      message: '브리프와 아웃라인을 고정했습니다. 이제 레인별 초안이 병렬로 채워집니다.',
    })
    moveToScreen('draft')

    await sleep(220)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'start-lanes',
      message: '라이터 A, B, C가 자기 소유 섹션만 병렬로 작성하고 있습니다.',
    })

    const lanePackets = (
      await Promise.all(
        assignments.map(async (assignment, index) => {
          await sleep(240 + index * 160)
          if (runRef.current !== runId) {
            return null
          }

          const packet = createLanePacket(state.inputs, brief, assignment)
          dispatch({
            type: 'set-lane-packet',
            packet,
            message: `${laneStatusLabel(packet.writerId)}이 미리보기 블록 ${packet.draftPreview.length}개를 넘겼습니다.`,
          })
          return packet
        }),
      )
    ).filter((packet): packet is LanePacket => Boolean(packet))

    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'start-merge',
      message: '카피 데스크가 중복을 줄이고, 전환을 정리하고, 전체 톤을 다시 맞추고 있습니다.',
    })

    await sleep(300)
    if (runRef.current !== runId) {
      return
    }

    const mergeReport = createMergeReport(state.inputs, brief, lanePackets)

    dispatch({
      type: 'set-merge-report',
      report: mergeReport,
      message: '머지 리뷰가 끝났습니다. 이제 최종 글과 내보내기 구성이 열립니다.',
    })
    moveToScreen('publish')

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    const finalArticle = createFinalArticle(state.inputs, brief, lanePackets, mergeReport)

    dispatch({
      type: 'finalize-run',
      outputs: assembleFinalOutputs(brief, outline, assignments, lanePackets, mergeReport, finalArticle),
      message: '최종 글이 준비됐습니다. 읽기용 화면을 확인한 뒤 마크다운을 내보낼 수 있습니다.',
    })
  }

  async function copyMarkdown() {
    const markdown = state.generation.outputs.final_post

    if (!markdown) {
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 글이 준비되면 이 버튼으로 마크다운을 바로 복사할 수 있습니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(markdown)
      dispatch({
        type: 'set-copy-feedback',
        message: '마크다운을 클립보드에 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '이 환경에서는 클립보드 복사가 막혀 있어 아래 미리보기에서 직접 확인할 수 있습니다.',
      })
    }
  }

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    dispatch({
      type: 'update-input',
      field,
      value,
    })
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    dispatch({
      type: 'apply-preset',
      payload: { topic: title, audience, tone, length },
    })
  }

  function moveToScreen(next: WorkspaceScreen) {
    setScreenMotion((current) => {
      if (current.current === next) {
        return current
      }

      return {
        current: next,
        direction: screenIndex(next) >= screenIndex(current.current) ? 'forward' : 'backward',
        revision: current.revision + 1,
      }
    })
  }

  const brief = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline ?? emptyOutline
  const assignments = state.generation.outputs.assignments ?? emptyAssignments
  const lanePackets = state.generation.outputs.section_drafts ?? emptyLanePackets
  const mergeReport = state.generation.outputs.review_notes
  const finalArticle = state.generation.outputs.final_article
  const completedLaneCount = lanePackets.length
  const liveStatusHook = state.generation.status === 'export-ready' ? 'export-ready' : null
  const markdownPreview = finalArticle
    ? finalArticle.markdown.split('\n').slice(0, 10).join('\n')
    : ''
  const fallbackLane = lanePackets[0]?.writerId ?? assignments[0]?.writerId ?? 'writer_a'
  const activeLane =
    manualActiveLane &&
    (lanePackets.some((packet) => packet.writerId === manualActiveLane) ||
      assignments.some((assignment) => assignment.writerId === manualActiveLane))
      ? manualActiveLane
      : fallbackLane
  const activeLaneAssignment = assignments.find((item) => item.writerId === activeLane) ?? assignments[0] ?? null
  const activeLanePacket = lanePackets.find((item) => item.writerId === activeLane) ?? lanePackets[0] ?? null
  const preferredReaderPanel: 'review' | 'final' = finalArticle ? 'final' : 'review'
  const activeReaderPanel = manualReaderPanel ?? preferredReaderPanel
  const heroLaneLedger = writerLanes.map((lane) => {
    const assignment = assignments.find((item) => item.writerId === lane.id)
    const packet = lanePackets.find((item) => item.writerId === lane.id)
    const sections = assignment?.sectionIds
      .map((sectionId) => outline.find((item) => item.id === sectionId)?.title ?? sectionId)
      .slice(0, 2) ?? []

    return {
      id: lane.id,
      label: lane.label,
      status: state.generation.unitStatuses[lane.id],
      focus: assignment?.laneSummary ?? lane.focus,
      detail: packet?.handoffNote ?? lane.mergeDuty,
      sections,
      fallbackSection: laneFallbackSections[lane.id],
    }
  })

  const progressValue =
    (state.generation.completedStages.length +
      (state.generation.currentStage &&
      !state.generation.completedStages.includes(state.generation.currentStage)
        ? 0.45
        : 0)) /
    workflowStages.length

  const mergeMoment = !brief
    ? '코디네이터가 아직 공통 브리프를 고정하기 전입니다.'
    : !completedLaneCount
      ? '브리프는 고정됐고, 레인별 초안 패킷이 도착하기를 기다리는 중입니다.'
      : !mergeReport
        ? '모든 패킷이 모이면 머지 데스크가 중복과 전환을 정리합니다.'
        : finalArticle
          ? '머지가 닫혔고 최종 글까지 준비됐습니다. 이제 전달만 남았습니다.'
          : '리뷰는 끝났고 최종 글 조립이 마지막 단계에 있습니다.'

  const nextAction = !brief
    ? '브리프를 잠가 세 개 레인의 작성 범위를 먼저 정하세요.'
    : completedLaneCount < writerLanes.length
      ? '레인 카드에서 누락된 초안이 없는지 보고, 머지 전까지 진행 상황을 확인하세요.'
      : !mergeReport
        ? '머지 데스크가 중복을 정리할 때까지 레인 요약과 기준을 확인하세요.'
        : '최종 글을 검토하고 마크다운을 복사해 발행 단계로 넘기세요.'

  const screen = screenMotion.current
  const screenGuide = screenGuides[screen]
  const screenEdition = screenEditions[screen]
  const mergeReady = completedLaneCount === writerLanes.length
  const mergeDockLabel = !brief
    ? '도킹 대기'
    : !completedLaneCount
      ? '레인 준비 중'
      : mergeReady && mergeReport
        ? '도킹 완료'
        : mergeReady
          ? '리뷰 대기'
          : '도킹 진행 중'
  const screenSignals =
    screen === 'setup'
      ? [
          {
            label: '브리프 상태',
            value: brief ? '잠금 완료' : '입력 조율 중',
            note: brief ? '코디네이터가 공통 프레임을 확보했습니다.' : '주제와 독자 조건을 먼저 정리합니다.',
            tone: brief ? 'accent' : 'muted',
          },
          {
            label: '레인 배치',
            value: brief ? `${assignments.length}개 레인 준비` : '생성 전 시뮬레이션',
            note: brief ? '도입 / 구조 / 마무리 레인이 각각 구간을 맡습니다.' : '현재 입력으로 예상 레인 경계를 먼저 보여 줍니다.',
            tone: 'accent',
          },
          {
            label: '복구 경로',
            value: '대표 프리셋',
            note: '첫 화면에서는 하나의 복구 CTA만 전면에 둡니다.',
            tone: 'warm',
          },
        ]
      : screen === 'draft'
        ? [
            {
              label: '도착한 레인',
              value: `${completedLaneCount}/3`,
              note: completedLaneCount ? '도착한 패킷만 밝게 띄우고 나머지는 잠깐 숨을 고릅니다.' : '아직 패킷이 도착하지 않았습니다.',
              tone: completedLaneCount === writerLanes.length ? 'accent' : 'muted',
            },
            {
              label: '집중 레인',
              value: activeLaneAssignment ? laneStatusLabel(activeLaneAssignment.writerId) : '레인 선택 대기',
              note: activeLanePacket ? '선택된 레인의 preview와 handoff만 깊게 읽습니다.' : '상세는 도착한 레인 하나만 크게 펼칩니다.',
              tone: 'accent',
            },
            {
              label: '도킹 상태',
              value: mergeDockLabel,
              note: mergeReady ? '카피 데스크가 리뷰로 닫을 수 있는 상태입니다.' : '세 레인이 같은 톤으로 수렴할 때까지 중앙 허브가 압력을 유지합니다.',
              tone: mergeReady ? 'warm' : 'muted',
            },
          ]
        : [
            {
              label: '리더 패널',
              value: activeReaderPanel === 'review' ? '리뷰 메모' : '최종 글',
              note: '두 패널은 같은 위치를 공유해 첫 인상을 분산시키지 않습니다.',
              tone: 'accent',
            },
            {
              label: '발행 상태',
              value: statusLabel(state.generation.status),
              note: finalArticle ? '읽기용 최종 글과 전달용 마크다운을 분리해 유지합니다.' : '머지 전에는 reader surface를 열지 않습니다.',
              tone: finalArticle ? 'warm' : 'muted',
            },
            {
              label: '복구 경로',
              value: '작성 보드 복귀',
              note: '발행 직전에도 draft 보드로 되돌아가 상태를 다시 확인할 수 있습니다.',
              tone: 'muted',
            },
          ]
  const stageCards = workflowStages.map((stage, index) => {
    const visualState = stageVisualState(stage.id, state.generation)
    return (
      <button
        key={stage.id}
        type="button"
        className={`stage-pill is-${visualState}`}
        data-testid={stageTestIds[stage.id]}
        onClick={() => moveToScreen(stageScreenMap[stage.id])}
      >
        <span className={`stage-index is-${visualState}`} aria-hidden="true">
          {visualState === 'complete' ? (
            <svg className="stage-check" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5 6.8 11.8 12.5 4.8" />
            </svg>
          ) : (
            <span>{index + 1}</span>
          )}
        </span>
        <span className="stage-copy">
          <span className="stage-label">{stage.label}</span>
          <span className="stage-summary">{stage.description}</span>
          <span className="sr-only">{stageHookLabels[stage.id]}</span>
        </span>
      </button>
    )
  })
  const lastCompletedStage = [...state.generation.completedStages].at(-1)
  const lastCompletedLabel = lastCompletedStage
    ? workflowStages.find((stage) => stage.id === lastCompletedStage)?.label ?? '직전 단계'
    : '입력 전'
  const checkpointSummary = !lastCompletedStage
    ? '아직 잠긴 산출물이 없습니다. 첫 생성 이후부터 안전 지점이 이 선반에 기록됩니다.'
    : lastCompletedStage === 'final'
      ? '최종 글까지 닫혔습니다. 지금은 발행 직전 점검만 남았습니다.'
      : `${lastCompletedLabel}까지는 다시 읽어도 흐름이 끊기지 않는 안전 지점입니다.`
  const laneVelocity = !brief
    ? '레인 배정 전'
    : completedLaneCount === writerLanes.length
      ? '세 레인 도착'
      : `${completedLaneCount}/3 레인 도착`
  const editionStrip = [
    {
      label: '현재 판면',
      value: screenEdition.tail,
      note: screenTitles[screen].kicker,
    },
    {
      label: '안전 지점',
      value: lastCompletedLabel,
      note: checkpointSummary,
    },
    {
      label: '복구 동선',
      value: screenGuide.label,
      note: screenGuide.recovery,
    },
    {
      label: '도킹 속도',
      value: laneVelocity,
      note: mergeMoment,
    },
  ]
  const setupIntentCards = [
    {
      label: '독자층',
      value: audienceOptions.find((item) => item.value === state.inputs.audience)?.label ?? '미정',
      note: '설명 깊이와 예시 밀도를 조절해 각 레인의 문장 길이를 균형 있게 나눕니다.',
    },
    {
      label: '톤',
      value: toneOptions.find((item) => item.value === state.inputs.tone)?.label ?? '미정',
      note: '머지 데스크가 중복을 지울 때 어떤 문장 결을 남길지 먼저 정합니다.',
    },
    {
      label: '분량',
      value: lengthOptions.find((item) => item.value === state.inputs.length)?.label ?? '미정',
      note: '섹션 압축도와 preview 카드 개수를 결정해 첫 화면의 밀도를 미리 통제합니다.',
    },
  ]
  const publishSettings = [
    {
      label: '리더 모드',
      value: activeReaderPanel === 'review' ? '리뷰 메모' : '최종 글',
      note: 'Ghost처럼 편집 맥락을 버리지 않고 같은 자리에서 검토와 발행 직전 읽기를 오갑니다.',
    },
    {
      label: '공개 준비',
      value: finalArticle ? '복사 가능' : '머지 대기',
      note: finalArticle
        ? '짧은 마크다운 미리보기 아래에서만 내보내기를 열어 과한 전면 노출을 막습니다.'
        : '최종 글이 닫히기 전에는 발행 CTA를 비활성 상태로 유지합니다.',
    },
    {
      label: '복원 포인트',
      value: lastCompletedLabel,
      note: 'Ghost의 post history처럼 마지막 안전 지점을 별도 선반에 남겨 되돌아갈 이유를 분명히 합니다.',
    },
  ]

  let primaryLabel = '글 생성'
  let primaryDisabled = false
  let primaryHandler: () => void | Promise<void> = handleGenerate
  let primaryAriaLabel = 'Generate post'
  let secondaryLabel: string | null = null
  let secondaryDisabled = false
  let secondaryHandler: (() => void) | null = null
  let secondaryAriaLabel: string | null = null

  if (screen === 'setup') {
    primaryLabel = state.generation.status === 'loading' ? '브리프 잠그는 중' : '글 생성'
    primaryDisabled = state.generation.status === 'loading'
    primaryHandler = handleGenerate
    primaryAriaLabel = 'Generate post'
  } else if (screen === 'draft') {
    primaryLabel = mergeReport || finalArticle ? '머지 결과 보기' : '병렬 작성 진행 중'
    primaryDisabled = !(mergeReport || finalArticle)
    primaryHandler = () => moveToScreen('publish')
    primaryAriaLabel = 'Open publish view'
  } else {
    primaryLabel = finalArticle ? '마크다운 복사' : '발행 대기 중'
    primaryDisabled = !finalArticle
    primaryHandler = copyMarkdown
    primaryAriaLabel = 'Copy markdown'
    secondaryLabel = '작성 보드로 돌아가기'
    secondaryDisabled = false
    secondaryHandler = () => moveToScreen('draft')
    secondaryAriaLabel = 'Back to drafts'
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-hero">
        <div className="hero-copy-panel">
          <p className="hero-kicker">병렬 섹션</p>
          <h1>세 원고실이 동시에 쓰고, 중앙 데스크가 한 편의 글로 조율합니다</h1>
          <p className="hero-lead">
            브리프 잠금, 병렬 초안, 머지 발행만 전면에 두고 긴 근거와 평가 레이어는 뒤로 밀어
            조용한 편집실처럼 읽히게 정리했습니다.
          </p>
          <div className="hero-chips">
            <span className="meta-chip">브리프 잠금</span>
            <span className="meta-chip">뉴스와이어 도킹</span>
            <span className="meta-chip">리더 1면</span>
          </div>
          <div className="hero-ledger" aria-label="병렬 레인 개요">
            {heroLaneLedger.map((lane) => (
              <article key={lane.id} className={`hero-ledger-card is-${lane.status}`}>
                <div className="hero-ledger-top">
                  <div className="lane-topline">
                    <span className={`lane-orb is-${lane.status}`} aria-hidden="true" />
                    <span className={`lane-pill lane-${lane.status}`}>{unitStatusLabel(lane.status)}</span>
                  </div>
                  <span className="lane-section-id">{lane.label}</span>
                </div>
                <strong>{lane.focus}</strong>
                <p>{lane.detail}</p>
                {lane.sections.length ? (
                  <div className="chip-row">
                    {lane.sections.map((section) => (
                      <span key={section} className="meta-chip">
                        {section}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        <aside className="hero-status-panel" aria-live="polite">
          <div className="status-topline">
            <span className={`status-chip status-${state.generation.status}`}>{statusLabel(state.generation.status)}</span>
            <span className="status-progress">{Math.max(8, Math.round(progressValue * 100))}% 진행</span>
          </div>
          {liveStatusHook ? <span className="sr-only">{liveStatusHook}</span> : null}
          <p className="status-message">{state.generation.statusMessage}</p>
          <p className="status-next">{nextAction}</p>
          {state.copyFeedback ? <p className="status-feedback">{state.copyFeedback}</p> : null}
          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>브리프 생성이 중단됐습니다</strong>
              <p>{state.generation.errorMessage}</p>
              <button
                type="button"
                className="support-button error-recovery"
                onClick={() => moveToScreen('setup')}
              >
                입력 다듬기
              </button>
            </div>
          ) : null}
        </aside>
      </section>

      <section className="telegraph-strip" aria-label="판면 요약">
        {editionStrip.map((item) => (
          <article key={item.label} className="telegraph-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.note}</p>
          </article>
        ))}
      </section>

      <section className="rail-panel">
        <div className="rail-head">
          <div>
            <p className="section-kicker">진행 레일</p>
            <h2>현재 단계는 위에 고정하고, 본문은 한 화면씩만 열어 둡니다</h2>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span className="progress-fill" style={{ width: `${Math.max(12, progressValue * 100)}%` }} />
          </div>
        </div>
        <div className="stage-rail">{stageCards}</div>
      </section>

      <section
        key={`${screen}-${screenMotion.revision}`}
        className={`screen-stage is-${screenMotion.direction} screen-${screen}`}
      >
        <div className="screen-shell">
          <header className="screen-head">
            <div>
              <p className="section-kicker">{screenTitles[screen].kicker}</p>
              <h2>{screenTitles[screen].title}</h2>
              <p className="screen-description">{screenTitles[screen].description}</p>
            </div>
            <div className="action-cluster">
              <button
                type="button"
                className="action-button is-primary"
                aria-label={primaryAriaLabel}
                onClick={primaryHandler}
                disabled={primaryDisabled}
              >
                {primaryLabel}
              </button>
              {secondaryLabel && secondaryHandler && secondaryAriaLabel ? (
                <button
                  type="button"
                  className="action-button is-secondary"
                  aria-label={secondaryAriaLabel}
                  onClick={secondaryHandler}
                  disabled={secondaryDisabled}
                >
                  {secondaryLabel}
                </button>
              ) : null}
            </div>
          </header>

          <div className="desk-marquee" data-stagger>
            <div className="desk-marquee-copy">
              <span className="info-badge">{screenEdition.label}</span>
              <strong>{screenEdition.title}</strong>
            </div>
            <p>{screenEdition.note}</p>
            <span className="desk-marquee-tail">{screenEdition.tail}</span>
          </div>

          <div className="screen-ribbon" data-stagger>
            <div>
              <span className="info-badge">{screenGuide.label}</span>
              <p>{screenGuide.note}</p>
            </div>
            <p>{screenGuide.recovery}</p>
          </div>
          <div className="signal-strip" data-stagger>
            {screenSignals.map((signal) => (
              <article key={signal.label} className={`signal-card is-${signal.tone}`}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <p>{signal.note}</p>
              </article>
            ))}
          </div>

          {screen === 'setup' ? (
            <div className="screen-grid screen-grid-setup">
              <article className="panel-sheet" data-stagger>
                <div className="panel-head">
                  <p className="section-kicker">입력 패널</p>
                  <h3>공통 브리프를 잠그면 바로 병렬 레인으로 넘어갑니다</h3>
                </div>
                <form className="brief-form">
                  <label className={`field-control ${state.inputs.topic ? 'is-filled' : ''}`}>
                    <span className="field-label">주제</span>
                    <textarea
                      aria-label="Topic"
                      name="topic"
                      rows={5}
                      value={state.inputs.topic}
                      onChange={(event) => updateField('topic', event.target.value)}
                    />
                  </label>
                  <label className={`field-control ${state.inputs.audience ? 'is-filled' : ''}`}>
                    <span className="field-label">독자층</span>
                    <select
                      aria-label="Audience"
                      name="audience"
                      value={state.inputs.audience}
                      onChange={(event) => updateField('audience', event.target.value as Audience)}
                    >
                      {audienceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-row">
                    <label className={`field-control ${state.inputs.tone ? 'is-filled' : ''}`}>
                      <span className="field-label">톤</span>
                      <select
                        aria-label="Tone"
                        name="tone"
                        value={state.inputs.tone}
                        onChange={(event) => updateField('tone', event.target.value as Tone)}
                      >
                        {toneOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={`field-control ${state.inputs.length ? 'is-filled' : ''}`}>
                      <span className="field-label">분량</span>
                      <select
                        aria-label="Length"
                        name="length"
                        value={state.inputs.length}
                        onChange={(event) => updateField('length', event.target.value as Length)}
                      >
                        {lengthOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </form>
                <p className="panel-note">
                  이 하네스는 병렬 섹션 오케스트레이션 자체를 검증합니다. 그래서 첫 화면은 입력과
                  방향 결정만 남기고, 실제 산출물은 뒤 단계에서 열리게 바꿨습니다.
                </p>
                <div className="intent-grid">
                  {setupIntentCards.map((card) => (
                    <article key={card.label} className="intent-card">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <p>{card.note}</p>
                    </article>
                  ))}
                </div>
              </article>

              <div className="stack-column">
                <article className="panel-sheet" data-stagger>
                  <div className="panel-head">
                    <p className="section-kicker">예상 레인 배정</p>
                    <h3>브리프를 잠그기 전에도 세 레인의 소유 경계를 먼저 보여 줍니다</h3>
                  </div>
                  <div className="lane-ledger-list">
                    {heroLaneLedger.map((lane) => (
                      <article key={lane.id} className={`lane-ledger-card is-${lane.status}`}>
                        <div className="hero-ledger-top">
                          <div className="lane-topline">
                            <span className={`lane-orb is-${lane.status}`} aria-hidden="true" />
                            <span className={`lane-pill lane-${lane.status}`}>{unitStatusLabel(lane.status)}</span>
                          </div>
                          <span className="lane-section-id">{lane.label}</span>
                        </div>
                        <strong>{lane.focus}</strong>
                        <p className="lane-ledger-copy">{lane.detail}</p>
                        <div className="chip-row">
                          {(lane.sections.length ? lane.sections : [lane.fallbackSection]).map((section) => (
                            <span key={section} className="meta-chip">
                              {section}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="summary-grid compact-summary-grid">
                    <div className="summary-card">
                      <span>독자층</span>
                      <strong>{audienceOptions.find((item) => item.value === state.inputs.audience)?.label}</strong>
                    </div>
                    <div className="summary-card">
                      <span>톤</span>
                      <strong>{toneOptions.find((item) => item.value === state.inputs.tone)?.label}</strong>
                    </div>
                    <div className="summary-card">
                      <span>분량</span>
                      <strong>{lengthOptions.find((item) => item.value === state.inputs.length)?.label}</strong>
                    </div>
                  </div>
                </article>

                <article className="panel-sheet" data-stagger>
                  <div className="panel-head">
                    <p className="section-kicker">빠른 시작</p>
                    <h3>대표 복구 CTA만 먼저 두고, 전체 프리셋은 필요할 때만 펼칩니다</h3>
                  </div>
                  <div className="empty-state compact-empty">
                    <span className="empty-icon" aria-hidden="true">◇</span>
                    <h3>아직 병렬 레인이 열리지 않았습니다</h3>
                    <p>
                      대표 프리셋 하나를 불러온 뒤 바로 생성해도 됩니다. 이 모듈이 빈 상태와 복구
                      진입점을 함께 맡습니다.
                    </p>
                    <button
                      type="button"
                      className="support-button"
                      onClick={() =>
                        applyPreset(
                          topicPresets[1].title,
                          topicPresets[1].audience,
                          topicPresets[1].tone,
                          topicPresets[1].length,
                        )
                      }
                    >
                      대표 프리셋 적용
                    </button>
                  </div>
                  <details className="preset-library">
                    <summary className="drawer-summary preset-library-summary">
                      <div>
                        <p className="section-kicker">프리셋 서랍</p>
                        <h3>주제 프리셋 전체 보기</h3>
                      </div>
                      <p>첫 화면 밀도를 줄이기 위해 빈 상태와 복구 버튼만 먼저 두고, 전체 프리셋은 접어 둡니다.</p>
                    </summary>
                    <div className="drawer-body">
                      <div className="preset-grid">
                        {topicPresets.map((preset) => (
                          <button
                            key={preset.title}
                            type="button"
                            className="preset-card"
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
                </article>
              </div>
            </div>
          ) : null}

          {screen === 'draft' ? (
            <div className="screen-grid screen-grid-draft">
              <div className="stack-column">
                <article className="panel-sheet merge-graphic-card" data-stagger>
                  <div className="panel-head panel-head-inline">
                    <div>
                      <p className="section-kicker">합류 레일</p>
                      <h3>세 레인이 아래 한 지점으로 접히며 현재 합류 압력을 보여줍니다</h3>
                    </div>
                    <p className="panel-inline-copy">{mergeMoment}</p>
                  </div>
                  <div className="merge-graphic" aria-hidden="true">
                    <span className={`merge-spine is-${mergeReady ? 'ready' : state.generation.status === 'loading' ? 'loading' : 'pending'}`} />
                    {writerLanes.map((lane) => {
                      const laneStatus = state.generation.unitStatuses[lane.id]
                      return (
                        <div key={lane.id} className={`merge-arm arm-${lane.id} is-${laneStatus}`}>
                          <span className="merge-ticket">{lane.label}</span>
                          <span className="merge-node" />
                        </div>
                      )
                    })}
                    <span className="merge-hub-ticket">머지 데스크</span>
                    <span className={`merge-hub is-${mergeReport ? 'complete' : state.generation.status === 'loading' ? 'loading' : 'pending'}`} />
                  </div>
                  <div className={`merge-dock-card is-${mergeReady ? 'ready' : 'pending'}`}>
                    <div className="merge-dock-topline">
                      <span className="status-chip status-populated">{mergeDockLabel}</span>
                      <span className="status-progress">{completedLaneCount}/3 레인 도착</span>
                    </div>
                    <strong>{mergeReady ? '카피 데스크가 바로 리뷰를 닫을 수 있는 상태입니다.' : '모든 레인이 같은 톤으로 도킹될 때까지 흐름을 유지합니다.'}</strong>
                    <p>{nextAction}</p>
                  </div>
                </article>

                <div className="lane-grid">
                  {writerLanes.map((lane, index) => {
                    const assignment = assignments.find((item) => item.writerId === lane.id)
                    const packet = lanePackets.find((item) => item.writerId === lane.id)
                    const laneStatus = state.generation.unitStatuses[lane.id]

                    return (
                      <button
                        key={lane.id}
                        type="button"
                        className={`lane-card is-${laneStatus} ${activeLane === lane.id ? 'is-selected' : ''}`}
                        onClick={() => setManualActiveLane(lane.id)}
                        aria-pressed={activeLane === lane.id}
                        data-stagger
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="lane-card-top">
                          <div className="lane-topline">
                            <span className={`lane-orb is-${laneStatus}`} aria-hidden="true" />
                            <span className={`lane-pill lane-${laneStatus}`}>{unitStatusLabel(laneStatus)}</span>
                          </div>
                          <span className="lane-section-id">0{index + 1}</span>
                        </div>
                        <h3>{lane.label}</h3>
                        <p className="lane-focus-copy">{lane.focus}</p>
                        {assignment ? (
                          <div className="chip-row">
                            {assignment.sectionIds.map((sectionId) => {
                              const section = outline.find((item) => item.id === sectionId)
                              return (
                                <span key={sectionId} className="meta-chip">
                                  {section?.title ?? sectionId}
                                </span>
                              )
                            })}
                          </div>
                        ) : null}
                        {packet ? (
                          <p className="lane-summary">{packet.statusSummary}</p>
                        ) : (
                          <div className="skeleton-stack" aria-hidden="true">
                            <span className="skeleton-line" />
                            <span className="skeleton-line is-short" />
                            <span className="skeleton-line" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="stack-column">
                <article className="panel-sheet" data-stagger>
                  <div className="panel-head">
                    <p className="section-kicker">선택된 레인</p>
                    <h3>{activeLaneAssignment ? laneStatusLabel(activeLaneAssignment.writerId) : '레인을 고르면 상세가 열립니다'}</h3>
                  </div>
                  {activeLaneAssignment ? (
                    <div className="detail-stack">
                      <p className="detail-copy">{activeLaneAssignment.ownershipRule}</p>
                      <div className="info-strip">
                        <span className="info-badge">소유 범위</span>
                        <p>{activeLaneAssignment.laneSummary}</p>
                      </div>
                      {activeLanePacket ? (
                        <>
                          <div className="info-strip">
                            <span className="info-badge">상태 요약</span>
                            <p>{activeLanePacket.statusSummary}</p>
                          </div>
                          <div className="preview-stack">
                            {activeLanePacket.draftPreview.map((preview) => (
                              <article key={preview.id} className="preview-card">
                                <h4>{preview.title}</h4>
                                <p>{preview.deck}</p>
                                <ul className="compact-list">
                                  {preview.bullets.map((bullet) => (
                                    <li key={bullet}>{bullet}</li>
                                  ))}
                                </ul>
                                <p className="preview-takeaway">{preview.takeaway}</p>
                              </article>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="empty-state compact-empty">
                          <span className="empty-icon" aria-hidden="true">⋯</span>
                          <h3>이 레인의 초안은 아직 작성 중입니다</h3>
                          <p>머지 전에는 skeleton과 상태 요약만 보여 주고, 실제 패킷은 도착한 뒤에만 펼칩니다.</p>
                          <button type="button" className="support-button" onClick={() => moveToScreen('setup')}>
                            브리프 화면으로 돌아가기
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="empty-state compact-empty">
                      <span className="empty-icon" aria-hidden="true">◎</span>
                      <h3>레인 배정 전입니다</h3>
                      <p>브리프를 먼저 잠가야 각 레인의 소유 범위와 상세 패킷이 열립니다.</p>
                      <button type="button" className="support-button" onClick={() => moveToScreen('setup')}>
                        브리프 작성으로 이동
                      </button>
                    </div>
                  )}
                </article>

                <article className="panel-sheet" data-stagger>
                  <div className="panel-head">
                    <p className="section-kicker">머지 데스크</p>
                    <h3>{mergeReport ? '합류 기준이 정리됐습니다' : '카피 데스크가 보고 있는 기준'}</h3>
                  </div>
                  <div className="detail-stack">
                    <p className="detail-copy">{nextAction}</p>
                    {brief ? (
                      <div className="criteria-grid">
                        {brief.mergeCriteria.map((criterion) => (
                          <article key={criterion.label} className="criterion-card">
                            <h4>{criterion.label}</h4>
                            <p>{criterion.detail}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state compact-empty">
                        <span className="empty-icon" aria-hidden="true">↺</span>
                        <h3>머지 기준이 아직 없습니다</h3>
                        <p>코디네이터가 리서치와 아웃라인을 먼저 고정하면 이 자리에 합류 기준이 채워집니다.</p>
                        <button type="button" className="support-button" onClick={() => moveToScreen('setup')}>
                          입력 다시 보기
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              </div>
            </div>
          ) : null}

          {screen === 'publish' ? (
            <div className="screen-grid screen-grid-publish final-panel">
              <div className="stack-column">
                <article className="panel-sheet" data-stagger>
                  <div className="reader-toggle-group" role="tablist" aria-label="출력 패널 전환">
                    <button
                      type="button"
                      className={`reader-toggle ${activeReaderPanel === 'review' ? 'is-active' : ''}`}
                      role="tab"
                      id="reader-tab-review"
                      aria-controls="reader-panel-review"
                      aria-selected={activeReaderPanel === 'review'}
                      onClick={() => setManualReaderPanel('review')}
                    >
                      리뷰 메모
                    </button>
                    <button
                      type="button"
                      className={`reader-toggle ${activeReaderPanel === 'final' ? 'is-active' : ''}`}
                      role="tab"
                      id="reader-tab-final"
                      aria-controls="reader-panel-final"
                      aria-selected={activeReaderPanel === 'final'}
                      onClick={() => finalArticle && setManualReaderPanel('final')}
                    >
                      최종 글
                    </button>
                  </div>
                </article>

                {mergeReport || finalArticle ? (
                  activeReaderPanel === 'review' ? (
                    <div key="review-panel" className="reader-panel-stage" data-panel="review" data-stagger>
                      <article
                        id="reader-panel-review"
                        className="panel-sheet"
                        role="tabpanel"
                        aria-labelledby="reader-tab-review"
                      >
                        <div className="panel-head">
                          <p className="section-kicker">리뷰 메모</p>
                          <h3>카피 데스크는 중복, 전환, 톤 밀도를 이 세 축으로 정리합니다</h3>
                        </div>
                        {mergeReport ? (
                          <div className="detail-stack">
                            <ul className="compact-list">
                              {mergeReport.reviewNotes.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                            <div className="criteria-grid">
                              {[mergeReport.dedupeFix, mergeReport.transitionFix, mergeReport.toneFix].map((fix) => (
                                <article key={fix.label} className="criterion-card">
                                  <h4>{fix.label}</h4>
                                  <p><strong>이전</strong> {fix.before}</p>
                                  <p><strong>이후</strong> {fix.after}</p>
                                  <p>{fix.rationale}</p>
                                </article>
                              ))}
                            </div>
                            <article className="panel-inset">
                              <p className="section-kicker">최종화 메모</p>
                              <p>{mergeReport.finalizationNote}</p>
                            </article>
                          </div>
                        ) : null}
                      </article>
                    </div>
                  ) : (
                    <div key="final-panel" className="reader-panel-stage" data-panel="final" data-stagger>
                      <article
                        id="reader-panel-final"
                        className="panel-sheet"
                        role="tabpanel"
                        aria-labelledby="reader-tab-final"
                      >
                        <div className="panel-head">
                          <p className="section-kicker">최종 글</p>
                          <h3>독자용 화면을 먼저 보여 주고 원본 전달본은 뒤로 밀어 둡니다</h3>
                        </div>
                        {finalArticle ? (
                          <div className="article-stack">
                            <article className="article-reader">
                              <p className="article-kicker">편집 완료</p>
                              <h3>{finalArticle.title}</h3>
                              <p className="article-intro">{finalArticle.intro}</p>
                              {finalArticle.mergedSections.map((section) => (
                                <section key={section.id} className="article-section">
                                  <h4>{section.title}</h4>
                                  <p className="article-deck">{section.deck}</p>
                                  {section.paragraphs.map((paragraph) => (
                                    <p key={paragraph}>{paragraph}</p>
                                  ))}
                                  <p className="preview-takeaway">{section.takeaway}</p>
                                </section>
                              ))}
                              <div className="article-closing">
                                <h4>마무리 체크</h4>
                                <p>{finalArticle.closing}</p>
                              </div>
                            </article>
                          </div>
                        ) : null}
                      </article>
                    </div>
                  )
                ) : (
                  <article className="empty-state" data-stagger>
                    <span className="empty-icon" aria-hidden="true">✦</span>
                    <h3>머지 데스크가 아직 닫히지 않았습니다</h3>
                    <p>리뷰 메모와 최종 글은 머지가 끝난 뒤에만 열립니다. 지금은 작성 화면에서 레인 상태를 먼저 확인하세요.</p>
                    <button type="button" className="support-button" onClick={() => moveToScreen('draft')}>
                      작성 보드로 돌아가기
                    </button>
                  </article>
                )}
              </div>

              <div className="stack-column">
                <article className="panel-sheet" data-stagger>
                  <div className="panel-head">
                    <p className="section-kicker">발행 체크</p>
                    <h3>발행 직전에는 요약된 설정과 다음 행동만 남깁니다</h3>
                  </div>
                  <div className="summary-grid">
                    <div className="summary-card">
                      <span>독자층</span>
                      <strong>{audienceOptions.find((item) => item.value === state.inputs.audience)?.label}</strong>
                    </div>
                    <div className="summary-card">
                      <span>톤</span>
                      <strong>{toneOptions.find((item) => item.value === state.inputs.tone)?.label}</strong>
                    </div>
                    <div className="summary-card">
                      <span>분량</span>
                      <strong>{lengthOptions.find((item) => item.value === state.inputs.length)?.label}</strong>
                    </div>
                  </div>
                  <ul className="compact-list">
                    <li>리뷰 메모와 최종 글은 동시에 열지 않습니다.</li>
                    <li>마크다운 원본 내보내기는 미리보기 아래에서만 확장됩니다.</li>
                    <li>영문 훅은 접근성·테스트 전용 계층에만 남깁니다.</li>
                  </ul>
                  <div className="publish-meta-grid">
                    {publishSettings.map((item) => (
                      <article key={item.label} className="publish-meta-card">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <p>{item.note}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="panel-sheet" data-stagger>
                  <div className="panel-head">
                    <p className="section-kicker">내보내기 미리보기</p>
                    <h3>기본 화면에는 짧은 미리보기만 남깁니다</h3>
                  </div>
                  <pre className="markdown-preview">
                    {markdownPreview || '최종 글이 준비되면 여기에 마크다운 미리보기가 나타납니다.'}
                  </pre>
                </article>

                <details className="panel-sheet evidence-drawer" data-stagger>
                  <summary className="drawer-summary">
                    <div>
                      <p className="section-kicker">보조 근거 레이어</p>
                      <h3>평가와 산출물 계약은 필요할 때만 엽니다</h3>
                    </div>
                    <p>제품 화면보다 벤치마크 의무가 먼저 보이지 않도록 가장 아래로 밀어 둡니다.</p>
                  </summary>
                  <div className="drawer-body">
                    <div className="detail-stack">
                      <h4>필수 산출물</h4>
                      <div className="criteria-grid">
                        {deliverables.map((item) => (
                          <article key={item.id} className="criterion-card">
                            <h4>{item.title}</h4>
                            <p>{item.description}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                    <div className="detail-stack">
                      <h4>검토 렌즈</h4>
                      <ul className="compact-list">
                        {reviewLenses.map((lens) => (
                          <li key={lens}>{lens}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="detail-stack">
                      <h4>평가 체크리스트</h4>
                      <ul className="compact-list">
                        {evaluationChecklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

export default App
