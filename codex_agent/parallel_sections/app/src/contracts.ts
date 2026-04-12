// contracts.ts - parallel_sections newsroom board의 타입 계약

export type Audience = 'beginner' | 'practitioner' | 'advanced'
export type Tone = 'clear' | 'pragmatic' | 'opinionated'
export type Length = 'short' | 'medium' | 'long'

export type WriterLaneId = 'writer_a' | 'writer_b' | 'writer_c'
export type PipelineUnit = 'coordinator' | WriterLaneId | 'merge_reviewer'
export type GenerationStageId = 'research' | 'outline' | 'drafts' | 'review' | 'final'
export type GenerationStatus =
  | 'initial'
  | 'loading'
  | 'populated'
  | 'review-complete'
  | 'export-ready'
  | 'error'
export type UnitStatus = 'pending' | 'loading' | 'complete' | 'error'

export interface BlogGeneratorInputs {
  topic: string
  audience: Audience
  tone: Tone
  length: Length
}

export interface WorkflowStage {
  id: GenerationStageId
  label: string
  description: string
}

export interface DeliverableCard {
  id: string
  title: string
  description: string
}

export interface TopicPreset {
  title: string
  audience: Audience
  tone: Tone
  length: Length
  rationale: string
}

export interface WriterLaneMeta {
  id: WriterLaneId
  label: string
  focus: string
  mergeDuty: string
}

export interface OutlineSection {
  id: string
  title: string
  goal: string
  writerHint: string
}

export interface MergeCriterion {
  label: string
  detail: string
}

export interface CoordinatorBrief {
  title: string
  angle: string
  thesis: string
  audienceLens: string
  commonFrame: string
  sectionMap: OutlineSection[]
  mergeCriteria: MergeCriterion[]
}

export interface SectionAssignment {
  writerId: WriterLaneId
  sectionIds: string[]
  ownershipRule: string
  laneSummary: string
}

export interface LaneDraftPreview {
  id: string
  title: string
  deck: string
  bullets: string[]
  takeaway: string
}

export interface LanePacket {
  writerId: WriterLaneId
  ownedSections: OutlineSection[]
  ownershipRule: string
  statusSummary: string
  draftPreview: LaneDraftPreview[]
  handoffNote: string
}

export interface MergeFix {
  label: string
  before: string
  after: string
  rationale: string
}

export interface MergeReport {
  reviewNotes: string[]
  dedupeFix: MergeFix
  transitionFix: MergeFix
  toneFix: MergeFix
  finalizationNote: string
}

export interface ArticleSection {
  id: string
  title: string
  deck: string
  paragraphs: string[]
  takeaway: string
}

export interface FinalArticle {
  title: string
  intro: string
  mergedSections: ArticleSection[]
  closing: string
  markdown: string
}

export interface PipelineOutputs {
  research_summary: CoordinatorBrief
  outline: OutlineSection[]
  section_drafts: LanePacket[]
  review_notes: MergeReport
  final_post: string
  assignments: SectionAssignment[]
  final_article: FinalArticle
}

export interface GenerationState {
  status: GenerationStatus
  currentStage: GenerationStageId | null
  completedStages: GenerationStageId[]
  unitStatuses: Record<PipelineUnit, UnitStatus>
  outputs: Partial<PipelineOutputs>
  statusMessage: string
  errorMessage: string | null
}

export interface RunManifest {
  harness: string
  run_id: string
  started_at: string
  finished_at: string
  task_spec_version: string
  status: 'completed' | 'failed' | 'partial'
}

export interface ArtifactIndex {
  screenshots: string[]
  final_urls: string[]
  notes: string[]
  deliverables: string[]
}

export interface Scorecard {
  task_success: number
  ux_score: number
  flow_clarity: number
  visual_quality: number
  responsiveness: number
  a11y_score: number
  process_adherence: number
  overall_score: number
}
