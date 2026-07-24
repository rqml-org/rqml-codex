<!-- Canonical RQML authoring craft. Source of truth: rqml-org/rqml-skill (references/authoring.md). -->
<!-- canonical-version: 4 -->

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
- **Never hand-edit trace edges** — `rqml link <from> <to> --type <type>`
  records any edge (satisfies, refines, implements, verifiedBy, …) between two
  artifact ids or a file path, and records the drift baseline where one
  applies. It emits the serialization the document's schema version requires,
  which hand-authoring cannot be relied on to get right.
- **Never hand-upgrade a spec's schema version** — `rqml migrate` rewrites a
  2.0.1 or 2.1.0 document to the current one (`--dry-run` previews it). It
  refuses rather than guessing when the document has integrity problems, and
  leaves the drift baseline alone so existing drift stays visible.
- **Never invent element shapes** — `rqml skeleton <req|edge|testCase|stateMachine>`
  emits schema-valid snippets to fill in; for the elements it does not cover,
  copy the shapes under "Markup you will not get from a skeleton" below.
- **Read before you write**: `rqml show <ID>` for one artifact with its trace
  neighborhood; `rqml impact <ID>` before changing anything that exists.

## The six activities and where they land

Requirements work is six activities (ISO/IEC/IEEE 29148, SWEBOK). Naming the
one you are in tells you which part of the document is yours to write, and
which finding will appear if you skip it. Work is rarely linear — you will
re-enter elicitation from the middle of coding — so treat these as moments, not
phases.

| Activity | The question | Where it lands | The move | Finding if it is missing |
|---|---|---|---|---|
| **Elicitation** | What is wanted, and by whom? | `goals`, `scenarios`, `catalogs` (`actor`, `term`, `stakeholder`) | ask, then write `<goal>`, `<qgoal>`, `<scenario>` | `orphan-requirement`, `uncovered-goal` |
| **Analysis** | What is in tension, and where are the boundaries? | `domain` (`entity`, `rule`), `goalLink`, `obstacle`, `risk`, `decision`, `priority` | `rqml impact <ID>`; `rqml link … --type conflictsWith\|mitigates\|dependsOn` | *none — the gate is silent here* |
| **Specification** | What must the system do, and how will we know? | `requirements` (`req`, `statement`, `acceptance`), `behavior` | `rqml skeleton req`, then `rqml validate` | `missing-acceptance`, `duplicate-id`, XSD errors |
| **Validation** | Is this the right requirement? | `status` (draft → review → approved), `issue` | the developer runs `rqml approve <ID>` | `premature-implementation` |
| **Verification** | Did we build it right? | `verifiedBy` edges, `verification` (`testCase`) | `rqml link <ID> <test> --type verifiedBy` | `unverified-requirement` |
| **Management** | Is the graph still true? | `trace` edges, drift baseline, `governance` | `rqml link`, `rqml link --refresh`, `rqml matrix` | `changed-implementation`, `missing-implementation`, `unimplemented-requirement`, `unresolved-local-ref` |

The coverage is uneven, and it is worth knowing where. Specification,
validation, verification and management each have findings that will chase you.
Elicitation has only two, both indirect — they notice a requirement with no goal
above it, not a goal you never asked about. **Analysis has none at all.** Where
no finding will ever prompt you, the habit is the only thing keeping the
information in the document rather than in a conversation that gets discarded.

Say what you did in these terms. "REQ-EXPORT-STREAM has no verifiedBy edge to a
test yet" is a working instruction; "the gate is red" is not. And report the
mechanism as the mechanism: `rqml check` exits 0 or it does not.

## Reach for a tag when the writing shows the sign

These are triggers, not a checklist — a document that never meets the sign
never needs the tag, and inventing content to fill a section is worse than
leaving it out.

| The sign in what you are writing | Reach for | What it buys |
|---|---|---|
| A number in a criterion that decides a boundary (21, 30 days, 5 retries) | `<rule>` + `<examples>` in `domain/businessRules` | the two sides of the edge become test oracles instead of one remembered case |
| A term you had to infer from context, used by more than one requirement | `<term>` in `catalogs/glossary` | the next reader — human or agent — stops guessing |
| A noun with states in its life: pending, active, expired, cancelled | `<stateMachine>` in `behavior` | `rqml check` enforces the initial state and the final-state rule; prose lifecycles are enforced by nobody |
| Two goals you can only serve at each other's expense | `<goalLink type="conflictsWith">` | the trade-off outlives the conversation that found it |
| "unless", "except", "but not when" inside one statement | a second `<req>` — occasionally a `<rule>` | one atomic obligation per requirement |
| A way the system could be *misused*, not just used | `<misuseCase>` in `scenarios` | the abuse path gets requirements of its own |
| Something that could stop a goal being met, that is not itself a requirement | `<obstacle>` + a `mitigates` edge from what addresses it | the risk and its answer stay attached |
| A quality target you can put a number on | `<qgoal>` + `<metric>` | the number becomes a threshold a test can assert |
| **SHALL, MUST, or a threshold sitting in `<notes>` or `<rationale>`** | promote it to a `<req>`, a `<rule>`, or a `<qgoal>` metric | normative text in a note is invisible to `check`, `matrix`, and `impact` — it is captured but unenforced |

The last row is the common one. Notes and rationale are for context and
history; the moment they start binding behaviour, they belong in an element the
toolchain can see.

## Markup you will not get from a skeleton

`rqml skeleton` covers `req`, `edge`, `testCase`, and `stateMachine`. The
shapes below are the ones most often needed and most often invented wrongly.
Attribute order is free; element order inside each is not. Every example here
is extracted and validated in CI, so these shapes are known-good.

Under `goals` — in this order: `goal`, `qgoal`, `obstacle`, `goalLink`:

<!-- rqml-example: goals -->
```xml
<goal id="GOAL-EXPORT" title="Analysts get their data out" priority="must" status="approved">
  <statement>Analysts can extract a full dataset without engineering help.</statement>
  <rationale>Every ad-hoc extract today costs an engineer half a day.</rationale>
</goal>

<qgoal id="QGOAL-EXPORT-P95" title="Exports stay responsive" priority="should">
  <statement>Export latency stays within budget at production volumes.</statement>
  <metric>p95 &lt; 2s for datasets up to 100k rows.</metric>
</qgoal>

<obstacle id="OBS-EXPORT-MEMORY" title="Large exports exhaust memory" likelihood="medium" severity="high">
  <statement>Buffering a whole dataset before writing exhausts the worker's heap.</statement>
  <mitigation>Stream in chunks; cap the buffer.</mitigation>
</obstacle>

<goalLink id="GL-EXPORT-TENSION" from="QGOAL-EXPORT-P95" to="GOAL-EXPORT" type="conflictsWith" confidence="0.6"/>
```

Under `scenarios` — `scenario`, then `misuseCase`, then `edgeCase`:

<!-- rqml-example: scenarios -->
```xml
<scenario id="SCN-EXPORT-FULL" title="Analyst exports a full dataset" actorRef="ACT-ANALYST">
  <narrative>An analyst picks a dataset, requests a full export, and receives a
  file whose row count matches the dataset.</narrative>
</scenario>

<misuseCase id="MIS-EXPORT-SCRAPE" title="Bulk scraping through the export API">
  <narrative>A credentialed client loops the export endpoint to copy the entire
  corpus faster than any analyst would.</narrative>
</misuseCase>
```

Under `catalogs/glossary`:

<!-- rqml-example: catalogs/glossary -->
```xml
<term id="TERM-CHUNK">
  <name>chunk</name>
  <definition>A bounded batch of rows written as one unit of an export.</definition>
  <synonyms><synonym>batch</synonym></synonyms>
</term>
```

Under `domain/businessRules` — the boundary in `<examples>` is the point of the
element, so state both sides of it:

<!-- rqml-example: domain/businessRules -->
```xml
<rule id="BR-EXPORT-LIMIT">
  <statement>An export of more than 10,000 rows SHALL be streamed, not buffered.</statement>
  <examples>10,000 rows: buffered. 10,001 rows: streamed.</examples>
</rule>
```

Under `domain/entities`:

<!-- rqml-example: domain/entities -->
```xml
<entity id="ENT-EXPORT" name="Export">
  <description>One requested extraction of a dataset.</description>
  <attr id="ATT-EXPORT-ROWS" name="rowCount" type="integer" required="true"/>
  <attr id="ATT-EXPORT-STATE" name="state" type="enum:pending,running,complete,failed" required="true"/>
</entity>
```

The rest of the catalog entries — `actor`, `stakeholder`, `constraint`,
`policy`, `decision`, `risk` — sit beside `glossary` under `catalogs`, each in
its own plural container (`actors`, `stakeholders`, …).

## The fifteen trace types

`rqml link <from> <to> --type <type>` records every one of them; the endpoints
go in the order the direction column gives.

| Type | Direction | Use it when |
|---|---|---|
| `satisfies` | solution → need | a requirement serves a goal or scenario |
| `refines` | more specific → less specific | one artifact details another |
| `implements` | code → requirement | code realizes a requirement |
| `verifiedBy` | requirement → test | a test proves a requirement |
| `covers` | test → requirement | stated from the test's side |
| `dependsOn` | dependent → dependency | one artifact needs another to hold first |
| `conflictsWith` | either → either | both cannot be fully achieved |
| `threatens` | threat → threatened | an obstacle or risk endangers something |
| `mitigates` | mitigation → threat | a requirement or control reduces it |
| `supersedes` | replacement → replaced | a new artifact takes over from an old one |
| `deprecates` | new → retired | stronger than supersedes; the target should go |
| `breaks` | breaking → broken | backward compatibility is knowingly broken |
| `conformsTo` | artifact → standard | compliance to an external standard (use a URI endpoint) |
| `consumesInterface` | consumer → provider | this system uses that contract |
| `providesInterface` | provider → consumer | this system offers that contract |

Four of them drive the gate: `satisfies` (orphan and goal coverage),
`implements` (coverage plus the drift baseline), `verifiedBy` and `covers`
(verification coverage). The other eleven are recorded and traversed by
`rqml impact`, but no finding depends on them — record them because the next
reader needs them, not because something will complain.

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
  `status="draft"` until the developer approves them. That approval is the
  validation step — a person agreeing this is the right requirement — and it is
  theirs to give, not yours to assume.

## Traceability

- Every requirement should `satisfies` a goal or scenario (otherwise it is an
  orphan — the coverage report will say so): `rqml link REQ-X GOAL-Y --type satisfies`.
- `implements` edges run code → requirement; `verifiedBy` runs requirement →
  test. `rqml link` orients these two automatically whichever order you give
  the endpoints, and stores the drift baseline so later edits to a linked file
  are detected. Every other type is recorded exactly from → to.
- Edges you record are stamped `status="draft"` with a `createdBy` identity —
  that is the curation loop: the developer reviews and approves them later, so
  never stamp `--status approved` on your own edges.
- Make the judgment behind an edge inspectable when there is one: `--notes`
  for *why* the relationship holds when it isn't obvious from the two titles,
  `--confidence` when the mapping is partial or inferred, `--tags`
  (e.g. safety, compliance) when a domain filters on them. Skip all three for
  self-evident edges.
- An endpoint's kind follows the shape of its value: a bare id is local, an
  `rqml:<doc-uri>#<id>` reference points into another RQML document (add
  `;version=`, `;git=`, or `;docId=` to pin it), and any other scheme URI or
  relative path containing `/` is an external artifact. A path with no `/`
  needs a `./` prefix or it reads as an id — `rqml link` handles that.

## Finishing

A spec-editing task is done when the document is valid and `rqml check` exits 0
at the project's strictness. Read the findings for what they are:

- **validate** — the document is malformed or internally inconsistent. Fix it
  before anything else; every other reading is unreliable until it is clean.
- **coverage** — a goal has no requirement, or a requirement has no
  satisfies / implements / verifiedBy edge. Either the work is genuinely
  incomplete, or the edge was never recorded.
- **drift** — a linked file changed after its edge was recorded. This is a
  *suspect link*, not a defect: re-read the file, and either update the
  requirement it no longer matches or re-pin the baseline with
  `rqml link --refresh <edge-id>`.

Two words to keep straight. `rqml validate` checks the **document** — schema
conformance and referential integrity. That is not requirements *validation* in
the 29148 sense, which asks whether these are the right requirements at all;
that answer is recorded by a person approving them (`status="approved"`).
So: report that the document is valid, that requirements are approved, that
requirements are verified by tests — and never report "requirements validated"
on the strength of a green check.

## Canonical source and updates

This file is maintained in **rqml-skill** and is the single source of truth.
The rqml-claude and rqml-codex plugins vendor a synced copy and must not edit it
locally — changes made here propagate to them via the rqml-skill craft-sync (see
rqml-skill ADR-0009). Bump `canonical-version` above whenever the content changes.
