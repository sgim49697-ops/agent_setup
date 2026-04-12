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
  statusMessage: '주제를 정하면 한 번에 리서치부터 최종 원고까지 이어서 생성합니다.',
  errorMessage: null,
}

function getPartialOutputs(
  outputs: PipelineOutputs,
  activeStage: GenerationStageId,
): Partial<PipelineOutputs> {
  const partial: Partial<PipelineOutputs> = {}

  for (const stage of workflowStages) {
    switch (stage.id) {
      case 'research':
        partial.research_summary = outputs.research_summary
        break
      case 'outline':
        partial.outline = outputs.outline
        break
      case 'drafts':
        partial.section_drafts = outputs.section_drafts
        break
      case 'review':
        partial.review_notes = outputs.review_notes
        break
      case 'final':
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
      return '읽는 흐름이 끊기지 않도록 개요를 다듬고 있습니다.'
    case 'drafts':
      return '섹션별 초안을 채우며 톤과 밀도를 맞추고 있습니다.'
    case 'review':
      return '빠진 논점과 어색한 문장을 검토하고 있습니다.'
    case 'final':
      return '최종 마크다운을 확정하고 바로 복사할 수 있게 준비합니다.'
  }
}

function getNextActionLabel(state: GenerationState) {
  if (state.status === 'error') {
    return '입력을 정리한 뒤 다시 생성'
  }

  if (state.status === 'export-ready') {
    return '마크다운 복사 후 마감'
  }

  if (!state.currentStage) {
    return '리서치부터 생성 시작'
  }

  const stageIndex = workflowStages.findIndex((stage) => stage.id === state.currentStage)
  const nextStage = workflowStages[Math.min(stageIndex + 1, workflowStages.length - 1)]

  if (stageIndex === workflowStages.length - 1) {
    return '최종 원고 확인'
  }

  return `${nextStage.label} 진행`
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
      }, 260 + index * 260)

      timersRef.current.push(timer)
    })
  }

  const handleGenerate = () => {
    if (!inputs.topic.trim()) {
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
      topic: inputs.topic.trim(),
    })
  }

  const handlePreset = (preset: TopicPreset) => {
    setInputs({
      topic: preset.title,
      audience: preset.audience,
      tone: preset.tone,
      length: preset.length,
    })
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
  const progress = Math.max(8, (completedCount / workflowStages.length) * 100)
  const selectedStageMeta = workflowStages.find((stage) => stage.id === selectedStage) ?? workflowStages[0]

  const renderResearch = () => {
    const research = generation.outputs.research_summary

    if (!research) {
      return (
        <div className="empty-block">
          <div>
            <strong>리서치가 아직 비어 있습니다.</strong>
            <p>{workflowStages[0].description}</p>
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
            <p>{workflowStages[1].description}</p>
          </div>
        </div>
      )
    }

    return (
      <ol className="outline-stack">
        {outline.map((section, index) => (
          <li className="content-card" key={section.id}>
            <p className="card-eyebrow">SECTION {index + 1}</p>
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
            <p>{workflowStages[2].description}</p>
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
            <p>{workflowStages[3].description}</p>
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
            <p>{workflowStages[4].description}</p>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="tag-row">
          <span className="soft-tag">Markdown ready</span>
          <span className="soft-tag">Copy markdown</span>
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
        {copyFeedback || generation.statusMessage}
      </div>

      <section className="workspace-hero">
        <div className="hero-copy">
          <p className="section-kicker">Slate Orchestrator / Focused Wizard</p>
          <h1>한 번에 한 단계씩 기술 블로그를 완성합니다.</h1>
          <p className="hero-lead">
            지금 필요한 입력만 받고, 현재 단계와 다음 행동만 또렷하게 보여주는 단일 에이전트 작성
            워크스페이스입니다.
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
                <p className="rail-hook">single agent harness</p>
                <h2>현재 단계와 다음 행동</h2>
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
                <p className="card-eyebrow">Brief Inputs</p>
                <h3>생성 브리프</h3>
              </div>
              <p className="brief-inline">프리셋은 접힌 서랍에 두고, 기본 입력만 짧게 유지합니다.</p>
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
                <span>간결한 주제 템플릿</span>
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
              <p className="spotlight-label">Current step</p>
              <strong>{generation.currentStage ? selectedStageMeta.label : '브리프 준비'}</strong>
              <span className="spotlight-hook">
                {generation.currentStage ? selectedStageMeta.testHook : 'Generate post'}
              </span>
              <p>{generation.statusMessage}</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">Next action</p>
              <strong>{getNextActionLabel(generation)}</strong>
              <span className="spotlight-hook">Focused wizard</span>
              <p>현재 단계가 끝나면 다음 산출물로 자연스럽게 이어지도록 안내합니다.</p>
            </article>
            <article className="spotlight-card">
              <p className="spotlight-label">Draft scope</p>
              <strong>{inputs.topic || '주제를 입력해 주세요'}</strong>
              <div className="tag-row">
                <span className="soft-tag">{audienceOptions.find((item) => item.value === inputs.audience)?.label}</span>
                <span className="soft-tag">{toneOptions.find((item) => item.value === inputs.tone)?.label}</span>
                <span className="soft-tag">{lengthOptions.find((item) => item.value === inputs.length)?.label}</span>
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
                {generation.status === 'loading' ? <span className="loading-pulse" aria-hidden="true" /> : <span className="active-dot" aria-hidden="true" />}
              </div>
              <div className="workspace-panel-copy">
                <p>{selectedStageMeta.description}</p>
                {generation.errorMessage ? <p>{generation.errorMessage}</p> : null}
              </div>
              {generation.status === 'error' ? (
                <div className="empty-block error-block">
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

          <section className="stage-stack">
            {workflowStages.map((stage) => (
              <article
                className={`content-card ${stage.id === 'final' ? 'final-summary-card' : ''}`}
                data-stage-hook={stage.testHook}
                key={stage.id}
              >
                <p className="panel-hook">{stage.testHook}</p>
                <h3>{stage.label}</h3>
                <p>{stage.description}</p>
                {renderStageBody(stage.id)}
              </article>
            ))}
          </section>

          <details className="support-drawer evidence-drawer">
            <summary>
              <strong>근거와 지원 패널</strong>
              <span>Evidence / reports / review lenses</span>
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
                <p className="panel-hook">review lenses</p>
                <h3>리뷰 기준</h3>
                <ul className="lens-list">
                  {reviewLenses.map((lens) => (
                    <li key={lens}>{lens}</li>
                  ))}
                </ul>
              </article>
              <article className="evidence-card">
                <p className="panel-hook">clipboard</p>
                <h3>내보내기 상태</h3>
                <div className="evidence-row">
                  <strong>Copy markdown</strong>
                  <p>{copyFeedback || '최종 원고가 준비되면 버튼 한 번으로 복사할 수 있습니다.'}</p>
                </div>
                <div className="evidence-row">
                  <strong>현재 상태</strong>
                  <p>{getStatusLabel(generation.status)}</p>
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
