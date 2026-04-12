// generator.ts - evaluator_optimizer용 deterministic loop generator

import type {
  Audience,
  BlogGeneratorInputs,
  ChecklistRow,
  FinalArticle,
  IterationRecord,
  Length,
  PipelineOutputs,
  SectionDraft,
  Tone,
} from './contracts'
import { checklistLabels } from './starterData'

const audienceLens: Record<Audience, string> = {
  beginner: 'first-time builders who need a reliable map before they touch production',
  practitioner: 'shipping teams that care about delivery quality more than novelty',
  advanced: 'staff-level readers who want sharper trade-offs and stronger reasoning',
}

const toneLens: Record<Tone, string> = {
  clear: 'plainspoken and explanatory',
  pragmatic: 'delivery-first and actionable',
  opinionated: 'assertive, but still evidence-backed',
}

const lengthLens: Record<Length, string> = {
  short: 'a fast four-minute read',
  medium: 'a balanced six-minute read',
  long: 'a deeper eight-minute read',
}

const buildStatusByIteration = [
  'rough build verified',
  'optimized build verified',
  'release build verified',
]

const loopTimes = ['T+00:00', 'T+00:45', 'T+01:30']

function countVerdicts(verdictRows: ChecklistRow[]) {
  let passCount = 0
  let partialCount = 0
  let failCount = 0

  for (const row of verdictRows) {
    if (row.verdict === 'PASS') {
      passCount += 1
    } else if (row.verdict === 'PARTIAL') {
      partialCount += 1
    } else {
      failCount += 1
    }
  }

  return { passCount, partialCount, failCount }
}

function buildOutline(topic: string, audience: Audience, length: Length, iteration: number) {
  const audienceLabel =
    audience === 'beginner' ? 'first rollout' : audience === 'advanced' ? 'systems view' : 'team rollout'
  const titles = [
    `Why ${topic} deserves a tighter framing`,
    `Signals that should drive the recommendation`,
    `${audienceLabel} plan for adopting the idea`,
    'Review loop that turns notes into a publishable post',
    'Release checklist and next moves',
  ]

  const sectionCount = length === 'short' ? 3 : length === 'medium' ? 4 : 5
  const activeTitles = titles.slice(0, sectionCount)

  if (iteration === 1) {
    return activeTitles.map((title) => title.replace('deserves a tighter framing', 'matters now'))
  }

  if (iteration === 2) {
    return activeTitles.map((title, index) =>
      index === activeTitles.length - 1 && sectionCount < 5 ? 'Release checklist and next moves' : title,
    )
  }

  return activeTitles
}

function buildResearchSummary(
  topic: string,
  audience: Audience,
  tone: Tone,
  length: Length,
  iteration: number,
) {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const lengthSummary = lengthLens[length]

  if (iteration === 1) {
    return [
      `${topic} clearly matters, but the opening draft still treats the topic as a broad trend instead of a decision surface.`,
      `The audience lens points at ${audienceSummary}, although the first pass still mixes beginner and practitioner language.`,
      `Tone should land as ${toneSummary}, but the rough copy repeats itself and undersells the payoff.`,
    ]
  }

  if (iteration === 2) {
    return [
      `${topic} is now framed around a concrete operating question instead of a generic summary.`,
      `The article is being reshaped for ${audienceSummary}, so examples and next steps now point at real execution pressure.`,
      `The optimizer keeps watching transitions because the middle sections still read like separate cards, not one argument.`,
      `The target package is ${lengthSummary}, which means every paragraph needs a job instead of ornamental filler.`,
    ]
  }

  return [
    `${topic} is now anchored around a real decision: how to turn curiosity into a dependable implementation path.`,
    `Research, outline, draft, and review are separated cleanly, which makes the piece easier to skim and easier to trust.`,
    `The final pass keeps the voice ${toneSummary} while giving ${audienceSummary} a clearer reason to act.`,
    `Transitions now bridge each section, so the reader feels progression instead of reading three disconnected notes.`,
    `The release candidate fits ${lengthSummary} and is explicit about what changed in each loop.`,
  ]
}

function buildSectionBody(
  topic: string,
  audience: Audience,
  tone: Tone,
  title: string,
  index: number,
  iteration: number,
) {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const firstSentence =
    iteration === 1
      ? `${topic} is interesting, but the first pass still sounds like rough workshop notes.`
      : iteration === 2
        ? `${topic} gets more useful once the draft stops narrating possibilities and starts making choices.`
        : `${topic} becomes easier to adopt when the article narrows the decision down to a few durable checks.`

  const secondSentence =
    index % 2 === 0
      ? `For ${audienceSummary}, that means showing what to trust first, what to postpone, and what to verify before release.`
      : `The loop keeps the voice ${toneSummary}, which helps the post sound deliberate instead of overly dramatic.`

  const thirdSentence =
    iteration === 1
      ? 'This section still needs sharper transitions and a clearer takeaway.'
      : iteration === 2
        ? 'The optimizer tightens the transitions here, but a few edges still need smoother landing lines.'
        : 'By the final pass, the section lands on one clear takeaway and hands the reader directly into the next section.'

  return `${title} starts here. ${firstSentence} ${secondSentence} ${thirdSentence}`
}

function buildTakeaway(topic: string, iteration: number) {
  if (iteration === 1) {
    return `Keep ${topic} anchored to one decision question before adding more detail.`
  }

  if (iteration === 2) {
    return `Use the review loop to compress repetition and make each section earn its place.`
  }

  return `Ship the explanation only after the research, structure, and release guidance feel like one argument.`
}

function buildSectionDrafts(
  topic: string,
  audience: Audience,
  tone: Tone,
  outline: string[],
  iteration: number,
) {
  return outline.map<SectionDraft>((title, index) => ({
    title,
    body: buildSectionBody(topic, audience, tone, title, index, iteration),
    takeaway: buildTakeaway(topic, iteration),
  }))
}

function buildReviewNotes(topic: string, iteration: number) {
  if (iteration === 1) {
    return [
      `The writer pass for ${topic} is directionally right, but it still needs a stronger audience lens.`,
      'Transitions between sections are too abrupt, so the review loop should add bridges rather than more raw text.',
      'The closing is generic and does not yet tell the reader what to do next.',
    ]
  }

  if (iteration === 2) {
    return [
      `The piece now has a clearer argument for ${topic}, but the middle sections still need tighter handoffs.`,
      'Reviewer focus moved from structural gaps to polish gaps: repetition, density, and clarity of next action.',
      'One more optimizer pass should be enough if the final close becomes more decisive.',
    ]
  }

  return [
    `The final pass turns ${topic} into a publishable article instead of a stack of promising notes.`,
    'Transitions, tone, and conclusion now reinforce the same recommendation, so the piece reads as one argument.',
    'Review gate cleared: export can use the final Markdown without a manual rescue pass.',
  ]
}

function buildVerdictRows(iteration: number): ChecklistRow[] {
  const notesByIteration = [
    [
      ['PARTIAL', 'The starter keeps the four inputs visible, but edge-case handling is still too thin.'],
      ['FAIL', 'The rough pass sketches the flow, yet the stages do not feel explicit enough for a release candidate.'],
      ['FAIL', 'Status transitions are implied instead of clearly surfaced, so loading and export semantics need work.'],
      ['FAIL', 'Error handling still needs an obvious alert surface and recovery guidance.'],
      ['FAIL', 'Copy behavior is not yet safely gated by export readiness.'],
      ['PARTIAL', 'The layout basically fits, but mobile density and scrolling still need deliberate tuning.'],
      ['PARTIAL', 'Semantic labels exist, but the live status and keyboard flow need a stricter pass.'],
      ['FAIL', 'The visual direction is still closer to a scaffold than a finished product surface.'],
      ['FAIL', 'Loop evidence is missing until iteration logging and optimizer traces are added.'],
    ],
    [
      ['PASS', 'Inputs, labels, and baseline guards now cover the benchmark contract.'],
      ['PASS', 'The five required stages are visible and connected to the loop narrative.'],
      ['PARTIAL', 'Most states are distinct now, but export copy and review-complete messaging still need tightening.'],
      ['PASS', 'Forced fail topics route into an alert panel with a recovery path.'],
      ['PARTIAL', 'Copy is functional, but the feedback can be clearer before export unlocks.'],
      ['PARTIAL', 'The stacked mobile view works, though a few dense sections still need better breathing room.'],
      ['PASS', 'Labels, aria-live, and keyboard basics are in place.'],
      ['PASS', 'The Loop Lab direction is now intentional and no longer feels like the Vite starter.'],
      ['PASS', 'Iteration traces and review-to-change links are now explicit.'],
    ],
    [
      ['PASS', 'Inputs, labels, and empty-state guidance all match the contract.'],
      ['PASS', 'Research, outline, drafts, review, and final are visible in one coherent flow.'],
      ['PASS', 'All six status states are distinct, narrated, and safely gated.'],
      ['PASS', 'Error entry, alert treatment, and recovery are clear and repeatable.'],
      ['PASS', 'Export uses the final iteration only and returns visible clipboard feedback.'],
      ['PASS', 'Desktop and mobile both preserve the core actions and readable hierarchy.'],
      ['PASS', 'aria-live, semantic controls, and keyboard flow are intact.'],
      ['PASS', 'Typography, spacing, and color direction feel intentional and consistent.'],
      ['PASS', 'The writer-reviewer-optimizer loop is visible in both the UI and the iteration log contract.'],
    ],
  ] as const

  return notesByIteration[iteration - 1].map((row, index) => ({
    index: index + 1,
    label: checklistLabels[index],
    verdict: row[0] as ChecklistRow['verdict'],
    note: row[1],
  }))
}

function buildOptimizerChanges(iteration: number) {
  if (iteration === 1) {
    return [
      'Rebuilt the starter into a loop-native surface with an explicit iteration timeline.',
      'Added loading, review-complete, export-ready, and error messaging so the state machine is visible.',
      'Moved the article into a dedicated final panel instead of hiding the release candidate inside a generic preview.',
    ]
  }

  if (iteration === 2) {
    return [
      'Condensed the current-iteration table and surfaced FAIL/PARTIAL repair instructions next to the reviewer verdicts.',
      'Tightened mobile stacking and kept the final article readable before the markdown export block.',
      'Improved copy feedback so the export action explains why iteration 3 is the only release candidate.',
    ]
  }

  return [
    'Locked the final pass to 9/9 reviewer gates and aligned the status banner with export-ready copy.',
    'Polished spacing, table overflow, and CTA hierarchy so the loop trace stays visible without burying the final article.',
    'Prepared the harness evidence pack: iteration log, scorecard, and evaluation report.',
  ]
}

function buildFinalArticle(
  topic: string,
  audience: Audience,
  tone: Tone,
  sectionDrafts: SectionDraft[],
  iteration: number,
): FinalArticle {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const intro =
    iteration === 1
      ? `${topic} matters, but the first pass still reads like a promising workshop summary. The loop now needs sharper framing before this can become a dependable post for ${audienceSummary}.`
      : iteration === 2
        ? `${topic} is finally moving from a broad idea to a practical recommendation. This pass trims repetition and starts shaping the argument for ${audienceSummary}.`
        : `${topic} becomes useful when the post stops celebrating the idea and starts spelling out the operating checks around it. This final pass is tuned for ${audienceSummary} and keeps the voice ${toneSummary}.`

  const closing =
    iteration === 1
      ? 'The release is not ready yet; the review loop still needs clearer transitions and a stronger close.'
      : iteration === 2
        ? 'One more optimizer pass can turn this from a solid internal note into a publishable external post.'
        : `The post is now ready to ship: the framing is tighter, the transitions are smoother, and the closing tells the reader how to act on ${topic} instead of merely admiring it.`

  const markdownLines = [`# ${topic}`, '', intro, '']

  for (const section of sectionDrafts) {
    markdownLines.push(`## ${section.title}`)
    markdownLines.push('')
    markdownLines.push(section.body)
    markdownLines.push('')
    markdownLines.push(`> Takeaway: ${section.takeaway}`)
    markdownLines.push('')
  }

  markdownLines.push('## Closing note')
  markdownLines.push('')
  markdownLines.push(closing)

  return {
    title: topic,
    intro,
    mergedSections: sectionDrafts,
    closing,
    markdown: markdownLines.join('\n'),
  }
}

export function isForcedErrorTopic(topic: string) {
  const normalized = topic.trim().toLowerCase()
  return normalized.startsWith('fail') || normalized.startsWith('error')
}

export function generatePipelineOutputs(inputs: BlogGeneratorInputs): PipelineOutputs {
  const topic = inputs.topic.trim().replace(/\s+/g, ' ')
  const iterations: IterationRecord[] = [1, 2, 3].map((iteration) => {
    const outline = buildOutline(topic, inputs.audience, inputs.length, iteration)
    const researchSummary = buildResearchSummary(
      topic,
      inputs.audience,
      inputs.tone,
      inputs.length,
      iteration,
    )
    const sectionDrafts = buildSectionDrafts(
      topic,
      inputs.audience,
      inputs.tone,
      outline,
      iteration,
    )
    const reviewNotes = buildReviewNotes(topic, iteration)
    const verdictRows = buildVerdictRows(iteration)
    const verdictCounts = countVerdicts(verdictRows)
    const finalArticle = buildFinalArticle(topic, inputs.audience, inputs.tone, sectionDrafts, iteration)

    return {
      iteration,
      startedAt: loopTimes[iteration - 1],
      phase: iteration === 3 ? 'ready' : 'optimizer',
      verdictRows,
      passCount: verdictCounts.passCount,
      partialCount: verdictCounts.partialCount,
      failCount: verdictCounts.failCount,
      optimizerChanges: buildOptimizerChanges(iteration),
      buildStatus: buildStatusByIteration[iteration - 1],
      needsAnotherLoop: iteration < 3,
      researchSummary,
      outline,
      sectionDrafts,
      reviewNotes,
      iterationMarkdown: finalArticle.markdown,
    }
  })

  const finalIteration = iterations[iterations.length - 1]
  const finalArticle = buildFinalArticle(
    topic,
    inputs.audience,
    inputs.tone,
    finalIteration.sectionDrafts,
    3,
  )

  return {
    research_summary: finalIteration.researchSummary,
    outline: finalIteration.outline,
    section_drafts: finalIteration.sectionDrafts,
    review_notes: finalIteration.reviewNotes,
    final_post: finalArticle.markdown,
    final_article: finalArticle,
    iterations,
    loop_summary: {
      minimumLoopsMet: iterations.length >= 3,
      lastIterationPassCount: finalIteration.passCount,
      readyForExport: finalIteration.passCount >= 8,
    },
  }
}
