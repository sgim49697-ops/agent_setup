// App.tsx - single_agent harness focused 3-screen wizard workspace

import { useReducer, useRef, useState, type HTMLAttributes, type KeyboardEvent } from 'react'
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

type ScreenId = 'brief' | 'progress' | 'publish'

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
  statusMessage: '브리프를 정리한 뒤 포스트 생성을 누르면 리서치에서 게시 준비까지 한 화면씩 이어집니다.',
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
  { value: 'opinionated', label: '관점을 분명히' },
]

const lengthOptions: { value: Length; label: string }[] = [
  { value: 'short', label: '짧게' },
  { value: 'medium', label: '중간' },
  { value: 'long', label: '길게' },
]

const stageMessages: Record<GenerationStageId, string> = {
  research: '리서치 축을 먼저 잠가 핵심 논지와 참고 방향을 정리합니다.',
  outline: '독자가 따라갈 순서를 끊기지 않게 개요를 고정합니다.',
  drafts: '섹션 초안을 이어 붙이며 문장 밀도와 장면 전환을 맞춥니다.',
  review: '검토 메모로 빠진 논점과 과한 문장을 걸러냅니다.',
  final: '최종 원고와 복사 준비 상태를 게시 전용 화면으로 넘길 준비를 합니다.',
}

const screenMeta: Array<{ id: ScreenId; label: string; deck: string }> = [
  { id: 'brief', label: '브리프', deck: '원고 의뢰' },
  { id: 'progress', label: '진행', deck: '편집 진행' },
  { id: 'publish', label: '게시', deck: '출고 점검' },
]

type WizardScreenProps = HTMLAttributes<HTMLElement> & { inert?: boolean }

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
                statusMessage: '브리프를 수정했습니다. 다시 생성하면 리서치 단계부터 같은 흐름을 재시작합니다.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 브리프를 조금만 다듬고 바로 생성할 수 있습니다.',
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
          statusMessage: '시작 지점에서 멈췄습니다. 브리프를 다듬고 다시 시도하세요.',
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
    initial: '대기',
    loading: '진행',
    populated: '작성 완료',
    'review-complete': '검토 완료',
    'export-ready': '복사 준비',
    error: '복구 필요',
  }

  return labels[status]
}

function stageVisualState(stage: WorkflowStage, generation: GenerationState) {
  if (generation.status === 'error' && stage.id === 'research') {
    return 'error'
  }

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

  return 'upcoming'
}

function stageProgressCopy(generation: GenerationState, stage: WorkflowStage) {
  if (generation.status === 'initial') {
    return '아직 열리지 않았습니다.'
  }

  if (generation.status === 'error' && stage.id === 'research') {
    return '브리프를 다시 맞추면 이 단계부터 복구됩니다.'
  }

  if (generation.currentStage === stage.id && generation.status === 'loading') {
    return '지금 이 단계가 실제로 움직이고 있습니다.'
  }

  if (generation.completedStages.includes(stage.id)) {
    return '완료된 결과를 다시 읽을 수 있습니다.'
  }

  return '앞선 단계가 닫히면 순서대로 열립니다.'
}

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('brief')
  const [selectedStage, setSelectedStage] = useState<GenerationStageId>('research')
  const runRef = useRef(0)
  const stageButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const currentStage =
    workflowStages.find((stage) => stage.id === state.generation.currentStage) ?? workflowStages[0]
  const currentStageIndex = workflowStages.findIndex((stage) => stage.id === currentStage.id)
  const selectedStageMeta =
    workflowStages.find((stage) => stage.id === selectedStage) ?? workflowStages[0]
  const selectedStageIndex = workflowStages.findIndex((stage) => stage.id === selectedStage)
  const progressPercent =
    state.generation.status === 'initial'
      ? 0
      : state.generation.status === 'export-ready'
        ? 100
        : Math.max(12, Math.round((state.generation.completedStages.length / workflowStages.length) * 100))
  const completedStageCount =
    state.generation.status === 'initial' || state.generation.status === 'error'
      ? 0
      : state.generation.status === 'export-ready'
        ? workflowStages.length
        : state.generation.completedStages.length
  const remainingStageCount = Math.max(workflowStages.length - completedStageCount, 0)
  const audienceLabel =
    audienceOptions.find((option) => option.value === state.inputs.audience)?.label ?? ''
  const toneLabel = toneOptions.find((option) => option.value === state.inputs.tone)?.label ?? ''
  const lengthLabel =
    lengthOptions.find((option) => option.value === state.inputs.length)?.label ?? ''
  const briefChips = [audienceLabel, toneLabel, lengthLabel].filter(Boolean)
  const featuredPreset = topicPresets[0]
  const featuredPresetChips = [
    audienceOptions.find((option) => option.value === featuredPreset.audience)?.label,
    toneOptions.find((option) => option.value === featuredPreset.tone)?.label,
    lengthOptions.find((option) => option.value === featuredPreset.length)?.label,
  ].filter(Boolean)
  const topicValue = state.inputs.topic.trim() || '주제를 적어 주세요'
  const topicSnapshot =
    topicValue.length > 62 ? `${topicValue.slice(0, 62).trimEnd()}…` : topicValue
  const researchSummary = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline
  const sectionDrafts = state.generation.outputs.section_drafts
  const reviewNotes = state.generation.outputs.review_notes
  const finalPost = state.generation.outputs.final_post
  const finalTitle =
    finalPost?.split('\n').find((line) => line.startsWith('# '))?.replace(/^#\s+/, '') ?? topicSnapshot
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
  const finalPreviewParagraphs =
    finalPost
      ?.split('\n')
      .filter(
        (line) =>
          line.trim().length > 0 &&
          !line.startsWith('#') &&
          !line.startsWith('>') &&
          !line.startsWith('-'),
      )
      .slice(0, 2) ?? []
  const finalSections = finalPost
    ? finalPost
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.replace(/^##\s+/, ''))
        .slice(0, 4)
    : []
  const liveRegionMessage = [
    `상태 ${statusLabel(state.generation.status)}`,
    `현재 단계 ${currentStage.label}`,
    state.copyFeedback || state.generation.statusMessage,
  ].join(' · ')
  const screenIndex = screenMeta.findIndex((screen) => screen.id === currentScreen)
  const activeScreenMeta = screenMeta[screenIndex] ?? screenMeta[0]
  const progressScreenLocked =
    state.generation.status === 'initial' || state.generation.status === 'error'
  const publishScreenLocked = !finalPost
  const stagePanelOrderLabel = String(selectedStageIndex + 1).padStart(2, '0')
  const topbarStatusSummary =
    state.copyFeedback ||
    (currentScreen === 'brief'
      ? '브리프를 잠그면 다음 화면에서 단계별 작성이 바로 시작됩니다.'
      : currentScreen === 'progress'
        ? finalPost
          ? '최종 원고가 열렸습니다. 게시 화면으로 넘어가 제목과 구조만 먼저 확인하세요.'
          : '현재 단계 카드 하나만 읽으며 흐름을 유지하는 구간입니다.'
        : finalPost
          ? '복사 직전 제목, 구조, 검토 메모만 남긴 게시 준비 상태입니다.'
          : '다섯 단계가 모두 닫히면 이 화면이 자동으로 열립니다.')
  const copyStatus =
    state.copyFeedback.includes('실패')
      ? { label: '다시 시도 필요', tone: 'error' as const }
      : state.copyFeedback.includes('복사했습니다')
        ? { label: '복사 완료', tone: 'ready' as const }
        : finalPost
          ? { label: '복사 준비', tone: 'current' as const }
          : { label: '잠금 상태', tone: 'pending' as const }
  const publishChecklist = [
    {
      label: '제목 판독',
      value: finalPost ? '확인 가능' : '대기',
      tone: finalPost ? ('ready' as const) : ('pending' as const),
    },
    {
      label: '섹션 구조',
      value: finalSections.length ? `${finalSections.length}개 섹션` : '대기',
      tone: finalSections.length ? ('ready' as const) : ('pending' as const),
    },
    {
      label: '검토 메모',
      value: reviewNotes ? `${reviewNotes.length}개 정리` : '대기',
      tone: reviewNotes ? ('current' as const) : ('pending' as const),
    },
    {
      label: '복사 상태',
      value: copyStatus.label,
      tone: copyStatus.tone,
    },
  ]
  const nextStage =
    currentStageIndex >= 0 && currentStageIndex < workflowStages.length - 1
      ? workflowStages[currentStageIndex + 1]
      : null
  const ribbonLead =
    currentScreen === 'brief'
      ? '브리프에서 출고까지 같은 결의 리본으로 연결합니다'
      : currentScreen === 'progress'
        ? '현재 단계와 다음 인계를 같은 리본 위에 붙여 둡니다'
        : '출고 직전 판단만 남기고 전문은 뒤쪽 레이어로 물립니다'
  const ribbonSummary =
    currentScreen === 'brief'
      ? '첫 화면에서는 입력을 잠그는 이유와 다음 화면으로 넘어갈 준비만 짧게 보여 줍니다.'
      : currentScreen === 'progress'
        ? '둘째 화면은 지금 읽어야 할 단계와 다음 인계만 남겨 진행 압박을 줄입니다.'
        : '셋째 화면은 제목, 구조, 복사 상태만 먼저 남기고 전문은 뒤쪽 레이어로 미룹니다.'
  const ribbonCurrentFocus =
    currentScreen === 'brief'
      ? {
          label: '지금 초점',
          title: '브리프 잠금',
          detail:
            briefChips.length > 0
              ? `${briefChips.join(' · ')} 기준으로 첫 단계를 시작합니다.`
              : '독자, 톤, 길이를 먼저 고정한 뒤 생성으로 넘깁니다.',
        }
      : currentScreen === 'progress'
        ? {
            label: '지금 초점',
            title: currentStage.label,
            detail:
              state.generation.status === 'error'
                ? '오류는 이 단계 앞에서 멈추고, 첫 화면으로 되돌려 복구 경로를 짧게 유지합니다.'
                : state.generation.status === 'loading'
                  ? '한 번에 한 단계씩만 열어 읽기 부담을 줄이고, 완료된 단계는 뒤로 접어 둡니다.'
                  : '닫힌 단계는 다시 읽을 수 있지만 현재 단계만 가장 강하게 드러납니다.',
          }
      : {
          label: '지금 초점',
          title: finalPost ? '출고 판독' : '게시 잠금',
          detail: finalPost
            ? '제목, 구조, 복사 상태만 먼저 판독해 마지막 판단을 짧게 끝냅니다.'
            : '진행 화면에서 최종 단계가 닫히면 이 면이 자동으로 열립니다.',
        }
  const ribbonNextFocus =
    currentScreen === 'brief'
      ? {
          label: '다음 인계',
          title: '리서치 단계',
          detail: '생성과 동시에 둘째 화면으로 미끄러지며 리서치 카드가 가장 먼저 열립니다.',
        }
      : currentScreen === 'progress'
        ? {
            label: '다음 인계',
            title: finalPost ? '게시 준비' : (nextStage?.label ?? '최종 원고'),
            detail: finalPost
              ? '게시 면에서는 전문을 먼저 펼치지 않고 제목과 구조부터 짧게 확인합니다.'
              : '현재 단계가 닫히는 즉시 다음 카드가 이어서 선택되어 흐름이 끊기지 않습니다.',
          }
      : {
          label: '다음 인계',
          title: '마크다운 복사',
          detail: '복사 이후에는 외부 게시 도구로 넘길 수 있도록 결과 상태만 또렷하게 남깁니다.',
        }
  const ribbonContext =
    currentScreen === 'brief'
      ? `${topicSnapshot} · ${briefChips.join(' · ') || '입력 기준을 고정하는 중'}`
      : currentScreen === 'progress'
        ? `${currentStage.label} 이후 ${nextStage?.label ?? '최종 원고'}로 이어집니다.`
        : `${finalSections.length ? `${finalSections.length}개 섹션` : '섹션 대기'} · ${copyStatus.label}`

  const screenFrameProps = (screenId: ScreenId): WizardScreenProps => {
    const hidden = currentScreen !== screenId

    return {
      'aria-hidden': hidden,
      inert: hidden || undefined,
    }
  }

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    setCurrentScreen('progress')
    setSelectedStage('research')

    dispatch({
      type: 'start-run',
      message: '브리프를 읽고 리서치에서 최종 원고까지 한 단계씩 펼치는 중입니다.',
    })

    await sleep(240)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      setCurrentScreen('brief')
      dispatch({
        type: 'set-error',
        message: '의도적으로 실패 조건이 들어간 주제입니다. 주제를 바꾼 뒤 다시 생성해 주세요.',
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
      await sleep(240)
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

    await sleep(160)
    if (runRef.current !== runId) {
      return
    }

    dispatch({
      type: 'finalize-run',
      outputs,
      message: '최종 원고가 준비되었습니다. 이제 게시 준비 화면에서 제목과 섹션 흐름을 확인할 수 있습니다.',
    })
  }

  async function handleCopyMarkdown() {
    if (!finalPost) {
      dispatch({
        type: 'set-copy-feedback',
        message: '먼저 원고 생성을 완료해야 마크다운을 복사할 수 있습니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(finalPost)
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 마크다운을 복사했습니다. 이제 게시 화면에서 마지막 문장만 점검하면 됩니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '브라우저 권한 때문에 복사에 실패했습니다. 권한을 확인한 뒤 다시 시도해 주세요.',
      })
    }
  }

  function handleStageKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }

    event.preventDefault()

    let targetIndex = index

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      targetIndex = Math.min(index + 1, workflowStages.length - 1)
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      targetIndex = Math.max(index - 1, 0)
    }

    if (event.key === 'Home') {
      targetIndex = 0
    }

    if (event.key === 'End') {
      targetIndex = workflowStages.length - 1
    }

    setSelectedStage(workflowStages[targetIndex].id)
    stageButtonRefs.current[targetIndex]?.focus()
  }

  function renderLoadingState(title: string, description: string) {
    return (
      <section className="empty-state loading-state" aria-live="polite">
        <div className="empty-icon" aria-hidden="true">
          진행
        </div>
        <div className="empty-copy">
          <strong>{title}</strong>
          <p>{description}</p>
          <div className="loading-skeleton" aria-hidden="true">
            <span className="skeleton-line skeleton-line-lg" />
            <span className="skeleton-line skeleton-line-md" />
            <span className="skeleton-line skeleton-line-sm" />
          </div>
        </div>
      </section>
    )
  }

  function renderEmptyState(
    icon: string,
    title: string,
    description: string,
    actionLabel: string,
    onAction: () => void,
    tone: 'default' | 'error' = 'default',
  ) {
    return (
      <section className={`empty-state ${tone === 'error' ? 'error-state' : ''}`.trim()} role={tone === 'error' ? 'alert' : undefined}>
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
        <div className="empty-copy">
          <strong>{title}</strong>
          <p>{description}</p>
          <button className="ghost-button empty-action" onClick={onAction} type="button">
            {actionLabel}
          </button>
        </div>
      </section>
    )
  }

  function renderScreenSequencer(activeScreen: ScreenId) {
    return (
      <div className="screen-sequencer" aria-hidden="true">
        {screenMeta.map((screen, index) => (
          <span
            className={`sequencer-dot ${screen.id === activeScreen ? 'is-active' : ''}`.trim()}
            key={screen.id}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        ))}
      </div>
    )
  }

  function renderSelectedStageBody() {
    if (selectedStage === 'research') {
      if (state.generation.status === 'error') {
        return renderEmptyState(
          '오류',
          '리서치 단계 전에 브리프를 다시 맞춰야 합니다.',
          state.generation.errorMessage ?? '브리프를 수정한 뒤 다시 생성해 주세요.',
          '브리프 면으로 돌아가기',
          () => setCurrentScreen('brief'),
          'error',
        )
      }

      if (
        state.generation.currentStage === 'research' &&
        state.generation.status === 'loading' &&
        !researchSummary
      ) {
        return renderLoadingState(
          '리서치 축을 잠그는 중입니다.',
          '검색 키워드와 핵심 논지를 먼저 묶은 뒤 다음 단계로 넘깁니다.',
        )
      }

      if (!researchSummary) {
        return renderEmptyState(
          '탐색',
          '리서치 결과가 아직 열리지 않았습니다.',
          '원고를 시작하면 핵심 논지와 참고 축이 이 면에 먼저 정리됩니다.',
          '브리프 면으로 가기',
          () => setCurrentScreen('brief'),
        )
      }

      return (
        <div className="reader-stack">
          <article className="reader-card">
            <p className="eyebrow">리서치 프레임</p>
            <h3>논지와 독자 적합도</h3>
            <p>{researchSummary.angle}</p>
            <p>{researchSummary.thesis}</p>
            <div className="reader-highlight">{researchSummary.audienceFit}</div>
          </article>
          <article className="reader-card">
            <p className="eyebrow">탐색 키워드</p>
            <h3>검색 힌트와 참고 출처</h3>
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
          </article>
        </div>
      )
    }

    if (selectedStage === 'outline') {
      if (state.generation.currentStage === 'outline' && state.generation.status === 'loading' && !outline) {
        return renderLoadingState(
          '개요 흐름을 정리하는 중입니다.',
          '독자가 따라갈 순서를 먼저 잠그고 나서 섹션 초안을 엽니다.',
        )
      }

      if (!outline) {
        return renderEmptyState(
          '윤곽',
          '개요 설계가 아직 준비되지 않았습니다.',
          '리서치가 닫히면 독자가 따라갈 순서가 이 카드에 압축됩니다.',
          '리서치 결과 보기',
          () => setSelectedStage('research'),
        )
      }

      return (
        <article className="reader-card">
          <p className="eyebrow">개요 설계</p>
          <h3>문단 흐름</h3>
          <ol className="outline-list">
            {outline.map((section, index) => (
              <li key={section.id}>
                <span>{index + 1}</span>
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
      if (
        state.generation.currentStage === 'drafts' &&
        state.generation.status === 'loading' &&
        !sectionDrafts
      ) {
        return renderLoadingState(
          '본문 초안을 이어 쓰는 중입니다.',
          '섹션별 카드가 순서대로 열리며 초안과 핵심 문장을 채우고 있습니다.',
        )
      }

      if (!sectionDrafts) {
        return renderEmptyState(
          '본문',
          '섹션 초안은 진행 화면에서 순서대로 열립니다.',
          '지금은 개요를 잠그는 중이거나 앞선 단계가 아직 닫히지 않았습니다.',
          '개요 단계 보기',
          () => setSelectedStage('outline'),
        )
      }

      return (
        <div className="reader-stack">
          {sectionDrafts.map((draft) => (
            <article className="reader-card" key={draft.id}>
              <p className="eyebrow">섹션 초안</p>
              <h3>{draft.title}</h3>
              {draft.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <div className="reader-highlight">{draft.takeaway}</div>
            </article>
          ))}
        </div>
      )
    }

    if (selectedStage === 'review') {
      if (state.generation.currentStage === 'review' && !reviewNotes) {
        return renderLoadingState(
          '검토 메모를 추리는 중입니다.',
          '과한 문장과 빠진 논점을 걸러낸 뒤 게시 준비 화면으로 넘깁니다.',
        )
      }

      if (!reviewNotes) {
        return renderEmptyState(
          '검토',
          '검토 메모는 초안 뒤에 이어집니다.',
          '섹션 초안이 모두 채워진 뒤 빠진 논점과 문장 리듬을 여기서 걸러냅니다.',
          '초안 단계 보기',
          () => setSelectedStage('drafts'),
        )
      }

      return (
        <div className="reader-stack">
          {reviewNotes.map((note) => (
            <article className={`reader-card review-${note.severity}`} key={`${note.label}-${note.detail}`}>
              <div className="review-head">
                <h3>{note.label}</h3>
                <span>{note.severity === 'good' ? '유지' : note.severity === 'watch' ? '주의' : '보완'}</span>
              </div>
              <p>{note.detail}</p>
            </article>
          ))}
        </div>
      )
    }

    if (!finalPost) {
      return renderEmptyState(
        '게시',
        '최종 원고는 마지막 단계에서만 열립니다.',
        '검토 메모까지 닫히면 게시 준비 화면으로 이동할 수 있습니다.',
        '검토 단계 보기',
        () => setSelectedStage('review'),
      )
    }

    return (
      <article className="reader-card final-card">
        <p className="eyebrow">최종 요약</p>
        <h3>{finalTitle}</h3>
        <p>{finalExcerpt || '첫 문단 요약이 이 위치에 먼저 나타납니다.'}</p>
        <div className="final-outline">
          {finalSections.map((section, index) => (
            <div className="final-outline-item" key={section}>
              <span>{index + 1}</span>
              <strong>{section}</strong>
            </div>
          ))}
        </div>
        <div className="reader-highlight">
          {state.copyFeedback || '최종 화면으로 넘어가면 제목, 섹션 구조, 복사 상태만 먼저 확인할 수 있습니다.'}
        </div>
        <div className="final-proof-strip">
          <p className="eyebrow">게시 직전 판독</p>
          <h4>전문은 마지막 화면으로 미루고 핵심 문장만 먼저 읽습니다</h4>
          <ul className="proof-points">
            {finalPreviewParagraphs.map((paragraph) => (
              <li key={paragraph}>{paragraph}</li>
            ))}
          </ul>
        </div>
      </article>
    )
  }

  return (
    <main className={`single-agent-shell screen-${currentScreen} status-${state.generation.status}`.trim()}>
      <div className="assistive-live" aria-atomic="true" aria-live="polite">
        {liveRegionMessage}
      </div>

      <header className="topbar surface-card">
        <div className="topbar-copy">
          <p className="kicker">단일 작성 편집실</p>
          <h1>한 명의 필자가 세 장의 교정지로 넘기는 원고실</h1>
          <p>
            브리프를 묶고, 진행 화면에서 한 단계씩 교정하고, 마지막 장에서만 게시 직전 원고를
            엽니다. 첫 화면은 입력만, 둘째 화면은 현재 단계만, 셋째 화면은 출고 판단만 보여 줍니다.
          </p>
        </div>
        <div aria-label="현재 작업 상태" className="topbar-status-grid">
          <article className="topbar-status-card">
            <p className="kicker">지금 열려 있는 면</p>
            <strong>{activeScreenMeta.label}</strong>
            <p>{activeScreenMeta.deck}</p>
          </article>
          <article className="topbar-status-card">
            <p className="kicker">집중 메모</p>
            <strong>{state.generation.status === 'error' ? '복구 우선' : statusLabel(state.generation.status)}</strong>
            <p>{topbarStatusSummary}</p>
          </article>
        </div>
      </header>

      <nav aria-label="화면 이동" className="screen-switcher">
        {screenMeta.map((screen) => {
          const locked =
            screen.id === 'progress'
              ? progressScreenLocked
              : screen.id === 'publish'
                ? publishScreenLocked
                : false

          return (
            <button
              className={`screen-pill ${currentScreen === screen.id ? 'is-active' : ''}`.trim()}
              disabled={locked}
              key={screen.id}
              onClick={() => setCurrentScreen(screen.id)}
              type="button"
            >
              <span>{screen.deck}</span>
              <strong>{screen.label}</strong>
            </button>
          )
        })}
      </nav>

      <section
        aria-label="단계 인계 리본"
        className="story-ribbon surface-card enter-block"
        style={{ animationDelay: '0ms' }}
      >
        <div className="story-ribbon-head">
          <div className="story-ribbon-copy">
            <p className="kicker">스토리 리본</p>
            <h2>{ribbonLead}</h2>
            <p>{ribbonSummary}</p>
            <p className="ribbon-context">{ribbonContext}</p>
          </div>
          <div className="story-ribbon-focus">
            <article className="ribbon-focus-card">
              <span>{ribbonCurrentFocus.label}</span>
              <strong>{ribbonCurrentFocus.title}</strong>
              <p>{ribbonCurrentFocus.detail}</p>
            </article>
            <article className="ribbon-focus-card is-next">
              <span>{ribbonNextFocus.label}</span>
              <strong>{ribbonNextFocus.title}</strong>
              <p>{ribbonNextFocus.detail}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="wizard-viewport surface-card">
        <div
          className={`wizard-track wizard-screen-${currentScreen}`.trim()}
          style={{ transform: `translateX(-${screenIndex * 100}%)` }}
        >
          <section
            {...screenFrameProps('brief')}
            aria-label="브리프 작성 화면"
            className="wizard-screen"
            data-screen="brief"
          >
            <div className="screen-curtain">
              <div className="curtain-copy enter-block" style={{ animationDelay: '0ms' }}>
                <p className="kicker">첫 화면</p>
                <h2>브리프를 잠그고 바로 시작합니다</h2>
                <p>
                  첫 화면에는 입력, 프리셋, 시작 행동만 남겼습니다. 복잡한 산출물은 다음 화면으로
                  넘기고 지금 필요한 선택만 보이게 만듭니다.
                </p>
              </div>
              <div className="curtain-docket enter-block" style={{ animationDelay: '50ms' }}>
                <span className="docket-label">지금 준비된 조합</span>
                <strong>{topicSnapshot}</strong>
                <p>{briefChips.join(' · ') || '독자 · 톤 · 길이를 정하는 중입니다.'}</p>
                <span className="folio-stamp">01 / 03</span>
                {renderScreenSequencer('brief')}
                <p className="docket-note">다음 장에서는 리서치 축과 개요가 한 단계씩 잠깁니다.</p>
                <div className="docket-metrics" aria-hidden="true">
                  <div className="docket-metric">
                    <span>입력 기준</span>
                    <strong>{briefChips.length ? `${briefChips.length}개 고정` : '선택 중'}</strong>
                  </div>
                  <div className="docket-metric">
                    <span>다음 행동</span>
                    <strong>원고 만들기</strong>
                  </div>
                </div>
              </div>
            </div>

            {state.generation.status === 'error' ? (
              <section className="brief-alert" role="alert">
                <div className="alert-mark" aria-hidden="true">
                  !
                </div>
                <div>
                  <strong>브리프를 다시 조정해 주세요.</strong>
                  <p>{state.generation.errorMessage}</p>
                </div>
              </section>
            ) : null}

            <div className="brief-grid">
              <article className="brief-panel enter-block" style={{ animationDelay: '100ms' }}>
                <div className="panel-head">
                  <div>
                    <p className="kicker">브리프 입력</p>
                    <h3>작성 기준 네 가지</h3>
                  </div>
                  <button
                    className="primary-button"
                    data-testid="Generate post"
                    disabled={state.generation.status === 'loading'}
                    onClick={() => void handleGenerate()}
                    type="button"
                  >
                    {state.generation.status === 'loading' ? '원고 생성 중' : '원고 만들기'}
                  </button>
                </div>

                <form className="brief-form" onSubmit={(event) => event.preventDefault()}>
                  <label
                    className={`field-shell field-topic ${state.inputs.topic.trim() ? 'has-value' : ''}`.trim()}
                  >
                    <textarea
                      data-testid="Topic"
                      name="topic"
                      onChange={(event) =>
                        dispatch({
                          type: 'update-input',
                          field: 'topic',
                          value: event.target.value,
                        })
                      }
                      rows={3}
                      value={state.inputs.topic}
                    />
                    <span className="field-label">주제</span>
                    <span className="field-underline" aria-hidden="true" />
                  </label>

                  <div className="brief-select-grid">
                    <label className="field-shell has-value">
                      <select
                        data-testid="Audience"
                        name="audience"
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
                      <span className="field-label">독자</span>
                      <span className="field-underline" aria-hidden="true" />
                    </label>

                    <label className="field-shell has-value">
                      <select
                        data-testid="Tone"
                        name="tone"
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
                      <span className="field-label">톤</span>
                      <span className="field-underline" aria-hidden="true" />
                    </label>

                    <label className="field-shell has-value">
                      <select
                        data-testid="Length"
                        name="length"
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
                      <span className="field-label">길이</span>
                      <span className="field-underline" aria-hidden="true" />
                    </label>
                  </div>
                </form>
              </article>

              <aside className="support-column enter-block" style={{ animationDelay: '150ms' }}>
                <article className="support-panel">
                  <p className="kicker">빠른 시작 묶음</p>
                  <h3>프리셋은 필요할 때만 펼칩니다</h3>
                  <p className="panel-description">
                    첫 화면은 브리프 입력에 집중하고, 추천 조합은 서랍 안에서 꺼내 쓰도록 정리했습니다.
                  </p>
                  <div className="preset-spotlight">
                    <div className="preset-spotlight-copy">
                      <span className="preset-note">오늘의 추천</span>
                      <strong>{featuredPreset.title}</strong>
                      <p>{featuredPreset.rationale}</p>
                    </div>
                    <div className="tag-row">
                      {featuredPresetChips.map((chip) => (
                        <span className="soft-tag" key={chip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                  <details className="support-drawer preset-drawer">
                    <summary>프리셋 펼치기</summary>
                    <div className="drawer-body">
                      <div className="preset-grid">
                        {topicPresets.map((preset, index) => (
                          <button
                            className="preset-card"
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
                            style={{ animationDelay: `${200 + index * 50}ms` }}
                            type="button"
                          >
                            <span>{preset.rationale}</span>
                            <strong>{preset.title}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  </details>
                </article>

                <article className="support-panel recovery-panel">
                  <p className="kicker">복구 메모</p>
                  <h3>항상 첫 장으로 되돌아와 다시 맞출 수 있습니다</h3>
                  <p className="panel-description">
                    생성이 멈추면 오류는 이 장에만 남기고 나머지 화면은 다시 잠급니다. 주제나 톤을
                    손본 뒤 같은 자리에서 재시작하면 됩니다.
                  </p>
                  <div className="recovery-pill-row">
                    <span className="recovery-pill">안전 지점: 브리프</span>
                    <span className="recovery-pill">복구 방식: 입력 수정 후 재생성</span>
                  </div>
                </article>
              </aside>
            </div>
          </section>

          <section
            {...screenFrameProps('progress')}
            aria-label="작성 진행 화면"
            className="wizard-screen"
            data-screen="progress"
          >
            <div className="screen-curtain">
              <div className="curtain-copy enter-block" style={{ animationDelay: '0ms' }}>
                <p className="kicker">둘째 화면</p>
                <h2>{state.generation.status === 'loading' ? '지금 움직이는 단계만 전면에 둡니다' : '진행 흔적을 정리해 게시 화면으로 넘깁니다'}</h2>
                <p>{state.generation.statusMessage}</p>
              </div>
              <div className="curtain-docket enter-block" style={{ animationDelay: '50ms' }}>
                <span className="docket-label">다음 행동</span>
                <strong>{finalPost ? '최종 원고 보기' : '현재 단계 집중'}</strong>
                <p>
                  {finalPost
                    ? '게시 화면으로 이동해 제목, 섹션 구조, 복사 준비 상태만 먼저 확인합니다.'
                    : '왼쪽 단계 목록에서 현재 진행 중인 카드가 자동으로 선택됩니다.'}
                </p>
                <span className="folio-stamp">02 / 03</span>
                {renderScreenSequencer('progress')}
                <p className="docket-note">파이프라인 그래프처럼 진행 흔적은 남기되, 읽기는 한 단계씩만 허용합니다.</p>
                <div className="docket-metrics" aria-hidden="true">
                  <div className="docket-metric">
                    <span>현재 단계</span>
                    <strong>{currentStage.label}</strong>
                  </div>
                  <div className="docket-metric">
                    <span>남은 단계</span>
                    <strong>{remainingStageCount}개</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="progress-grid">
              <aside className="progress-sidebar enter-block" style={{ animationDelay: '100ms' }}>
                <article className="progress-panel">
                  <div className="panel-head">
                    <div>
                      <p className="kicker">진행 파형</p>
                      <h3>{statusLabel(state.generation.status)}</h3>
                    </div>
                    <button
                      className="primary-button"
                      disabled={!finalPost}
                      onClick={() => setCurrentScreen('publish')}
                      type="button"
                    >
                      최종 원고 보기
                    </button>
                  </div>
                  <div className="progress-bar" aria-hidden="true">
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="progress-meta">
                    <strong>{progressPercent}%</strong>
                    <span>
                      {state.generation.status === 'initial'
                        ? '브리프를 잠그면 단계가 시작됩니다.'
                        : state.generation.status === 'error'
                          ? '복구를 위해 브리프를 다시 조정해 주세요.'
                          : `${state.generation.completedStages.length}개 단계 완료`}
                    </span>
                  </div>
                  <div className="progress-rail" aria-hidden="true">
                    {workflowStages.map((stage, index) => {
                      const visualState = stageVisualState(stage, state.generation)

                      return (
                        <div
                          className={`progress-rail-node rail-${visualState}`.trim()}
                          key={stage.id}
                        >
                          <span className="rail-status-dot" />
                          {index < workflowStages.length - 1 ? <span className="rail-link" /> : null}
                          <span className="rail-label">{stage.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </article>

                <div aria-label="작성 단계 선택" aria-orientation="vertical" className="stage-list" role="tablist">
                  {workflowStages.map((stage, index) => {
                    const visualState = stageVisualState(stage, state.generation)
                    const isSelected = selectedStage === stage.id
                    const compactProgressCopy =
                      visualState === 'complete'
                        ? '완료'
                        : visualState === 'current'
                          ? '진행 중'
                          : visualState === 'error'
                            ? '복구 필요'
                            : '곧 열림'

                    return (
                      <button
                        aria-controls={`stage-panel-${stage.id}`}
                        aria-selected={isSelected}
                        className={`stage-card stage-${visualState} ${isSelected ? 'is-selected' : ''}`.trim()}
                        data-testid={`stage-${stage.id}`}
                        id={`stage-tab-${stage.id}`}
                        key={stage.id}
                        onClick={() => setSelectedStage(stage.id)}
                        onKeyDown={(event) => handleStageKeyDown(event, index)}
                        ref={(element) => {
                          stageButtonRefs.current[index] = element
                        }}
                        role="tab"
                        tabIndex={isSelected ? 0 : -1}
                        type="button"
                      >
                        <div className="stage-card-head">
                          <span className="stage-order">{String(index + 1).padStart(2, '0')}</span>
                          <span className={`stage-badge stage-badge-${visualState}`.trim()}>
                            {visualState === 'complete'
                              ? '완료'
                              : visualState === 'current'
                                ? '진행'
                                : visualState === 'error'
                                  ? '오류'
                                  : '대기'}
                          </span>
                        </div>
                        <div className="stage-card-copy">
                          <strong>{stage.label}</strong>
                          <p>{isSelected ? stageProgressCopy(state.generation, stage) : compactProgressCopy}</p>
                        </div>
                        <div className="stage-card-mark" aria-hidden="true">
                          {visualState === 'complete' ? (
                            <span className="checkmark-shell">
                              <svg className="checkmark" viewBox="0 0 24 24">
                                <path d="M5 13.2L9.2 17.4L19 7.6" />
                              </svg>
                            </span>
                          ) : visualState === 'current' ? (
                            <span className="pulse-dot" />
                          ) : visualState === 'error' ? (
                            <span className="error-dot" />
                          ) : (
                            <span className="pending-dot" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </aside>

              <section
                aria-labelledby={`stage-tab-${selectedStage}`}
                className="reader-panel enter-block"
                id={`stage-panel-${selectedStage}`}
                role="tabpanel"
                style={{ animationDelay: '150ms' }}
              >
                <div className="panel-head">
                  <div>
                    <p className="kicker">현재 단계 판독</p>
                    <h3>
                      {stagePanelOrderLabel}. {selectedStageMeta.label}
                    </h3>
                  </div>
                  <span className="reader-state">
                    {selectedStage === currentStage.id && state.generation.status !== 'initial'
                      ? '현재 단계'
                      : state.generation.completedStages.includes(selectedStage)
                        ? '완료된 단계'
                        : '예고 단계'}
                  </span>
                </div>
                <p className="panel-description">
                  {selectedStage === currentStage.id
                    ? state.generation.statusMessage
                    : selectedStageIndex < currentStageIndex
                      ? '이미 닫은 결과를 다시 읽으며 논지와 밀도를 점검하는 면입니다.'
                      : '앞선 단계가 닫히면 이 산출물이 순서대로 열립니다.'}
                </p>
                {renderSelectedStageBody()}
              </section>
            </div>
          </section>

          <section
            {...screenFrameProps('publish')}
            aria-label="게시 준비 화면"
            className="wizard-screen"
            data-screen="publish"
          >
            <div className="screen-curtain">
              <div className="curtain-copy enter-block" style={{ animationDelay: '0ms' }}>
                <p className="kicker">셋째 화면</p>
                <h2>{finalPost ? '제목과 구조를 마지막으로 확인합니다' : '최종 원고가 아직 잠겨 있습니다'}</h2>
                <p>
                  {finalPost
                    ? '전체 초안을 한 번에 쏟아붓지 않고, 제목과 섹션 구조를 먼저 보여 준 뒤 전문은 펼침 레이어로 넘깁니다.'
                    : '진행 화면에서 다섯 단계가 모두 닫히면 이 화면이 게시 준비 면으로 바뀝니다.'}
                </p>
              </div>
              <div className="curtain-docket enter-block" style={{ animationDelay: '50ms' }}>
                <span className="docket-label">게시 상태</span>
                <strong>{finalPost ? '복사 준비 완료' : '잠금 상태'}</strong>
                <p>{state.copyFeedback || '복사 버튼은 최종 원고가 열릴 때만 활성화됩니다.'}</p>
                <span className="folio-stamp">03 / 03</span>
                {renderScreenSequencer('publish')}
                <p className="docket-note">전문은 서랍 안에 남기고, 첫 판독은 제목과 구조만으로 끝냅니다.</p>
                <div className="docket-metrics" aria-hidden="true">
                  <div className="docket-metric">
                    <span>구조 판독</span>
                    <strong>{finalSections.length ? `${finalSections.length}개 섹션` : '대기'}</strong>
                  </div>
                  <div className="docket-metric">
                    <span>복사 상태</span>
                    <strong>{copyStatus.label}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="publish-grid">
              <article className="publish-panel enter-block" style={{ animationDelay: '100ms' }}>
                {!finalPost ? (
                  renderEmptyState(
                    '게시',
                    '최종 원고가 아직 준비되지 않았습니다.',
                    '진행 화면에서 마지막 단계를 닫으면 이 화면이 자동으로 복사 준비 면이 됩니다.',
                    '진행 면으로 돌아가기',
                    () => setCurrentScreen('progress'),
                  )
                ) : (
                  <>
                    <div className="panel-head">
                      <div>
                        <p className="kicker">게시 미리보기</p>
                        <h3>{finalTitle}</h3>
                      </div>
                      <button
                        className="primary-button"
                        data-testid="Copy markdown"
                        onClick={() => void handleCopyMarkdown()}
                        type="button"
                      >
                        마크다운 복사
                      </button>
                    </div>

                    <p className="panel-description">
                      {finalExcerpt || '첫 문단 요약이 이 위치에 먼저 나타나며, 전문은 아래 펼침 레이어에서 확인합니다.'}
                    </p>

                    <div className="final-structure-grid">
                      {finalSections.map((section, index) => (
                        <div className="structure-card" key={section}>
                          <span>{index + 1}</span>
                          <strong>{section}</strong>
                        </div>
                      ))}
                    </div>

                    <details className="support-drawer">
                      <summary>전문 원고 펼치기</summary>
                      <div className="drawer-body final-panel">
                        <pre className="markdown-preview">{finalPost}</pre>
                      </div>
                    </details>
                  </>
                )}
              </article>

              <aside className="support-column enter-block" style={{ animationDelay: '150ms' }}>
                <article className="support-panel handoff-panel">
                  <p className="kicker">출고 체크</p>
                  <h3>넘길 준비를 네 줄로 끝냅니다</h3>
                  <p className="panel-description">
                    글쓰기 에디터의 미리보기-게시 전환처럼, 이 면에서는 제목과 구조와 복사 상태만
                    빠르게 확인합니다.
                  </p>
                  <div className="handoff-grid">
                    {publishChecklist.map((item) => (
                      <article
                        className={`handoff-card tone-${item.tone}`.trim()}
                        key={item.label}
                      >
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="support-panel">
                  <p className="kicker">검토 메모</p>
                  <h3>마지막 확인</h3>
                  {reviewNotes ? (
                    <ul className="review-list">
                      {reviewNotes.map((note) => (
                        <li key={`${note.label}-${note.detail}`}>
                          <strong>{note.label}</strong>
                          <p>{note.detail}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="compact-empty">
                      {renderEmptyState(
                        '검토',
                        '검토 메모 대기 중',
                        '초안이 채워지면 게시 전 확인 항목이 여기에 모입니다.',
                        '진행 면 보기',
                        () => setCurrentScreen('progress'),
                      )}
                    </div>
                  )}
                </article>

                <article className="support-panel">
                  <p className="kicker">지원 레이어</p>
                  <h3>보조 기록 서랍</h3>
                  <details className="support-drawer">
                    <summary>보조 기록 펼치기</summary>
                    <div className="drawer-body">
                      <ul className="deliverable-list">
                        {deliverables.map((deliverable) => (
                          <li key={deliverable.id}>
                            <strong>{deliverable.title}</strong>
                            <p>{deliverable.description}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                </article>
              </aside>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
