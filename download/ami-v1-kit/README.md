# AMI v1.0 Assessment Kit

## What AMI Measures

The Agent Maturity Index (AMI) evaluates AI agent systems across 6 dimensions
of production readiness:

- **Execution Reliability** (20% weight)
- **Tooling & Integration Breadth** (15% weight)
- **Safety & Guardrails** (20% weight)
- **Observability** (15% weight)
- **Deployment Maturity** (15% weight)
- **Real-World Validation** (15% weight)

Each dimension is scored 0-5 with cited evidence. The overall score is 0-100
with a letter grade (A-F).

## What AMI Does NOT Measure

- Model intelligence or reasoning capability
- Benchmark performance (MMLU, HumanEval, etc.)
- Market share or popularity
- Price or value for money
- Subjective "best tool" rankings

AMI measures operational maturity — how ready an agent system is for
real-world production deployment.

## How to Run a Self-Assessment

1. Copy `ami-assessment-template.json` and fill in your system details
2. Use `ami-self-assessment-llm-prompt.txt` with an LLM to generate a draft
3. Review the LLM output against `ami-v1-rubric.md`
4. Ensure all evidence is real, cited, and verifiable
5. Validate against the schema in `ami-v1-schema.json`

## Self-Reported vs Published Assessments

| | Self-Reported | Published |
|---|---|---|
| **Who runs it** | System maintainers or third parties | Autonomy Index editorial board |
| **Review state** | draft or reviewed | published |
| **Reviewer signatures** | None required | Required (SHA-256 signed) |
| **Confidence** | Typically lower | Evidence-verified |
| **Profile compliance** | May not pass prod-general-v1 | Must pass to be listed |
| **Listed on AMI index** | No | Yes |

Self-reported assessments are useful for internal benchmarking and
identifying improvement areas, but carry no official certification.

## How to Submit for Official Review

1. Complete a self-assessment using this kit
2. Ensure your assessment passes the community-basic-v1 profile at minimum
3. Submit via the Autonomy Index website: https://www.autonomyindex.io/ami-download
4. The editorial board will verify evidence, adjust scores if needed,
   and publish the assessment if it passes prod-general-v1

## Kit Contents

| File | Description |
|------|-------------|
| `README.md` | This file |
| `ami-v1-rubric.md` | Full scoring rubric with detailed criteria |
| `ami-v1-schema.json` | JSON schema for assessment validation |
| `ami-v1-profiles.json` | Compliance profile definitions |
| `ami-assessment-template.json` | Blank assessment template |
| `ami-self-assessment-llm-prompt.txt` | LLM prompt for self-assessment |
| `submission-guidelines.md` | Detailed submission process |

## Links

- Methodology: https://www.autonomyindex.io/methodology#ami
- AMI Assessments: https://www.autonomyindex.io/ami-systems
- Download Page: https://www.autonomyindex.io/ami-download

---
AMI v1.0 | Generated 2026-02-17 | Spec Hash: e40f86bc6348add440f17abe4cc129555ed40853f2c771d748154b8d5a8d407d
