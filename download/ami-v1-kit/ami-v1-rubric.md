# AMI v1.0 Rubric

Agent Maturity Index — Scoring Rubric

This document is auto-generated from the live AMI v1.0 specification.
It reflects the exact rubric enforced by the Autonomy Index validation system.

## Scoring Scale

Each dimension is scored 0-5. The overall AMI score is 0-100.

| Level | Meaning |
|-------|---------|
| 0 | No capability or evidence |
| 1 | Minimal / emerging |
| 2 | Basic / functional |
| 3 | Moderate / production-viable |
| 4 | Strong / comprehensive |
| 5 | Industry-leading / formal |

## Grade Scale

| Grade | Score Range |
|-------|------------|
| A | 80-100 |
| B | 60-79 |
| C | 40-59 |
| D | 20-39 |
| F | 0-19 |

## Dimensions

| Dimension | Weight |
|-----------|--------|
| Execution Reliability | 20% |
| Tooling & Integration Breadth | 15% |
| Safety & Guardrails | 20% |
| Observability | 15% |
| Deployment Maturity | 15% |
| Real-World Validation | 15% |

## Aggregation Formula

```
AMI = round( SUM(score_i * renorm_weight_i) / 5 * 100 )

Where renorm_weight_i = original_weight_i / SUM(scored_weights)
Unscored dimensions are excluded and remaining weights renormalized.
Maximum 2 dimensions may be unscored for "scored" status.
```

## Confidence Levels

Per-dimension: `verified` | `inferred` | `unverified`

Overall confidence:
- **high**: all scored dimensions are verified
- **medium**: mix of verified and inferred (no unverified)
- **low**: any scored dimension is unverified

## Detailed Rubric

### Execution Reliability (20%)

**Level 0:**
- [ER0a] No evidence of task completion capability

**Level 1:**
- [ER1a] Basic task execution with frequent failures
- [ER1b] No error recovery or retry logic

**Level 2:**
- [ER2a] Completes simple tasks reliably
- [ER2b] Basic error handling present

**Level 3:**
- [ER3a] Handles multi-step tasks with moderate reliability
- [ER3b] Error recovery exists but incomplete

**Level 4:**
- [ER4a] Reliable multi-step execution with graceful degradation
- [ER4b] Comprehensive error handling and retry logic

**Level 5:**
- [ER5a] Production-grade reliability with SLA guarantees
- [ER5b] Formal reliability engineering and chaos testing

### Tooling & Integration Breadth (15%)

**Level 0:**
- [TI0a] No external tool integration

**Level 1:**
- [TI1a] Single tool or API integration

**Level 2:**
- [TI2a] Multiple tool integrations with basic protocol support

**Level 3:**
- [TI3a] Broad tool ecosystem with standard protocol support
- [TI3b] IDE or editor integration available

**Level 4:**
- [TI4a] Extensive third-party ecosystem with multi-protocol support
- [TI4b] MCP or equivalent open protocol integration

**Level 5:**
- [TI5a] Industry-leading ecosystem with bidirectional tool orchestration
- [TI5b] Custom tool creation SDK with marketplace

### Safety & Guardrails (20%)

**Level 0:**
- [SG0a] No safety controls or permission model

**Level 1:**
- [SG1a] Minimal permission model with permissive defaults
- [SG1b] Known unpatched vulnerabilities

**Level 2:**
- [SG2a] Basic permission model with some secure defaults

**Level 3:**
- [SG3a] Role-based access control with configurable policies
- [SG3b] Regular security patches

**Level 4:**
- [SG4a] Comprehensive security model with audit logging
- [SG4b] Third-party security audit completed

**Level 5:**
- [SG5a] Zero-trust architecture with formal verification
- [SG5b] Continuous security monitoring and compliance certification

### Observability (15%)

**Level 0:**
- [OB0a] No logging or monitoring capability

**Level 1:**
- [OB1a] Basic console logging only

**Level 2:**
- [OB2a] Structured logging with basic trace visibility

**Level 3:**
- [OB3a] Built-in dashboard with execution traces
- [OB3b] Tool call visibility and structured logs

**Level 4:**
- [OB4a] Full distributed tracing with SIEM integration
- [OB4b] Custom metrics and alerting

**Level 5:**
- [OB5a] Production-grade APM with anomaly detection
- [OB5b] Real-time cost and performance monitoring

### Deployment Maturity (15%)

**Level 0:**
- [DM0a] No deployment tooling or documentation

**Level 1:**
- [DM1a] Manual deployment with basic documentation

**Level 2:**
- [DM2a] Container support with basic deployment guides

**Level 3:**
- [DM3a] Docker support with cloud deployment options
- [DM3b] No enterprise SLA or multi-region support

**Level 4:**
- [DM4a] Kubernetes-native with multi-region support
- [DM4b] Infrastructure-as-code templates

**Level 5:**
- [DM5a] Enterprise-grade with SLA guarantees
- [DM5b] Auto-scaling, blue-green deployment, disaster recovery

### Real-World Validation (15%)

**Level 0:**
- [RV0a] No evidence of real-world usage

**Level 1:**
- [RV1a] Early adopter usage with limited feedback

**Level 2:**
- [RV2a] Growing community adoption with user testimonials

**Level 3:**
- [RV3a] Significant adoption metrics or institutional backing
- [RV3b] Limited named enterprise case studies

**Level 4:**
- [RV4a] Named enterprise deployments with published case studies
- [RV4b] Independent benchmarks or evaluations

**Level 5:**
- [RV5a] Industry-standard with regulatory acceptance
- [RV5b] Peer-reviewed evaluations and long-term production track record

## Anti-Gaming Gates

All assessments must pass these validation gates:

1. **GATE 1**: No scored dimension without evidence
2. **GATE 2**: Each evidence item must reference >= 1 source ID
3. **GATE 3**: Scored dimensions require a confidence value
4. **GATE 4**: Aggregation math must match stored score (max 2 unscored)
5. **GATE 5**: Score >= 4 requires >= 2 distinct sources
6. **GATE 6**: Score 5 requires >= 1 primary or hard-evidence source
7. **GATE 7**: Scored assessment requires >= 3 distinct sources total
8. **GATE 8**: Scored dimensions require rubric_refs

## Source Tiering

| Tier | Description |
|------|-------------|
| T1 | Primary documentation, official repositories, security audits |
| T2 | Reputable third-party analysis, independent benchmarks |
| T3 | Community reports, self-reported metrics, forum discussions |

Source reliability: `primary` | `secondary` | `self_reported`

Source access: `public` | `private`

---
Generated: 2026-02-17
AMI Version: 1.0
Spec Hash: e40f86bc6348add440f17abe4cc129555ed40853f2c771d748154b8d5a8d407d