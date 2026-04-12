// generator.ts - orchestrator_worker용 deterministic decomposition and integration

import type {
  Audience,
  BlogGeneratorInputs,
  IntegrationReview,
  Length,
  OrchestratorPlan,
  OutlineSection,
  PipelineOutputs,
  ResearchSummary,
  ReviewNote,
  SectionDraft,
  TaskBundle,
  Tone,
  WorkerOutput,
} from './contracts'

const audienceGuidance: Record<Audience, string> = {
  beginner: '용어 정의와 판단 기준을 짧게 같이 보여줘야 한다.',
  practitioner: '실무 적용 판단과 운영 포인트를 빠르게 가져갈 수 있어야 한다.',
  advanced: '트레이드오프와 설계 경계가 먼저 보여야 설득력이 생긴다.',
}

const toneGuidance: Record<Tone, string> = {
  clear: '군더더기를 줄이고 구조를 또렷하게 정리하는 톤',
  pragmatic: '결정 기준과 체크리스트를 앞세우는 톤',
  opinionated: '선호와 비선호를 명확히 드러내는 톤',
}

const sectionTitles: Record<Length, string[]> = {
  short: ['왜 지금 중요한가', '구조와 상태를 나누는 기준', '바로 적용할 체크리스트'],
  medium: ['문제 정의와 배경', '분해 기준과 ownership', '상태 연결과 흔한 실수', '최종 적용 체크리스트'],
  long: [
    '문제 정의와 배경',
    '분해 기준과 ownership',
    '상태 연결과 UI 협업',
    '콘텐츠 통합과 consistency review',
    '최종 적용 체크리스트',
  ],
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^\w|\s\w)/g, (match) => match.toUpperCase())
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createBundles(inputs: BlogGeneratorInputs): TaskBundle[] {
  return [
    {
      workerId: 'ui_worker',
      scope: 'stage tracker, CTA, empty/error messaging, panel hierarchy',
      ownedDeliverables: ['Stage labels', 'CTA clarity', 'Empty state copy', 'Panel hierarchy'],
      integrationRisks: [
        'state worker의 disabled semantics와 충돌할 수 있다',
        'content worker의 긴 본문이 layout hierarchy를 무너뜨릴 수 있다',
      ],
    },
    {
      workerId: 'state_worker',
      scope: 'loading, populated, review-complete, export-ready semantics',
      ownedDeliverables: ['Reducer rules', 'Disabled button timing', 'Error trigger', 'Stage completion notes'],
      integrationRisks: [
        'UI copy가 실제 state progression과 어긋날 수 있다',
        'content worker 결과가 늦게 들어올 때 잘못된 완료 상태를 선언할 수 있다',
      ],
    },
    {
      workerId: 'content_worker',
      scope: `research, outline, drafts, review, final markdown for ${inputs.topic}`,
      ownedDeliverables: ['research_summary', 'outline', 'section_drafts', 'review_notes', 'final_post'],
      integrationRisks: [
        'UI worker가 준비한 패널 구조보다 콘텐츠 밀도가 커질 수 있다',
        'state worker의 review-complete / export-ready 경계가 애매해질 수 있다',
      ],
    },
  ]
}

export function buildOrchestratorPlan(inputs: BlogGeneratorInputs): OrchestratorPlan {
  return {
    productGoal: `Implement the tech blog post generator for ${inputs.topic} while keeping decomposition, ownership, and integration trace explicit.`,
    decompositionReason:
      `This topic benefits from splitting UI framing, state semantics, and editorial content so the final product can show how orchestration manages collaboration boundaries. ${audienceGuidance[inputs.audience]}`,
    bundles: createBundles(inputs),
    integrationChecklist: [
      'UI copy must reflect the actual state machine progression.',
      'Worker ownership must not overlap in a way that hides responsibility.',
      'Final post must read like one product, not three disconnected work streams.',
      'Review notes and final export must stay aligned after integration.',
    ],
  }
}

export function buildUiWorkerOutput(inputs: BlogGeneratorInputs, plan: OrchestratorPlan): WorkerOutput {
  return {
    workerId: 'ui_worker',
    summary:
      `UI Worker mapped the orchestrator plan into a readable shell with a stage tracker, decomposition board, worker cards, integration desk, and export panel.`,
    handoffNote:
      'State Worker should keep button disabling and status timing aligned with the messaging. Content Worker should respect the panel hierarchy and keep dense copy contained.',
    deliverablePreview: [
      'Primary CTA: Generate post',
      'Secondary CTA: Copy markdown',
      'Empty states for orchestrator desk, worker board, final post',
      `Tone framing: ${toneGuidance[inputs.tone]}`,
      `Plan checkpoints: ${plan.integrationChecklist.length}`,
    ],
  }
}

export function buildStateWorkerOutput(inputs: BlogGeneratorInputs): WorkerOutput {
  return {
    workerId: 'state_worker',
    summary:
      `State Worker defined a deterministic sequence from planning to integration review, with explicit loading, populated, review-complete, export-ready, and error transitions.`,
    handoffNote:
      'Integrator should confirm that loading disables Generate post, error never leaks into export-ready, and review-complete appears before final export.',
    deliverablePreview: [
      'Loading state disables Generate post',
      'fail/error prefix triggers planning-stage error',
      'review-complete appears before export-ready',
      `Audience guardrail: ${audienceGuidance[inputs.audience]}`,
    ],
  }
}

function buildResearchSummary(inputs: BlogGeneratorInputs): ResearchSummary {
  const cleanTopic = titleCase(inputs.topic)
  return {
    angle: `${toneGuidance[inputs.tone]}으로 ${cleanTopic}를 설명하되, 하나의 거대한 흐름이 아니라 역할 분해와 통합 기준을 함께 보여준다.`,
    thesis: `${cleanTopic}는 기능 소개보다 "어떤 책임을 어떻게 나누고, 마지막에 무엇을 다시 통합해야 하는가"를 중심으로 설명할 때 더 실무적이다.`,
    focusBullets: [
      '분해 기준이 먼저 있어야 ownership 충돌이 줄어든다.',
      'UI, state, content를 따로 보되 최종 통합 기준이 없으면 제품 품질이 흔들린다.',
      `${inputs.audience} 독자는 각 역할이 무엇을 책임지는지 명확히 볼 때 글을 더 빨리 이해한다.`,
    ],
    supportNote: `${audienceGuidance[inputs.audience]} ${toneGuidance[inputs.tone]}.`,
  }
}

function buildOutline(inputs: BlogGeneratorInputs): OutlineSection[] {
  return sectionTitles[inputs.length].map((title, index) => ({
    id: `${slugify(inputs.topic)}-${index + 1}`,
    title: index === 0 ? `${title}: ${titleCase(inputs.topic)}` : title,
    goal:
      index === 0
        ? `${titleCase(inputs.topic)}를 단일 기능보다 orchestration 대상 제품으로 소개한다.`
        : `${title}에서 분해 기준, ownership, 통합 포인트를 실무 관점으로 정리한다.`,
  }))
}

function buildSectionDrafts(
  inputs: BlogGeneratorInputs,
  outline: OutlineSection[],
  research: ResearchSummary,
): SectionDraft[] {
  return outline.map((section, index) => ({
    id: section.id,
    title: section.title,
    summary: `${section.goal} 이 섹션은 content worker가 실제 글 흐름을 담당하고, integrator가 마지막에 tone과 연결감을 정리할 수 있도록 적절한 밀도로 작성한다.`,
    paragraphs: [
      `${titleCase(inputs.topic)}를 이 구간에서 설명할 때 가장 중요한 것은 누가 어떤 책임을 가져가고, 그 경계가 언제 다시 연결되는지 보여주는 일이다.`,
      `${research.focusBullets[index % research.focusBullets.length]} 이 포인트를 중심으로 보면 글이 추상론보다 실전 판단에 가까워진다.`,
      `${inputs.audience} 독자에게는 ${section.goal.toLowerCase()}를 하나의 체크 포인트로 보이게 하는 편이 읽기 흐름을 훨씬 안정적으로 만든다.`,
    ],
    takeaway: `${section.title} takeaway: 이 구간에서는 분해 기준과 통합 기준을 함께 봐야 한다.`,
  }))
}

function buildReviewNotes(inputs: BlogGeneratorInputs): ReviewNote[] {
  return [
    {
      label: 'Ownership clarity',
      detail: 'Worker별 책임이 명시적이라 orchestration 패턴의 장점이 화면에서 바로 읽힌다.',
      severity: 'good',
    },
    {
      label: 'Integration sequencing',
      detail: 'UI와 state semantics가 final post export까지 잘 이어지지만, content density가 더 커지면 collapse UX가 필요할 수 있다.',
      severity: 'watch',
    },
    {
      label: 'Editorial usefulness',
      detail: `${inputs.audience} 독자를 위해 실제 예시 한두 개를 더 넣으면 적용 감각이 더 좋아질 수 있다.`,
      severity: 'improve',
    },
  ]
}

function buildRawFinalPost(
  inputs: BlogGeneratorInputs,
  research: ResearchSummary,
  drafts: SectionDraft[],
): string {
  return [
    `# ${titleCase(inputs.topic)}`,
    '',
    `> Audience: ${titleCase(inputs.audience)} | Tone: ${titleCase(inputs.tone)} | Length: ${titleCase(inputs.length)}`,
    '',
    '## Intro',
    `${research.thesis} 이 글은 UI, state, content 책임을 따로 본 뒤 최종 통합 기준으로 다시 묶는 흐름을 따른다.`,
    '',
    ...drafts.flatMap((draft) => [
      `## ${draft.title}`,
      '',
      draft.summary,
      '',
      ...draft.paragraphs,
      '',
      `- Takeaway: ${draft.takeaway}`,
      '',
    ]),
    '## Closing checklist',
    '',
    `- Draft conclusion: ${inputs.topic}는 분해만 잘해서는 부족하고, 마지막 integration review가 품질을 닫아줘야 실제 제품처럼 보인다.`,
  ].join('\n')
}

export function buildContentWorkerBundle(inputs: BlogGeneratorInputs): {
  workerOutput: WorkerOutput
  researchSummary: ResearchSummary
  outline: OutlineSection[]
  sectionDrafts: SectionDraft[]
  reviewNotes: ReviewNote[]
  rawFinalPost: string
} {
  const researchSummary = buildResearchSummary(inputs)
  const outline = buildOutline(inputs)
  const sectionDrafts = buildSectionDrafts(inputs, outline, researchSummary)
  const reviewNotes = buildReviewNotes(inputs)
  const rawFinalPost = buildRawFinalPost(inputs, researchSummary, sectionDrafts)

  return {
    workerOutput: {
      workerId: 'content_worker',
      summary:
        `Content Worker produced the article spine: research summary, outline, ${sectionDrafts.length} section drafts, review notes, and a raw final markdown draft.`,
      handoffNote:
        'Integrator should tighten the intro and closing, remove any repeated interaction copy, and make the final post read like one product instead of three work streams.',
      deliverablePreview: [
        `Research bullets: ${researchSummary.focusBullets.length}`,
        `Outline sections: ${outline.length}`,
        `Draft count: ${sectionDrafts.length}`,
        `Review notes: ${reviewNotes.length}`,
      ],
    },
    researchSummary,
    outline,
    sectionDrafts,
    reviewNotes,
    rawFinalPost,
  }
}

export function buildIntegrationReview(inputs: BlogGeneratorInputs): IntegrationReview {
  return {
    layoutConsistency:
      'Integrator aligned the decomposition board, worker cards, review desk, and final export into one information hierarchy.',
    stateConsistency:
      'Integrator confirmed loading, review-complete, and export-ready semantics match the visible status copy and button behavior.',
    contentConsistency:
      `Integrator tightened the intro and closing so ${inputs.topic} reads as one product narrative instead of three disconnected implementation notes.`,
    fixesApplied: [
      'Synced CTA copy with state progression',
      'Tightened empty/error messaging to match reducer behavior',
      'Polished intro and closing so the final post feels integrated',
    ],
    finalizationNote:
      'The integration review closes the gap between worker ownership and user-facing coherence, which is the core value of the orchestrator_worker harness.',
  }
}

export function buildFinalPost(
  inputs: BlogGeneratorInputs,
  rawFinalPost: string,
  integrationReview: IntegrationReview,
): string {
  const improvedIntro = `${titleCase(inputs.topic)}는 작업을 잘게 나누는 것만으로 품질이 좋아지지 않는다. UI, state, content를 분리한 뒤 마지막 integration review로 다시 묶을 때 비로소 하나의 제품처럼 읽힌다.`
  const improvedClosing = `- Final conclusion: ${inputs.topic}는 worker ownership을 분명히 하면서도, 마지막에 ${integrationReview.fixesApplied[0].toLowerCase()} 같은 통합 작업으로 마감할 때 가장 설득력 있게 구현된다.`

  return rawFinalPost
    .replace(
      /^## Intro[\s\S]*?(?=\n## )/m,
      `## Intro\n${improvedIntro}\n`,
    )
    .replace(
      /- Draft conclusion:[\s\S]*$/m,
      improvedClosing,
    )
}

export function assembleFinalOutputs(
  plan: OrchestratorPlan,
  workerOutputs: WorkerOutput[],
  researchSummary: ResearchSummary,
  outline: OutlineSection[],
  sectionDrafts: SectionDraft[],
  reviewNotes: ReviewNote[],
  finalPost: string,
  integrationReview: IntegrationReview,
): PipelineOutputs {
  return {
    research_summary: researchSummary,
    outline,
    section_drafts: sectionDrafts,
    review_notes: reviewNotes,
    final_post: finalPost,
    orchestrator_plan: plan,
    worker_outputs: workerOutputs,
    integration_review: integrationReview,
  }
}
