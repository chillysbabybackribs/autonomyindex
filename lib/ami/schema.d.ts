// ─────────────────────────────────────────────────────────────────────────────
// AMI v1.0 TypeScript Definitions — aligned with docs/ami-v1-spec.md
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums / Literals ─────────────────────────────────────────────────────────

export type AmiDimensionId =
  | 'execution_reliability'
  | 'tooling_integration'
  | 'safety_guardrails'
  | 'observability'
  | 'deployment_maturity'
  | 'real_world_validation';

export type ConfidenceLevel = 'verified' | 'inferred' | 'unverified';

export type OverallConfidence = 'high' | 'medium' | 'low';

export type AmiGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type SystemStatus =
  | 'scored'
  | 'insufficient_evidence'
  | 'inactive'
  | 'excluded'
  | 'under_review';

export type SystemCategory =
  | 'cloud_autonomous'
  | 'cloud_workflow'
  | 'local_autonomous'
  | 'enterprise'
  | 'vertical_agent';

export type EvidenceType =
  | 'official_docs'
  | 'source_code'
  | 'security_audit'
  | 'incident_report'
  | 'changelog'
  | 'independent_analysis'
  | 'case_study'
  | 'compliance'
  | 'community_metrics'
  | 'news_report';

export type SourceTier = 'T1' | 'T2' | 'T3';

export type SourceType =
  | 'url' | 'doc' | 'commit' | 'issue' | 'log' | 'metric'
  | 'screenshot' | 'video' | 'dataset' | 'other';

export type SourceReliability = 'primary' | 'secondary' | 'self_reported';

export type SourceAccess = 'public' | 'private';

export type ReviewState = 'draft' | 'reviewed' | 'published';

export interface SourceEntry {
  source_id: string;
  title: string;
  url: string;
  type: SourceType;
  publisher?: string;
  published_date: string;
  captured_at?: string;
  hash?: string;
  access: SourceAccess;
  reliability?: SourceReliability;
  tier: SourceTier;
}

export interface ReviewBlock {
  state: ReviewState;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface IntegrityBlock {
  assessment_hash: string;
  hash_algorithm: 'sha256';
  hashed_at: string;
}

// ── Evidence ─────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  /** Unique evidence ID, e.g., "EV_20260217_001" */
  id: string;
  /** @deprecated Use source_ids instead */
  source_id?: string;
  /** FK(s) to source-catalog.json source_ids */
  source_ids: string[];
  /** Direct URL to the evidence */
  url: string;
  /** Source document title */
  title: string;
  /** Organization or author that published the source */
  publisher: string;
  /** ISO date of source publication (YYYY-MM-DD) */
  published_date: string;
  /** <=25 word excerpt summarizing the relevant claim */
  excerpt: string;
  /** What specific claim this evidence supports */
  claim_supported: string;
  /** Evidence type classification */
  evidence_type: EvidenceType;
  /** How this evidence contributes to confidence level */
  confidence_contribution: ConfidenceLevel;
  /** 0.0-1.0 how central this evidence is to the dimension score */
  relevance_weight: number;
  /** ISO timestamp when evidence was captured/recorded */
  captured_at: string;
  /** Optional archived URL (archive.org, perma.cc) */
  archived_url?: string;
}

// ── Dimension Scores ─────────────────────────────────────────────────────────

export interface AmiDimensionScore {
  /** Dimension identifier */
  dimension_id: AmiDimensionId;
  /** Human-readable dimension name */
  dimension_name: string;
  /** Raw score 0-5 (null if not scored) */
  score: number | null;
  /** Confidence level for this dimension */
  confidence: ConfidenceLevel;
  /** Weight used in this assessment (0.0-1.0) */
  weight: number;
  /** Short editorial note explaining the score */
  rationale: string;
  /** Evidence items supporting this score */
  evidence: EvidenceItem[];
  /** Whether this dimension was scored or skipped */
  scored: boolean;
  /** If not scored, reason why */
  not_scored_reason?: string;
}

// ── Eligibility ──────────────────────────────────────────────────────────────

export interface EligibilityFlags {
  /** Is this an agent system (not a raw LLM)? */
  agent_system: boolean;
  /** Does a public artifact exist? */
  public_artifact: boolean;
  /** Has the system been updated within 180 days? */
  active_development: boolean;
  /** Is there an identifiable maintainer? */
  maintainer_identifiable: boolean;
  /** Count of distinct verified sources */
  verified_sources_count: number;
  /** Exclusion flags (any true = excluded) */
  exclusion_flags: {
    base_llm_only: boolean;
    prompt_library_only: boolean;
    research_prototype_only: boolean;
    wrapper_only: boolean;
  };
  /** Optional notes on eligibility determination */
  notes?: string;
}

// ── Assessment ───────────────────────────────────────────────────────────────

export interface AmiAssessment {
  /** Unique assessment ID, e.g., "AMI_ASSESS_20260217_openclaw_v2" */
  assessment_id: string;
  /** FK to system identifier */
  system_id: string;
  /** Assessment version (increments per reassessment of same system) */
  version: number;
  /** ISO timestamp of assessment completion */
  assessed_at: string;
  /** Product/system version being assessed, if known */
  system_version?: string;
  /** ID of previous assessment for this system (for diff) */
  previous_assessment_id?: string;

  /** Overall AMI score (0-100, null if not scored) */
  overall_score: number | null;
  /** Letter grade */
  grade: AmiGrade | null;
  /** Overall confidence */
  overall_confidence: OverallConfidence;
  /** Assessment status */
  status: SystemStatus;
  /** System category */
  category: SystemCategory;

  /** Eligibility determination */
  eligibility: EligibilityFlags;

  /** Per-dimension breakdown */
  dimensions: AmiDimensionScore[];

  /** Methodology version used */
  methodology_version: string;
  /** Assessor identifier (human or "automated-pipeline") */
  assessed_by: string;
  /** Optional editorial notes */
  notes?: string;
  /** Review/publish lifecycle state */
  review?: ReviewBlock;
  /** Integrity hash for tamper detection */
  integrity?: IntegrityBlock;
}

// ── Aggregation Result ───────────────────────────────────────────────────────

export interface AggregationResult {
  scored_count: number;
  not_scored_count: number;
  renormalized_weights: Record<string, number>;
  raw_weighted_sum: number;
  max_possible_weighted: number;
  score_percent: number | null;
  grade: AmiGrade | null;
}

// ── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── API Response Types ───────────────────────────────────────────────────────

export interface AmiIndexEntry {
  system_id: string;
  assessment_id: string;
  overall_score: number | null;
  grade: AmiGrade | null;
  overall_confidence: OverallConfidence;
  status: SystemStatus;
  category: SystemCategory;
  assessed_at: string;
  methodology_version: string;
}

export interface AmiIndexResponse {
  meta: {
    version: string;
    last_updated: string;
    total_systems: number;
    methodology_url: string;
  };
  systems: AmiIndexEntry[];
}

export interface AmiDiffResponse {
  system_id: string;
  current: AmiAssessment;
  previous: AmiAssessment | null;
  changes: {
    overall_score_delta: number | null;
    grade_changed: boolean;
    confidence_changed: boolean;
    dimension_changes: Array<{
      dimension_id: AmiDimensionId;
      old_score: number | null;
      new_score: number | null;
      delta: number | null;
      confidence_changed: boolean;
    }>;
  };
}

// ── Exported Constants ───────────────────────────────────────────────────────

export const DIMENSION_IDS: readonly AmiDimensionId[];
export const DIMENSION_DISPLAY_NAMES: Record<AmiDimensionId, string>;
export const DIMENSION_WEIGHTS: Record<AmiDimensionId, number>;
export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[];
export const OVERALL_CONFIDENCE_LEVELS: readonly OverallConfidence[];
export const AMI_GRADES: readonly AmiGrade[];
export const SYSTEM_STATUSES: readonly SystemStatus[];
export const SYSTEM_CATEGORIES: readonly SystemCategory[];
export const EVIDENCE_TYPES: readonly EvidenceType[];
export const SOURCE_TIERS: readonly SourceTier[];
export const SOURCE_TYPES: readonly SourceType[];
export const SOURCE_RELIABILITY: readonly SourceReliability[];
export const REVIEW_STATES: readonly ReviewState[];

// ── Exported Functions ───────────────────────────────────────────────────────

export function scoreToGrade(score: number | null): AmiGrade | null;
export function computeOverallConfidence(dimensions: AmiDimensionScore[]): OverallConfidence;
export function computeAggregation(dimensions: AmiDimensionScore[]): AggregationResult;
export function validateAssessment(
  assessment: AmiAssessment,
  options?: { sourceCatalog?: Map<string, SourceEntry> }
): ValidationResult;
export function validateEvidenceItem(ev: EvidenceItem, idx: number): string[];
export function validateDimensionScore(dim: AmiDimensionScore, evidenceMap: Map<string, EvidenceItem>): string[];
export function validateEligibility(elig: EligibilityFlags, status: SystemStatus): string[];
export function resolveSourceIds(ev: EvidenceItem): string[];
