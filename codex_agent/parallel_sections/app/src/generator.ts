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

const laneVoices: Record<
  WriterLaneId,
  { lead: string; lens: string; handoff: string }
> = {
  writer_a: {
    lead: 'opening desk',
    lens: '문제 정의와 독자 프레이밍',
    handoff: 'Merge desk should compress repeated topic framing into a single opening paragraph.',
  },
  writer_b: {
    lead: 'structure desk',
    lens: '핵심 구조와 선택 기준',
    handoff: 'Merge desk should add bridge sentences so mid-article structure feels continuous.',
  },
  writer_c: {
    lead: 'closing desk',
    lens: '실전 적용과 최종 판단 압축',
    handoff: 'Merge desk should align checklist tone with the earlier analytical sections.',
  },
}

const sectionTitles: Record<Length, string[]> = {
  short: ['왜 지금 중요한가', '구조와 선택 기준', '바로 적용할 체크리스트'],
  medium: ['문제 정의와 배경', '권장 구조와 ownership', '구현 시 함정과 회피법', '실전 적용 체크리스트'],
  long: [
    '문제 정의와 배경',
    '핵심 mental model',
    '권장 구조와 ownership',
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
      label: 'Duplication cleanup',
      detail: `${inputs.topic}의 배경 설명은 opening lane 한 곳에만 남기고, 나머지 lane에서는 자기 decision point부터 시작한다.`,
    },
    {
      label: 'Transition bridges',
      detail: 'lane 경계마다 짧은 연결 문장을 넣어 독자가 기사처럼 한 흐름으로 읽게 만든다.',
    },
    {
      label: 'Tone alignment',
      detail: `${toneLens[inputs.tone]}을 유지하면서 lane마다 다른 문장 밀도를 하나의 기사 톤으로 맞춘다.`,
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
          ? `${firstSection?.title ?? bundle[0]}만 맡고, 다른 lane의 framing은 반복하지 않는다.`
          : `${firstSection?.title ?? bundle[0]}부터 ${lastSection?.title ?? bundle[bundle.length - 1]}까지 한 흐름으로 맡아 중간 설명이 끊기지 않게 한다.`,
      laneSummary: `${laneVoices[writerId].lead}가 ${laneVoices[writerId].lens} 관점에서 ${bundle.length}개 섹션을 소유한다.`,
    }
  })
}

function writerLabel(writerId: WriterLaneId) {
  return writerId.replace('writer_', 'Writer ').toUpperCase()
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
      writerHint: owner ? `${writerLabel(owner.writerId)} ownership` : 'Coordinator ownership',
    }
  })

  const brief: CoordinatorBrief = {
    title: cleanTopic,
    angle: `${toneLens[inputs.tone]}으로 ${cleanTopic}를 설명하되, 빠른 병렬 작성 뒤에도 최종 글이 하나의 기사처럼 읽히도록 설계한다.`,
    thesis: `${cleanTopic}는 빠르게 섹션을 병렬 작성할 수 있지만, shipping quality는 merge desk가 중복과 전환, 톤 밀도를 정리하는 순간에 결정된다.`,
    audienceLens: audienceLens[inputs.audience],
    commonFrame:
      'Shared frame: coordinator가 논지와 ownership을 먼저 잠그고, 각 lane은 자기 decision point만 작성한 뒤 merge reviewer가 reader-ready article로 압축한다.',
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
      `${section.title}에서는 ${inputs.topic}의 이 구간만 설명하고, 다른 lane이 맡은 background framing은 다시 가져오지 않는다.`,
      `${audienceLens[inputs.audience]} 이 기준을 따라 ${section.title}의 판단 포인트를 더 짧고 선명하게 정리한다.`,
    ],
    takeaway: `${section.title} takeaway: 이 섹션은 ${inputs.topic}의 전체 설명이 아니라, 지금 필요한 decision point만 남겨야 읽기 속도가 유지된다.`,
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
      `All three lanes stayed inside owned sections and left merge work to the review desk.`,
      `${brief.title}의 opening 설명은 Writer A 쪽으로 압축하고, middle/closing lanes는 자기 판단 포인트부터 시작하도록 정리한다.`,
      `${toneLens[inputs.tone]}을 유지하면서 lane마다 다른 문장 길이를 reader-first article 톤으로 맞춘다.`,
    ],
    dedupeFix: {
      label: 'Duplication cleanup',
      before: '각 lane이 왜 이 주제가 중요한지 다시 소개하면서 opening context가 반복된다.',
      after: 'opening context는 intro와 첫 섹션에만 남기고, 나머지 lane은 자기 section goal부터 바로 시작한다.',
      rationale: `${ownershipLabels}가 만든 초안의 속도는 살리고, reader가 같은 framing을 세 번 읽지 않게 만든다.`,
    },
    transitionFix: {
      label: 'Transition bridge',
      before: 'Writer A/B/C 결과가 카드 단위로는 분명하지만, 기사로 읽을 때 섹션 경계가 갑자기 튄다.',
      after: '각 섹션 끝에 다음 decision point로 넘어가는 연결 문장을 추가해 기사 흐름을 회복한다.',
      rationale: 'parallel board의 흔적은 유지하되 final article은 단일 저자 글처럼 읽혀야 한다.',
    },
    toneFix: {
      label: 'Tone alignment',
      before: 'opening lane은 설명형, middle lane은 비교형, closing lane은 체크리스트형이라 문장 밀도가 들쭉날쭉하다.',
      after: `${toneLens[inputs.tone]}을 기준으로 문장 길이와 takeaway 어조를 재정렬한다.`,
      rationale: 'merge reviewer는 정보 손실보다 기사 톤의 일관성을 먼저 복구한다.',
    },
    finalizationNote:
      'Merge desk now ships one reader-ready article: shared framing is shorter, section edges are bridged, and checklist language matches the rest of the piece.',
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
      ? '이 opening은 이후 섹션이 같은 배경 설명을 반복하지 않게 브리프의 기준점을 먼저 고정한다.'
      : '이 구간은 앞선 섹션의 판단 기준을 이어받아 다음 의사결정으로 자연스럽게 이동하도록 설계한다.'

  return {
    id: section.id,
    title: section.title,
    deck:
      preview?.deck ??
      `${section.goal} 이 섹션은 merge review 이후 하나의 기사 흐름 안에 맞게 다시 압축된다.`,
    paragraphs: [
      `${section.goal} ${transitionLine}`,
      `${inputs.topic}를 다룰 때 이 섹션에서 중요한 것은 ${section.writerHint.toLowerCase()}을 지키면서도 reader가 “왜 여기서 이 판단을 해야 하는가”를 바로 이해하게 만드는 일이다.`,
      `${preview?.bullets[1] ?? audienceLens[inputs.audience]} 그래서 이 구간은 설명을 늘리는 대신, 다음 섹션으로 이어질 decision point를 먼저 정리한다.`,
    ],
    takeaway:
      preview?.takeaway ??
      `${section.title} takeaway: ${inputs.topic}의 이 구간에서는 역할 경계와 다음 판단 포인트를 함께 보여줘야 한다.`,
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
  const closing = `Final note: ${brief.title}는 병렬 작성으로 속도를 얻을 수 있지만, release quality는 ${mergeReport.transitionFix.label.toLowerCase()}와 ${mergeReport.toneFix.label.toLowerCase()}를 거친 뒤에야 확보된다.`

  const markdown = [
    `# ${brief.title}`,
    '',
    `> Audience: ${titleCase(inputs.audience)} | Tone: ${titleCase(inputs.tone)} | Length: ${titleCase(inputs.length)}`,
    '',
    '## Intro',
    intro,
    '',
    ...mergedSections.flatMap((section, index) => [
      `## ${section.title}`,
      '',
      section.deck,
      '',
      ...section.paragraphs,
      '',
      `- Takeaway: ${section.takeaway}`,
      index < mergedSections.length - 1
        ? `Transition: 이제 ${section.title}에서 정리한 판단 기준을 다음 섹션의 decision point로 자연스럽게 이어간다.`
        : '',
      '',
    ]),
    '## Closing checklist',
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
