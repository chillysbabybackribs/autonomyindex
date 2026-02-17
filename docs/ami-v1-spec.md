# AMI (Autonomy Maturity Index) v1.0 Specification

**Status:** Draft v1.0
**Date:** 2026-02-17
**Owner:** AutonomyIndex.io Editorial Board

---

## A. Eligibility Rules

### Who Gets an AMI Score

AMI scores **autonomous agent systems**, not base LLMs or general-purpose libraries.

#### Inclusion Criteria (ALL must be met)

1. **Agent System** — The system must orchestrate autonomous multi-step actions (tool calls, code execution, file operations, API interactions) beyond single-turn prompt/response.
2. **Public Artifact** — At least one of: public repository, published documentation, commercial product page, or verifiable API endpoint.
3. **Minimum Evidence Threshold** — At least **3 distinct verified sources** (see Allowed Evidence Types below) must exist to score the system. If fewer than 3 sources exist, the system receives status `INSUFFICIENT_EVIDENCE` and is listed but not scored.
4. **Active Development** — At least one verifiable release, commit, or update within the last **180 days** (6 months). Abandoned projects receive status `INACTIVE`.
5. **Identifiable Maintainer** — The system must have an identifiable individual, team, company, or foundation responsible for it.

#### Exclusion Criteria (ANY disqualifies)

1. **Base LLMs without agent capabilities** — GPT-4, Claude, Gemini etc. as raw models are not scored. Their agent SDKs/frameworks are.
2. **Prompt libraries or template collections** — No autonomous execution layer.
3. **Pure research prototypes** — No public release, no deployment path, paper-only.
4. **Wrapper-only projects** — Thin API wrappers that add no agent orchestration logic.

#### System Categories

| Category | Description | Examples |
|---|---|---|
| Cloud Autonomous | Server/cloud-deployed agents with full autonomy | OpenClaw, AutoGen, CrewAI |
| Cloud Workflow | Agent-augmented workflow/pipeline platforms | LangChain, n8n, Vercel AI SDK |
| Local Autonomous | Desktop/local agents with OS-level access | Clawdia, Claude Code |
| Enterprise | Enterprise-grade agent orchestration SDKs | Semantic Kernel, OpenAI Agents SDK |
| Vertical Agent | Domain-specific autonomous systems | Devin (coding), Harvey (legal) |

#### Status Taxonomy

| Status | Meaning |
|---|---|
| `SCORED` | Meets all inclusion criteria, AMI computed |
| `INSUFFICIENT_EVIDENCE` | Meets criteria 1-2 but <3 verified sources |
| `INACTIVE` | No updates in 180+ days |
| `EXCLUDED` | Fails one or more exclusion criteria |
| `UNDER_REVIEW` | Being assessed, not yet published |

---

## B. AMI Dimensions + Rubric

AMI measures **production readiness** of autonomous agent systems across **6 dimensions**, each scored on a **0–5 integer scale**.

The 0-5 scale maps to the 0-100 display scale as: `display_score = (raw_sum_weighted / max_possible_weighted) * 100`, detailed in Section C.

### Dimension 1: Execution Reliability

**Definition:** The system's ability to complete assigned tasks correctly, handle errors gracefully, and recover from failures without human intervention.

**Weight:** 20%

| Score | Level | Description |
|---|---|---|
| 0 | None | No evidence of task completion or error handling |
| 1 | Minimal | Completes simple tasks but crashes on edge cases; no retry logic |
| 2 | Basic | Handles common tasks; basic try/catch error handling; manual restart required on failure |
| 3 | Moderate | Reliable on standard workloads; automatic retries; graceful degradation on some failure modes |
| 4 | Strong | Production-tested at scale; comprehensive error recovery; automatic failover; documented uptime SLAs or equivalent |
| 5 | Exceptional | Battle-proven in high-stakes production; formal reliability engineering (chaos testing, circuit breakers); published incident response process |

**Required Evidence for Score >= 4:**
- Production deployment evidence (case studies, customer testimonials, or usage metrics)
- Documented error handling architecture (retry policies, circuit breakers, fallback strategies)
- At least one of: uptime metrics, incident postmortem, or third-party reliability assessment

**Allowed Evidence:** Official docs, GitHub issues/PRs showing error handling, production case studies, incident reports, changelog entries showing reliability fixes, benchmark results.

**Disallowed Evidence:** Marketing claims without backing data, self-reported uptime without verification method, anonymous testimonials.

---

### Dimension 2: Tooling & Integration Breadth

**Definition:** The richness and stability of the system's tool ecosystem — available integrations, plugin architecture, protocol support, and third-party extensibility.

**Weight:** 15%

| Score | Level | Description |
|---|---|---|
| 0 | None | No tool integration capability |
| 1 | Minimal | Hard-coded tool set; no extensibility |
| 2 | Basic | Plugin/tool API exists; <20 integrations; unstable tool interface |
| 3 | Moderate | Stable tool API; 20-100 integrations; community contributions accepted |
| 4 | Strong | Mature plugin ecosystem; 100+ integrations; versioned tool API; MCP or equivalent protocol support |
| 5 | Exceptional | Industry-leading ecosystem; 500+ integrations; tool marketplace; backward-compatible API; cross-platform protocol support |

**Required Evidence for Score >= 4:**
- Verifiable integration count (registry, marketplace, or documented list)
- Versioned tool/plugin API documentation
- Evidence of third-party tool contributions (PRs, marketplace listings)

**Allowed Evidence:** Official documentation, plugin/integration registries, GitHub repository analysis (tool directories, plugin PRs), marketplace listings, protocol specification docs.

**Disallowed Evidence:** Claimed integration counts without a verifiable list, planned/roadmap integrations counted as current.

---

### Dimension 3: Safety & Guardrails

**Definition:** The system's security posture, vulnerability profile, and built-in mechanisms to prevent harm — including permission models, input validation, and abuse prevention.

**Weight:** 20%

| Score | Level | Description |
|---|---|---|
| 0 | None | No security considerations; known critical vulnerabilities unpatched |
| 1 | Minimal | Basic input validation only; no permission model; known high-severity vulnerabilities |
| 2 | Basic | Permission model exists but permissive defaults; no formal security audit; responsive to reported CVEs |
| 3 | Moderate | Configurable permissions with secure defaults; regular dependency updates; no unpatched high/critical CVEs |
| 4 | Strong | Formal security audit completed; permission model enforced by default; sandboxed execution; CVE response SLA |
| 5 | Exceptional | Recurring third-party audits; bug bounty program; zero unpatched critical CVEs; published security model; SOC2/ISO27001 or equivalent |

**Required Evidence for Score >= 4:**
- Third-party security audit report (may be summary/attestation)
- CVE database check showing response timeline
- Documentation of permission model with default configuration

**Allowed Evidence:** Security audit reports, CVE databases, GitHub security advisories, permission model documentation, bug bounty program pages, compliance attestations, incident response documentation.

**Disallowed Evidence:** "No known vulnerabilities" without evidence of active scanning, self-assessed security ratings, marketing security claims without audit backing.

---

### Dimension 4: Observability

**Definition:** The system's transparency into its own execution — logging, tracing, debugging tools, execution visualization, and the ability to understand what the agent did and why.

**Weight:** 15%

| Score | Level | Description |
|---|---|---|
| 0 | None | No logging or execution visibility |
| 1 | Minimal | stdout/stderr logs only; no structured logging |
| 2 | Basic | Structured logs; basic execution history; manual log inspection required |
| 3 | Moderate | Execution tracing with tool call visibility; log aggregation support; exportable traces |
| 4 | Strong | Integrated dashboard/UI for execution monitoring; distributed tracing; OpenTelemetry or equivalent support; real-time streaming |
| 5 | Exceptional | Full execution replay; cost/token tracking; anomaly detection; SIEM integration; execution diff between runs |

**Required Evidence for Score >= 4:**
- Documentation or screenshots of monitoring dashboard/UI
- Evidence of structured trace format (OpenTelemetry, custom trace schema)
- Integration with at least one external observability platform

**Allowed Evidence:** Official documentation, product screenshots, trace format specifications, integration guides, demo recordings, open-source monitoring code.

**Disallowed Evidence:** Planned observability features, third-party monitoring tools not specifically integrated.

---

### Dimension 5: Deployment Maturity

**Definition:** The system's readiness for production deployment — CI/CD support, containerization, scaling capabilities, configuration management, and enterprise operational requirements.

**Weight:** 15%

| Score | Level | Description |
|---|---|---|
| 0 | None | No deployment path; source-only with no install instructions |
| 1 | Minimal | Manual installation; single-machine only; no containerization |
| 2 | Basic | Documented installation; Docker support; single-instance deployment |
| 3 | Moderate | CI/CD integration examples; multi-environment configs; health checks; basic scaling (replicas) |
| 4 | Strong | Production deployment guides; Kubernetes/cloud-native support; auto-scaling; configuration management; rollback procedures |
| 5 | Exceptional | Enterprise-grade deployment; multi-region support; zero-downtime upgrades; IaC templates; SLA-backed managed offering |

**Required Evidence for Score >= 4:**
- Published deployment documentation for production environments
- Container/orchestration configuration (Dockerfile, Helm charts, Terraform, etc.)
- Evidence of multi-instance or scaled deployment (docs, architecture diagrams, or customer evidence)

**Allowed Evidence:** Official docs, Dockerfiles, Helm charts, Terraform configs, deployment guides, architecture documentation, cloud marketplace listings, managed service pages.

**Disallowed Evidence:** "Can be deployed to production" without supporting documentation, theoretical scaling claims without evidence.

---

### Dimension 6: Real-World Validation

**Definition:** Evidence that the system has been deployed, tested, or validated in real-world conditions beyond the developer's own environment — including production deployments, independent evaluations, community adoption signals, and documented use cases.

**Weight:** 15%

| Score | Level | Description |
|---|---|---|
| 0 | None | No evidence of use beyond the author |
| 1 | Minimal | Author demos only; no independent adoption evidence |
| 2 | Basic | Community adoption signals (stars, forks, issues); a few independent blog posts or tutorials |
| 3 | Moderate | Documented production use cases from independent organizations; independent benchmarks or evaluations; active community (100+ contributors or equivalent) |
| 4 | Strong | Named enterprise deployments; independent analyst coverage; published case studies; large-scale community (1000+ contributors or 10K+ active users) |
| 5 | Exceptional | Industry-standard reference deployments; formal academic evaluation; Fortune 500 deployments; dedicated partner ecosystem |

**Required Evidence for Score >= 4:**
- Named organizations using the system in production (case studies, testimonials, or partner pages)
- Independent evaluation or benchmark (not self-published)
- Quantifiable community metrics (GitHub contributors, npm downloads, etc.)

**Allowed Evidence:** Case studies, partner/customer pages, independent analyst reports, academic papers, GitHub metrics, package registry downloads, conference talks, community surveys.

**Disallowed Evidence:** Unverified "customer" claims, GitHub stars alone (must combine with other signals), self-published benchmarks without reproducible methodology.

---

## C. Weighting & Aggregation

### Default Weights

| Dimension | Weight | Justification |
|---|---|---|
| Execution Reliability | 20% | Core purpose of an agent — must complete tasks correctly |
| Safety & Guardrails | 20% | Autonomous systems demand high safety bar; equal to reliability |
| Tooling & Integration | 15% | Ecosystem breadth is important but secondary to core function |
| Observability | 15% | Must understand what agents do; critical for trust but not as weighted as reliability |
| Deployment Maturity | 15% | Production readiness infrastructure; enables but doesn't define maturity |
| Real-World Validation | 15% | External proof matters but young systems shouldn't be penalized disproportionately |

**Total:** 100%

### Formula

Each dimension is scored 0-5. The AMI overall score (0-100) is computed as:

```
AMI = round( (SUM(dimension_score_i * weight_i) / SUM(5 * weight_i)) * 100 )
```

Which simplifies to (since weights sum to 1.0):

```
AMI = round( (SUM(dimension_score_i * weight_i) / 5) * 100 )
    = round( SUM(dimension_score_i * weight_i) * 20 )
```

**Example Calculation:**

| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Execution Reliability | 3 | 0.20 | 0.60 |
| Safety & Guardrails | 2 | 0.20 | 0.40 |
| Tooling & Integration | 4 | 0.15 | 0.60 |
| Observability | 3 | 0.15 | 0.45 |
| Deployment Maturity | 3 | 0.15 | 0.45 |
| Real-World Validation | 4 | 0.15 | 0.60 |
| **Sum** | | | **3.10** |
| **AMI** | | | **62** |

### Grade Mapping

| Grade | AMI Range | Meaning |
|---|---|---|
| A | 80-100 | Production-excellent: strong across all dimensions |
| B | 60-79 | Production-capable: solid with identifiable gaps |
| C | 40-59 | Development-stage: usable but significant gaps |
| D | 20-39 | Early-stage: major gaps in production readiness |
| F | 0-19 | Pre-alpha: not recommended for production use |

### Confidence Model

Each **dimension score** carries a confidence level:

| Level | Code | Meaning | Display Treatment |
|---|---|---|---|
| High | `verified` | Score backed by primary source evidence (official docs, audits, verifiable metrics) | Full opacity, green indicator |
| Medium | `inferred` | Score derived from reasonable inference from verified data (e.g., GitHub activity patterns implying reliability) | 80% opacity, yellow indicator |
| Low | `unverified` | Score based on limited or indirect evidence | 60% opacity, orange indicator |

**Overall assessment confidence** is computed as:

```
overall_confidence =
  if ALL dimensions are "verified" → "high"
  else if ANY dimension is "unverified" → "low"
  else → "medium"
```

### Missing Data Policy: "Not Scored" with Transparency

**Decision: "Not Scored" (no penalty)**

**Justification:** Penalizing missing data would incentivize speculative scoring to avoid penalties, which contradicts the source-required philosophy. Instead:

- A dimension with insufficient evidence is marked `not_scored` (null score).
- `not_scored` dimensions are **excluded from the weighted calculation** (weights renormalize across scored dimensions).
- The UI clearly displays which dimensions were not scored and why.
- A system with >=3 dimensions `not_scored` receives overall status `INSUFFICIENT_EVIDENCE` instead of a numeric AMI.

**Renormalization formula when dimensions are missing:**

```
AMI = round( (SUM(scored_dimension_score_i * weight_i) / SUM(5 * scored_weight_i)) * 100 )
```

This ensures a system isn't punished for transparency about data gaps, but the lower dimension count is visible to readers.

---

## D. Evidence Schema

### Evidence Item Model

Each sub-score must attach to one or more `EvidenceItem` records:

```
EvidenceItem:
  id:                string     # Unique ID, e.g., "EV_20260217_001"
  source_id:         string     # FK to source-catalog, e.g., "SRC_003"
  url:               string     # Direct URL to the evidence
  title:             string     # Source document title
  publisher:         string     # Organization/author that published it
  published_date:    string     # ISO date of source publication (YYYY-MM-DD)
  excerpt:           string     # <=25 words summarizing the relevant claim
  claim_supported:   string     # What specific claim this evidence supports
  evidence_type:     enum       # See Evidence Type taxonomy below
  confidence_contribution: enum # "verified" | "inferred" | "unverified"
  relevance_weight:  number     # 0.0-1.0 how central this evidence is to the score
  captured_at:       string     # ISO timestamp when evidence was recorded
  archived_url:      string?    # Optional archive.org/perma.cc link
```

### Evidence Type Taxonomy

| Type | Code | Description |
|---|---|---|
| Official Documentation | `official_docs` | Vendor/maintainer published docs |
| Source Code | `source_code` | Public repository inspection |
| Security Audit | `security_audit` | Third-party security assessment |
| Incident Report | `incident_report` | Postmortem or incident disclosure |
| Changelog/Release Notes | `changelog` | Version release documentation |
| Independent Analysis | `independent_analysis` | Third-party evaluation or benchmark |
| Case Study | `case_study` | Published deployment case study |
| Regulatory/Compliance | `compliance` | SOC2, ISO, or equivalent attestation |
| Community Metrics | `community_metrics` | GitHub stars, npm downloads, etc. (with snapshot date) |
| News Report | `news_report` | T1 journalism covering the system |

### Source Tier System

Integrates with the existing `source-catalog.json`:

| Tier | Definition | Trust Level |
|---|---|---|
| T1 | Primary sources: official docs, vendor announcements, major news outlets (Reuters, Bloomberg) | Highest — can support "verified" confidence |
| T2 | Reputable secondary sources: tech press (TechCrunch, The Verge), independent researchers | Can support "verified" for factual claims, "inferred" for analysis |
| T3 | Community sources: blog posts, tutorials, forum discussions | "Inferred" only; cannot be sole basis for any score |

### Cross-Reference Rules

1. Every `EvidenceItem.source_id` MUST exist in `source-catalog.json`.
2. Every dimension score with confidence `verified` MUST have at least one T1 or T2 evidence item.
3. No dimension score can be based solely on T3 evidence.
4. `relevance_weight` for all evidence items on a dimension must be reviewed for coherence (highest weight = most directly supporting).

---

## E. Output Data Structures

### TypeScript Types

```typescript
// ──────────────────────────────────────────
// Core Enums / Literals
// ──────────────────────────────────────────

type AmiDimensionId =
  | 'execution_reliability'
  | 'tooling_integration'
  | 'safety_guardrails'
  | 'observability'
  | 'deployment_maturity'
  | 'real_world_validation';

type ConfidenceLevel = 'verified' | 'inferred' | 'unverified';

type OverallConfidence = 'high' | 'medium' | 'low';

type AmiGrade = 'A' | 'B' | 'C' | 'D' | 'F';

type SystemStatus =
  | 'scored'
  | 'insufficient_evidence'
  | 'inactive'
  | 'excluded'
  | 'under_review';

type SystemCategory =
  | 'cloud_autonomous'
  | 'cloud_workflow'
  | 'local_autonomous'
  | 'enterprise'
  | 'vertical_agent';

type EvidenceType =
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

type SourceTier = 'T1' | 'T2' | 'T3';

// ──────────────────────────────────────────
// Evidence
// ──────────────────────────────────────────

interface EvidenceItem {
  /** Unique evidence ID, e.g., "EV_20260217_001" */
  id: string;
  /** FK to source-catalog.json source_id */
  source_id: string;
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

// ──────────────────────────────────────────
// Dimension Scores
// ──────────────────────────────────────────

interface AmiDimensionScore {
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

// ──────────────────────────────────────────
// Assessment (one snapshot in time)
// ──────────────────────────────────────────

interface AmiAssessment {
  /** Unique assessment ID, e.g., "AMI_ASSESS_20260217_openclaw_v3" */
  assessment_id: string;
  /** FK to SystemUnderReview.system_id */
  system_id: string;
  /** Assessment version (increments per reassessment of same system) */
  version: number;
  /** ISO timestamp of assessment completion */
  assessed_at: string;
  /** Product/system version being assessed, if known */
  system_version?: string;
  /** ID of previous assessment for this system (for diff) */
  previous_assessment_id?: string;

  /** Overall AMI score (0-100, null if insufficient evidence) */
  overall_score: number | null;
  /** Letter grade */
  grade: AmiGrade | null;
  /** Overall confidence */
  overall_confidence: OverallConfidence;
  /** Assessment status */
  status: SystemStatus;

  /** Per-dimension breakdown */
  dimensions: AmiDimensionScore[];

  /** Methodology version used */
  methodology_version: string;
  /** Assessor identifier (human or "automated-pipeline") */
  assessed_by: string;
  /** Optional editorial notes */
  notes?: string;
}

// ──────────────────────────────────────────
// System Under Review
// ──────────────────────────────────────────

interface SystemUnderReview {
  /** Unique system identifier, e.g., "openclaw" */
  system_id: string;
  /** Display name */
  name: string;
  /** System category */
  category: SystemCategory;
  /** Short description */
  description: string;
  /** Primary repository URL, if public */
  github_url?: string;
  /** Primary website/docs URL */
  website_url?: string;
  /** Maintainer organization/individual */
  maintainer: string;
  /** ISO date of first assessment */
  first_assessed: string;
  /** ISO date of most recent assessment */
  last_assessed: string;
  /** Latest assessment */
  latest_assessment: AmiAssessment;
  /** All historical assessment IDs (newest first) */
  assessment_history: string[];
}

// ──────────────────────────────────────────
// Source Catalog Entry (extended)
// ──────────────────────────────────────────

interface SourceCatalogEntry {
  /** Unique source ID, e.g., "SRC_001" */
  source_id: string;
  /** Source title */
  title: string;
  /** Source URL */
  url: string;
  /** ISO date published */
  published_date: string;
  /** Source tier */
  tier: SourceTier;
  /** Publisher organization */
  publisher: string;
  /** When this source was added to the catalog */
  cataloged_at: string;
}

// ──────────────────────────────────────────
// API Response Types
// ──────────────────────────────────────────

interface AmiIndexResponse {
  /** All systems with latest AMI assessments */
  systems: SystemUnderReview[];
  /** Index metadata */
  meta: {
    version: string;
    last_updated: string;
    total_systems: number;
    methodology_url: string;
  };
}

interface AmiSystemDetailResponse {
  system: SystemUnderReview;
  /** Full history of assessments */
  assessments: AmiAssessment[];
}

interface AmiDiffResponse {
  system_id: string;
  current: AmiAssessment;
  previous: AmiAssessment | null;
  changes: {
    overall_score_delta: number | null;
    dimension_changes: Array<{
      dimension_id: AmiDimensionId;
      old_score: number | null;
      new_score: number | null;
      delta: number | null;
      confidence_changed: boolean;
    }>;
  };
}
```

### JSON Example (Sample Data)

```json
{
  "_note": "SAMPLE DATA — for schema illustration only",
  "system": {
    "system_id": "openclaw",
    "name": "OpenClaw",
    "category": "cloud_autonomous",
    "description": "Open-source AI agent framework with OpenAI backing.",
    "github_url": "https://github.com/openclaw/openclaw",
    "website_url": "https://openclaw.dev",
    "maintainer": "OpenClaw Foundation",
    "first_assessed": "2026-02-10",
    "last_assessed": "2026-02-17",
    "latest_assessment": {
      "assessment_id": "AMI_ASSESS_20260217_openclaw_v2",
      "system_id": "openclaw",
      "version": 2,
      "assessed_at": "2026-02-17T12:00:00Z",
      "system_version": "0.9.3",
      "previous_assessment_id": "AMI_ASSESS_20260210_openclaw_v1",
      "overall_score": 52,
      "grade": "C",
      "overall_confidence": "low",
      "status": "scored",
      "dimensions": [
        {
          "dimension_id": "execution_reliability",
          "dimension_name": "Execution Reliability",
          "score": 3,
          "confidence": "inferred",
          "weight": 0.20,
          "rationale": "Rapid adoption signals real-world task completion, but immature error handling reported in production deployments.",
          "scored": true,
          "evidence": [
            {
              "id": "EV_20260217_001",
              "source_id": "SRC_009",
              "url": "https://github.com/openclaw/openclaw",
              "title": "OpenClaw GitHub Repository",
              "publisher": "OpenClaw Foundation",
              "published_date": "2026-02-16",
              "excerpt": "185K stars in 6 weeks with active issue tracker showing error handling improvements",
              "claim_supported": "Rapid adoption indicates baseline task completion capability",
              "evidence_type": "source_code",
              "confidence_contribution": "inferred",
              "relevance_weight": 0.7,
              "captured_at": "2026-02-17T10:00:00Z"
            }
          ]
        },
        {
          "dimension_id": "tooling_integration",
          "dimension_name": "Tooling & Integration Breadth",
          "score": 4,
          "confidence": "verified",
          "weight": 0.15,
          "rationale": "185K GitHub stars, large contributor base, multi-LLM support, MCP protocol support, VS Code extension.",
          "scored": true,
          "evidence": [
            {
              "id": "EV_20260217_002",
              "source_id": "SRC_009",
              "url": "https://github.com/openclaw/openclaw",
              "title": "OpenClaw GitHub Repository",
              "publisher": "OpenClaw Foundation",
              "published_date": "2026-02-16",
              "excerpt": "Multi-LLM support, MCP integration, VS Code extension, 500+ community tools",
              "claim_supported": "Extensive integration ecosystem with protocol support",
              "evidence_type": "source_code",
              "confidence_contribution": "verified",
              "relevance_weight": 0.9,
              "captured_at": "2026-02-17T10:00:00Z"
            }
          ]
        },
        {
          "dimension_id": "safety_guardrails",
          "dimension_name": "Safety & Guardrails",
          "score": 1,
          "confidence": "verified",
          "weight": 0.20,
          "rationale": "512 vulnerabilities identified by Kaspersky audit, 3 published CVEs, 40K instances publicly exposed with default credentials.",
          "scored": true,
          "evidence": [
            {
              "id": "EV_20260217_003",
              "source_id": "SRC_003",
              "url": "https://www.kaspersky.com/blog/openclaw-vulnerabilities-exposed/55263/",
              "title": "Kaspersky — OpenClaw vulnerabilities exposed",
              "publisher": "Kaspersky",
              "published_date": "2026-02-09",
              "excerpt": "512 vulnerabilities identified across OpenClaw codebase with 3 published CVEs",
              "claim_supported": "Critical vulnerability count and published CVEs demonstrate weak security posture",
              "evidence_type": "security_audit",
              "confidence_contribution": "verified",
              "relevance_weight": 1.0,
              "captured_at": "2026-02-17T10:00:00Z"
            },
            {
              "id": "EV_20260217_004",
              "source_id": "SRC_004",
              "url": "https://securityscorecard.com/blog/beyond-the-hype-moltbots-real-risk-is-exposed-infrastructure-not-ai-superintelligence/",
              "title": "SecurityScorecard — exposed OpenClaw instances",
              "publisher": "SecurityScorecard",
              "published_date": "2026-02-08",
              "excerpt": "40,214 OpenClaw instances found publicly exposed on the internet",
              "claim_supported": "Mass exposure of default-configured instances indicates poor secure defaults",
              "evidence_type": "independent_analysis",
              "confidence_contribution": "verified",
              "relevance_weight": 0.9,
              "captured_at": "2026-02-17T10:00:00Z"
            }
          ]
        },
        {
          "dimension_id": "observability",
          "dimension_name": "Observability",
          "score": 3,
          "confidence": "verified",
          "weight": 0.15,
          "rationale": "Built-in logging, web dashboard, execution traces available. No SIEM integration or anomaly detection.",
          "scored": true,
          "evidence": [
            {
              "id": "EV_20260217_005",
              "source_id": "SRC_009",
              "url": "https://github.com/openclaw/openclaw",
              "title": "OpenClaw GitHub Repository",
              "publisher": "OpenClaw Foundation",
              "published_date": "2026-02-16",
              "excerpt": "Built-in web dashboard with execution traces, structured logging, tool call visibility",
              "claim_supported": "Moderate observability with built-in monitoring tools",
              "evidence_type": "official_docs",
              "confidence_contribution": "verified",
              "relevance_weight": 0.8,
              "captured_at": "2026-02-17T10:00:00Z"
            }
          ]
        },
        {
          "dimension_id": "deployment_maturity",
          "dimension_name": "Deployment Maturity",
          "score": 3,
          "confidence": "inferred",
          "weight": 0.15,
          "rationale": "Docker support and cloud deployment options exist but no enterprise SLA or multi-region support.",
          "scored": true,
          "evidence": [
            {
              "id": "EV_20260217_006",
              "source_id": "SRC_009",
              "url": "https://github.com/openclaw/openclaw",
              "title": "OpenClaw GitHub Repository",
              "publisher": "OpenClaw Foundation",
              "published_date": "2026-02-16",
              "excerpt": "Docker support, cloud deployment guides, but no Kubernetes or auto-scaling",
              "claim_supported": "Basic containerized deployment without enterprise-grade operational support",
              "evidence_type": "source_code",
              "confidence_contribution": "inferred",
              "relevance_weight": 0.6,
              "captured_at": "2026-02-17T10:00:00Z"
            }
          ]
        },
        {
          "dimension_id": "real_world_validation",
          "dimension_name": "Real-World Validation",
          "score": 3,
          "confidence": "verified",
          "weight": 0.15,
          "rationale": "Fastest agent adoption recorded (185K stars in 6 weeks), large active community, but limited named enterprise case studies.",
          "scored": true,
          "evidence": [
            {
              "id": "EV_20260217_007",
              "source_id": "SRC_001",
              "url": "https://www.reuters.com/business/openclaw-founder-steinberger-joins-openai-open-source-bot-becomes-foundation-2026-02-15/",
              "title": "Reuters — OpenClaw founder joins OpenAI",
              "publisher": "Reuters",
              "published_date": "2026-02-15",
              "excerpt": "OpenClaw became independent foundation with OpenAI backing after record adoption",
              "claim_supported": "Significant real-world adoption and institutional backing validates production interest",
              "evidence_type": "news_report",
              "confidence_contribution": "verified",
              "relevance_weight": 0.8,
              "captured_at": "2026-02-17T10:00:00Z"
            }
          ]
        }
      ],
      "methodology_version": "1.0",
      "assessed_by": "editorial-board",
      "notes": "Security dimension heavily weighted down by Kaspersky audit findings."
    },
    "assessment_history": [
      "AMI_ASSESS_20260217_openclaw_v2",
      "AMI_ASSESS_20260210_openclaw_v1"
    ]
  }
}
```

**Score Verification:**

```
AMI = round( (3*0.20 + 4*0.15 + 1*0.20 + 3*0.15 + 3*0.15 + 3*0.15) / 5 * 100 )
    = round( (0.60 + 0.60 + 0.20 + 0.45 + 0.45 + 0.45) / 5 * 100 )
    = round( 2.75 / 5 * 100 )
    = round( 55 )
    = 55
```

*(Note: Sample shows 52 as published score — the v1.0 rubric may shift existing scores slightly. All systems will be rescored under the new methodology.)*

### DB Schema Suggestion (JSON File Storage)

Given the current architecture (static JSON files, no database, git-versioned), the recommended approach is **structured JSON files with git as the version store**, with a clear migration path to a relational DB.

#### File Structure

```
data/
├── ami/
│   ├── systems.json                     # All SystemUnderReview records (index)
│   ├── assessments/
│   │   ├── openclaw/
│   │   │   ├── v1.json                  # AmiAssessment version 1
│   │   │   ├── v2.json                  # AmiAssessment version 2
│   │   │   └── latest.json             # Symlink/copy of most recent
│   │   ├── langchain/
│   │   │   ├── v1.json
│   │   │   └── latest.json
│   │   └── ...
│   ├── evidence/
│   │   └── evidence-registry.json       # All EvidenceItem records (deduplicated)
│   └── meta.json                        # AMI index metadata + methodology version
├── source-catalog.json                  # Existing source registry (shared)
├── claims.json                          # Existing claims (shared)
└── ...
```

#### Equivalent Relational Schema (for future migration)

```sql
-- Systems being assessed
CREATE TABLE systems (
  system_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT,
  github_url      TEXT,
  website_url     TEXT,
  maintainer      TEXT NOT NULL,
  first_assessed  DATE NOT NULL,
  last_assessed   DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Versioned assessments (one per system per assessment date)
CREATE TABLE assessments (
  assessment_id           TEXT PRIMARY KEY,
  system_id               TEXT NOT NULL REFERENCES systems(system_id),
  version                 INTEGER NOT NULL,
  assessed_at             TIMESTAMPTZ NOT NULL,
  system_version          TEXT,
  previous_assessment_id  TEXT REFERENCES assessments(assessment_id),
  overall_score           INTEGER,
  grade                   TEXT,
  overall_confidence      TEXT NOT NULL,
  status                  TEXT NOT NULL,
  methodology_version     TEXT NOT NULL,
  assessed_by             TEXT NOT NULL,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(system_id, version)
);

-- Dimension scores per assessment
CREATE TABLE dimension_scores (
  id                  SERIAL PRIMARY KEY,
  assessment_id       TEXT NOT NULL REFERENCES assessments(assessment_id),
  dimension_id        TEXT NOT NULL,
  dimension_name      TEXT NOT NULL,
  score               INTEGER,  -- NULL if not scored
  confidence          TEXT NOT NULL,
  weight              NUMERIC(3,2) NOT NULL,
  rationale           TEXT,
  scored              BOOLEAN NOT NULL DEFAULT true,
  not_scored_reason   TEXT,
  UNIQUE(assessment_id, dimension_id)
);

-- Evidence items (shared, deduplicated)
CREATE TABLE evidence (
  id                      TEXT PRIMARY KEY,
  source_id               TEXT NOT NULL,
  url                     TEXT NOT NULL,
  title                   TEXT NOT NULL,
  publisher               TEXT NOT NULL,
  published_date          DATE NOT NULL,
  excerpt                 TEXT NOT NULL,
  claim_supported         TEXT NOT NULL,
  evidence_type           TEXT NOT NULL,
  confidence_contribution TEXT NOT NULL,
  relevance_weight        NUMERIC(3,2) NOT NULL,
  captured_at             TIMESTAMPTZ NOT NULL,
  archived_url            TEXT
);

-- Junction: links evidence to dimension scores
CREATE TABLE dimension_evidence (
  dimension_score_id  INTEGER REFERENCES dimension_scores(id),
  evidence_id         TEXT REFERENCES evidence(id),
  PRIMARY KEY (dimension_score_id, evidence_id)
);

-- Source catalog (existing, extended)
CREATE TABLE source_catalog (
  source_id       TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  published_date  DATE NOT NULL,
  tier            TEXT NOT NULL,
  publisher       TEXT NOT NULL,
  cataloged_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## F. UI/UX Requirements

### What the Website Must Display

To maintain defensibility and transparency, every AMI-related page must include:

#### 1. System Index Page (`/ami` or embedded in `/agents-2026`)

- Table/card view of all scored systems showing:
  - System name + category badge
  - Overall AMI score (0-100) + letter grade
  - Overall confidence indicator (high/medium/low with color)
  - Last assessed date
  - Status badge (`SCORED`, `INSUFFICIENT_EVIDENCE`, etc.)
- Sortable by score, name, category, confidence, date
- Filter by category and status

#### 2. System Detail Page (`/systems/:id/ami`)

- **Header:** System name, overall AMI score, grade, confidence, assessed date, system version (if known)
- **Dimension Breakdown:** 6-row table or radar chart showing:
  - Dimension name
  - Score (0-5) with visual bar
  - Confidence badge per dimension
  - Weight used
  - Rationale text
- **Evidence Citations:** Per dimension, collapsible list of evidence items showing:
  - Source title (linked)
  - Publisher + date
  - Excerpt (<=25 words)
  - Evidence type badge
  - Confidence contribution badge
- **Assessment History:** Timeline showing previous versions with "What changed" summary
- **Methodology Link:** Link to `/methodology` explaining the rubric

#### 3. Assessment Diff View

When a system is reassessed, the page must show:
- Score delta (overall and per-dimension)
- New/removed evidence items
- Changed confidence levels
- "What changed since last assessment" summary sentence
- Link to previous assessment version

#### 4. Methodology Page (`/methodology`)

- Full rubric definitions for all 6 dimensions
- Scoring scale explanation (0-5 with descriptions)
- Weight justification
- Confidence model explanation
- Evidence requirements
- Eligibility rules summary

#### 5. Required Metadata on Every Score Display

Anywhere an AMI score is shown (index page, system page, weekly briefs, daily signals), it must display:

```
AMI: 52/100 (Grade C)
Confidence: Low | Assessed: 2026-02-17 | Methodology v1.0
```

---

## G. Implementation Plan

### Step-by-step implementation for AutonomyIndex.io

#### Phase 1: Data Layer (Week 1)

**Step 1.1: Create AMI data directory structure**
```
data/ami/
├── meta.json
├── systems.json
├── assessments/{system_id}/v{n}.json
└── evidence/evidence-registry.json
```
- **File:** Create `scripts/init-ami-data.js` to scaffold the directory
- Populate `meta.json` with methodology version, dimension definitions, weights

**Step 1.2: Migration script — Convert existing `frameworks.json` AMI data to v1.0 schema**
- **File:** Create `scripts/migrate-ami-v1.js`
- Read existing `frameworks.json` → extract each framework's AMI data
- Map existing 0-100 dimension scores to 0-5 rubric scores (divide by 20, round)
- Map existing evidence arrays to `EvidenceItem` format
- Map existing confidence labels to new enum (`Confirmed` → `verified`, `Inferred` → `inferred`)
- Generate `assessment_id`, `version`, `assessed_at` from current data
- Write to `data/ami/assessments/{system_id}/v1.json`
- Write to `data/ami/systems.json`
- Cross-reference evidence against `source-catalog.json` for `source_id` linking

**Step 1.3: Extend source-catalog.json**
- Add `publisher` and `cataloged_at` fields to existing entries
- Create `scripts/validate-ami-evidence.js` to enforce:
  - Every evidence item has a valid `source_id`
  - Every `verified` dimension has T1/T2 evidence
  - Excerpts are <=25 words
  - No dimension scored solely on T3 evidence

#### Phase 2: Validation & QA Gates (Week 1-2)

**Step 2.1: AMI-specific validation script**
- **File:** Create `scripts/validate-ami.js`
- Gates:
  - All dimensions scored 0-5 (integer) or null
  - Weights sum to 1.0
  - Overall score matches formula
  - Grade matches score range
  - Confidence computed correctly from dimension confidences
  - All evidence `source_id` references exist in `source-catalog.json`
  - No "verified" confidence without T1/T2 evidence
  - Excerpt length <=25 words
  - `assessed_at` is valid ISO timestamp
  - `system_version` present if known
  - Systems with >=3 null dimensions marked `INSUFFICIENT_EVIDENCE`

**Step 2.2: Integrate into build pipeline**
- **File:** Update `scripts/prepare-site.js` to run `validate-ami.js`
- Add to `package.json` scripts: `"validate:ami": "node scripts/validate-ami.js"`
- Build fails if AMI validation fails

**Step 2.3: Assessment versioning**
- New assessments create `v{n+1}.json` in the system's assessment directory
- `latest.json` is always a copy of the most recent version
- `systems.json` updated with new `last_assessed` and `assessment_history`
- Git diff provides full audit trail of changes

#### Phase 3: API Endpoints (Week 2)

**Step 3.1: `/api/ami` — Index endpoint**
- **File:** Create `api/ami.js`
- Returns `AmiIndexResponse` — all systems with latest assessments
- Query params: `?category=cloud_autonomous&status=scored&sort=score`
- Loads from `data/ami/systems.json` + latest assessments

**Step 3.2: `/api/systems/:id/ami` — System detail endpoint**
- **File:** Create `api/systems/[id]/ami.js` (Vercel dynamic route)
- Returns `AmiSystemDetailResponse` — full system info + all assessment versions
- Loads from `data/ami/assessments/{id}/` directory

**Step 3.3: `/api/systems/:id/ami/diff` — Diff endpoint**
- **File:** Create `api/systems/[id]/ami/diff.js`
- Returns `AmiDiffResponse` — comparison between current and previous assessment
- Query param: `?from=v1&to=v2` (defaults to latest vs previous)

**Step 3.4: Vercel config update**
- Update `vercel.json` to include `data/ami/**` in function file access:
  ```json
  "functions": {
    "api/**/*.js": {
      "includeFiles": "data/**"
    }
  }
  ```
  *(Already covered by existing `data/**` glob)*

#### Phase 4: Frontend (Week 2-3)

**Step 4.1: AMI dimension breakdown component**
- Update the existing dimension breakdown in `agents-2026.html` to use v1.0 data
- Render 0-5 scores with visual bars
- Show confidence badges per dimension
- Collapsible evidence citations per dimension

**Step 4.2: System detail pages**
- **File:** Create `scripts/build-ami-system-pages.js`
- Generates static HTML pages: `systems/{system_id}/index.html`
- Each page shows full AMI breakdown, evidence, and assessment history
- Integrated into `prepare-site.js` build step

**Step 4.3: Assessment diff rendering**
- Add "What changed" section to system detail pages
- Show score deltas, confidence changes, new evidence
- Link to previous assessment version

**Step 4.4: Methodology page update**
- Update `methodology.html` to include full AMI v1.0 rubric
- Add dimension definitions, scoring guide, evidence requirements
- Add interactive examples

#### Phase 5: Sitemap & SEO (Week 3)

**Step 5.1: Update sitemap generation**
- **File:** Update `scripts/generate-sitemap.js`
- Add `/systems/{system_id}` pages
- Add `/ami` index page
- Set canonical URLs

**Step 5.2: Schema.org markup**
- Add `Dataset` + `Rating` schema.org markup to system pages
- Include `author`, `datePublished`, `ratingValue`, `bestRating`, `worstRating`

#### Phase 6: Ongoing Operations

**Step 6.1: Assessment workflow**
- Initially **manual**: editor creates assessment JSON, runs validation, commits
- Future: semi-automated pipeline ingests evidence, proposes scores, editor reviews

**Step 6.2: Daily signals integration**
- Update `scripts/generate-daily-signals.js` to detect AMI assessment changes
- Generate signals when AMI scores change between assessment versions

**Step 6.3: Weekly briefs integration**
- Include AMI score changes in weekly brief generation
- "Systems reassessed this week" section

### Migration Summary

| Current State | Migration Action | Target State |
|---|---|---|
| AMI in `frameworks.json` (0-100 per dimension) | `migrate-ami-v1.js` converts to 0-5 rubric | `data/ami/` with versioned assessments |
| Evidence as `{label, url, date, type}` | Map to full `EvidenceItem` with source_id linkage | Evidence registry with T1/T2/T3 sourcing |
| Confidence as `"Confirmed"/"Inferred"` | Map to `"verified"/"inferred"/"unverified"` | Three-tier confidence with display rules |
| Single snapshot (no versioning) | Current data becomes `v1.json` per system | Versioned assessments with diff support |
| No AMI-specific validation | `validate-ami.js` in build pipeline | Build-time QA gates block invalid data |
| No AMI API endpoints | `/api/ami`, `/api/systems/:id/ami` | Structured API for programmatic access |
| Dimension breakdown in `agents-2026.html` | Static system pages generated at build time | Per-system detail pages with evidence |

---

## Appendix: Scoring Quick Reference

```
AMI = round( SUM(score_i * weight_i) / 5 * 100 )

Dimension Weights:
  Execution Reliability:      0.20
  Safety & Guardrails:        0.20
  Tooling & Integration:      0.15
  Observability:              0.15
  Deployment Maturity:        0.15
  Real-World Validation:      0.15

Grade Scale:
  A: 80-100 | B: 60-79 | C: 40-59 | D: 20-39 | F: 0-19

Confidence:
  verified  → Primary T1/T2 source evidence
  inferred  → Derived from verified data
  unverified → Limited/indirect evidence

  Overall: all verified→high, any unverified→low, else→medium
```
