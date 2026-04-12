// generator.ts - deterministic mock generation for the single_agent benchmark app

import type {
  Audience,
  BlogGeneratorInputs,
  Length,
  OutlineSection,
  PipelineOutputs,
  ResearchSummary,
  ReviewNote,
  SectionDraft,
  Tone,
} from './contracts'

const audienceDescriptors: Record<Audience, string> = {
  beginner: '개념과 용어를 천천히 연결해 주는 설명이 필요합니다.',
  practitioner: '의사결정 근거와 실제 적용 포인트를 함께 보여줘야 합니다.',
  advanced: '트레이드오프와 설계 경계가 분명한 분석을 기대합니다.',
}

const toneDescriptors: Record<Tone, string> = {
  clear: '핵심을 짧고 선명하게 정리하는 방식',
  pragmatic: '실무 선택지와 체크리스트를 강조하는 방식',
  opinionated: '선호와 기준을 분명하게 드러내는 방식',
}

const lengthDescriptors: Record<Length, string[]> = {
  short: ['왜 지금 중요한가', '핵심 설계 포인트', '바로 적용할 체크리스트'],
  medium: ['문제 정의와 맥락', '권장 접근 방식', '구현 예시와 함정', '팀 적용 체크리스트'],
  long: [
    '문제 정의와 배경',
    '핵심 개념과 mental model',
    '선택지 비교와 트레이드오프',
    '실무 적용 패턴',
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

function createResearchSummary(inputs: BlogGeneratorInputs): ResearchSummary {
  const cleanTopic = titleCase(inputs.topic)
  return {
    angle: `${toneDescriptors[inputs.tone]}으로 ${cleanTopic}를 설명하고, ${inputs.audience} 독자가 바로 다음 선택을 할 수 있게 돕는다.`,
    thesis: `${cleanTopic}는 단일 기능 소개보다 '언제 쓰고 언제 피해야 하는지'를 알려줄 때 훨씬 설득력 있게 전달된다.`,
    audienceFit: `${inputs.audience} 독자를 기준으로 보면 ${audienceDescriptors[inputs.audience]}`,
    searchTerms: [
      `${inputs.topic} architecture`,
      `${inputs.topic} trade-offs`,
      `${inputs.topic} best practices`,
      `${inputs.topic} implementation checklist`,
    ],
    findings: [
      `${cleanTopic}를 설명할 때는 개념보다 먼저 문제 상황을 제시해야 읽는 속도가 올라간다.`,
      `${inputs.audience} 독자에게는 이상적인 설계보다 실패 패턴과 회피 기준을 같이 제시하는 편이 유용하다.`,
      `${inputs.tone} 톤에서는 장단점을 같은 밀도로 다뤄야 글의 신뢰도가 유지된다.`,
      `${inputs.length} 분량에서는 모든 세부사항을 나열하기보다 우선순위가 높은 판단 기준을 남기는 구성이 적합하다.`,
    ],
    references: [
      '공식 문서와 릴리스 노트',
      '실무 사례 회고와 아키텍처 글',
      '운영 중 겪는 실패 패턴 정리',
    ],
  }
}

function createOutline(inputs: BlogGeneratorInputs, research: ResearchSummary): OutlineSection[] {
  return lengthDescriptors[inputs.length].map((label, index) => ({
    id: `${slugify(inputs.topic)}-${index + 1}`,
    title: index === 0 ? `${label}: ${titleCase(inputs.topic)}` : label,
    summary:
      index === 0
        ? research.thesis
        : `${label}에 맞춰 ${inputs.topic}의 실제 선택 기준과 ${inputs.audience} 독자에게 필요한 설명 수준을 정리한다.`,
  }))
}

function createSectionDrafts(
  inputs: BlogGeneratorInputs,
  research: ResearchSummary,
  outline: OutlineSection[],
): SectionDraft[] {
  return outline.map((section, index) => ({
    id: section.id,
    title: section.title,
    body: [
      `${section.title}에서는 ${titleCase(inputs.topic)}를 단일 해법처럼 포장하지 않고, 문제의 성격과 팀의 제약 안에서 바라보는 시각을 먼저 제시한다. ${research.audienceFit}`,
      `실무적으로는 ${research.findings[index % research.findings.length]} 이 지점을 중심으로 설계를 비교하면 글의 흐름이 자연스러워진다. 독자가 다음 액션을 떠올릴 수 있도록 예외와 경계 조건도 함께 적는다.`,
      `${inputs.tone === 'opinionated' ? '나는' : '이 글은'} ${inputs.topic}를 설명할 때 도구 자체보다 팀이 어떤 복잡도를 감당할 준비가 되었는지를 더 중요하게 본다. 그래서 섹션 말미에는 적용 기준과 회피 기준을 한 쌍으로 남긴다.`,
    ],
    takeaway: `${section.title}의 핵심은 ${inputs.topic}를 '좋은 기술'이 아니라 '조건이 맞을 때 강한 선택지'로 설명하는 것이다.`,
  }))
}

function createReviewNotes(
  inputs: BlogGeneratorInputs,
  outline: OutlineSection[],
  drafts: SectionDraft[],
): ReviewNote[] {
  return [
    {
      label: 'Flow clarity',
      detail: `첫 섹션에서 독자 문제를 명확히 정의했고, 총 ${outline.length}개 섹션이 한 방향으로 이어진다.`,
      severity: 'good',
    },
    {
      label: 'Depth balance',
      detail: `${inputs.length} 분량에 맞는 설명량은 확보했지만, 섹션별 예시 수는 더 늘릴 여지가 있다.`,
      severity: 'watch',
    },
    {
      label: 'Actionability',
      detail: `${drafts[drafts.length - 1]?.takeaway ?? '마지막 takeaway'} 덕분에 마무리가 실용적이다.`,
      severity: 'good',
    },
    {
      label: 'Editorial polish',
      detail: `${inputs.audience} 독자를 기준으로 전문 용어에 짧은 정의를 더하면 진입 장벽을 더 낮출 수 있다.`,
      severity: 'improve',
    },
  ]
}

function createFinalPost(
  inputs: BlogGeneratorInputs,
  research: ResearchSummary,
  drafts: SectionDraft[],
): string {
  const header = [
    `# ${titleCase(inputs.topic)}`,
    '',
    `> Audience: ${titleCase(inputs.audience)} | Tone: ${titleCase(inputs.tone)} | Length: ${titleCase(inputs.length)}`,
    '',
    `## Intro`,
    `${research.thesis} 이 글은 ${inputs.audience} 독자가 ${inputs.topic}를 판단할 때 필요한 기준만 남기도록 설계했다.`,
    '',
    `### Research summary`,
    ...research.findings.map((finding) => `- ${finding}`),
    '',
  ]

  const sections = drafts.flatMap((draft) => [
    `## ${draft.title}`,
    '',
    ...draft.body,
    '',
    `- Takeaway: ${draft.takeaway}`,
    '',
  ])

  const closing = [
    `## Closing checklist`,
    '',
    `- 공식 문서를 먼저 보고 개념 범위를 확정한다.`,
    `- ${inputs.topic}를 도입할 이유와 피해야 할 이유를 같은 밀도로 적는다.`,
    `- 팀의 운영 복잡도와 학습 비용을 마지막에 다시 점검한다.`,
  ]

  return [...header, ...sections, ...closing].join('\n')
}

export function generatePipelineOutputs(inputs: BlogGeneratorInputs): PipelineOutputs {
  const research_summary = createResearchSummary(inputs)
  const outline = createOutline(inputs, research_summary)
  const section_drafts = createSectionDrafts(inputs, research_summary, outline)
  const review_notes = createReviewNotes(inputs, outline, section_drafts)
  const final_post = createFinalPost(inputs, research_summary, section_drafts)

  return {
    research_summary,
    outline,
    section_drafts,
    review_notes,
    final_post,
  }
}
