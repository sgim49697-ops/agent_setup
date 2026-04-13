// generator.ts - sequential pipeline용 deterministic local generation

import type {
  Audience,
  BlogGeneratorInputs,
  Length,
  OutlineOutput,
  OutlineSection,
  PipelineHandoff,
  PipelineOutputs,
  ResearchOutput,
  ReviewNote,
  ReviewerOutput,
  SectionDraft,
  Tone,
  WriterOutput,
} from './contracts'

const audienceGuidance: Record<Audience, string> = {
  beginner: '개념과 용어 정의를 짧게 보강해야 한다.',
  practitioner: '실무 판단 기준과 운영 포인트를 빠르게 전달해야 한다.',
  advanced: '트레이드오프와 설계 경계가 분명해야 설득력이 생긴다.',
}

const toneGuidance: Record<Tone, string> = {
  clear: '핵심을 정리하고 군더더기 표현을 줄이는 톤',
  pragmatic: '의사결정 체크리스트와 적용 기준을 앞세우는 톤',
  opinionated: '판단 기준과 선호를 분명하게 드러내는 톤',
}

const audienceLabels: Record<Audience, string> = {
  beginner: '입문자',
  practitioner: '실무자',
  advanced: '고급 사용자',
}

const toneLabels: Record<Tone, string> = {
  clear: '명료하게',
  pragmatic: '실무적으로',
  opinionated: '단호하게',
}

const lengthLabels: Record<Length, string> = {
  short: '짧게',
  medium: '보통',
  long: '길게',
}

const lengthSections: Record<Length, string[]> = {
  short: ['왜 지금 중요한가', '핵심 설계 포인트', '바로 적용할 체크리스트'],
  medium: ['문제 정의와 배경', '권장 구조와 역할 분리', '구현 시 주의할 함정', '실전 적용 체크리스트'],
  long: [
    '문제 정의와 배경',
    '핵심 mental model',
    '구조 선택과 트레이드오프',
    '실전 구현 패턴',
    '운영 체크리스트와 결론',
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

function buildMarkdown(
  inputs: BlogGeneratorInputs,
  introLine: string,
  drafts: SectionDraft[],
  closingLine: string,
) {
  return [
    `# ${titleCase(inputs.topic)}`,
    '',
    `> 독자: ${audienceLabels[inputs.audience]} | 톤: ${toneLabels[inputs.tone]} | 분량: ${lengthLabels[inputs.length]}`,
    '',
    '## 시작 메모',
    introLine,
    '',
    ...drafts.flatMap((draft) => [
      `## ${draft.title}`,
      '',
      draft.summary,
      '',
      ...draft.paragraphs,
      '',
      `- 핵심 포인트: ${draft.takeaway}`,
      '',
    ]),
    '## 마무리 체크리스트',
    '',
    closingLine,
  ].join('\n')
}

export function runResearcher(inputs: BlogGeneratorInputs): ResearchOutput {
  const cleanTopic = titleCase(inputs.topic)

  return {
    angle: `${toneGuidance[inputs.tone]}으로 ${cleanTopic}를 설명하고, ${inputs.audience} 독자가 도입 기준을 빠르게 잡게 만든다.`,
    thesis: `${cleanTopic}는 기능 소개보다 "어떤 조건에서 쓰고, 언제 피해야 하는지"를 중심으로 설명할 때 훨씬 유용해진다.`,
    keyFindings: [
      `${cleanTopic}의 핵심 가치는 역할 경계와 책임 분리를 명확히 했을 때 잘 드러난다.`,
      `${inputs.audience} 독자에게는 이상론보다 실패 패턴과 회피 기준을 함께 주는 편이 실용적이다.`,
      `${inputs.length} 분량에서는 모든 디테일보다 우선순위가 높은 판단 기준을 남기는 구성이 효과적이다.`,
    ],
    supportingFacts: [
      `독자 기준: ${audienceGuidance[inputs.audience]}`,
      `톤 기준: ${toneGuidance[inputs.tone]}`,
      '근거 소스: 공식 문서, 실무 회고, 아키텍처 비교 글',
    ],
    searchTerms: [
      `${inputs.topic} 아키텍처`,
      `${inputs.topic} 트레이드오프`,
      `${inputs.topic} 모범 사례`,
      `${inputs.topic} 구현 체크리스트`,
    ],
    handoffNote:
      '아웃라이너는 첫 제목부터 실무 판단 포인트가 보이도록 thesis를 섹션 순서로 다시 잠가야 한다.',
  }
}

export function runOutliner(
  inputs: BlogGeneratorInputs,
  research: ResearchOutput,
): OutlineOutput {
  const sections: OutlineSection[] = lengthSections[inputs.length].map((label, index) => ({
    id: `${slugify(inputs.topic)}-${index + 1}`,
    title: index === 0 ? `${label}: ${titleCase(inputs.topic)}` : label,
    goal:
      index === 0
        ? research.thesis
        : `${label}에서 ${inputs.topic}의 실제 선택 기준과 ${inputs.audience} 독자가 가져가야 할 판단 포인트를 정리한다.`,
  }))

  return {
    sections,
    structureRationale:
      '이 구조는 문제 정의에서 시작해 역할 경계, 구현 함정, 적용 체크리스트로 이동한다. 라이터가 점점 더 구체적인 판단 기준을 쌓게 만드는 순서다.',
    handoffNote:
      '라이터는 섹션마다 하나의 의사결정만 붙들고, 마지막에 리뷰어가 다듬기 좋은 핵심 포인트를 남겨야 한다.',
  }
}

export function runWriter(
  inputs: BlogGeneratorInputs,
  research: ResearchOutput,
  outline: OutlineOutput,
): WriterOutput {
  const sectionDrafts: SectionDraft[] = outline.sections.map((section, index) => ({
    id: section.id,
    title: section.title,
    summary: `${section.goal} 이 섹션은 ${inputs.topic}를 좋은 기술 소개가 아니라 조건부 선택지로 설명하도록 구성한다.`,
    paragraphs: [
      `${section.title}에서는 ${titleCase(inputs.topic)}를 단일 해법처럼 포장하지 않고, 팀이 감당할 수 있는 복잡도와 운영 비용을 먼저 드러낸다.`,
      `Researcher가 남긴 ${research.keyFindings[index % research.keyFindings.length]} 포인트를 중심으로 보면, 독자는 개념보다 판단 기준을 먼저 얻게 된다.`,
      `${inputs.audience} 독자를 위해서는 역할 경계, 실패 패턴, 적용 전 체크리스트를 한 묶음으로 제시하는 편이 실제 읽기 흐름에 잘 맞는다.`,
    ],
    takeaway: `${section.title}의 takeaway는 ${inputs.topic}를 도입 전 체크리스트와 함께 이해하게 만드는 것이다.`,
  }))

  const introLine = `${research.thesis} 이 초안은 ${inputs.audience} 독자를 위해 구조를 먼저 보여주고, 이후에 실제 선택 기준을 차례대로 설명한다.`
  const closingLine = `- 초안 결론: ${inputs.topic}는 팀 상황에 맞춰 판단해야 하며, 섣부른 일반화보다 역할과 운영 비용을 먼저 보는 편이 안전하다.`

  return {
    sectionDrafts,
    writerSummary: `라이터가 ${sectionDrafts.length}개의 섹션 초안을 만들었고, 아웃라이너 순서를 그대로 따르는 사전 검토용 마크다운까지 정리했습니다.`,
    preReviewMarkdown: buildMarkdown(inputs, introLine, sectionDrafts, closingLine),
    handoffNote:
      '리뷰어는 도입부를 더 단단하게 만들고, 최소 한 개의 핵심 포인트를 sharper하게 다듬은 뒤, 결론을 행동 지향형으로 바꿔야 한다.',
  }
}

export function runReviewer(
  inputs: BlogGeneratorInputs,
  research: ResearchOutput,
  outline: OutlineOutput,
  writerOutput: WriterOutput,
): ReviewerOutput {
  const introBefore = `${research.thesis} 이 초안은 ${audienceLabels[inputs.audience]}를 위해 구조를 먼저 보여주고, 이후에 실제 선택 기준을 차례대로 설명한다.`
  const introAfter = `${research.thesis} 먼저 이 글은 ${audienceLabels[inputs.audience]}가 역할 분리, 운영 비용, 회피 기준을 한 번에 판단할 수 있도록 구조를 잡는다.`

  const firstTakeawayBefore = writerOutput.sectionDrafts[0]?.takeaway ?? ''
  const firstTakeawayAfter = `${outline.sections[0]?.title ?? '첫 섹션'}의 takeaway는 ${inputs.topic}를 도입 이유와 회피 기준을 함께 검토하는 선택지로 보게 만드는 것이다.`

  const closingBefore = `- 초안 결론: ${inputs.topic}는 팀 상황에 맞춰 판단해야 하며, 섣부른 일반화보다 역할과 운영 비용을 먼저 보는 편이 안전하다.`
  const closingAfter = `- 최종 결론: ${inputs.topic}는 팀의 운영 복잡도, 도입 이유, 회피 기준을 같이 따질 때 가장 설득력 있는 선택이 된다.`

  const reviewedDrafts = writerOutput.sectionDrafts.map((draft, index) =>
    index === 0
      ? {
          ...draft,
          takeaway: firstTakeawayAfter,
        }
      : draft,
  )

  const reviewNotes: ReviewNote[] = [
    {
      label: '흐름 선명도',
      detail: `라이터가 아웃라이너 순서를 그대로 따라갔고, 리뷰어가 ${outline.sections.length}개 섹션을 하나의 주장으로 다시 고정했습니다.`,
      severity: 'good',
    },
    {
      label: '행동 가능성',
      detail: '도입부와 결론이 일반 요약으로 흐르지 않고, 도입 판단을 더 직접적으로 말해주도록 조정됐습니다.',
      severity: 'good',
    },
    {
      label: '편집 다듬기',
      detail: `${audienceLabels[inputs.audience]}를 위해 몇몇 전문 용어에 짧은 정의를 더하면 진입 장벽을 더 낮출 수 있습니다.`,
      severity: 'improve',
    },
  ]

  const appliedEdits = [
    {
      label: '도입부 강화',
      before: introBefore,
      after: introAfter,
    },
    {
      label: '핵심 포인트 정리',
      before: firstTakeawayBefore,
      after: firstTakeawayAfter,
    },
    {
      label: '결론 행동성 보강',
      before: closingBefore,
      after: closingAfter,
    },
  ]

  return {
    reviewNotes,
    appliedEdits,
    finalMarkdown: buildMarkdown(inputs, introAfter, reviewedDrafts, closingAfter),
    finalizationNote: `리뷰어가 ${appliedEdits.length}개의 편집 수정을 적용해 검토 메모를 나열하는 수준을 넘어서, 실제 발행 원고에 바로 반영되도록 잠갔습니다.`,
  }
}

export function assembleFinalOutputs(
  inputs: BlogGeneratorInputs,
  research: ResearchOutput,
  outline: OutlineOutput,
  writerOutput: WriterOutput,
  reviewerOutput: ReviewerOutput,
): PipelineOutputs {
  const handoffs: PipelineHandoff[] = [
    {
      from: 'researcher',
      to: 'outliner',
      inputSummary: `${inputs.topic} 주제 브리프`,
      outputSummary: research.handoffNote,
      status: 'delivered',
    },
    {
      from: 'outliner',
      to: 'writer',
      inputSummary: `리서치 thesis와 ${research.keyFindings.length}개의 핵심 발견`,
      outputSummary: outline.handoffNote,
      status: 'delivered',
    },
    {
      from: 'writer',
      to: 'reviewer',
      inputSummary: `${outline.sections.length}개의 섹션 구조`,
      outputSummary: writerOutput.handoffNote,
      status: 'delivered',
    },
  ]

  return {
    research_summary: research,
    outline,
    section_drafts: writerOutput,
    review_notes: reviewerOutput,
    final_post: reviewerOutput.finalMarkdown,
    handoffs,
  }
}
