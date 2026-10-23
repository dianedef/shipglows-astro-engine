---
artifact: project_governance
metadata_schema_version: "1.0"
artifact_version: "1.0.0"
project: ShipGlows Astro Engine
created: "2026-10-23"
updated: "2026-10-23"
status: active
source_skill: sg-docs
scope: project-governance
owner: Diane
confidence: high
risk_level: low
security_impact: none
docs_impact: yes
linked_systems:
  - ../README.md
  - ../package.json
  - ../src/
depends_on: []
supersedes: []
evidence:
  - "2026-10-23: governance topology audit found no shipglows_data/ corpus; module inventories and consumer migrations lived only in session reports."
next_review: "2027-01-23"
next_step: "Record each new module and each site adoption in technical/context.md and workflow/TASKS.md."
---

# Astro Engine Governance

Canonical internal corpus of `@shipglows/astro-engine`: shared, unstyled logic
for the ShipGlows Astro sites, one module per sub-path export.

## Canonical Entry Points

- `../README.md`: usage and API of every module (integration source of truth).
- `technical/context.md`: module map, conventions, consumers.
- `workflow/TASKS.md`: open site adoptions and follow-ups.

## Scope Boundary

The repository is public: this corpus holds no identity data, secrets, local
paths or private notes. Site-specific content (links, legal identity,
translations, CSS) stays in each site's own governance; this corpus only
records what the shared modules promise and which sites adopt them.
