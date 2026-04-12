// contracts.ts - sequential_pipeline 워크스페이스의 타입 계약

export type Audience = 'beginner' | 'practitioner' | 'advanced'
export type Tone = 'clear' | 'pragmatic' | 'opinionated'
export type Length = 'short' | 'medium' | 'long'

export type PipelineRole = 'researcher' | 'outliner' | 'writer' | 'reviewer'
export type GenerationStageId = 'research' | 'outline' | 'drafts' | 'review' | 'final'
export type GenerationStatus =
  | 'initial'
  | 'loading'
  | 'populated'
  | 'review-complete'
  | 'export-ready'
  | 'error'

export type HandoffStatus = 'delivered'

export interface BlogGeneratorInputs {
  topic: string
  audience: Audience
  tone: Tone
  length: Length
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

export interface PipelineRoleCard {
  id: PipelineRole
  label: string
  stageLabel: string
  description: string
  handoffLabel: string
}

export interface PipelineHandoff {
  from: PipelineRole
  to: PipelineRole
  inputSummary: string
  outputSummary: string
  status: HandoffStatus
}

export interface ResearchOutput {
  angle: string
  thesis: string
  keyFindings: string[]
  supportingFacts: string[]
  searchTerms: string[]
  handoffNote: string
}

export interface OutlineSection {
  id: string
  title: string
  goal: string
}

export interface OutlineOutput {
  sections: OutlineSection[]
  structureRationale: string
  handoffNote: string
}

export interface SectionDraft {
  id: string
  title: string
  summary: string
  paragraphs: string[]
  takeaway: string
}

export interface WriterOutput {
  sectionDrafts: SectionDraft[]
  writerSummary: string
  preReviewMarkdown: string
  handoffNote: string
}

export interface ReviewNote {
  label: string
  detail: string
  severity: 'good' | 'watch' | 'improve'
}

export interface AppliedEdit {
  label: string
  before: string
  after: string
}

export interface ReviewerOutput {
  reviewNotes: ReviewNote[]
  appliedEdits: AppliedEdit[]
  finalMarkdown: string
  finalizationNote: string
}

export interface PipelineOutputs {
  research_summary: ResearchOutput
  outline: OutlineOutput
  section_drafts: WriterOutput
  review_notes: ReviewerOutput
  final_post: string
  handoffs: PipelineHandoff[]
}

export interface GenerationState {
  status: GenerationStatus
  currentRole: PipelineRole | null
  currentStage: GenerationStageId | null
  completedRoles: PipelineRole[]
  completedStages: GenerationStageId[]
  outputs: Partial<PipelineOutputs>
  statusMessage: string
  errorMessage: string | null
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
