// App.tsx - single_agent focused wizard UI for the blog post generator harness

import { useEffect, useRef, useState } from 'react'
import './App.css'
import type {
  BlogGeneratorInputs,
  GenerationStageId,
  GenerationState,
  PipelineOutputs,
  ReviewNote,
  TopicPreset,
} from './contracts'
import { generatePipelineOutputs } from './generator'
import { evidenceDrawerItems, reviewLenses, topicPresets, workflowStages } from './starterData'

const audienceOptions = [
  { value: 'beginner', label: '입문자' },
  { value: 'practitioner', label: '실무자' },
  { value: 'advanced', label: '고급 사용자' },
] as const

const toneOptions = [
  { value: 'clear', label: '명료하게' },
  { value: 'pragmatic', label: '실무 중심' },
  { value: 'opinionated', label: '의견을 분명하게' },
] as const

const lengthOptions = [
  { value: 'short', label: '짧게' },
  { value: 'medium', label: '중간 길이' },
  { value: 'long', label: '깊게 길게' },
] as const

const initialInputs: BlogGeneratorInputs = {
  topic: topicPresets[0]?.title ?? '',
  audience: topicPresets[0]?.audience ?? 'practitioner',
  tone: topicPresets[0]?.tone ?? 'pragmatic',
  length: topicPresets[0]?.length ?? 'medium',
}

const initialGeneration: GenerationState = {
  status: 'initial',
  currentStage: null,
  completedStages: [],
  outputs: {},
  statusMessage: '주제를 정하면 리서치부터 최종 원고까지 한 흐름으로 이어집니다.',
  errorMessage: null,
}

function getPartialOutputs(
  outputs: PipelineOutputs,
  activeStage: GenerationStageId,
): Partial<PipelineOutputs> {
  const partial: Partial<PipelineOutputs> = {}

  for (const stage of workflowStages) {
    switch (stage.output) {
      case 'research_summary':
        partial.research_summary = outputs.research_summary
        break
      case 'outline':
        partial.outline = outputs.outline
        break
      case 'section_drafts':
        partial.section_drafts = outputs.section_drafts
        break
      case 'review_notes':
        partial.review_notes = outputs.review_notes
        break
      case 'final_post':
        partial.final_post = outputs.final_post
        break
    }

    if (stage.id === activeStage) {
      break
    }
  }

  return partial
}

function getStatusLabel(status: GenerationState['status']) {
  switch (status) {
    case 'initial':
      return '준비됨'
    case 'loading':
      return '생성 중'
    case 'populated':
      return '초안 완료'
    case 'review-complete':
      return '검토 완료'
    case 'export-ready':
      return '내보내기 가능'
    case 'error':
      return '확인 필요'
  }
}

function getStepMessage(stageId: GenerationStageId, complete: boolean) {
  if (complete && stageId === 'final') {
    return '최종 원고와 복사 준비를 마쳤습니다.'
  }

  switch (stageId) {
    case 'research':
      return '핵심 각도와 참고 근거를 먼저 정리하고 있습니다.'
    case 'outline':
      return '읽는 흐름이 끊기지 않도록 개요를 설계하고 있습니다.'
    case 'drafts':
      return '섹션별 초안을 채우며 문장 밀도와 톤을 맞추고 있습니다.'
    case 'review':
      return '빠진 논점과 어색한 문장을 검토하고 있습니다.'
    case 'final':
      return '최종 마크다운을 확정하고 바로 복사할 수 있게 준비합니다.'
  }
}

function getNextActionLabel(state: GenerationState) {
  if (state.status === 'error') {
    return '주제를 정리한 뒤 다시 생성'
  }

  if (state.status === 'export-ready') {
    return '마크다운 복사 후 게시 준비'
  }

  if (!state.currentStage) {
    return '리서치부터 생성 시작'
  }

  const stageIndex = workflowStages.findIndex((stage) => stage.id === state.currentStage)
  const nextStage = workflowStages[Math.min(stageIndex + 1, workflowStages.length - 1)]

  if (stageIndex === workflowStages.length - 1) {
    return '최종 원고 확인'
  }

  return `${nextStage.label} 이어서 진행`
}

function getStageStateLabel(stageId: GenerationStageId, state: GenerationState) {
  if (state.completedStages.includes(stageId)) {
    return '완료'
  }

  if (state.currentStage === stageId) {
    return state.status === 'export-ready' && stageId === 'final' ? '완료' : '진행 중'
  }

  const currentIndex = state.currentStage
    ? workflowStages.findIndex((stage) => stage.id === state.currentStage)
    : -1
  const stageIndex = workflowStages.findIndex((stage) => stage.id === stageId)

  if (stageIndex === currentIndex + 1) {
    return '다음'
  }

  return '대기'
}

function reviewToneClass(note: ReviewNote) {
  switch (note.severity) {
    case 'good':
      return 'review-good'
    case 'watch':
      return 'review-watch'
    case 'improve':
      return 'review-improve'
  }
}

function shouldTriggerFailure(topic: string) {
  return topic.toLowerCase().includes('fail this topic intentionally')
}

async function copyMarkdown(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function App() {
  const [inputs, setInputs] = useState<BlogGeneratorInputs>(initialInputs)
  const [generation, setGeneration] = useState<GenerationState>(initialGeneration)
  const [selectedStage, setSelectedStage] = useState<GenerationStageId>('research')
  const [copyFeedback, setCopyFeedback] = useState('')
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    if (generation.currentStage) {
      setSelectedStage(generation.currentStage)
    }
  }, [generation.currentStage])

  const clearTimers = () => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer)
    }
    timersRef.current = []
  }

  const scheduleGeneration = (nextInputs: BlogGeneratorInputs) => {
    const outputs = generatePipelineOutputs(nextInputs)
    const forcedFailure = shouldTriggerFailure(nextInputs.topic)

    clearTimers()
    setCopyFeedback('')
    setGeneration({
      status: 'loading',
      currentStage: 'research',
      completedStages: [],
      outputs: {},
      statusMessage: getStepMessage('research', false),
      errorMessage: null,
    })

    workflowStages.forEach((stage, index) => {
      const timer = window.setTimeout(() => {
        if (forcedFailure && stage.id === 'review') {
          setGeneration({
            status: 'error',
            currentStage: 'review',
            completedStages: workflowStages
              .filter((item) => item.id !== 'review' && item.id !== 'final')
              .map((item) => item.id),
            outputs: getPartialOutputs(outputs, 'drafts'),
            statusMessage: '검토 단계에서 의도된 오류를 표시했습니다. 주제를 수정한 뒤 다시 생성해 주세요.',
            errorMessage:
              '"fail this topic intentionally" 문구가 감지되어 테스트용 오류 상태를 표시했습니다.',
          })
          return
        }

        const isFinal = stage.id === 'final'
        const completedStages = isFinal
          ? workflowStages.map((item) => item.id)
          : workflowStages.slice(0, index).map((item) => item.id)

        setGeneration({
          status:
            stage.id === 'drafts'
              ? 'populated'
              : stage.id === 'review'
                ? 'review-complete'
                : isFinal
                  ? 'export-ready'
                  : 'loading',
          currentStage: stage.id,
          completedStages,
          outputs: getPartialOutputs(outputs, stage.id),
          statusMessage: getStepMessage(stage.id, isFinal),
          errorMessage: null,
        })
      }, 280 + index * 280)

      timersRef.current.push(timer)
    })
  }

  const handleGenerate = () => {
    const nextTopic = inputs.topic.trim()

    if (!nextTopic) {
      clearTimers()
      setGeneration({
        status: 'error',
        currentStage: null,
        completedStages: [],
        outputs: {},
        statusMessage: '주제를 먼저 적어야 생성 흐름을 시작할 수 있습니다.',
        errorMessage: '주제를 입력해 주세요. Topic 필드는 비워 둘 수 없습니다.',
      })
      return
    }

    scheduleGeneration({
      ...inputs,
      topic: nextTopic,
    })
  }

  const handlePreset = (preset: TopicPreset) => {
    clearTimers()
    setCopyFeedback('')
    setInputs({
      topic: preset.title,
      audience: preset.audience,
      tone: preset.tone,
      length: preset.length,
    })
    setGeneration((current) => ({
      ...current,
      errorMessage: null,
      statusMessage: '프리셋을 적용했습니다. 입력을 확인한 뒤 바로 생성할 수 있습니다.',
    }))
  }

  const handleCopy = async () => {
    const finalPost = generation.outputs.final_post

    if (!finalPost) {
      return
    }

    try {
      await copyMarkdown(finalPost)
      setCopyFeedback('마크다운을 클립보드에 복사했습니다.')
    } catch {
      setCopyFeedback('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.')
    }
  }

  const completedCount = generation.completedStages.length
  const progress =
    generation.status === 'initial' ? 6 : Math.max(12, (completedCount / workflowStages.length) * 100)
  const selectedStageMeta = workflowStages.find((stage) => stage.id === selectedStage) ?? workflowStages[0]
  const statusHook =
    generation.status === 'export-ready'
      ? 'export-ready'
      : generation.status === 'error'
        ? 'generation-error'
        : generation.currentStage
          ? `${generation.currentStage}-in-progress`
          : 'waiting-for-input'

  const renderResearch = () => {
    const research = generation.outputs.research_summary

    if (!research) {
      return (
        <div className="empty-block">
          <div>
            <strong>리서치가 아직 비어 있습니다.</strong>
            <p>주제를 정하면 핵심 각도와 참고 근거부터 조용히 채워 넣습니다.</p>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="tag-row">
          {research.searchTerms.map((term) => (
            <span className="soft-tag" key={term}>
              {term}
            </span>
          ))}
        </div>
        <p>{research.angle}</p>
        <p>{research.thesis}</p>
        <ul className="stack-list">
          {research.findings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
        <p>
          <strong>참고 범위</strong>
        </p>
        <ul className="stack-list">
          {research.references.map((reference) => (
            <li key={reference}>{reference}</li>
          ))}
        </ul>
      </>
    )
  }

  const renderOutline = () => {
    const outline = generation.outputs.outline

    if (!outline) {
      return (
        <div className="empty-block">
          <div>
            <strong>개요가 아직 준비되지 않았습니다.</strong>
            <p>섹션 순서와 독자 흐름은 리서치가 끝난 뒤 자동으로 정리됩니다.</p>
          </div>
        </div>
      )
    }

    return (
      <ol className="outline-stack">
        {outline.map((section, index) => (
          <li className="content-card" key={section.id}>
            <p className="card-eyebrow">구간 {index + 1}</p>
            <h3>{section.title}</h3>
            <p>{section.summary}</p>
          </li>
        ))}
      </ol>
    )
  }

  const renderDrafts = () => {
    const drafts = generation.outputs.section_drafts

    if (!drafts) {
      return (
        <div className="empty-block">
          <div>
            <strong>섹션 초안이 아직 없습니다.</strong>
            <p>핵심 섹션이 채워지면 여기서 바로 문장 밀도를 확인할 수 있습니다.</p>
          </div>
        </div>
      )
    }

    return (
      <div className="stage-stack">
        {drafts.map((draft) => (
          <article className="content-card" key={draft.id}>
            <p className="card-eyebrow">Section drafts</p>
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

  const renderReview = () => {
    const reviewNotes = generation.outputs.review_notes

    if (!reviewNotes) {
      return (
        <div className="empty-block">
          <div>
            <strong>검토 메모가 아직 없습니다.</strong>
            <p>리뷰 단계에서는 빠진 논점과 과한 문장을 짧게 표시합니다.</p>
          </div>
        </div>
      )
    }

    return (
      <div className="stage-stack">
        {reviewNotes.map((note) => (
          <article className="content-card" key={note.label}>
            <div className={`review-head ${reviewToneClass(note)}`}>
              <h3>{note.label}</h3>
              <span>{note.severity}</span>
            </div>
            <p>{note.detail}</p>
          </article>
        ))}
      </div>
    )
  }

  const renderFinal = () => {
    const finalPost = generation.outputs.final_post

    if (!finalPost) {
      return (
        <div className="empty-block">
          <div>
            <strong>최종 원고가 아직 확정되지 않았습니다.</strong>
            <p>리뷰가 끝나면 게시 가능한 마크다운과 복사 상태가 여기에서 정리됩니다.</p>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="tag-row">
          <span className="soft-tag">내보내기 준비</span>
          <span className="soft-tag">최종 점검 완료</span>
        </div>
        <pre className="markdown-preview">{finalPost}</pre>
      </>
    )
  }

  const renderStageBody = (stageId: GenerationStageId) => {
    switch (stageId) {
      case 'research':
        return renderResearch()
      case 'outline':
        return renderOutline()
      case 'drafts':
        return renderDrafts()
      case 'review':
        return renderReview()
      case 'final':
        return renderFinal()
    }
  }

  return (
    <main className="app-shell">
      <div className="assistive-live" aria-live="polite">
        {statusHook} {copyFeedback || generation.statusMessage}
      </div>

      <section className="workspace-hero">
        <div className="hero-copy">
          <p className="section-kicker">단일 작성 위저드</p>
          <h1>한 사람의 초안 작업을 끝까지 밀어 주는 슬레이트 워크스페이스</h1>
          <p className="hero-lead">
            한 번에 한 단계만 또렷하게 보여 주고, 증거와 디버그 정보는 뒤로 물려 둔 제품 중심
            작성 화면입니다. 입력, 현재 단계, 최종 내보내기만 먼저 잡아 빠르게 완성 흐름에
            들어가게 합니다.
          </p>
        </div>
        <div className="hero-actions">
          <button
            aria-label="Generate post"
            className="primary-action"
            onClick={handleGenerate}
            type="button"
          >
            <span className="button-copy-kr">포스트 생성 시작</span>
            <span className="button-copy-hook">Generate post</span>
          </button>
          <button
            aria-label="Copy markdown"
            className="secondary-action"
            disabled={!generation.outputs.final_post}
            onClick={() => {
              void handleCopy()
            }}
            type="button"
          >
            <span className="button-copy-kr">마크다운 복사</span>
            <span className="button-copy-hook">Copy markdown</span>
          </button>
        </div>
      </section>

      <div className="workspace-frame">
        <aside className="brief-rail">
          <section className="rail-card rail-card-dark">
            <div className="status-row">
              <div>
                <p className="rail-hook">현재 흐름</p>
                <h2>지금 해야 할 일과 다음 행동</h2>
              </div>
              <span className={`status-badge status-${generation.status}`}>{getStatusLabel(generation.status)}</span>
            </div>
            <p className="rail-description">{generation.statusMessage}</p>
            <p className="status-detail">
              현재 단계: {generation.currentStage ? selectedStageMeta.label : '브리프 준비'}
            </p>
            <p className="status-detail status-detail-soft">다음 행동: {getNextActionLabel(generation)}</p>
            <div className="progress-meta">
              <span>{completedCount} / 5 단계 완료</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
          </section>

          <section className="rail-card">
            <div className="rail-section-head">
              <div>
                <p className="card-eyebrow">브리프 입력</p>
                <h3>생성 브리프</h3>
              </div>
              <p className="brief-inline">입력은 짧게, 프리셋과 보조 정보는 접힌 서랍 안에 둡니다.</p>
            </div>

            <div className="brief-form">
              <label>
                <span>
                  주제 <em>Topic</em>
                </span>
                <textarea
                  aria-label="Topic"
                  onChange={(event) => {
                    setInputs((current) => ({
                      ...current,
                      topic: event.target.value,
                    }))
                  }}
                  placeholder="예: LangGraph 1.0에서 supervisor 패턴 설계하기"
                  value={inputs.topic}
                />
              </label>

              <label>
                <span>
                  대상 독자 <em>Audience</em>
                </span>
                <select
                  aria-label="Audience"
                  onChange={(event) => {
                    setInputs((current) => ({
                      ...current,
                      audience: event.target.value as BlogGeneratorInputs['audience'],
                    }))
                  }}
                  value={inputs.audience}
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>
                  문체 톤 <em>Tone</em>
                </span>
                <select
                  aria-label="Tone"
                  onChange={(event) => {
                    setInputs((current) => ({
                      ...current,
                      tone: event.target.value as BlogGeneratorInputs['tone'],
                    }))
                  }}
                  value={inputs.tone}
                >
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>
                  글 길이 <em>Length</em>
                </span>
                <select
                  aria-label="Length"
                  onChange={(event) => {
                    setInputs((current) => ({
                      ...current,
                      length: event.target.value as BlogGeneratorInputs['length'],
                    }))
                  }}
                  value={inputs.length}
                >
                  {lengthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <details className="support-drawer">
              <summary>
                <strong>프리셋 불러오기</strong>
                <span>빠르게 시작하는 주제 템플릿</span>
              </summary>
              <div className="preset-list">
                {topicPresets.map((preset) => (
                  <button
                    className="preset-tile"
                    key={preset.title}
                    onClick={() => {
                      handlePreset(preset)
                    }}
                    type="button"
                  >
                    <strong>{preset.title}</strong>
                    <span>{preset.rationale}</span>
                  </button>
                ))}
              </div>
            </details>
          </section>
        </aside>

        <section className="workspace-main">
          <div className="spotlight-row">
            <article className="spotlight-card spotlight-card-primary">
              <p className="spotlight-label">현재 단계</p>
              <strong>{generation.currentStage ? selectedStageMeta.label : '브리프 준비'}</strong>
              <span className="spotlight-hook">
                {generation.currentStage ? selectedStageMeta.testHook : 'Generate post'}
              </span>
              <p>{generation.statusMessage}</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">다음 행동</p>
              <strong>{getNextActionLabel(generation)}</strong>
              <span className="spotlight-hook">한 단계씩 집중</span>
              <p>현재 단계가 끝나면 다음 산출물만 바로 이어서 열리도록 설계했습니다.</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">작성 범위</p>
              <strong>{inputs.topic || '주제를 입력해 주세요'}</strong>
              <div className="tag-row">
                <span className="soft-tag">
                  {audienceOptions.find((item) => item.value === inputs.audience)?.label}
                </span>
                <span className="soft-tag">
                  {toneOptions.find((item) => item.value === inputs.tone)?.label}
                </span>
                <span className="soft-tag">
                  {lengthOptions.find((item) => item.value === inputs.length)?.label}
                </span>
              </div>
            </article>
          </div>

          <section className="stage-stack">
            <div className="stage-rail" aria-label="workflow stages">
              {workflowStages.map((stage, index) => {
                const stageStateLabel = getStageStateLabel(stage.id, generation)

                return (
                  <button
                    aria-label={stage.testHook}
                    className={[
                      'stage-chip',
                      generation.completedStages.includes(stage.id) ? 'complete' : '',
                      generation.currentStage === stage.id ? 'current' : '',
                      selectedStage === stage.id ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={stage.id}
                    onClick={() => {
                      setSelectedStage(stage.id)
                    }}
                    type="button"
                  >
                    <span className="stage-chip-index">{index + 1}</span>
                    <span className="stage-chip-copy">
                      <strong>{stage.label}</strong>
                      <em>{stage.testHook}</em>
                    </span>
                    <span className="stage-chip-state">{stageStateLabel}</span>
                  </button>
                )
              })}
            </div>

            <section className="workspace-panel">
              <div className="workspace-panel-head">
                <div>
                  <p className="panel-hook">{selectedStageMeta.testHook}</p>
                  <h2>{selectedStageMeta.label}</h2>
                </div>
                {generation.status === 'loading' ? (
                  <span className="loading-pulse" aria-hidden="true" />
                ) : (
                  <span className="active-dot" aria-hidden="true" />
                )}
              </div>
              <div className="workspace-panel-copy">
                <p>{selectedStageMeta.description}</p>
                {generation.errorMessage ? <p>{generation.errorMessage}</p> : null}
              </div>
              {generation.status === 'error' ? (
                <div className="empty-block error-block" role="alert">
                  <div>
                    <strong>입력을 확인해 주세요.</strong>
                    <p>{generation.errorMessage}</p>
                  </div>
                </div>
              ) : (
                renderStageBody(selectedStage)
              )}
            </section>
          </section>

          <div className="spotlight-row">
            <article className="content-card final-summary-card">
              <p className="panel-hook">Final post</p>
              <h3>내보내기 준비 상태</h3>
              <p>
                {generation.outputs.final_post
                  ? '최종 원고가 준비되었습니다. 복사 버튼으로 바로 게시 흐름에 넘길 수 있습니다.'
                  : '최종 원고는 마지막 단계가 끝나면 이 카드에서 준비 상태를 알려 줍니다.'}
              </p>
              <div className="evidence-row">
                <strong>Copy markdown</strong>
                <p>{copyFeedback || '최종 원고가 준비되면 버튼 한 번으로 복사할 수 있습니다.'}</p>
              </div>
            </article>
            <article className="content-card">
              <p className="panel-hook">Review notes</p>
              <h3>검토 기준</h3>
              <ul className="lens-list">
                {reviewLenses.map((lens) => (
                  <li key={lens}>{lens}</li>
                ))}
              </ul>
            </article>
            <article className="content-card">
              <p className="panel-hook">Research results</p>
              <h3>빈 상태 힌트</h3>
              <p>
                처음에는 주제와 독자, 톤, 길이만 넣고 시작하세요. 나머지 리서치, 개요, 초안,
                검토, 최종 원고는 단계별로 자동 채워집니다.
              </p>
            </article>
          </div>

          <details className="support-drawer evidence-drawer">
            <summary>
              <strong>근거와 지원 패널</strong>
              <span>보조 산출물과 디버그 메모</span>
            </summary>
            <div className="evidence-grid">
              {evidenceDrawerItems.map((item) => (
                <article className="evidence-card" key={item.id}>
                  <p className="panel-hook">{item.id}</p>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
              <article className="evidence-card">
                <p className="panel-hook">workflow</p>
                <h3>완료된 단계</h3>
                <p>
                  {generation.completedStages.length > 0
                    ? generation.completedStages
                        .map((stageId) => workflowStages.find((stage) => stage.id === stageId)?.label)
                        .filter(Boolean)
                        .join(', ')
                    : '아직 완료된 단계가 없습니다.'}
                </p>
              </article>
              <article className="evidence-card">
                <p className="panel-hook">status</p>
                <h3>현재 상태</h3>
                <div className="evidence-row">
                  <strong>상태 라벨</strong>
                  <p>{getStatusLabel(generation.status)}</p>
                </div>
                <div className="evidence-row">
                  <strong>다음 행동</strong>
                  <p>{getNextActionLabel(generation)}</p>
                </div>
              </article>
            </div>
          </details>
        </section>
      </div>
    </main>
  )
}

export default App
