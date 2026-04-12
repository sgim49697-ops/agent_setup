import { useReducer, useRef, useState } from 'react'
import './App.css'
import type {
  ArtifactIndex,
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
  statusMessage: '코디네이터가 공통 브리프를 기다리고 있습니다. 먼저 보드를 생성해 공통 프레임을 고정하세요.',
  errorMessage: null,
}

const stageHookLabels = {
  research: 'Research results',
  outline: 'Outline',
  drafts: 'Section drafts',
  review: 'Review notes',
  final: 'Final post',
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
                statusMessage: '브리프를 수정했습니다. 다시 생성해 보드를 처음부터 재구성하세요.',
              }
            : state.generation,
      }
    case 'apply-preset':
      return {
        ...state,
        inputs: action.payload,
        generation: {
          ...state.generation,
          statusMessage: '프리셋을 불러왔습니다. 이제 코디네이터가 글을 레인별 소유 범위로 나눌 수 있습니다.',
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
          statusMessage: '공통 브리프가 완성되기 전에 코디네이터가 멈췄습니다.',
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
    loading: '보드 구성 중',
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

function App() {
  const [state, dispatch] = useReducer(reducer, {
    inputs: initialInputs,
    generation: initialGeneration,
    copyFeedback: '',
  })
  const runRef = useRef(0)
  const [activeReaderPanel, setActiveReaderPanel] = useState<'review' | 'final' | null>(null)

  async function handleGenerate() {
    const runId = runRef.current + 1
    runRef.current = runId
    setActiveReaderPanel(null)

    dispatch({
      type: 'start-run',
      message: '코디네이터가 공통 브리프를 고정한 뒤, 보드를 세 개의 섹션 레인으로 나눕니다.',
    })

    await sleep(260)
    if (runRef.current !== runId) {
      return
    }

    if (/^\s*(fail|error)\b/i.test(state.inputs.topic)) {
      dispatch({
        type: 'set-error',
        message:
          '코디네이터 리서치 단계에서 유효한 브리프를 만들지 못했습니다. 주제를 수정한 뒤 보드를 다시 실행하세요.',
      })
      return
    }

    const { brief, outline, assignments } = createCoordinatorBrief(state.inputs)

    dispatch({
      type: 'set-coordinator',
      brief,
      outline,
      assignments,
      message: '코디네이터 브리프를 고정했습니다. 이제 아웃라인, 레인 배정, 머지 기준을 확인할 수 있습니다.',
    })

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
            message: `${laneStatusLabel(packet.writerId)}이 미리보기 블록 ${packet.draftPreview.length}개를 마쳤습니다.`,
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
      message: '머지 데스크가 중복을 줄이고, 전환을 넣고, 전체 묶음의 톤을 정렬하고 있습니다.',
    })

    await sleep(300)
    if (runRef.current !== runId) {
      return
    }

    const mergeReport = createMergeReport(state.inputs, brief, lanePackets)

    dispatch({
      type: 'set-merge-report',
      report: mergeReport,
      message: '머지 리뷰를 마쳤습니다. 이제 읽기용 최종 글과 내보내기 구성을 준비할 수 있습니다.',
    })

    await sleep(180)
    if (runRef.current !== runId) {
      return
    }

    const finalArticle = createFinalArticle(state.inputs, brief, lanePackets, mergeReport)

    dispatch({
      type: 'finalize-run',
      outputs: assembleFinalOutputs(brief, outline, assignments, lanePackets, mergeReport, finalArticle),
      message: '뉴스룸 보드가 완료됐습니다. 최종 글은 바로 읽을 수 있고, 필요할 때 마크다운을 내보낼 수 있습니다.',
    })
  }

  async function copyMarkdown() {
    const markdown = state.generation.outputs.final_post

    if (!markdown) {
      dispatch({
        type: 'set-copy-feedback',
        message: '먼저 병합된 글을 생성하세요. 내보내기 준비 완료 상태가 된 뒤에만 복사할 수 있습니다.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(markdown)
      dispatch({
        type: 'set-copy-feedback',
        message: '최종 글 내보내기에서 마크다운을 복사했습니다.',
      })
    } catch {
      dispatch({
        type: 'set-copy-feedback',
        message: '이 브라우저에서는 클립보드 복사에 실패했지만, 아래에 최종 마크다운이 그대로 보입니다.',
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

  const brief = state.generation.outputs.research_summary
  const outline = state.generation.outputs.outline ?? []
  const assignments = state.generation.outputs.assignments ?? []
  const lanePackets = state.generation.outputs.section_drafts ?? []
  const mergeReport = state.generation.outputs.review_notes
  const finalArticle = state.generation.outputs.final_article
  const completedLaneCount = lanePackets.length
  const mergeMoment = !brief
    ? '코디네이터가 공통 논지를 고정하기를 기다리는 중입니다.'
    : !completedLaneCount
      ? '코디네이터는 끝났지만 각 레인이 아직 자기 섹션 패킷을 넘겨야 합니다.'
      : !mergeReport
        ? '모든 레인 패킷이 도착했습니다. 이제 머지 데스크가 중복과 전환을 정리합니다.'
        : finalArticle
          ? '머지가 끝났습니다. 내보내기가 열렸고 글을 바로 전달할 수 있습니다.'
          : '머지 리뷰는 끝났고, 이제 최종 조립만 남았습니다.'
  const nextAction = !brief
    ? '보드를 생성해 공통 프레임을 먼저 만드세요.'
    : completedLaneCount < writerLanes.length
      ? '모든 레인이 초안을 마칠 때까지 기다린 뒤 독자용 화면을 올리세요.'
      : !mergeReport
        ? '머지 수정안을 검토하고, 겹침을 정리하도록 데스크를 밀어주세요.'
        : '병합된 글을 검토한 뒤 마크다운을 내보내세요.'

  const currentReaderPanel = finalArticle ? activeReaderPanel ?? 'final' : 'review'
  const liveStatusHook = state.generation.status === 'export-ready' ? 'export-ready' : null
  const markdownPreview = finalArticle
    ? finalArticle.markdown.split('\n').slice(0, 8).join('\n')
    : ''

  const artifactPreview: ArtifactIndex = {
    screenshots: ['runs/desktop-verification.png', 'runs/mobile-verification.png'],
    final_urls: ['http://127.0.0.1:<dev-port>'],
    notes: [
      '섹션 소유 범위 노출',
      '머지 수정 포인트 노출',
      '독자 우선 최종 글 검증',
      '검증 뒤 평가 완료',
    ],
    deliverables: deliverables.map((item) => item.title),
  }

  return (
    <main className="newsroom-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">병렬 섹션 보드</p>
          <h1>기술 블로그 포스트 생성 워크스페이스</h1>
          <p className="lead">
            코디네이터가 공통 브리프를 먼저 고정하고, 세 개의 레인이 병렬로 초안을 만든 뒤,
            머지 데스크가 하나의 읽기 좋은 글로 묶습니다.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              aria-label="Generate post"
              onClick={handleGenerate}
              disabled={state.generation.status === 'loading'}
            >
              <span className="action-copy">
                {state.generation.status === 'loading' ? '생성 중...' : '글 생성'}
              </span>
            </button>
            <button type="button" className="secondary" aria-label="Copy markdown" onClick={copyMarkdown}>
              <span className="action-copy">마크다운 복사</span>
            </button>
          </div>

          <div className="status-band" aria-live="polite">
            <span className={`status-pill status-${state.generation.status}`}>
              {statusLabel(state.generation.status)}
            </span>
            {liveStatusHook ? <small className="live-hook">{liveStatusHook}</small> : null}
            <p>{state.generation.statusMessage}</p>
            {state.copyFeedback ? <small>{state.copyFeedback}</small> : null}
          </div>

          <div className="next-move-card">
            <p className="block-label">다음 행동</p>
            <h2>{finalArticle ? '병합된 글을 검토하고 내보내세요' : '레인 보드가 멈추지 않게 이어가세요'}</h2>
            <p>{nextAction}</p>
            <div className="chip-row">
              <span className="meta-chip">공통 리서치와 아웃라인</span>
              <span className="meta-chip">병렬 섹션 초안</span>
              <span className="meta-chip">리뷰와 최종 글</span>
            </div>
          </div>

          {state.generation.errorMessage ? (
            <div className="error-panel" role="alert">
              <strong>코디네이터 브리프 생성 실패</strong>
              <p>{state.generation.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <aside className="panel-surface input-rail">
          <p className="panel-label">입력 패널</p>
          <form className="input-grid">
            <label>
              <span>주제</span>
              <textarea
                aria-label="Topic"
                name="topic"
                rows={4}
                value={state.inputs.topic}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label>
              <span>독자층</span>
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
            <label>
              <span>톤</span>
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
            <label>
              <span>분량</span>
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
          </form>
          <p className="rail-note">
            이 하네스는 프런트엔드만으로 동작하며, 결정론적 로컬 생성으로 오케스트레이션 패턴
            자체를 평가할 수 있게 설계돼 있습니다.
          </p>

          <details className="quick-briefs">
            <summary className="quick-briefs-summary">
              <span className="panel-label">빠른 브리프</span>
              <div>
                <strong>시작 속도를 높이고 싶을 때만 프리셋을 불러오세요</strong>
                <p>프리셋은 보드 구성보다 뒤에 오는 보조 도구라 기본값으로 접혀 있습니다.</p>
              </div>
            </summary>

            <div className="quick-brief-list">
              {topicPresets.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(preset.title, preset.audience, preset.tone, preset.length)}
                >
                  <strong>{preset.title}</strong>
                  <span>{preset.rationale}</span>
                </button>
              ))}
            </div>
          </details>
        </aside>
      </section>

      <section className="panel-surface stage-panel">
        <div className="section-head">
          <p className="eyebrow">단계 스트립</p>
          <h2>공통 프레임에서 병렬 작성, 머지, 최종 글까지 한 번에 추적합니다</h2>
          <p>Stitch 기준에 맞춰 현재 단계와 다음 전환을 첫 화면에서 바로 읽을 수 있게 정리했습니다.</p>
        </div>

        <div className="stage-grid">
          {workflowStages.map((stage) => {
            const isCurrent = state.generation.currentStage === stage.id
            const isComplete = state.generation.completedStages.includes(stage.id)

            return (
              <article
                key={stage.id}
                className={`stage-card ${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''}`}
              >
                <div className="hook-row">
                  <p className="block-label">{stage.label}</p>
                  <span className="hook-chip">{stageHookLabels[stage.id]}</span>
                </div>
                <h3>{isCurrent ? '현재 진행 단계' : isComplete ? '완료된 단계' : '다음 대기 단계'}</h3>
                <p>{stage.description}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="board-priority">
        <article className="panel-surface">
          <div className="section-head">
            <p className="eyebrow">Section drafts</p>
            <h2>Lane board first, merge readiness second</h2>
            <p>Each card stays compact until you open a specific lane packet.</p>
          </div>
          <div className="writer-board">
            {writerLanes.map((lane) => {
              const assignment = assignments.find((item) => item.writerId === lane.id)
              const packet = lanePackets.find((item) => item.writerId === lane.id)
              const laneStatus = state.generation.unitStatuses[lane.id]

              return (
                <article key={lane.id} className={`writer-card status-${laneStatus}`}>
                  <div className="writer-head">
                    <div>
                      <p className="block-label">Lane status</p>
                      <h3>{lane.label}</h3>
                    </div>
                    <span className={`lane-pill lane-${laneStatus}`}>{laneStatus}</span>
                  </div>

                  <p className="lane-focus">{lane.focus}</p>
                  <p className="subtle-copy">{lane.mergeDuty}</p>

                  {assignment ? (
                    <>
                      <div className="sub-block">
                        <h4>Owned sections</h4>
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
                        <p>{assignment.ownershipRule}</p>
                      </div>

                      {packet ? (
                        <>
                          <div className="sub-block">
                            <h4>Status summary</h4>
                            <p>{packet.statusSummary}</p>
                          </div>

                          <details className="lane-drawer">
                            <summary className="lane-drawer-summary">
                              Open {lane.label} packet
                            </summary>

                            <div className="preview-stack">
                              {packet.draftPreview.map((preview) => (
                                <article key={preview.id} className="preview-card">
                                  <h4>{preview.title}</h4>
                                  <p>{preview.deck}</p>
                                  <ul className="compact-list">
                                    {preview.bullets.map((bullet) => (
                                      <li key={bullet}>{bullet}</li>
                                    ))}
                                  </ul>
                                  <p className="takeaway">{preview.takeaway}</p>
                                </article>
                              ))}
                            </div>

                            <div className="sub-block">
                              <h4>Handoff note</h4>
                              <p>{packet.handoffNote}</p>
                            </div>
                          </details>
                        </>
                      ) : (
                        <div className="empty-state">
                          <p>This lane is assigned and waiting for the drafting phase.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <p>Coordinator has not assigned this lane yet.</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </article>

        <aside className="panel-surface merge-rail">
          <div className="section-head">
            <p className="eyebrow">Merge readiness</p>
            <h2>Current desk pressure and next action</h2>
          </div>

          <div className="merge-rail-stack">
            <article className="info-card">
              <p className="block-label">Current moment</p>
              <h3>{mergeReport ? 'Merge complete' : completedLaneCount ? 'Merge in progress' : 'Waiting on lanes'}</h3>
              <p>{mergeMoment}</p>
            </article>

            <article className="info-card">
              <p className="block-label">Lane coverage</p>
              <h3>
                {completedLaneCount}/{writerLanes.length} lanes delivered
              </h3>
              <p>
                {assignments.length
                  ? `${assignments.length} ownership rules are locked across the board.`
                  : 'Coordinator ownership rules will appear here once the board is initialized.'}
              </p>
            </article>

            <article className="info-card">
              <p className="block-label">Next action</p>
              <h3>{finalArticle ? 'Export or review' : 'Keep the merge desk focused'}</h3>
              <p>{nextAction}</p>
            </article>
          </div>
        </aside>
      </section>

      <details className="panel-surface secondary-panel">
        <summary className="secondary-summary">
          <span className="eyebrow">Research results + Outline</span>
          <div>
            <h2>Coordinator frame, lane ownership, and merge criteria</h2>
            <p>Open the planning context only when you need the shared brief behind the board.</p>
          </div>
        </summary>

        <div className="secondary-body">
          <div className="section-head">
            <p className="eyebrow">Orchestration strip</p>
            <h2>Common frame first, ownership before drafting</h2>
          </div>
          <div className="orchestration-grid">
            <article className="info-card">
              <p className="block-label">Research results</p>
              {brief ? (
                <>
                  <h3>Coordinator brief</h3>
                  <p>{brief.angle}</p>
                  <strong>{brief.thesis}</strong>
                  <p className="subtle-copy">{brief.audienceLens}</p>
                  <p className="subtle-copy">{brief.commonFrame}</p>
                </>
              ) : (
                <div className="empty-state">
                  <p>Generate the board to lock the common thesis and audience lens.</p>
                </div>
              )}
            </article>

            <article className="info-card">
              <p className="block-label">Outline</p>
              {outline.length > 0 ? (
                <>
                  <div className="outline-list">
                    {outline.map((section) => (
                      <article key={section.id} className="outline-item">
                        <div className="outline-top">
                          <h3>{section.title}</h3>
                          <span className="meta-chip">{section.writerHint}</span>
                        </div>
                        <p>{section.goal}</p>
                      </article>
                    ))}
                  </div>

                  <div className="assignment-strip">
                    <h4>Lane assignments</h4>
                    <div className="assignment-list">
                      {assignments.map((assignment) => (
                        <article key={assignment.writerId} className="assignment-card">
                          <strong>{laneStatusLabel(assignment.writerId)}</strong>
                          <p>{assignment.ownershipRule}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <p>Outline and lane assignments appear together once the coordinator finishes.</p>
                </div>
              )}
            </article>

            <article className="info-card">
              <p className="block-label">Merge criteria</p>
              {brief ? (
                <div className="criteria-list">
                  {brief.mergeCriteria.map((criterion) => (
                    <article key={criterion.label} className="criterion-card">
                      <h3>{criterion.label}</h3>
                      <p>{criterion.detail}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Merge criteria appear here before any lane starts drafting.</p>
                </div>
              )}
            </article>
          </div>
        </div>
      </details>

      <section className="reader-grid">
        {mergeReport || finalArticle ? (
          <article className="panel-surface final-panel">
            <div className="reader-shell-head">
              <div className="section-head">
                <p className="eyebrow">Reader surface</p>
                <h2>Only one post-merge surface stays open at a time</h2>
              </div>

              <div className="reader-tabs" role="tablist" aria-label="Post-merge surface">
                <button
                  type="button"
                  className={`reader-tab ${currentReaderPanel === 'review' ? 'is-active' : ''}`}
                  onClick={() => setActiveReaderPanel('review')}
                  role="tab"
                  aria-selected={currentReaderPanel === 'review'}
                >
                  Review notes
                </button>
                <button
                  type="button"
                  className={`reader-tab ${currentReaderPanel === 'final' ? 'is-active' : ''}`}
                  onClick={() => setActiveReaderPanel('final')}
                  role="tab"
                  aria-selected={currentReaderPanel === 'final'}
                >
                  Final post
                </button>
              </div>
            </div>

            {currentReaderPanel === 'review' ? (
              mergeReport ? (
                <div className="merge-layout">
                  <div className="merge-notes">
                    <h3>Review notes</h3>
                    <ul className="compact-list">
                      {mergeReport.reviewNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="fix-grid">
                    {[mergeReport.dedupeFix, mergeReport.transitionFix, mergeReport.toneFix].map((fix) => (
                      <article key={fix.label} className="fix-card">
                        <h3>{fix.label}</h3>
                        <p><strong>Before:</strong> {fix.before}</p>
                        <p><strong>After:</strong> {fix.after}</p>
                        <p className="subtle-copy">{fix.rationale}</p>
                      </article>
                    ))}
                  </div>

                  <div className="merge-summary">
                    <h3>Finalization note</h3>
                    <p>{mergeReport.finalizationNote}</p>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Merge notes appear after all three lanes finish and the review desk starts compressing the bundle.</p>
                </div>
              )
            ) : finalArticle ? (
              <>
                <div className="article-reader">
                  <p className="article-kicker">Newsroom merge complete</p>
                  <h3>{finalArticle.title}</h3>
                  <p className="article-intro">{finalArticle.intro}</p>

                  {finalArticle.mergedSections.map((section) => (
                    <section key={section.id} className="article-section">
                      <h4>{section.title}</h4>
                      <p className="article-deck">{section.deck}</p>
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      <p className="takeaway">{section.takeaway}</p>
                    </section>
                  ))}

                  <div className="article-closing">
                    <h4>Closing checklist</h4>
                    <p>{finalArticle.closing}</p>
                  </div>
                </div>

                <div className="export-card export-preview-card">
                  <p className="block-label">Markdown export</p>
                  <h3>Keep the raw handoff short on the default surface</h3>
                  <p className="subtle-copy">
                    The excerpt keeps the export contract visible without letting the full raw
                    Markdown dominate the reader-ready article.
                  </p>
                  <pre className="markdown-preview markdown-preview-peek">{markdownPreview}</pre>
                </div>

                <details className="export-card export-drawer">
                  <summary className="export-summary">
                    <div>
                      <p className="block-label">Markdown export</p>
                      <h3>Open the raw handoff only when you need the full export</h3>
                    </div>
                    <p>
                      Copy stays available above, so the reader surface can stay focused on the
                      merged article by default.
                    </p>
                  </summary>
                  <pre className="markdown-preview">{finalArticle.markdown}</pre>
                </details>
              </>
            ) : (
              <div className="empty-state">
                <p>The final article appears here after merge review closes duplication, transitions, and tone drift.</p>
              </div>
            )}
          </article>
        ) : (
          <article className="panel-surface final-panel">
            <div className="section-head">
              <p className="eyebrow">Reader surface</p>
              <h2>Review notes and the final post stay parked until merge is ready</h2>
            </div>
            <div className="reader-empty-grid">
              <article className="info-card">
                <p className="block-label">Review notes</p>
                <h3>Reserved for merge fixes</h3>
                <p>Keep the reader surface quiet until every lane hands off its packet.</p>
              </article>
              <article className="info-card">
                <p className="block-label">Final post</p>
                <h3>Unlocked after merge</h3>
                <p>The article and Markdown export only take over after the merge desk closes overlap.</p>
              </article>
            </div>
          </article>
        )}
      </section>

      <details className="panel-surface utility-drawer">
        <summary className="utility-summary">
          <span className="eyebrow">Evidence + Evaluation</span>
          <div>
            <h2>Open the benchmark contract only when you need the audit layer</h2>
            <p>
              The board, merge rail, and reader-ready article stay on the primary surface. This
              drawer keeps benchmark obligations available without leading the product story.
            </p>
          </div>
        </summary>

        <div className="utility-body evidence-grid">
          <article className="panel-surface utility-card">
            <div className="section-head">
              <p className="eyebrow">Evidence</p>
              <h2>Deliverables this harness must leave behind</h2>
            </div>
            <div className="artifact-list">
              {deliverables.map((item) => (
                <article key={item.id} className="artifact-card">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="panel-surface utility-card">
            <div className="section-head">
              <p className="eyebrow">Evaluation</p>
              <h2>Review lenses and run contract</h2>
            </div>

            <div className="sub-block">
              <h3>Review lenses</h3>
              <ul className="compact-list">
                {reviewLenses.map((lens) => (
                  <li key={lens}>{lens}</li>
                ))}
              </ul>
            </div>

            <div className="sub-block">
              <h3>Evaluation checklist</h3>
              <ul className="compact-list">
                {evaluationChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="sub-block">
              <h3>Artifact contract</h3>
              <div className="contract-card">
                <p>Expected screenshots: {artifactPreview.screenshots.join(', ')}</p>
                <p>Expected notes: {artifactPreview.notes.join(' / ')}</p>
                <p>Expected deliverables: {artifactPreview.deliverables.join(', ')}</p>
              </div>
            </div>
          </article>
        </div>
      </details>
    </main>
  )
}

export default App
