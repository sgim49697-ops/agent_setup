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
    `> Audience: ${titleCase(inputs.audience)} | Tone: ${titleCase(inputs.tone)} | Length: ${titleCase(inputs.length)}`,
    '',
    '## Intro',
    introLine,
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
      `Audience fit: ${audienceGuidance[inputs.audience]}`,
      `Tone choice: ${toneGuidance[inputs.tone]}`,
      'Supporting sources: 공식 문서, 실무 회고, 아키텍처 비교 글',
    ],
    searchTerms: [
      `${inputs.topic} architecture`,
      `${inputs.topic} trade-offs`,
      `${inputs.topic} best practices`,
      `${inputs.topic} implementation checklist`,
    ],
    handoffNote: `Outliner should turn this thesis into a section order that keeps the practical decision point visible from the first heading.`,
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
    structureRationale: `The outline starts with the problem framing, then moves into role boundaries, implementation pitfalls, and a checklist so the writer can keep the argument progressively more concrete.`,
    handoffNote: `Writer should keep each section focused on one decision and end with a takeaway that can be reviewed or tightened later.`,
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
  const closingLine = `- Draft conclusion: ${inputs.topic}는 팀 상황에 맞춰 판단해야 하며, 섣부른 일반화보다는 역할과 운영 비용을 먼저 보는 편이 안전하다.`

  return {
    sectionDrafts,
    writerSummary: `Writer produced ${sectionDrafts.length} section drafts and a readable pre-review markdown draft that follows the outliner order exactly.`,
    preReviewMarkdown: buildMarkdown(inputs, introLine, sectionDrafts, closingLine),
    handoffNote: `Reviewer should tighten the intro, sharpen at least one takeaway, and turn the draft conclusion into a stronger action-oriented closing.`,
  }
}

export function runReviewer(
  inputs: BlogGeneratorInputs,
  research: ResearchOutput,
  outline: OutlineOutput,
  writerOutput: WriterOutput,
): ReviewerOutput {
  const introBefore = `${research.thesis} 이 초안은 ${inputs.audience} 독자를 위해 구조를 먼저 보여주고, 이후에 실제 선택 기준을 차례대로 설명한다.`
  const introAfter = `${research.thesis} 먼저 이 글은 ${inputs.audience} 독자가 역할 분리, 운영 비용, 회피 기준을 한 번에 판단할 수 있도록 구조를 잡는다.`

  const firstTakeawayBefore = writerOutput.sectionDrafts[0]?.takeaway ?? ''
  const firstTakeawayAfter = `${outline.sections[0]?.title ?? '첫 섹션'}의 takeaway는 ${inputs.topic}를 도입 이유와 회피 기준을 함께 검토하는 선택지로 보게 만드는 것이다.`

  const closingBefore = `- Draft conclusion: ${inputs.topic}는 팀 상황에 맞춰 판단해야 하며, 섣부른 일반화보다는 역할과 운영 비용을 먼저 보는 편이 안전하다.`
  const closingAfter = `- Final conclusion: ${inputs.topic}는 팀의 운영 복잡도, 도입 이유, 회피 기준을 같이 따질 때 가장 설득력 있는 선택이 된다.`

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
      label: 'Flow clarity',
      detail: `The writer followed the outliner order and the reviewer kept all ${outline.sections.length} sections aligned to one argument.`,
      severity: 'good',
    },
    {
      label: 'Actionability',
      detail: 'The intro and closing now make the adoption decision more explicit, rather than leaving it as a general summary.',
      severity: 'good',
    },
    {
      label: 'Editorial polish',
      detail: `${inputs.audience} 독자를 위해 몇몇 전문 용어에 짧은 정의를 더하면 진입 장벽을 더 낮출 수 있다.`,
      severity: 'improve',
    },
  ]

  const appliedEdits = [
    {
      label: 'Intro reinforcement',
      before: introBefore,
      after: introAfter,
    },
    {
      label: 'Takeaway tightening',
      before: firstTakeawayBefore,
      after: firstTakeawayAfter,
    },
    {
      label: 'Closing actionability',
      before: closingBefore,
      after: closingAfter,
    },
  ]

  return {
    reviewNotes,
    appliedEdits,
    finalMarkdown: buildMarkdown(inputs, introAfter, reviewedDrafts, closingAfter),
    finalizationNote: `Reviewer applied ${appliedEdits.length} concrete edits so the final post reflects editorial changes instead of merely listing review notes.`,
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
      inputSummary: `Topic brief for ${inputs.topic}`,
      outputSummary: research.handoffNote,
      status: 'delivered',
    },
    {
      from: 'outliner',
      to: 'writer',
      inputSummary: `Research thesis and ${research.keyFindings.length} key findings`,
      outputSummary: outline.handoffNote,
      status: 'delivered',
    },
    {
      from: 'writer',
      to: 'reviewer',
      inputSummary: `${outline.sections.length} outlined sections`,
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
