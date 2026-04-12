// generator.ts - parallel_sections newsroom board용 deterministic generator

import type {
  Audience,
  ArticleSection,
  BlogGeneratorInputs,
  CoordinatorBrief,
  FinalArticle,
  LaneDraftPreview,
  LanePacket,
  Length,
  MergeCriterion,
  MergeReport,
  OutlineSection,
  PipelineOutputs,
  SectionAssignment,
  Tone,
  WriterLaneId,
} from './contracts'

const audienceLens: Record<Audience, string> = {
  beginner: '개념 정의를 먼저 보여주고, 결정 기준을 짧은 문장으로 반복 확인해줘야 한다.',
  practitioner: '실무 판단과 도입 체크리스트를 빠르게 가져갈 수 있어야 한다.',
  advanced: '설계 경계와 트레이드오프가 먼저 보여야 설득력이 생긴다.',
}

const toneLens: Record<Tone, string> = {
  clear: '군더더기보다 구조와 논리 흐름을 먼저 세우는 톤',
  pragmatic: '실행 조건과 체크리스트를 앞세우는 톤',
  opinionated: '선호와 비선호를 분명하게 남기는 톤',
}

const audienceLabels: Record<Audience, string> = {
  beginner: '입문자',
  practitioner: '실무자',
  advanced: '고급 사용자',
}

const toneLabels: Record<Tone, string> = {
  clear: '명료한 설명',
  pragmatic: '실무 중심',
  opinionated: '선명한 관점',
}

const lengthLabels: Record<Length, string> = {
  short: '짧게',
  medium: '중간',
  long: '길게',
}

const laneVoices: Record<
  WriterLaneId,
  { lead: string; lens: string; handoff: string }
> = {
  writer_a: {
    lead: '도입 데스크',
    lens: '문제 정의와 독자 프레이밍',
    handoff: '머지 데스크는 반복되는 주제 프레이밍을 하나의 도입 문단으로 압축해야 한다.',
  },
  writer_b: {
    lead: '구조 데스크',
    lens: '핵심 구조와 선택 기준',
    handoff: '머지 데스크는 중간 구간이 끊기지 않도록 연결 문장을 추가해야 한다.',
  },
  writer_c: {
    lead: '마무리 데스크',
    lens: '실전 적용과 최종 판단 압축',
    handoff: '머지 데스크는 체크리스트 톤을 앞선 분석 섹션과 맞춰야 한다.',
  },
}

const sectionTitles: Record<Length, string[]> = {
  short: ['왜 지금 중요한가', '구조와 선택 기준', '바로 적용할 체크리스트'],
  medium: ['문제 정의와 배경', '권장 구조와 소유 범위', '구현 시 함정과 회피법', '실전 적용 체크리스트'],
  long: [
    '문제 정의와 배경',
    '핵심 사고 프레임',
    '권장 구조와 소유 범위',
    '구현 시 함정과 회피법',
    '실전 적용 체크리스트',
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

function buildMergeCriteria(inputs: BlogGeneratorInputs): MergeCriterion[] {
  return [
    {
      label: '중복 정리',
      detail: `${inputs.topic}의 배경 설명은 도입 레인 한 곳에만 남기고, 나머지 레인에서는 자기 판단 지점부터 시작한다.`,
    },
    {
      label: '전환 연결',
      detail: '레인 경계마다 짧은 연결 문장을 넣어 독자가 기사처럼 한 흐름으로 읽게 만든다.',
    },
    {
      label: '톤 정렬',
      detail: `${toneLens[inputs.tone]}을 유지하면서 레인마다 다른 문장 밀도를 하나의 기사 톤으로 맞춘다.`,
    },
  ]
}

function sectionBundles(sections: string[]): string[][] {
  if (sections.length <= 3) {
    return sections.map((section) => [section])
  }

  if (sections.length === 4) {
    return [[sections[0]], [sections[1], sections[2]], [sections[3]]]
  }

  return [[sections[0], sections[1]], [sections[2], sections[3]], [sections[4]]]
}

function buildAssignments(outline: OutlineSection[]): SectionAssignment[] {
  const laneIds: WriterLaneId[] = ['writer_a', 'writer_b', 'writer_c']
  const bundles = sectionBundles(outline.map((section) => section.id))

  return bundles.map((bundle, index) => {
    const writerId = laneIds[index]
    const firstSection = outline.find((section) => section.id === bundle[0])
    const lastSection = outline.find((section) => section.id === bundle[bundle.length - 1])

    return {
      writerId,
      sectionIds: bundle,
      ownershipRule:
        bundle.length === 1
          ? `${firstSection?.title ?? bundle[0]}만 맡고, 다른 레인의 프레이밍은 반복하지 않는다.`
          : `${firstSection?.title ?? bundle[0]}부터 ${lastSection?.title ?? bundle[bundle.length - 1]}까지 한 흐름으로 맡아 중간 설명이 끊기지 않게 한다.`,
      laneSummary: `${laneVoices[writerId].lead}가 ${laneVoices[writerId].lens} 관점에서 ${bundle.length}개 섹션을 소유한다.`,
    }
  })
}

function writerLabel(writerId: WriterLaneId) {
  return writerId === 'writer_a'
    ? '라이터 A'
    : writerId === 'writer_b'
      ? '라이터 B'
      : '라이터 C'
}

export function createCoordinatorBrief(inputs: BlogGeneratorInputs): {
  brief: CoordinatorBrief
  outline: OutlineSection[]
  assignments: SectionAssignment[]
} {
  const cleanTopic = titleCase(inputs.topic)

  const baseOutline = sectionTitles[inputs.length].map((title, index) => ({
    id: `${slugify(inputs.topic)}-${index + 1}`,
    title: index === 0 ? `${title}: ${cleanTopic}` : title,
    goal:
      index === 0
        ? `${cleanTopic}를 왜 지금 다시 정리해야 하는지와, 독자가 무엇을 먼저 판단해야 하는지 보여준다.`
        : `${title}에서 ${cleanTopic}의 선택 기준과 실무 판단 포인트를 분리해서 설명한다.`,
    writerHint: '',
  }))

  const assignments = buildAssignments(baseOutline)
  const outline = baseOutline.map((section) => {
    const owner = assignments.find((assignment) => assignment.sectionIds.includes(section.id))
    return {
      ...section,
      writerHint: owner ? `${writerLabel(owner.writerId)} 담당` : '코디네이터 담당',
    }
  })

  const brief: CoordinatorBrief = {
    title: cleanTopic,
    angle: `${toneLens[inputs.tone]}으로 ${cleanTopic}를 설명하되, 빠른 병렬 작성 뒤에도 최종 글이 하나의 기사처럼 읽히도록 설계한다.`,
    thesis: `${cleanTopic}는 빠르게 섹션을 병렬 작성할 수 있지만, 실제 출고 품질은 머지 데스크가 중복과 전환, 톤 밀도를 정리하는 순간에 결정된다.`,
    audienceLens: audienceLens[inputs.audience],
    commonFrame:
      '공통 프레임: 코디네이터가 논지와 소유 범위를 먼저 잠그고, 각 레인은 자기 판단 지점만 작성한 뒤 머지 리뷰어가 읽기용 최종 글로 압축한다.',
    sectionMap: outline,
    mergeCriteria: buildMergeCriteria(inputs),
  }

  return { brief, outline, assignments }
}

function makeDraftPreview(
  inputs: BlogGeneratorInputs,
  section: OutlineSection,
  writerId: WriterLaneId,
): LaneDraftPreview {
  const voice = laneVoices[writerId]

  return {
    id: section.id,
    title: section.title,
    deck: `${voice.lens} 관점에서 ${section.goal}`,
    bullets: [
      `${section.title}에서는 ${inputs.topic}의 이 구간만 설명하고, 다른 레인이 맡은 배경 프레이밍은 다시 가져오지 않는다.`,
      `${audienceLens[inputs.audience]} 이 기준을 따라 ${section.title}의 판단 포인트를 더 짧고 선명하게 정리한다.`,
    ],
    takeaway: `${section.title} 핵심 정리: 이 섹션은 ${inputs.topic}의 전체 설명이 아니라, 지금 필요한 판단 지점만 남겨야 읽기 속도가 유지된다.`,
  }
}

export function createLanePacket(
  inputs: BlogGeneratorInputs,
  brief: CoordinatorBrief,
  assignment: SectionAssignment,
): LanePacket {
  const ownedSections = brief.sectionMap.filter((section) => assignment.sectionIds.includes(section.id))

  return {
    writerId: assignment.writerId,
    ownedSections,
    ownershipRule: assignment.ownershipRule,
    statusSummary: assignment.laneSummary,
    draftPreview: ownedSections.map((section) => makeDraftPreview(inputs, section, assignment.writerId)),
    handoffNote: laneVoices[assignment.writerId].handoff,
  }
}

export function createMergeReport(
  inputs: BlogGeneratorInputs,
  brief: CoordinatorBrief,
  lanePackets: LanePacket[],
): MergeReport {
  const ownershipLabels = lanePackets.map((packet) => writerLabel(packet.writerId)).join(', ')

  return {
    reviewNotes: [
      '세 개의 레인이 모두 자기 담당 섹션 안에 머물렀고, 통합 정리는 리뷰 데스크로 넘겼다.',
      `${brief.title}의 도입 설명은 라이터 A 쪽으로 압축하고, 가운데와 마무리 레인은 자기 판단 포인트부터 시작하도록 정리한다.`,
      `${toneLens[inputs.tone]}을 유지하면서 레인마다 다른 문장 길이를 독자 우선 기사 톤으로 맞춘다.`,
    ],
    dedupeFix: {
      label: '중복 정리',
      before: '각 레인이 왜 이 주제가 중요한지 다시 소개하면서 도입 맥락이 반복된다.',
      after: '도입 맥락은 서문과 첫 섹션에만 남기고, 나머지 레인은 자기 섹션 목표부터 바로 시작한다.',
      rationale: `${ownershipLabels}가 만든 초안의 속도는 살리고, 독자가 같은 프레이밍을 세 번 읽지 않게 만든다.`,
    },
    transitionFix: {
      label: '전환 연결',
      before: '라이터 A/B/C 결과가 카드 단위로는 분명하지만, 기사로 읽을 때 섹션 경계가 갑자기 튄다.',
      after: '각 섹션 끝에 다음 판단 지점으로 넘어가는 연결 문장을 추가해 기사 흐름을 회복한다.',
      rationale: '병렬 보드의 흔적은 유지하되 최종 글은 단일 저자 글처럼 읽혀야 한다.',
    },
    toneFix: {
      label: '톤 정렬',
      before: '도입 레인은 설명형, 가운데 레인은 비교형, 마무리 레인은 체크리스트형이라 문장 밀도가 들쭉날쭉하다.',
      after: `${toneLens[inputs.tone]}을 기준으로 문장 길이와 핵심 정리 어조를 재정렬한다.`,
      rationale: '머지 리뷰어는 정보 손실보다 기사 톤의 일관성을 먼저 복구한다.',
    },
    finalizationNote:
      '머지 데스크는 이제 하나의 읽기용 최종 글을 출고한다. 공통 프레이밍은 짧아졌고, 섹션 경계는 연결됐으며, 체크리스트 톤도 본문과 맞춰졌다.',
  }
}

function buildArticleSection(
  inputs: BlogGeneratorInputs,
  section: OutlineSection,
  packet: LanePacket | undefined,
  index: number,
): ArticleSection {
  const preview = packet?.draftPreview.find((draft) => draft.id === section.id)
  const transitionLine =
    index === 0
      ? '이 도입은 이후 섹션이 같은 배경 설명을 반복하지 않게 브리프의 기준점을 먼저 고정한다.'
      : '이 구간은 앞선 섹션의 판단 기준을 이어받아 다음 의사결정으로 자연스럽게 이동하도록 설계한다.'

  return {
    id: section.id,
    title: section.title,
    deck:
      preview?.deck ??
      `${section.goal} 이 섹션은 머지 리뷰 이후 하나의 기사 흐름 안에 맞게 다시 압축된다.`,
    paragraphs: [
      `${section.goal} ${transitionLine}`,
      `${inputs.topic}를 다룰 때 이 섹션에서 중요한 것은 ${section.writerHint.toLowerCase()}을 지키면서도 독자가 “왜 여기서 이 판단을 해야 하는가”를 바로 이해하게 만드는 일이다.`,
      `${preview?.bullets[1] ?? audienceLens[inputs.audience]} 그래서 이 구간은 설명을 늘리는 대신, 다음 섹션으로 이어질 판단 지점을 먼저 정리한다.`,
    ],
    takeaway:
      preview?.takeaway ??
      `${section.title} 핵심 정리: ${inputs.topic}의 이 구간에서는 역할 경계와 다음 판단 포인트를 함께 보여줘야 한다.`,
  }
}

export function createFinalArticle(
  inputs: BlogGeneratorInputs,
  brief: CoordinatorBrief,
  lanePackets: LanePacket[],
  mergeReport: MergeReport,
): FinalArticle {
  const mergedSections = brief.sectionMap.map((section, index) =>
    buildArticleSection(
      inputs,
      section,
      lanePackets.find((packet) => packet.ownedSections.some((owned) => owned.id === section.id)),
      index,
    ),
  )

  const intro = `${brief.thesis} ${brief.commonFrame} ${mergeReport.dedupeFix.after}`
  const closing = `${brief.title}는 병렬 작성으로 속도를 얻을 수 있지만, 실제 공개 품질은 ${mergeReport.transitionFix.label}과 ${mergeReport.toneFix.label}을 거친 뒤에야 확보된다.`

  const markdown = [
    `# ${brief.title}`,
    '',
    `> 독자층: ${audienceLabels[inputs.audience]} | 톤: ${toneLabels[inputs.tone]} | 분량: ${lengthLabels[inputs.length]}`,
    '',
    '## 도입',
    intro,
    '',
    ...mergedSections.flatMap((section, index) => [
      `## ${section.title}`,
      '',
      section.deck,
      '',
      ...section.paragraphs,
      '',
      `- 핵심 정리: ${section.takeaway}`,
      index < mergedSections.length - 1
        ? `전환: 이제 ${section.title}에서 정리한 판단 기준을 다음 섹션의 판단 지점으로 자연스럽게 이어간다.`
        : '',
      '',
    ]),
    '## 마무리 체크리스트',
    '',
    closing,
  ].join('\n')

  return {
    title: brief.title,
    intro,
    mergedSections,
    closing,
    markdown,
  }
}

export function assembleFinalOutputs(
  brief: CoordinatorBrief,
  outline: OutlineSection[],
  assignments: SectionAssignment[],
  lanePackets: LanePacket[],
  mergeReport: MergeReport,
  finalArticle: FinalArticle,
): PipelineOutputs {
  return {
    research_summary: brief,
    outline,
    section_drafts: lanePackets,
    review_notes: mergeReport,
    final_post: finalArticle.markdown,
    assignments,
    final_article: finalArticle,
  }
}
