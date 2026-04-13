// App.tsx - focused wizard workspace for the single-agent benchmark harness

import { useReducer, useRef, useState, type KeyboardEvent } from 'react'
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

const stageVisibleHooks: Record<GenerationStageId, string> = {
  research: '근거 고정',
  outline: '지면 배치',
  drafts: '문장 전개',
  review: '과잉 정리',
  final: '출고 봉인',
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

function closureSignal(generation: GenerationState, hasFinalPost: boolean) {
  if (generation.status === 'error') {
    return '브리프를 다듬은 뒤 같은 흐름을 다시 시작해야 합니다.'
  }

  if (hasFinalPost || generation.status === 'export-ready') {
    return '마감 직전 확인이 끝났고, 복사 후 게시 흐름으로 넘길 수 있습니다.'
  }

  switch (generation.currentStage) {
    case 'review':
      return '검토 메모만 닫히면 최종 원고와 내보내기 준비가 이어집니다.'
    case 'drafts':
      return '본문 밀도를 맞춘 뒤 검토 단계로 넘어갑니다.'
    case 'outline':
      return '개요를 잠그면 바로 섹션 초안으로 이어집니다.'
    case 'research':
      return '핵심 근거를 정리한 뒤 개요 설계로 자연스럽게 넘어갑니다.'
    case 'final':
      return '최종 원고를 읽기 좋은 면으로 정리하는 중입니다.'
    default:
      return '브리프를 정리하면 첫 단계부터 차례대로 닫힙니다.'
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const [selectedStage, setSelectedStage] = useState<GenerationStageId>('research')
  const runRef = useRef(0)
  const stageButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const currentStage =
    workflowStages.find((stage) => stage.id === state.generation.currentStage) ?? workflowStages[0]
  const selectedStageMeta =
    workflowStages.find((stage) => stage.id === selectedStage) ?? workflowStages[0]
  const currentStageIndex = workflowStages.findIndex((stage) => stage.id === currentStage.id)
  const selectedStageIndex = workflowStages.findIndex((stage) => stage.id === selectedStage)
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
  const audienceLabel =
    audienceOptions.find((option) => option.value === state.inputs.audience)?.label ?? ''
  const toneLabel = toneOptions.find((option) => option.value === state.inputs.tone)?.label ?? ''
  const lengthLabel =
    lengthOptions.find((option) => option.value === state.inputs.length)?.label ?? ''
  const closureMessage = closureSignal(state.generation, Boolean(finalPost))
  const currentStageNumber = state.generation.status === 'initial' ? 0 : currentStageIndex + 1
  const briefSummary = [audienceLabel, toneLabel, lengthLabel].filter(Boolean).join(' · ')
  const briefTags = [audienceLabel || '독자 미정', toneLabel || '톤 미정', lengthLabel || '길이 미정']
  const topicPreview = state.inputs.topic.trim() || '주제를 입력해 주세요'
  const topicSnapshot =
    topicPreview.length > 58 ? `${topicPreview.slice(0, 58).trimEnd()}…` : topicPreview
  const finalTitle =
    finalPost?.split('\n').find((line) => line.startsWith('# '))?.replace(/^#\s+/, '') ?? topicPreview
  const finalExcerpt =
    finalPost
      ?.split('\n')
      .find(
        (line) =>
          line.trim().length > 0 &&
          !line.startsWith('#') &&
          !line.startsWith('>') &&
          !line.startsWith('-'),
      )
      ?.trim() ?? ''
  const finalSections = finalPost
    ? finalPost
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.replace(/^##\s+/, ''))
        .slice(0, 4)
    : []
  const finalOutlineLead =
    finalExcerpt || '최종 원고가 열리면 이 영역에 첫 문단 요약과 섹션 흐름이 먼저 표시됩니다.'
  const finalStructureLabel =
    finalSections.length > 0 ? `핵심 섹션 ${finalSections.length}개` : '섹션 구조 잠금 전'
  const focusStageLabel =
    state.generation.status === 'initial'
      ? '브리프 입력'
      : state.generation.status === 'error'
        ? '브리프 재정리'
        : currentStage.label
  const focusStageStatusMessage =
    state.generation.status === 'initial'
      ? '주제, 독자, 톤, 길이를 정리하면 리서치부터 최종 원고까지 한 흐름으로 이어집니다.'
      : state.generation.status === 'error'
        ? state.generation.errorMessage ?? '브리프를 조정한 뒤 같은 흐름을 다시 시작하세요.'
        : state.generation.statusMessage
  const focusProgressLabel =
    state.generation.status === 'initial' ? '브리프 봉인 전' : `${currentStageNumber} / 5 단계`
  const progressSummary =
    state.generation.status === 'initial'
      ? '브리프를 봉인하면 다섯 단계 마감 레일이 순서대로 켜집니다.'
      : state.generation.status === 'error'
        ? '실패 지점을 고치면 같은 흐름을 처음부터 다시 밟습니다.'
        : `${state.generation.completedStages.length}개 단계를 닫았고 다음 연결만 남았습니다.`
  const briefSummaryLine = briefSummary || '독자 · 톤 · 길이 조합을 정하는 중입니다.'
  const nextActionLabel =
    state.generation.status === 'initial'
      ? '포스트 생성'
      : state.generation.status === 'error'
        ? '브리프 조정 후 다시 생성'
        : nextStage
          ? nextStage.label
          : '마크다운 복사 또는 새 브리프'
  const nextActionDescription =
    state.generation.status === 'initial'
      ? '브리프를 정리한 뒤 생성 버튼을 누르면 리서치부터 최종 원고까지 한 흐름으로 시작합니다.'
      : state.generation.status === 'error'
        ? '실패 조건이 포함된 주제를 정리한 뒤 같은 흐름을 처음부터 다시 시작합니다.'
        : nextStage
          ? nextStage.description
          : '최종 원고를 복사한 뒤 같은 흐름으로 다음 주제를 다시 시작할 수 있습니다.'
  const nextActionMicrocopy =
    state.generation.status === 'initial'
      ? '브리프를 봉인하면 다섯 단계 레일이 순서대로 켜집니다.'
      : state.generation.status === 'error'
        ? '브리프를 고친 뒤 같은 흐름을 처음부터 다시 열면 됩니다.'
        : nextStage
          ? `${nextActionLabel} 전환만 남았습니다.`
          : '복사 후 같은 흐름으로 다음 주제를 다시 시작할 수 있습니다.'
  const commandShortNote = finalPost
    ? '복사와 마지막 확인만 남았습니다.'
    : state.generation.status === 'loading'
      ? '작업면에서 결과를 확인하며 흐름만 제어하면 됩니다.'
      : '브리프를 봉인하면 생성이 시작되고, 최종 원고가 열릴 때까지 복사는 잠겨 있습니다.'
  const commandPulseLabel =
    state.generation.status === 'loading'
      ? '작성 리듬 가동 중'
      : state.generation.status === 'error'
        ? '브리프 재정리 필요'
        : finalPost
          ? '출고 직전 정렬'
          : '브리프 봉인 대기'
  const exportStateLabel = finalPost ? '복사 준비 완료' : '출고 전 잠금'
  const completionSummary = `${state.generation.completedStages.length} / 5 단계`
  const phasePulseSummary =
    state.generation.status === 'initial'
      ? '브리프 봉인 전'
      : state.generation.status === 'error'
        ? '브리프 재정비 필요'
        : state.generation.status === 'loading'
          ? '원고 전개 중'
          : finalPost
            ? '원고 봉인 완료'
            : '다음 단계 정렬 중'
  const stageRailLead =
    state.generation.status === 'initial'
      ? '브리프를 봉인하면 다섯 단계 레일이 한 줄로 켜집니다.'
      : state.generation.status === 'error'
        ? '브리프를 다듬으면 같은 레일을 처음부터 다시 켭니다.'
        : finalPost
          ? '모든 레일이 닫혔고, 지금은 복사와 마지막 문장 확인만 남았습니다.'
          : `${currentStage.label}이 앞줄에 나와 있고 ${nextActionLabel}은 다음 도착 순서로 준비됩니다.`
  const selectedStageStateLabel =
    state.generation.status === 'initial'
      ? selectedStage === 'research'
        ? '시작 전 준비'
        : '시작 전 미리보기'
      : state.generation.status === 'error' && selectedStage === currentStage.id
        ? '브리프 재정리 필요'
        : selectedStage === currentStage.id
          ? '실제 진행 중'
          : state.generation.completedStages.includes(selectedStage)
            ? '완료된 작업면'
            : selectedStageIndex < currentStageIndex
              ? '이전 단계 회고'
              : '다음 작업면'
  const selectedStageHint =
    state.generation.status === 'initial'
      ? selectedStage === 'research'
        ? '브리프를 봉인하면 리서치 결과가 가장 먼저 열리고, 나머지 단계는 순서대로 이어집니다.'
        : `아직 생성은 시작되지 않았습니다. ${selectedStageMeta.label}은 브리프를 봉인한 뒤 앞선 단계가 닫히면 열립니다.`
      : state.generation.status === 'error'
        ? selectedStage === currentStage.id
          ? '실패 지점은 브리프 재정리입니다. 주제를 고친 뒤 같은 흐름을 처음부터 다시 시작하세요.'
          : `현재 흐름은 ${focusStageLabel}에서 다시 시작을 기다립니다. 이 작업면은 복구 후 순서대로 다시 열립니다.`
        : selectedStage === currentStage.id
          ? '지금 실제 생성 흐름이 머무는 작업면입니다.'
          : state.generation.completedStages.includes(selectedStage)
            ? '이미 닫은 단계의 결과를 다시 읽으며 문장 밀도와 논지 흐름을 점검하는 면입니다.'
            : `현재 생성 흐름은 ${focusStageLabel} 단계에 머물러 있고, 이 카드는 다음에 열릴 산출물을 미리 조망하는 면입니다.`
  const selectedStageOrderLabel = String(selectedStageIndex + 1).padStart(2, '0')
  const focusStageOrderLabel = String(state.generation.status === 'initial' ? 0 : currentStageNumber).padStart(2, '0')
  const briefSealState =
    state.generation.status === 'loading'
      ? '봉인 유지 중'
      : state.generation.status === 'error'
        ? '봉인 재정비'
        : finalPost
          ? '출고 대기 봉인'
          : '입력 봉인 준비'
  const briefSealDescription =
    state.generation.status === 'loading'
      ? '작성 흐름이 움직이는 동안 입력은 이 레일에 고정되고 오른쪽 작업면만 앞으로 남습니다.'
      : state.generation.status === 'error'
        ? '실패 조건을 덜어낸 뒤 다시 봉인하면 같은 레일이 처음부터 다시 켜집니다.'
        : finalPost
          ? '브리프는 그대로 유지한 채 최종 원고와 복사 준비만 확인하면 됩니다.'
          : '짧은 브리프를 봉인하면 다섯 단계가 한 줄 흐름으로 이어집니다.'
  const heroHeadline =
    state.generation.status === 'initial'
      ? '짧은 브리프로 원고의 첫 리듬을 잠급니다'
      : state.generation.status === 'error'
        ? '복구할 한 지점만 고치고 흐름을 다시 잇습니다'
        : finalPost
          ? '출고 직전 원고가 잠겼고 복사만 남았습니다'
          : `${focusStageLabel}만 전면에 남긴 단일 작성 흐름`
  const heroLead =
    state.generation.status === 'initial'
      ? '주제, 독자, 톤, 길이만 봉인하면 한 명의 작성 흐름이 리서치부터 최종 원고까지 곧게 전개됩니다.'
      : state.generation.status === 'error'
        ? '실패한 흐름 전체를 다시 읽지 않도록, 복구해야 할 단계와 다시 시작 신호만 남겼습니다.'
        : finalPost
          ? '최종 원고가 잠겼습니다. 지금은 제목, 섹션 흐름, 복사 준비만 먼저 확인하면 됩니다.'
          : '작성 흐름이 움직이는 동안 첫 화면에는 현재 단계와 다음 작업만 남깁니다.'
  const supportSurfaceDescription = finalPost
    ? '최종 원고가 열리면 보조 기록을 펼치지 않아도 복사 직전 확인만 끝낼 수 있습니다.'
    : '검토 메모와 산출물은 뒤쪽 서랍에 남기고, 첫 화면에는 현재 단계와 다음 행동만 남겼습니다.'
  const briefDrawerLabel =
    state.generation.status === 'initial'
      ? '브리프 봉인 상태 펼치기'
      : state.generation.status === 'error'
        ? '브리프 복구 정보 펼치기'
        : '브리프 상태와 진행률 펼치기'
  const briefDrawerMeta =
    state.generation.status === 'initial'
      ? '입력 준비 중'
      : `${focusStageLabel} · ${progress}%`
  const briefLockLead =
    state.generation.status === 'loading'
      ? '입력은 잠기고 작업 레일만 남아 있습니다.'
      : state.generation.status === 'error'
        ? '브리프를 다듬어 같은 레일을 다시 켭니다.'
        : '짧은 브리프만 봉인하고 바로 작업 레일로 넘깁니다.'
  const briefLockDescription =
    state.generation.status === 'loading'
      ? '생성 중에는 잠긴 브리프만 확인하고, 실제 읽기와 판단은 오른쪽 작업면에서 이어갑니다.'
      : state.generation.status === 'error'
        ? '실패 조건을 걷어낸 뒤 다시 시작하면 리서치부터 최종 원고까지 같은 흐름으로 복구됩니다.'
        : '주제, 독자, 톤, 길이만 고정하면 한 줄 작성 흐름이 차례대로 켜집니다.'
  const isPreflightDocket =
    state.generation.status === 'initial' || state.generation.status === 'error'
  const docketStatusLabel =
    state.generation.status === 'initial'
      ? '준비 전'
      : state.generation.status === 'error'
        ? '복구 필요'
        : finalPost
          ? '출고 직전'
          : '작성 중'
  const docketLead = finalPost
    ? finalOutlineLead
    : state.generation.status === 'error'
      ? '브리프를 다듬으면 현재 단계부터 원고 흐름을 다시 이어갈 수 있습니다.'
      : '긴 초안 대신 현재 단계, 다음 단계, 진행률만 먼저 보여 주는 상태 카드입니다.'
  const docketHighlights = [
    {
      label: '현재 단계',
      value: focusStageLabel,
    },
    {
      label: '다음 단계',
      value: nextActionLabel,
    },
    {
      label: finalPost ? '원고 구조' : '진행률',
      value: finalPost ? finalStructureLabel : completionSummary,
    },
  ]
  const stagePanelMessage =
    state.generation.status === 'initial'
      ? selectedStage === 'research'
        ? '브리프를 봉인하면 가장 먼저 열릴 단계입니다.'
        : `${selectedStageMeta.label}은 브리프를 봉인한 뒤 앞선 단계가 닫히면 순서대로 열립니다.`
      : state.generation.status === 'error'
        ? selectedStage === currentStage.id
          ? focusStageStatusMessage
          : `현재 흐름은 ${focusStageLabel}에서 멈춰 있습니다. 브리프를 다듬으면 ${selectedStageMeta.label}도 다시 이어집니다.`
        : selectedStage === currentStage.id
          ? focusStageStatusMessage
          : state.generation.completedStages.includes(selectedStage)
            ? '이미 닫은 단계의 결과를 다시 읽으며 문장 밀도와 논지 흐름을 점검하는 면입니다.'
            : `${selectedStageMeta.label} 단계는 ${nextActionLabel} 이전에 열릴 작업면입니다.`
  const panelFocusTitle =
    state.generation.status === 'initial'
      ? `${selectedStageMeta.label} 대기 단계`
      : state.generation.status === 'error'
        ? selectedStage === currentStage.id
          ? '브리프 복구가 먼저 필요한 단계'
          : `${selectedStageMeta.label}은 복구 뒤 다시 열릴 단계`
        : selectedStage === currentStage.id
          ? `${selectedStageMeta.label} 진행 단계`
          : state.generation.completedStages.includes(selectedStage)
            ? `${selectedStageMeta.label} 검토 단계`
            : `${selectedStageMeta.label} 예고 단계`
  const panelDrawerTitle = finalPost ? '긴 원고는 뒤 레이어 유지' : '기록은 뒤 서랍 유지'
  const panelDrawerNote =
    selectedStage === currentStage.id
      ? supportSurfaceDescription
      : '이 단계는 순서를 미리 읽거나 되짚어 보는 보조 면입니다. 실제 전환은 현재 단계가 닫힌 뒤에만 일어납니다.'
  const panelBridgeTitle = selectedStage === currentStage.id ? nextActionLabel : focusStageLabel
  const panelBridgeNote =
    selectedStage === currentStage.id
      ? closureMessage
      : '이 작업면은 앞뒤 흐름을 조망하는 보조 단계입니다. 실제 진행은 단계 레일의 현재 위치로 돌아가 이어가면 됩니다.'
  const liveRegionMessage = `${statusLabel(state.generation.status)} | ${focusStageLabel} | ${state.copyFeedback || state.generation.statusMessage}`

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

  function handleStageKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const navigationKey = event.key

    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(navigationKey)) {
      return
    }

    event.preventDefault()

    let targetIndex = index

    if (navigationKey === 'ArrowDown' || navigationKey === 'ArrowRight') {
      targetIndex = Math.min(index + 1, workflowStages.length - 1)
    }

    if (navigationKey === 'ArrowUp' || navigationKey === 'ArrowLeft') {
      targetIndex = Math.max(index - 1, 0)
    }

    if (navigationKey === 'Home') {
      targetIndex = 0
    }

    if (navigationKey === 'End') {
      targetIndex = workflowStages.length - 1
    }

    setSelectedStage(workflowStages[targetIndex].id)
    stageButtonRefs.current[targetIndex]?.focus()
  }

  function renderStageBody() {
    if (selectedStage === 'research') {
      if (state.generation.status === 'error') {
        return (
          <section className="empty-block error-block" role="alert">
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
            <h3>참고 출처</h3>
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
            <div className="reference-strip">
              <strong>리서치 참고 축</strong>
              <div className="tag-row">
                {researchSummary.references.map((reference) => (
                  <span className="soft-tag soft-tag-muted" key={reference}>
                    {reference}
                  </span>
                ))}
              </div>
            </div>
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
          <p className="card-eyebrow">개요 설계</p>
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
              <p className="card-eyebrow">섹션 초안</p>
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
                <span>검토 메모</span>
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
            <p>검토 메모까지 끝나면 이 영역이 최종 내보내기 전용 미리보기로 바뀝니다.</p>
          </div>
        </section>
      )
    }

    return (
      <div className="stage-stack">
        <article className="content-card final-editorial-card">
          <div className="final-editorial-head">
            <div className="reader-preview-head">
              <p className="card-eyebrow">출고 직전</p>
              <h3>최종 원고 요약</h3>
              <p className="reader-note">
                전체 원고를 먼저 펼치지 않고, 제목과 장면 흐름, 그리고 출고 신호만 먼저 읽히도록 정리한 마지막 확인 면입니다.
              </p>
            </div>
            <div className="reader-meta final-reader-meta">
              <span className="summary-chip">{finalStructureLabel}</span>
              <span className="summary-chip">{exportStateLabel}</span>
            </div>
          </div>
          <div className="final-editorial-grid">
            <div className="reader-shelf final-reader-shelf">
              <div className="reader-shelf-head">
                <p className="hero-summary-label">최종 원고</p>
                <strong>{finalTitle}</strong>
                <p className="reader-note reader-note-strong">{closureMessage}</p>
                <p className="reader-note">{finalOutlineLead}</p>
              </div>
              <div className="reader-outline">
                {finalSections.map((section, index) => (
                  <div className="reader-outline-item" key={section}>
                    <span>{index + 1}</span>
                    <strong>{section}</strong>
                  </div>
                ))}
              </div>
              <div className="reader-shelf-foot">
                <span className="summary-chip">{finalStructureLabel}</span>
                <span className="summary-chip">{exportStateLabel}</span>
              </div>
            </div>
            <div className="final-proof-column">
              <div className="final-checklist">
                <div className="final-check-item">
                  <span>독자</span>
                  <strong>{audienceLabel}</strong>
                </div>
                <div className="final-check-item">
                  <span>톤</span>
                  <strong>{toneLabel}</strong>
                </div>
                <div className="final-check-item">
                  <span>길이</span>
                  <strong>{lengthLabel}</strong>
                </div>
                <div className="final-check-item">
                  <span>출고 상태</span>
                  <strong>{exportStateLabel}</strong>
                </div>
              </div>
              <div className="takeaway-line final-takeaway-line">
                {state.copyFeedback || '복사 버튼으로 내보낸 뒤 마지막 문장 리듬만 한 번 더 확인하면 됩니다.'}
              </div>
              <div className="hero-note-strip final-proof-note">
                <span>출고 기준</span>
                <strong>{nextActionLabel}</strong>
                <p>{nextActionDescription}</p>
              </div>
            </div>
          </div>
          <details className="reader-drawer">
            <summary>전문 원고 펼치기</summary>
            <div className="reader-drawer-body">
              <pre className="markdown-preview">{finalPost}</pre>
            </div>
          </details>
        </article>
      </div>
    )
  }

  return (
    <main className="app-shell">
      <div className="assistive-live" aria-atomic="true" aria-live="polite">
        {liveRegionMessage}
      </div>

      <section className="workspace-hero">
        <article className="hero-storyboard">
          <div className="hero-ribbon">
            <span className="hero-signal">{focusProgressLabel}</span>
            <span className="hero-signal hero-signal-live">
              {commandPulseLabel} · {statusLabel(state.generation.status)}
            </span>
          </div>
          <div className="hero-headline hero-headline-tight hero-headline-solo">
            <div className="hero-headline-copy">
              <p className="section-kicker">단일 작성 흐름</p>
              <h1>{heroHeadline}</h1>
              <p className="hero-deck">{heroLead}</p>
            </div>
          </div>
          <ul
            aria-label="브리프와 원고 상태"
            className={`hero-ledger-strip ${isPreflightDocket ? 'hero-ledger-strip-preflight' : ''}`.trim()}
          >
            <li className="hero-ledger-panel hero-ledger-panel-spotlight">
              <span>봉인한 브리프</span>
              <strong>{topicSnapshot}</strong>
              <p>{briefSummaryLine}</p>
              <div className="hero-ledger-meta">
                <span className="summary-chip">{briefSealState}</span>
                <span className="summary-chip">{focusProgressLabel}</span>
              </div>
            </li>
            <li
              className={`hero-ledger-panel hero-ledger-panel-manuscript ${isPreflightDocket ? 'hero-ledger-panel-manuscript-soft' : ''}`.trim()}
            >
              <div className="hero-docket-head">
                <div>
                  <span>원고 상태</span>
                  <strong>{finalTitle}</strong>
                </div>
                <b className="hero-docket-status">{docketStatusLabel}</b>
              </div>
              <p className="hero-docket-lead">{docketLead}</p>
              <ul className="hero-docket-preview" aria-label="핵심 정보">
                {docketHighlights.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))}
              </ul>
              <div className="hero-ledger-meta hero-docket-meta">
                <span className="summary-chip">{commandPulseLabel}</span>
                <span className="summary-chip">{exportStateLabel}</span>
              </div>
            </li>
          </ul>

          <div className="mission-board">
            <article className="mission-card mission-card-current">
              <div className="mission-card-head">
                <p className="hero-summary-label">현재 단계</p>
                <span className="mission-card-pill">{phasePulseSummary}</span>
              </div>
              <div className="mission-stage-band">
                <span className="mission-stage-index">{focusStageOrderLabel}</span>
                <div className="mission-stage-copy">
                  <strong>{focusStageLabel}</strong>
                  <p>{focusStageStatusMessage}</p>
                </div>
              </div>
              <div className="mission-progress-block">
                <div className="mission-progress-copy">
                  <span>현재 진행 신호</span>
                  <strong>{progressSummary}</strong>
                </div>
                <div className="progress-track mission-progress-track" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              <p className="mission-card-note">{closureMessage}</p>
            </article>

            <article className="mission-card mission-card-action">
              <div className="mission-card-head">
                <p className="hero-summary-label">다음 행동</p>
                <span className="mission-card-pill">{nextActionLabel}</span>
              </div>
              <strong className="mission-card-title">{commandPulseLabel}</strong>
              <p className="mission-card-copy">{nextActionDescription}</p>
              <div className="hero-action-stack mission-action-stack">
                <button
                  aria-label={state.generation.status === 'loading' ? '원고 생성 중' : '원고 생성 시작'}
                  className="primary-action"
                  data-testid="Generate post"
                  disabled={state.generation.status === 'loading'}
                  onClick={() => void handleGenerate()}
                  type="button"
                >
                  <span className="button-copy-kr">
                    {state.generation.status === 'loading' ? '원고 생성 중' : '원고 생성 시작'}
                  </span>
                </button>
                <button
                  aria-label="원고 복사"
                  className="secondary-action"
                  data-testid="Copy markdown"
                  disabled={!finalPost}
                  onClick={() => void handleCopyMarkdown()}
                  type="button"
                >
                  <span className="button-copy-kr">원고 복사</span>
                </button>
              </div>
              <div className="mission-action-note">
                <strong>{briefSummaryLine}</strong>
                <p>{commandShortNote} {nextActionMicrocopy}</p>
              </div>
            </article>
          </div>
        </article>
      </section>

      <section className="workspace-frame">
        <aside className="brief-rail">
          <article className="rail-card rail-card-dark rail-card-input">
            <div className="rail-section-head">
              <div>
                <p className="section-kicker">브리프 레일</p>
                <h3>브리프 요약</h3>
              </div>
              <p className="brief-inline">
                브리프는 이 레일에서만 고정하고, 나머지 기록은 뒤 서랍으로 밀어 첫 장면을 가볍게 유지합니다.
              </p>
            </div>
            <div className="brief-seal-board">
              <p className="rail-hook">봉인된 편집 메모</p>
              <strong>{topicSnapshot}</strong>
              <p>{briefSealDescription}</p>
              <div className="brief-seal-meta">
                <span className="soft-tag">{briefSealState}</span>
                {briefTags.map((tag) => (
                  <span className="soft-tag soft-tag-muted" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="brief-lock-strip">
              <div className="brief-lock-copy">
                <p className="rail-hook">봉인 규칙</p>
                <strong>{briefLockLead}</strong>
                <p>{briefLockDescription}</p>
              </div>
            </div>

            <form className="brief-form brief-form-ghost">
              <label>
                <span>주제</span>
                <textarea
                  data-testid="Topic"
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
                  data-testid="Audience"
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
                  data-testid="Tone"
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
                  data-testid="Length"
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

            <details className="support-drawer rail-status-drawer">
              <summary>
                <span>{briefDrawerLabel}</span>
                <span>{briefDrawerMeta}</span>
              </summary>
              <div className="brief-status-strip">
                <div className="brief-status-chip">
                  <span className={`status-badge status-${state.generation.status}`}>{statusLabel(state.generation.status)}</span>
                  <strong>{focusStageLabel}</strong>
                </div>
                <div className="brief-status-copy">
                  <p>{focusStageStatusMessage}</p>
                  <div className="progress-meta">
                    <span>{state.generation.completedStages.length} / 5 단계 완료</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>

              <div className="brief-synopsis">
                <p className="hero-summary-label">이번 글의 축</p>
                <strong>{topicPreview}</strong>
                <div className="tag-row">
                  {briefTags.map((tag) => (
                    <span className="soft-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </details>

            <details className="support-drawer">
              <summary>
                <span>원고 워밍업 펼치기</span>
                <span>{topicPresets.length}개 프리셋</span>
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
          <div className="stage-workbench">
            <section className="stage-rail-shell">
              <div className="stage-rail-head">
                <p className="panel-hook">단계 레일</p>
                <h2>지금 볼 작성 단계</h2>
                <p>{stageRailLead}</p>
              </div>
              <div aria-label="작성 단계 선택" aria-orientation="vertical" className="stage-rail" role="tablist">
                {workflowStages.map((stage, index) => (
                  <button
                    aria-controls={`stage-panel-${stage.id}`}
                    aria-selected={selectedStage === stage.id}
                    className={`stage-chip ${stageTone(stage, state.generation)} ${selectedStage === stage.id ? 'is-selected' : ''}`.trim()}
                    data-testid={stage.testHook}
                    id={`stage-tab-${stage.id}`}
                    key={stage.id}
                    onKeyDown={(event) => handleStageKeyDown(event, index)}
                    onClick={() => setSelectedStage(stage.id)}
                    ref={(element) => {
                      stageButtonRefs.current[index] = element
                    }}
                    role="tab"
                    tabIndex={selectedStage === stage.id ? 0 : -1}
                    type="button"
                  >
                    <span className="stage-chip-trace" aria-hidden="true">
                      <span className="stage-chip-index">{String(index + 1).padStart(2, '0')}</span>
                      {index < workflowStages.length - 1 ? <span className="stage-chip-line" /> : null}
                    </span>
                    <span className="stage-chip-copy">
                      <strong>{stage.label}</strong>
                      <em>{stageVisibleHooks[stage.id]}</em>
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
              <div className="stage-rail-foot">
                <strong>{selectedStageStateLabel}</strong>
                <p>{selectedStageHint}</p>
              </div>
            </section>

            <article
              aria-labelledby={`stage-tab-${selectedStage}`}
              className="workspace-panel"
              id={`stage-panel-${selectedStage}`}
              role="tabpanel"
            >
              <div className="workspace-panel-head">
                <div>
                  <p className="panel-hook">{selectedStage === currentStage.id ? '현재 편집면' : '선택한 작업면'}</p>
                  <h2>{selectedStageMeta.label}</h2>
                </div>
                <div className="panel-actions">
                  <div className="panel-head-meta" aria-hidden="true">
                    <span className="summary-chip">{selectedStageStateLabel}</span>
                    <span className="summary-chip">
                      {selectedStage === currentStage.id ? phasePulseSummary : completionSummary}
                    </span>
                  </div>
                  <button
                    className="inline-action inline-action-ghost"
                    onClick={() => setSelectedStage(currentStage.id)}
                    type="button"
                  >
                    <span className="button-copy-kr">현재 레일로 복귀</span>
                  </button>
                </div>
              </div>
              <div className="panel-focus-band">
                <article
                  className={`panel-focus-card ${selectedStage === currentStage.id ? 'panel-focus-card-spotlight' : ''}`.trim()}
                >
                  <div className="panel-focus-main">
                    <span className="panel-focus-index">{selectedStageOrderLabel}</span>
                    <div>
                      <p className="card-eyebrow">선택한 장면</p>
                      <strong>{panelFocusTitle}</strong>
                      <p>{stagePanelMessage}</p>
                    </div>
                  </div>
                  <div className="panel-focus-ribbon" aria-hidden="true">
                    <span className="summary-chip">{selectedStageStateLabel}</span>
                    <span className="summary-chip">
                      {selectedStage === currentStage.id ? completionSummary : focusProgressLabel}
                    </span>
                  </div>
                </article>
                <div className="panel-focus-side">
                  <article className="panel-status-cell panel-status-cell-primary">
                    <span>다음 행동</span>
                    <strong>{panelBridgeTitle}</strong>
                    <p>{selectedStage === currentStage.id ? nextActionDescription : panelBridgeNote}</p>
                  </article>
                  <article className="panel-status-cell panel-status-cell-secondary">
                    <span>보조 서랍 원칙</span>
                    <strong>{panelDrawerTitle}</strong>
                    <p>{panelDrawerNote}</p>
                  </article>
                </div>
              </div>
              {renderStageBody()}
              <div className="workspace-panel-copy">
                <article className={`panel-note-card ${selectedStage === currentStage.id ? 'panel-note-card-ink' : ''}`.trim()}>
                  <span>{selectedStage === currentStage.id ? '작업 규칙' : '선택한 작업면 메모'}</span>
                  <strong>{selectedStage === currentStage.id ? selectedStageMeta.description : panelBridgeTitle}</strong>
                  <p>
                    {selectedStage === currentStage.id
                      ? `${panelBridgeNote} ${panelDrawerNote}`
                      : `${selectedStageHint} ${panelBridgeNote}`}
                  </p>
                </article>
                {state.copyFeedback ? <p className="panel-copy-feedback">{state.copyFeedback}</p> : null}
              </div>
            </article>
          </div>

          <details className="support-drawer evidence-drawer">
            <summary>
              <span>보조 기록 서랍</span>
              <span>기록은 뒤 레이어에 유지</span>
            </summary>
            <div className="evidence-grid">
              <article className="evidence-card">
                <p className="card-eyebrow">산출물 목록</p>
                <h3>기록 위치</h3>
                <div className="evidence-row">
                  <strong>실행 기록 묶음</strong>
                  <p>실행 시각, 상태, 산출물 연결 정보는 실행 기록 파일과 산출물 인덱스 파일에 남깁니다.</p>
                </div>
                <div className="evidence-row">
                  <strong>검토 문서 묶음</strong>
                  <p>리뷰 보고서, 평가 결과, 점수 카드 파일은 뒤쪽 검토 서랍에만 남겨 첫 화면 밀도를 지켰습니다.</p>
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
                  <strong>보조 산출물</strong>
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
