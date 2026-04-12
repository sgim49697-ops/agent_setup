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

const audienceDisplayLabels: Record<Audience, string> = {
  beginner: '입문자 (Beginner)',
  practitioner: '실무자 (Practitioner)',
  advanced: '고급 사용자 (Advanced)',
}

const toneDisplayLabels: Record<Tone, string> = {
  clear: '명료함 (Clear)',
  pragmatic: '실무형 (Pragmatic)',
  opinionated: '의견형 (Opinionated)',
}

const lengthDisplayLabels: Record<Length, string> = {
  short: '짧게 (Short)',
  medium: '보통 (Medium)',
  long: '길게 (Long)',
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
      scope: '단계 추적기, CTA, 빈/오류 메시지, 패널 계층',
      ownedDeliverables: ['단계 라벨', 'CTA 선명도', '빈 상태 문구', '패널 계층'],
      integrationRisks: [
        '상태 워커의 비활성 의미 체계와 충돌할 수 있다',
        '콘텐츠 워커의 긴 본문이 레이아웃 계층을 무너뜨릴 수 있다',
      ],
    },
    {
      workerId: 'state_worker',
      scope: '로딩, 초안 준비, 리뷰 완료, 내보내기 준비 의미 체계',
      ownedDeliverables: ['리듀서 규칙', '버튼 비활성 타이밍', '오류 트리거', '단계 완료 메모'],
      integrationRisks: [
        'UI 문구가 실제 상태 전이와 어긋날 수 있다',
        '콘텐츠 워커 결과가 늦게 들어올 때 잘못된 완료 상태를 선언할 수 있다',
      ],
    },
    {
      workerId: 'content_worker',
      scope: `${inputs.topic}에 대한 리서치, 아웃라인, 초안, 리뷰, 최종 마크다운`,
      ownedDeliverables: ['리서치 요약', '아웃라인', '섹션 초안', '리뷰 노트', '최종 글'],
      integrationRisks: [
        'UI 워커가 준비한 패널 구조보다 콘텐츠 밀도가 커질 수 있다',
        '상태 워커의 리뷰 완료 / 내보내기 준비 경계가 애매해질 수 있다',
      ],
    },
  ]
}

export function buildOrchestratorPlan(inputs: BlogGeneratorInputs): OrchestratorPlan {
  return {
    productGoal: `${inputs.topic}용 테크 블로그 생성기를 구현하되, 분해 기준과 ownership, integration trace가 화면에서 명확히 읽히게 만든다.`,
    decompositionReason:
      `이 주제는 UI framing, 상태 semantics, 콘텐츠 작성을 나눠야 orchestration이 협업 경계를 어떻게 관리하는지 제품 화면에서 보여주기 좋다. ${audienceGuidance[inputs.audience]}`,
    bundles: createBundles(inputs),
    integrationChecklist: [
      'UI 문구는 실제 상태 전이와 어긋나지 않아야 한다.',
      '워커 소유 범위는 책임이 흐려질 만큼 겹치지 않아야 한다.',
      '최종 글 (Final post)은 세 개의 작업 스트림이 아니라 하나의 제품처럼 읽혀야 한다.',
      '리뷰 노트와 최종 내보내기는 통합 이후에도 같은 결론을 유지해야 한다.',
    ],
  }
}

export function buildUiWorkerOutput(inputs: BlogGeneratorInputs, plan: OrchestratorPlan): WorkerOutput {
  return {
    workerId: 'ui_worker',
    summary:
      'UI 워커가 단계 추적기, 분해 보드, 워커 카드, 통합 데스크, 내보내기 패널을 하나의 읽기 쉬운 셸로 정리했다.',
    handoffNote:
      '상태 워커는 버튼 비활성 타이밍과 상태 문구를 맞춰야 하고, 콘텐츠 워커는 패널 계층을 존중해 긴 본문을 접힌 표면 안에 가둬야 한다.',
    deliverablePreview: [
      '기본 CTA: 글 생성 시작 (Generate post)',
      '보조 CTA: 마크다운 복사 (Copy markdown)',
      '오케스트레이터 데스크, 워커 보드, 최종 글 빈 상태',
      `톤 프레이밍: ${toneGuidance[inputs.tone]}`,
      `계획 체크포인트: ${plan.integrationChecklist.length}개`,
    ],
  }
}

export function buildStateWorkerOutput(inputs: BlogGeneratorInputs): WorkerOutput {
  return {
    workerId: 'state_worker',
    summary:
      '상태 워커가 계획부터 통합 리뷰까지의 순서를 결정론적으로 고정하고, 로딩/초안 준비/리뷰 완료/내보내기 준비/오류 전이를 명시했다.',
    handoffNote:
      '통합 담당자는 로딩 동안 글 생성 시작 (Generate post)이 비활성화되는지, 오류가 내보내기 준비 상태로 새지 않는지, 리뷰 완료가 최종 내보내기보다 먼저 보이는지 확인해야 한다.',
    deliverablePreview: [
      '로딩 상태에서 글 생성 시작 (Generate post) 비활성화',
      'fail/error 접두사는 계획 단계 오류를 트리거',
      '리뷰 완료는 내보내기 준비보다 먼저 노출',
      `독자 가드레일: ${audienceGuidance[inputs.audience]}`,
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
      `${audienceDisplayLabels[inputs.audience]} 독자는 각 역할이 무엇을 책임지는지 명확히 볼 때 글을 더 빨리 이해한다.`,
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
    summary: `${section.goal} 이 섹션은 콘텐츠 워커가 실제 글 흐름을 담당하고, 통합 담당자가 마지막에 톤과 연결감을 정리할 수 있도록 적절한 밀도로 작성한다.`,
    paragraphs: [
      `${titleCase(inputs.topic)}를 이 구간에서 설명할 때 가장 중요한 것은 누가 어떤 책임을 가져가고, 그 경계가 언제 다시 연결되는지 보여주는 일이다.`,
      `${research.focusBullets[index % research.focusBullets.length]} 이 포인트를 중심으로 보면 글이 추상론보다 실전 판단에 가까워진다.`,
      `${audienceDisplayLabels[inputs.audience]} 독자에게는 ${section.goal.toLowerCase()}를 하나의 체크포인트로 보이게 하는 편이 읽기 흐름을 훨씬 안정적으로 만든다.`,
    ],
    takeaway: `${section.title} 핵심 정리: 이 구간에서는 분해 기준과 통합 기준을 함께 봐야 한다.`,
  }))
}

function buildReviewNotes(inputs: BlogGeneratorInputs): ReviewNote[] {
  return [
    {
      label: '소유 범위 선명도',
      detail: '워커별 책임이 명시적이라 오케스트레이션 패턴의 장점이 화면에서 바로 읽힌다.',
      severity: 'good',
    },
    {
      label: '통합 순서',
      detail: 'UI와 상태 의미 체계가 최종 글 내보내기까지 잘 이어지지만, 콘텐츠 밀도가 더 커지면 접힘 UX가 필요할 수 있다.',
      severity: 'watch',
    },
    {
      label: '콘텐츠 실용성',
      detail: `${audienceDisplayLabels[inputs.audience]} 독자를 위해 실제 예시 한두 개를 더 넣으면 적용 감각이 더 좋아질 수 있다.`,
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
    `> 독자층 (Audience): ${audienceDisplayLabels[inputs.audience]} | 톤 (Tone): ${toneDisplayLabels[inputs.tone]} | 분량 (Length): ${lengthDisplayLabels[inputs.length]}`,
    '',
    '## 시작 메모',
    `${research.thesis} 이 글은 UI, state, content 책임을 따로 본 뒤 최종 통합 기준으로 다시 묶는 흐름을 따른다.`,
    '',
    ...drafts.flatMap((draft) => [
      `## ${draft.title}`,
      '',
      draft.summary,
      '',
      ...draft.paragraphs,
      '',
      `- 핵심 정리: ${draft.takeaway}`,
      '',
    ]),
    '## 마무리 체크리스트',
    '',
    `- 초안 결론: ${inputs.topic}는 분해만 잘해서는 부족하고, 마지막 integration review가 품질을 닫아줘야 실제 제품처럼 보인다.`,
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
        `콘텐츠 워커가 글의 뼈대를 완성했다. 리서치 요약, 아웃라인, ${sectionDrafts.length}개 섹션 초안, 리뷰 노트, 원본 최종 마크다운 초안이 준비됐다.`,
      handoffNote:
        '통합 담당자는 도입부와 마무리를 더 조이고, 반복되는 인터랙션 문구를 제거해 최종 글이 세 개의 작업 흐름이 아니라 하나의 제품처럼 읽히게 만들어야 한다.',
      deliverablePreview: [
        `리서치 핵심 bullet: ${researchSummary.focusBullets.length}`,
        `아웃라인 섹션: ${outline.length}`,
        `초안 수: ${sectionDrafts.length}`,
        `리뷰 노트: ${reviewNotes.length}`,
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
      '통합 담당자가 분해 보드, 워커 카드, 리뷰 데스크, 최종 내보내기를 하나의 정보 계층으로 다시 정렬했다.',
    stateConsistency:
      '통합 담당자가 로딩, 리뷰 완료, 내보내기 준비 의미 체계가 화면의 상태 문구와 버튼 동작에 맞는지 확인했다.',
    contentConsistency:
      `통합 담당자가 도입부와 마무리를 조여 ${inputs.topic}가 세 개의 단절된 구현 메모가 아니라 하나의 제품 서사처럼 읽히게 만들었다.`,
    fixesApplied: [
      'CTA 문구를 상태 전이와 동기화',
      '빈 상태/오류 메시지를 리듀서 동작과 맞게 정리',
      '도입부와 마무리를 다듬어 최종 글이 더 통합적으로 느껴지게 조정',
    ],
    finalizationNote:
      '통합 리뷰는 워커 소유 범위와 사용자 체감 일관성 사이의 간극을 닫아주며, 이것이 orchestrator_worker 하니스의 핵심 가치다.',
  }
}

export function buildFinalPost(
  inputs: BlogGeneratorInputs,
  rawFinalPost: string,
  integrationReview: IntegrationReview,
): string {
  const improvedIntro = `${titleCase(inputs.topic)}는 작업을 잘게 나누는 것만으로 품질이 좋아지지 않는다. UI, 상태, 콘텐츠를 분리한 뒤 마지막 통합 리뷰로 다시 묶을 때 비로소 하나의 제품처럼 읽힌다.`
  const improvedClosing = `- 최종 결론: ${inputs.topic}는 워커 소유 범위를 분명히 하면서도, 마지막에 ${integrationReview.fixesApplied[0].toLowerCase()} 같은 통합 작업으로 마감할 때 가장 설득력 있게 구현된다.`

  return rawFinalPost
    .replace(
      /^## 시작 메모[\s\S]*?(?=\n## )/m,
      `## 시작 메모\n${improvedIntro}\n`,
    )
    .replace(
      /- 초안 결론:[\s\S]*$/m,
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
