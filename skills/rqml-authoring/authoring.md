<!-- Canonical RQML authoring craft. Source of truth: rqml-org/rqml-skill (references/authoring.md). -->
<!-- canonical-version: 1 -->

# RQML authoring craft

The canonical, host-agnostic guide to authoring and revising RQML requirements
documents. This is the single source other RQML skills and plugins vendor from —
edit it here, in rqml-skill, never in a vendored copy. Long-form reference:
https://rqml.org/docs/.

RQML (https://rqml.org) is an XML format for software requirements. An `.rqml`
document has up to eleven sections in a fixed order — meta, catalogs, domain,
goals, scenarios, requirements, behavior, interfaces, verification, trace,
governance — of which only **meta** and **requirements** are mandatory. Add a
section when it earns its keep, not before.

## Non-negotiables

- **Validate after every edit**: `rqml validate` (XSD + referential integrity).
  Never leave the document invalid between turns.
- **Never hand-edit trace edges** for implementation or verification links —
  `rqml link <REQ-ID> <path>` (and `--type verifiedBy` for tests) writes a
  correct edge and records the drift baseline.
- **Never invent element shapes** — `rqml skeleton <req|edge|testCase|stateMachine>`
  emits schema-valid snippets to fill in.
- **Read before you write**: `rqml show <ID>` for one artifact with its trace
  neighborhood; `rqml impact <ID>` before changing anything that exists.

## Document structure

The eleven sections, in order, each optional unless noted:

- **meta** *(mandatory)* — title, system, summary, authors.
- **catalogs** — reusable actors, constraints, risks, decisions, policies.
- **domain** — entities and their attributes.
- **goals** — `<goal>` and `<qgoal>` (quality goals with a `<metric>`); obstacles.
- **scenarios** — narrative `<scenario>` / `<edgeCase>` flows.
- **requirements** *(mandatory)* — `<reqPackage>` groups of `<req>`.
- **behavior** — state machines (`<stateMachine>`, `<state>`, `<transition>`).
- **interfaces** — external/internal interface contracts.
- **verification** — `<testSuite>`, `<testCase>`.
- **trace** — `<edge>` links between artifacts.
- **governance** — process and ownership rules.

Keep the document as small as the problem allows; every section you add is
something to keep correct.

## Statement quality

- One atomic, testable obligation per `<req>`; split compound statements.
- RFC 2119 keywords carry the obligation: SHALL/MUST (binding), SHOULD
  (default expectation), MAY (genuinely optional). The `priority` attribute
  matches: must / should / may.
- Classify with `type`: FR (functional), NFR (quality), IR (interface),
  DR (data/structure), SR (security), CR (compliance/constraint), PR (process),
  UXR (usability), OR (operational).
- Give every verifiable requirement `<acceptance>` criteria in given/when/then
  form — they are what tests get generated from.
- Statements answer *what* and *how well*; put *why* in `<rationale>` and design
  choices in `<decision>` elements, not in the statement. A significant
  architectural decision belongs in a full ADR under `.rqml/adr/`
  (https://rqml.org/docs/development-process/design); the `<decision>` element is
  the agent-readable summary, the ADR the long-form context — cross-reference
  them by id.

## Identity and lifecycle

- IDs match `[A-Za-z][A-Za-z0-9._-]*` (2–80 chars), unique across the whole
  document. Conventions: REQ-*, GOAL-*/QGOAL-*, ENT-*, SM-*/ST-*/TR-*, TC-*,
  DEC-*, RISK-*/OBS-*, E-* for trace edges, CRIT-* for criteria.
- Lifecycle: draft → review → approved → deprecated. **Only approved
  requirements drive implementation**; new requirements you draft are
  `status="draft"` until the developer approves them.

## Traceability

- Every requirement should `satisfies` a goal or scenario (otherwise it is an
  orphan — the coverage report will say so). Satisfies edges may be hand-authored.
- `implements` edges run code → requirement; `verifiedBy` runs requirement →
  test. Record both with `rqml link`, never manually — it also stores the drift
  baseline so later edits to a linked file are detected.
- Cross-document references use doc locators; external artifacts use external
  locators with a URI.

## Finishing

A spec-editing task is done when `rqml validate` is clean and `rqml check` exits
0 at the project's strictness. Treat that as the gate for every change.

## Canonical source and updates

This file is maintained in **rqml-skill** and is the single source of truth.
The rqml-claude and rqml-codex plugins vendor a synced copy and must not edit it
locally — changes made here propagate to them via the rqml-skill craft-sync (see
rqml-skill ADR-0009). Bump `canonical-version` above whenever the content changes.
