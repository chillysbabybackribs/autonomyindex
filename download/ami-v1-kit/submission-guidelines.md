# AMI v1.0 Submission Guidelines

## Before You Submit

Ensure your assessment meets these minimum requirements:

1. **Valid JSON**: Assessment must parse as valid JSON
2. **All 6 dimensions present**: Even unscored dimensions must be included
3. **Evidence for scored dimensions**: No scored dimension without at least one evidence item
4. **Source references**: Every evidence item must have source_ids
5. **Rubric references**: Every scored dimension must cite specific rubric IDs
6. **Correct aggregation**: overall_score must match the computed weighted average
7. **Eligibility filled**: All eligibility fields must be populated

## Self-Assessment Checklist

- [ ] Used the assessment template as starting point
- [ ] All evidence URLs are accessible and verifiable
- [ ] Excerpts are 25 words or fewer
- [ ] Confidence levels are honest (not inflated)
- [ ] Rubric refs match the actual score level awarded
- [ ] Overall score matches the aggregation formula
- [ ] Status is set appropriately (scored vs insufficient_evidence)
- [ ] Category is correct for your system type

## Submission Process

1. **Prepare**: Complete your assessment JSON using the template and rubric
2. **Validate**: Check your assessment against the schema
3. **Self-check**: Run the assessment against compliance profiles:
   - community-basic-v1 (minimum for self-assessments)
   - prod-general-v1 (required for official listing)
4. **Submit**: Send your assessment JSON to the Autonomy Index team
5. **Review**: The editorial board will verify evidence and scores
6. **Publication**: If approved, your assessment receives:
   - Reviewer signatures (SHA-256)
   - Integrity hash
   - Published status
   - Listing on the AMI index

## What Happens During Review

The editorial board will:

- Verify all cited evidence URLs are accessible
- Cross-check claims against source content
- Validate scoring against the rubric
- Check for anti-gaming gate violations
- Adjust scores if evidence doesn't support claimed level
- Add reviewer signatures upon approval
- Compute and attach integrity hash

## Timeline

- Self-assessments: Complete at your own pace
- Review turnaround: Typically 5-10 business days
- Re-review after revisions: 2-5 business days

## Questions

- Methodology: https://www.autonomyindex.io/methodology#ami
- Current assessments: https://www.autonomyindex.io/ami-systems
- Contact: Submit via the download page

---
AMI v1.0 | 2026-02-17
