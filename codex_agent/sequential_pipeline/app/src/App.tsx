import { useReducer, useRef, useState } from 'react'
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

function roleStatusLabel(status: 'complete' | 'current' | 'pending') {
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
    return '마크다운을 복사하거나, 필요할 때만 보조 근거 서랍을 열어 주세요.'
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
  const excerptLines = lines.slice(0, 9)

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
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const runRef = useRef(0)

  const research = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline
  const writerOutput = state.generation.outputs.section_drafts
  const reviewerOutput = state.generation.outputs.review_notes
  const handoffs = state.generation.outputs.handoffs ?? []

  const roleTracker = pipelineRoles.map((role) => {
    const isComplete = state.generation.completedRoles.includes(role.id)
    const isCurrent = state.generation.currentRole === role.id && state.generation.status !== 'error'
    const handoff = handoffs.find((item) => item.from === role.id)
    return {
      ...role,
      status: isComplete ? 'complete' : isCurrent ? 'current' : 'pending',
      handoffSummary:
        role.id === 'reviewer'
          ? reviewerOutput?.finalizationNote ??
            '마지막 편집 인계가 닫히면 리뷰어 잠금 메모가 여기에 남습니다.'
          : handoff?.outputSummary ?? '이 역할이 닫히면 다음 인계 메모가 여기에 남습니다.',
    }
  })

  const selectedRoleMeta = roleTracker.find((role) => role.id === state.selectedRole) ?? roleTracker[0]
  const currentRoleMeta =
    roleTracker.find((role) => role.id === state.generation.currentRole) ??
    (state.generation.status === 'export-ready'
      ? {
          id: 'reviewer',
          label: '리뷰어',
          stageLabel: '최종 원고',
          description: '리뷰 반영 원고가 잠겨 이제 바로 내보낼 수 있습니다.',
          handoffLabel: '내보내기',
          handoffSummary: reviewerOutput?.finalizationNote ?? '복사 가능한 최종 원고가 준비되었습니다.',
          status: 'complete',
        }
      : selectedRoleMeta)
  const nextRoleMeta =
    state.generation.status === 'export-ready'
      ? null
      : state.generation.status === 'review-complete'
      ? {
          label: '발행 준비',
          stageLabel: '최종 원고',
          handoffSummary:
            '리뷰 반영 원고를 확인한 뒤 복사와 공유 전 마지막 읽기 흐름만 정리합니다.',
        }
        : roleTracker.find((role) => role.status === 'pending') ?? null
  const statusLabel = statusLabels[state.generation.status]
  const currentStageLabel = state.generation.currentStage
    ? stageLabels[state.generation.currentStage]
    : '자료 요약'
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
  const nextPendingRoleId =
    state.generation.status === 'export-ready' || state.generation.status === 'review-complete'
      ? null
      : roleTracker.find((role) => role.status === 'pending')?.id ?? null
  const relaySignals = [
    {
      label: '현재 단계',
      value: `${currentRoleMeta.label} · ${currentRoleMeta.stageLabel}`,
      note:
        state.generation.status === 'initial'
          ? '첫 브리프 잠금 전이라 리서처 데스크가 조용히 대기 중입니다.'
          : currentRoleMeta.handoffSummary,
      tone:
        state.generation.status === 'export-ready'
          ? 'complete'
          : state.generation.status === 'error'
            ? 'pending'
            : 'active',
    },
    {
      label: nextRoleMeta ? '다음 단계' : '발행 준비',
      value: nextRoleMeta ? `${nextRoleMeta.label} · ${nextRoleMeta.stageLabel}` : '복사와 마지막 읽기',
      note:
        nextRoleMeta?.handoffSummary ??
        '최종 원고가 잠겨 복사와 마지막 읽기만 남았습니다.',
      tone: nextRoleMeta ? 'next' : 'complete',
    },
  ] as const
  const heroSequenceStops = roleTracker.map((role, index) => {
    const tone =
      role.status === 'complete'
        ? 'complete'
        : role.status === 'current'
          ? 'current'
          : role.id === nextPendingRoleId
            ? 'next'
            : 'pending'

    const statusText =
      tone === 'complete'
        ? '잠금 완료'
        : tone === 'current'
          ? '현재 인계'
          : tone === 'next'
            ? '다음 인계'
            : '대기'

    const note =
      tone === 'complete'
        ? role.handoffSummary
        : tone === 'current'
          ? role.handoffSummary
          : tone === 'next'
            ? `${role.description} ${role.handoffLabel} 준비만 남았습니다.`
            : role.description

    return {
      id: role.id,
      index,
      tone,
      statusText,
      label: `${role.label} · ${role.stageLabel}`,
      note,
    }
  })
  const routeNotes = [
    {
      label: '현재 단계',
      value: `${currentRoleMeta.label} · ${currentRoleMeta.stageLabel}`,
      note:
        state.generation.status === 'initial'
          ? '첫 브리프 잠금 전이라 리서처 데스크가 조용히 대기 중입니다.'
          : currentRoleMeta.handoffSummary,
    },
    {
      label: nextRoleMeta ? '다음 단계' : '발행 준비',
      value: nextRoleMeta ? `${nextRoleMeta.label} · ${nextRoleMeta.stageLabel}` : '복사와 마지막 읽기',
      note:
        nextRoleMeta?.handoffSummary ??
        '리뷰 반영 원고가 잠겨 복사와 마지막 읽기만 남았습니다.',
    },
    {
      label: '발행 준비',
      value: state.generation.outputs.final_post ? '복사 가능한 발행본' : '리뷰 잠금 후 공개',
      note: state.generation.outputs.final_post
        ? '짧은 발행 요약과 복사 동작을 먼저 두고 전체 원고는 접힌 읽기 면 아래에 둡니다.'
        : '리뷰어 단계가 닫혀야 발행대와 복사 버튼이 함께 열립니다.',
    },
  ] as const
  const routeRules = [
    {
      label: '레일 규칙 01',
      title: '이전 출력이 다음 입력이 되도록 인계를 끊지 않기',
      note: '자료 요약에서 검토 메모까지 한 줄 계약으로 이어 두고, 각 단계는 앞단의 요약을 입력으로만 사용합니다.',
    },
    {
      label: '레일 규칙 02',
      title: '첫 화면에는 현재와 다음 데스크만 전면 노출',
      note: '긴 산출물과 실행 근거는 아래 작업면과 보조 서랍으로 내려 첫 스캔 밀도를 강하게 눌렀습니다.',
    },
    {
      label: '레일 규칙 03',
      title: '발행본은 리뷰 잠금 뒤에만 복사 가능',
      note: '리뷰어가 수정 메모를 닫기 전에는 발행 요약과 복사 버튼이 완전히 열리지 않도록 순서를 고정합니다.',
    },
  ] as const
  const selectedRoleTone =
    state.generation.completedRoles.includes(selectedRoleMeta.id)
      ? 'complete'
      : state.generation.currentRole === selectedRoleMeta.id && state.generation.status !== 'error'
        ? 'current'
        : selectedRoleMeta.id === nextPendingRoleId
          ? 'next'
          : 'pending'
  const checkpointCards = [
    {
      label: '선택한 단계',
      value: `${selectedRoleMeta.label} · ${selectedRoleMeta.stageLabel}`,
      note: selectedRoleMeta.description,
      tone: selectedRoleTone,
    },
    {
      label: nextRoleMeta ? '다음 단계' : '발행 준비',
      value: nextRoleMeta ? `${nextRoleMeta.label} · ${nextRoleMeta.stageLabel}` : '복사와 마지막 읽기',
      note:
        nextRoleMeta?.handoffSummary ??
        '리뷰 반영 원고가 잠겨 복사와 마지막 읽기만 남았습니다.',
      tone: nextRoleMeta ? 'next' : 'complete',
    },
  ] as const
  const checkpointFacts = [
    {
      label: '잠긴 입력 계약',
      value: briefPressureLabel,
    },
    {
      label: '완료 단계',
      value:
        state.generation.status === 'export-ready'
          ? '4/4 단계 완료'
          : `${completedCount}/4 단계 완료`,
    },
    {
      label: '발행 준비',
      value: state.generation.outputs.final_post ? '복사 가능' : '리뷰 잠금 전',
    },
  ] as const
  const manifestPreview: Record<string, unknown> = {
    워크스페이스: '순차 파이프라인',
    현재_단계: currentStageLabel,
    상태: statusLabel,
    완료_역할: state.generation.completedRoles.map((role) => formatRoleLabel(role)),
  }
  const artifactPreview: Record<string, unknown> = {
    준비된_화면:
      state.generation.status === 'export-ready' ? ['데스크톱 미리보기', '모바일 미리보기'] : [],
    발행_상태: state.generation.outputs.final_post ? ['최종 원고 잠금 해제'] : ['리뷰 잠금 전'],
    다음_메모: [actionHint],
    남길_묶음: deliverables.map((item) => item.title),
  }
  const scorePreview: Record<string, number> = {
    과업_적합도: baseScorePreview.task_success,
    경험_선명도: state.generation.outputs.final_post ? 9 : baseScorePreview.ux_score,
    흐름_가독성: baseScorePreview.flow_clarity,
    시각_완성도: baseScorePreview.visual_quality,
    반응형_준비도: baseScorePreview.responsiveness,
    접근성_기본점수: baseScorePreview.a11y_score,
    프로세스_준수도: baseScorePreview.process_adherence,
    종합_점수: state.generation.outputs.final_post ? 8.9 : baseScorePreview.overall_score,
  }
  const readerChecks = [
    {
      label: '발행 상태',
      value: state.generation.outputs.final_post ? '복사 가능' : '리뷰 잠금 전',
      note: '리뷰어 잠금이 끝난 뒤에만 발행본 복사 버튼이 열립니다.',
    },
    {
      label: '첫 읽기',
      value: '요약 우선',
      note: '긴 본문보다 발행 메모와 짧은 요약을 먼저 읽도록 설계했습니다.',
    },
    {
      label: '보조 면',
      value: '원고 · 근거 서랍',
      note: '전체 원고와 실행 근거는 필요할 때만 여는 이차 표면으로 분리했습니다.',
    },
  ] as const

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId

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
      message: '내보내기 준비 | 최종 원고가 잠겼습니다. 경로를 확인했다면 마크다운을 복사하세요.',
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
        message: '최종 마크다운을 복사했습니다. 리뷰 반영 원고와 같은 내용입니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message:
          '이 브라우저 맥락에서는 클립보드 복사가 실패했지만, 아래 최종 원고는 그대로 읽을 수 있습니다.',
      })
    }
  }

  return (
    <main className="pipeline-shell">
      <section className="hero-layout">
        <article className="hero-card">
          <div className="hero-headline-grid">
            <div className="hero-headline-copy">
              <p className="eyebrow">야간 편집 레일</p>
              <h1>한 장의 원고가 네 단계를 따라 잠기는 인계 레일</h1>
              <p className="lead">
                리서처부터 리뷰어까지 같은 브리프가 순서대로 전달됩니다. 첫 화면은 현재
                단계, 다음 단계, 발행 준비만 남겨 단계 흐름이 먼저 읽히도록 정리했습니다.
              </p>

              <p className="hero-contract-line">
                입력 계약 · {briefPressureLabel} · 한 번 잠그면 네 데스크가 같은 기준으로
                움직입니다.
              </p>

              <div className="hero-actions">
                <button
                  type="button"
                  className="primary-button"
                  aria-label="Generate post"
                  data-testid="Generate post"
                  onClick={handleGenerate}
                  disabled={state.generation.status === 'loading'}
                >
                  {state.generation.status === 'loading' ? '생성 중...' : '글 생성 시작'}
                </button>
              </div>
            </div>

            <article className="hero-closing-card">
              <span className="signal-label">인계 관제석</span>
              <strong>
                {state.generation.status === 'export-ready'
                  ? '네 단계가 끝났습니다. 이제 발행본 확인과 복사만 남았습니다.'
                  : `현재 단계는 ${currentRoleMeta.label}이며, 다음 단계는 ${nextRoleMeta?.label ?? '발행 준비'}입니다.`}
              </strong>
              <p>
                긴 산출물과 근거는 아래 작업면과 보조 서랍으로 내리고, 첫 줄에는 현재 단계와
                다음 단계만 남겨 인계 순서를 바로 읽을 수 있게 정리했습니다.
              </p>

              <div className="hero-window-list">
                {relaySignals.map((signal, index) => (
                  <article
                    key={signal.label}
                    className={`hero-window-card hero-window-${signal.tone}`}
                  >
                    <div className="hero-window-head">
                      <span className="hero-window-step">{`0${index + 1}`}</span>
                      <span className="signal-label">{signal.label}</span>
                    </div>
                    <strong>{signal.value}</strong>
                    <p>{signal.note}</p>
                  </article>
                ))}
              </div>
            </article>
          </div>

          <div className="hero-storyband">
            <div className="hero-sequence" aria-label="네 단계 인계 레일">
              {heroSequenceStops.map((stop, index) => (
                <article key={stop.id} className={`hero-sequence-card hero-sequence-${stop.tone}`}>
                  <span className="hero-sequence-index">{`0${index + 1}`}</span>
                  <span className="hero-sequence-status">{stop.statusText}</span>
                  <div className="hero-sequence-copy">
                    <strong>{stop.label}</strong>
                    <p>{stop.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="status-banner" aria-live="polite">
            <span className="sr-only">
              {state.generation.status === 'export-ready'
                ? 'export-ready'
                : state.generation.status === 'review-complete'
                  ? 'review-complete'
                  : stageHookLabels[state.generation.currentStage ?? 'research']}
            </span>
            <strong>
              <span className={`status-pill status-${state.generation.status}`}>{statusLabel}</span>
              {currentStageLabel}
            </strong>
            <p>{state.generation.statusMessage}</p>
            <p className="copy-feedback">{state.copyFeedback || actionHint}</p>
          </div>
        </article>

        <aside className="control-card">
          <div className="section-head">
            <p className="eyebrow">브리프 데스크</p>
            <h2>첫 인계 전에 같은 기준표를 잠그기</h2>
          </div>

          <form className="form-grid">
            <label>
              <span>주제</span>
              <textarea
                name="topic"
                aria-label="Topic"
                value={state.inputs.topic}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'topic',
                  value: event.target.value,
                })}
              />
            </label>

            <label>
              <span>독자</span>
              <select
                name="audience"
                aria-label="Audience"
                value={state.inputs.audience}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'audience',
                  value: event.target.value as Audience,
                })}
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
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'tone',
                  value: event.target.value as Tone,
                })}
              >
                <option value="clear">명료하게</option>
                <option value="pragmatic">실무적으로</option>
                <option value="opinionated">단호하게</option>
              </select>
            </label>

            <label>
              <span>분량</span>
              <select
                name="length"
                aria-label="Length"
                value={state.inputs.length}
                onChange={(event) => dispatch({
                  type: 'update-input',
                  field: 'length',
                  value: event.target.value as Length,
                })}
              >
                <option value="short">짧게</option>
                <option value="medium">보통</option>
                <option value="long">길게</option>
              </select>
            </label>
          </form>

          <div className="brief-sheet">
            <strong className="brief-label">지금 잠길 입력 계약</strong>
            <p className="brief-topic">{state.inputs.topic}</p>
            <div className="brief-chip-row">
              <span className="brief-chip">독자 · {audienceUiLabels[state.inputs.audience]}</span>
              <span className="brief-chip">톤 · {toneUiLabels[state.inputs.tone]}</span>
              <span className="brief-chip">분량 · {lengthUiLabels[state.inputs.length]}</span>
            </div>
            <p className="brief-note">
              이 계약이 리서처에서 리뷰어까지 같은 압력으로 전달되며, 단계마다 산출물만
              더 구체적으로 잠깁니다.
            </p>
          </div>
        </aside>
      </section>

      <details
        className="preset-drawer"
        open={presetOpen}
        onToggle={(event) => setPresetOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="preset-summary">
          <div className="preset-summary-copy">
            <p className="eyebrow">추천 브리프</p>
            <h2>지금 바로 잠가 볼 주제 묶음</h2>
            <p>첫 화면은 가볍게 두고, 필요할 때만 샘플 브리프를 펼쳐 바로 시작합니다.</p>
          </div>
          <span className="preset-toggle">{presetOpen ? '접기' : '열기'}</span>
        </summary>

        <section className="preset-row" aria-label="Benchmark topics">
          {topicPresets.map((preset) => (
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
            >
              <strong>{preset.title}</strong>
              <span>{preset.rationale}</span>
            </button>
          ))}
        </section>
      </details>

      <section className="panel-card">
        <div className="section-head">
          <p className="eyebrow">레일 보드</p>
          <h2 aria-label="Research results Outline Section drafts Review notes Final post">
            현재 단계와 다음 단계를 한 줄로 읽는 레일
          </h2>
          <p className="tracker-intro">
            네 단계 전체를 보이되 지금 필요한 단계만 진하게 남겼습니다. 각 카드를 누르면 바로
            아래 작업면으로 이어집니다.
          </p>
        </div>

        <div className="route-board-shell">
          <article className="route-progress-card route-spotlight">
            <div className="route-progress-top">
              <div>
                <span className="signal-label">잠금 진행도</span>
                <strong>
                  {state.generation.status === 'export-ready'
                    ? '모든 인계 잠금 완료'
                    : `${completedCount}/4 인계 잠금`}
                </strong>
              </div>
              <span className="route-progress-value">{Math.round(progressPercent)}%</span>
            </div>
            <div className="route-progress-track" aria-hidden="true">
              <span className="route-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="summary-text">
              {state.generation.status === 'initial'
                ? '브리프를 잠그면 리서처부터 리뷰어까지 같은 계약으로 레일이 켜집니다.'
                : state.generation.status === 'export-ready'
                  ? '리뷰어 잠금까지 끝났으므로 이제 발행본 확인과 복사만 남았습니다.'
                  : actionHint}
            </p>
            <div className="route-pulse-grid" aria-label="현재 인계와 다음 이동">
              {routeNotes.map((item) => (
                <article key={item.label} className="route-pulse-card">
                  <span className="signal-label">{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          </article>

          <div className="route-stage-column">
            <div className="tracker-grid">
              {roleTracker.map((role, index) => (
                <button
                  key={role.id}
                  type="button"
                  className="tracker-card-button"
                  aria-pressed={state.selectedRole === role.id}
                  aria-current={role.status === 'current' ? 'step' : undefined}
                  onClick={() => dispatch({ type: 'select-role', role: role.id })}
                >
                  <article
                    className={`tracker-card tracker-${role.status}`}
                    aria-label={stageHookLabels[roleStageMap[role.id]]}
                    data-testid={stageHookLabels[roleStageMap[role.id]]}
                  >
                    <div className="tracker-top">
                      <div className="tracker-index-wrap">
                        <span className="tracker-index">{`0${index + 1}`}</span>
                        <span className="tracker-badge">{role.label}</span>
                      </div>
                      <span className={`tracker-status tracker-${role.status}`}>
                        {roleStatusLabel(role.status)}
                      </span>
                    </div>
                    <h3>{role.stageLabel}</h3>
                    <p>{role.description}</p>
                    <div className="tracker-footer">
                      <strong>{role.handoffLabel}</strong>
                      <span>{role.handoffSummary}</span>
                    </div>
                  </article>
                </button>
              ))}
            </div>

            <div className="route-rule-list">
              {routeRules.map((rule) => (
                <article key={rule.label} className="route-rule-card">
                  <span className="route-rule-index">{rule.label.slice(-2)}</span>
                  <div className="route-rule-copy">
                    <span className="signal-label">{rule.label}</span>
                    <strong>{rule.title}</strong>
                    <p>{rule.note}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel-card role-panel checkpoint-panel">
          <div className="section-head">
            <p className="eyebrow">보조 체크포인트</p>
            <h2>선택한 단계를 다시 확인하기</h2>
          </div>

          <div className="checkpoint-docket">
            <div className="checkpoint-desk-grid">
              {checkpointCards.map((item, index) => (
                <article
                  key={item.label}
                  className={`checkpoint-desk-card checkpoint-desk-${item.tone}`}
                >
                  <div className="checkpoint-desk-head">
                    <span className="checkpoint-window-step">{`0${index + 1}`}</span>
                    <span className="signal-label">{item.label}</span>
                  </div>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>

            <article className="checkpoint-note-sheet">
              <span className="signal-label">선택한 작업면</span>
              <strong>
                {selectedRoleMeta.label} · {selectedRoleMeta.stageLabel}
              </strong>
              <p>{selectedRoleMeta.description}</p>
              <p>{selectedRoleMeta.handoffSummary}</p>
            </article>

            <div className="checkpoint-fact-grid">
              {checkpointFacts.map((item) => (
                <article key={item.label} className="checkpoint-fact-card">
                  <span className="signal-label">{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </div>
        </article>

        <RolePanel
          title={selectedRoleMeta.label}
          stageLabel={selectedRoleMeta.stageLabel}
          status={state.generation.status}
          activeRole={state.generation.currentRole}
          role={selectedRoleMeta.id}
          inputSummary={inputSummaryForRole(state.inputs, selectedRoleMeta.id, research, outline, writerOutput)}
          handoffNote={handoffNoteForRole(selectedRoleMeta.id, research, outline, writerOutput, reviewerOutput)}
          emptyText={emptyTextForRole(selectedRoleMeta.id)}
        >
          {renderRoleSurface(selectedRoleMeta.id, research, outline, writerOutput, reviewerOutput)}
        </RolePanel>
      </section>

      <section
        className="panel-card final-panel"
        aria-label={stageHookLabels.final}
        data-testid={stageHookLabels.final}
      >
        <div className="section-head">
          <p className="eyebrow">발행 원고</p>
          <h2>검토를 마친 뒤 발행대로 넘기는 최종 원고</h2>
        </div>

        {state.generation.status === 'error' ? (
          <div className="error-panel" role="alert">
            <strong>
              {stageLabels[roleStageMap[state.generation.currentRole ?? 'researcher']]} 단계에서 흐름이 멈췄습니다.
            </strong>
            <p>{state.generation.errorMessage}</p>
            <p>일반 브리프로 다시 생성해 순차 인계의 정상 경로를 확인해 주세요.</p>
          </div>
        ) : state.generation.outputs.final_post ? (
          <div className="reader-shell">
            <div className="reader-focus-band">
              <article className="reader-spotlight-card">
                <span className="signal-label">발행 메모</span>
                <strong>{reviewerOutput?.finalizationNote ?? '발행본 잠금이 완료되었습니다.'}</strong>
                <p>
                  긴 원고를 바로 전면에 펼치지 않고, 먼저 발행 상태와 핵심 요약만 읽히도록
                  요약 면 뒤로 접어 둡니다.
                </p>
                <div className="reader-meta">
                  <span className="brief-chip">잠금 상태 · {statusLabel}</span>
                  <span className="brief-chip">
                    발행 준비 · {state.generation.outputs.final_post ? '완료' : '대기'}
                  </span>
                </div>
              </article>

              <div className="reader-preview-card">
                <div className="final-preview-top">
                  <div>
                    <span className="signal-label">발행 요약</span>
                    <h3>복사 전에 읽는 짧은 원고 요약</h3>
                  </div>
                  <button
                    type="button"
                    className="secondary-button final-copy-button"
                    aria-label="Copy markdown"
                    data-testid="Copy markdown"
                    onClick={handleCopyMarkdown}
                  >
                    최종 원고 복사
                  </button>
                </div>
                {finalPreview ? (
                  <pre className="markdown-preview markdown-preview-compact">{finalPreview.excerpt}</pre>
                ) : null}
                {finalPreview && finalPreview.hiddenLineCount > 0 ? (
                  <p className="summary-text">
                    아래 요약 뒤에 본문 {finalPreview.hiddenLineCount}줄이 더 잠겨 있습니다. 전체
                    확인이 필요할 때만 펼치세요.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="reader-command-strip">
              {readerChecks.map((item) => (
                <article key={item.label} className="reader-command-card">
                  <span className="signal-label">{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
            <details className="inline-details final-preview-details">
              <summary>전체 원고 문서 펼치기</summary>
              <div className="reader-document-shell">
                <div className="reader-document-head">
                  <div className="reader-document-copy">
                    <span className="signal-label">원문 보관함</span>
                    <strong>리뷰 완료 후 전체 원고</strong>
                    <p>긴 본문은 별도 문서면으로 분리해 스크롤 길이를 눌렀습니다.</p>
                  </div>
                  <span className="reader-document-count">총 {finalLineCount}줄</span>
                </div>
                <div
                  className="markdown-block reader-document-body"
                  tabIndex={0}
                  aria-label="최종 원고 전체"
                >
                  <pre>{state.generation.outputs.final_post}</pre>
                </div>
              </div>
            </details>
          </div>
        ) : (
          <div className="empty-state">
            <p>리뷰어 수정이 닫혀야만 최종 원고가 여기에 나타납니다.</p>
          </div>
        )}
      </section>

      <details
        className="panel-card final-panel evidence-drawer"
        open={evidenceOpen}
        onToggle={(event) => setEvidenceOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="drawer-summary">
          <div>
            <p className="eyebrow">보조 근거</p>
            <h2>추적과 점수 맥락이 필요할 때만 여는 서랍</h2>
          </div>
          <span>{evidenceOpen ? '서랍 닫기' : '서랍 열기'}</span>
        </summary>

        <div className="panel-grid evidence-grid">
          <article className="panel-card">
            <div className="section-head">
              <p className="eyebrow">인계 장부</p>
              <h2>전달된 전환 기록</h2>
            </div>

            <div className="handoff-log">
              {handoffs.length > 0 ? (
                handoffs.map((handoff) => (
                  <article key={`${handoff.from}-${handoff.to}`} className="handoff-card">
                    <div className="handoff-heading">
                      <strong>
                        {formatRoleLabel(handoff.from)} → {formatRoleLabel(handoff.to)}
                      </strong>
                      <span>{handoff.status === 'delivered' ? '전달 완료' : handoff.status}</span>
                    </div>
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
              <h2>이번 실행에서 남길 근거 묶음</h2>
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
    </main>
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
          <article className="surface-lead-card surface-lead-research">
            <span className="signal-label">핵심 논지</span>
            <strong>{research.thesis}</strong>
            <p>{research.angle}</p>
          </article>
          <div className="insight-grid">
            {research.keyFindings.map((finding, index) => (
              <article key={finding} className="insight-card">
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
            {research.supportingFacts.map((fact) => (
              <article key={fact} className="support-card">
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
          <article className="surface-lead-card surface-lead-outline">
            <span className="signal-label">구조 설계 원칙</span>
            <strong>문제 정의에서 체크리스트까지 읽기 압력을 단계적으로 높입니다.</strong>
            <p>{outline.structureRationale}</p>
          </article>
          <ol className="outline-grid">
            {outline.sections.map((section, index) => (
              <li key={section.id} className="outline-card">
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
          <article className="surface-lead-card surface-lead-writer">
            <span className="signal-label">초안 묶음</span>
            <strong>{writerOutput.writerSummary}</strong>
            <p>섹션별 초안은 카드로 잘라 검토 전에 필요한 부분만 빠르게 읽을 수 있게 두었습니다.</p>
          </article>
          <div className="draft-board">
            {writerOutput.sectionDrafts.map((draft, index) => (
              <article key={draft.id} className="draft-card draft-card-framed">
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
          <article className="surface-lead-card surface-lead-review">
            <span className="signal-label">발행 잠금 메모</span>
            <strong>{reviewerOutput.finalizationNote}</strong>
            <p>검토 메모는 위험도별 카드로 정리하고, 실제 적용 편집은 별도 접힘 목록으로 분리했습니다.</p>
          </article>
          <div className="review-board">
            {reviewerOutput.reviewNotes.map((note) => (
              <article key={note.label} className={`review-note review-${note.severity} review-note-framed`}>
                <div className="review-note-head">
                  <strong>{note.label}</strong>
                  <span>{reviewSeverityLabels[note.severity]}</span>
                </div>
                <p>{note.detail}</p>
              </article>
            ))}
          </div>
          <details className="inline-details review-details">
            <summary>적용된 편집 {reviewerOutput.appliedEdits.length}건 펼치기</summary>
            <div className="edit-list">
              {reviewerOutput.appliedEdits.map((edit) => (
                <article key={edit.label} className="edit-card">
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
  title: string
  stageLabel: string
  status: GenerationStatus
  activeRole: PipelineRole | null
  role: PipelineRole
  inputSummary: string
  handoffNote?: string
  emptyText: string
  children: React.ReactNode
}) {
  const isLoading = props.status === 'loading' && props.activeRole === props.role
  const isError = props.status === 'error' && props.activeRole === props.role
  const hasContent = Boolean(props.children)

  return (
    <article className="panel-card role-panel">
      <div className="section-head">
        <p className="eyebrow">{props.stageLabel}</p>
        <h2>{props.title}</h2>
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
        props.children
      ) : isLoading ? (
        <div className="empty-state loading-state">
          <span className="loading-dot" />
          <p>{props.title} 작업면이 지금 열려 있으며 산출물을 채우는 중입니다.</p>
        </div>
      ) : isError ? (
        <div className="empty-state error-state">
          <p>이 역할은 유효한 산출물을 넘기기 전에 중단되었습니다.</p>
        </div>
      ) : (
        <div className="empty-state">
          <p>{props.emptyText}</p>
        </div>
      )}
    </article>
  )
}

function PreviewBlock(props: { title: string; hookLabel: string; payload: unknown }) {
  return (
    <article className="preview-block" aria-label={props.hookLabel} data-testid={props.hookLabel}>
      <h3>{props.title}</h3>
      <span className="sr-only">{props.hookLabel}</span>
      <pre>{JSON.stringify(props.payload, null, 2)}</pre>
    </article>
  )
}

export default App
