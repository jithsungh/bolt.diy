
> **Turn bolt.diy into a Claude-Code-like autonomous coding agent**

then you need a **systematic upgrade roadmap**, not random tweaks. What follows is a concrete engineering plan broken into **phases**, with exact components and why they matter.

This is not optional fluff. Skip pieces and the system degrades fast. ⚠️

---

## 🎯 Target architecture (end state)

Before phases, understand the destination:

```
User request
   ↓
Planner Agent
   ↓
Task Graph
   ↓
Executor Agent ↔ Repo Index ↔ Memory System
   ↓
Execution Sandbox (tests/build/lint)
   ↓
Reviewer Agent
   ↓
Patch Engine → Git Commit
```

Your job is to evolve bolt.diy into this pipeline.

---

## Phase 1 — Repo Intelligence Layer (critical foundation) 🧱

![Image](https://files.readme.io/c6129997d955a02776eddbf17af8f4529d8b9b54b34e8163c0db3065c8e86edd-image.png)

![Image](https://cdn.prod.website-files.com/65ddeabd4e505fecafbdbe93/67dbd045224f5cad323d0dd9_Code%20Review%20Process%20%282%29.png)

![Image](https://images.ctfassets.net/1wryd5vd9xez/1nwvGZf8kTusJRgR5DKAUt/0a6da2819cb20b15c6372860946cbac0/coffee-script.png)

![Image](https://cdn.prod.website-files.com/65d609edcc331dd0e4eb519b/6893f9807ec5f00ec712580c_software%20dependency%20graph.png)

### Goal

Stop blind file editing. Build repo awareness.

### Upgrades needed

#### 1. Semantic repo index

Add:

* AST parsing (Tree-sitter or language server protocol)
* symbol graph (functions/classes/modules)
* embeddings stored in vector DB

Stack suggestion:

* Tree-sitter + SQLite + LanceDB/Chroma
* periodic incremental indexing

#### 2. Context builder

Before every agent step:

* retrieve relevant files
* summarize large modules
* inject architecture notes

This reduces hallucinations massively.

---

### Deliverables

* Repo indexing service
* semantic search API
* automatic context assembly

👉 Without this, everything else is lipstick on a pig.

---

## Phase 2 — Multi-Agent Pipeline 🧠

Single-agent loops plateau. You need role separation.

### Agents to implement

#### Planner Agent

Produces:

* task list
* file targets
* dependency order

Output format:

```
Step 1: Modify auth service
Step 2: Update controller
Step 3: Adjust tests
```

Structured JSON only.

---

#### Executor Agent

Responsibilities:

* generate diffs
* modify minimal code regions
* avoid rewriting whole files

Must operate patch-first, not overwrite-first.

---

#### Reviewer Agent

Acts as internal critic:

* checks logic consistency
* flags risky edits
* suggests fixes

If reviewer fails → loop back to executor.

---

### Deliverables

* agent orchestration engine
* task queue
* retry logic
* evaluation scoring

This is where Claude-like reasoning emerges.

---

## Phase 3 — Execution Feedback Loop 🔁

![Image](https://i.sstatic.net/6ij1g.png)

![Image](https://docs.cloudbees.com/docs/cloudbees-cd/latest/dashboards-built-in/_images/continous-integration.37bbf57.png)

![Image](https://i.sstatic.net/m4rnY.png)

![Image](https://media2.dev.to/dynamic/image/width%3D800%2Cheight%3D%2Cfit%3Dscale-down%2Cgravity%3Dauto%2Cformat%3Dauto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F219faubo3mwhdd3er7gq.jpg)

This is the most important differentiator.

### Build an automated sandbox

Every patch triggers:

* build/compile
* lint/type check
* test run
* error capture

Errors are summarized and fed back to the agent.

Loop:

```
generate → execute → analyze errors → retry
```

Hard limits:

* max retries per task
* timeout protection

---

### Deliverables

* isolated execution container
* structured error parser
* feedback summarizer

Without execution feedback, your agent is guessing.

---

## Phase 4 — Memory System 📚

You want persistent intelligence.

### Two layers

#### Short-term working memory

* conversation compression
* rolling summaries
* active task state

#### Long-term architectural memory

* module summaries
* design decisions
* historical fixes

Store as structured documents + embeddings.

---

### Deliverables

* memory manager
* summarization pipeline
* retrieval integration

This improves reasoning over long sessions.

---

## Phase 5 — Diff Engine & Safety Guardrails 🛡️

Naive editing kills repos.

### Requirements

#### AST-aware patching

* operate on syntax nodes
* preserve formatting
* minimize diffs

#### Safety constraints

* step budget
* forbidden operations list
* rollback checkpoints
* git staging area

If agent goes rogue → auto revert.

---

### Deliverables

* patch validator
* git integration
* rollback system

This prevents catastrophic edits.

---

## Phase 6 — Evaluation & Self-Improvement 📊

You want measurable progress.

### Add:

* task success metrics
* failure categorization
* automated regression tests for the agent
* prompt tuning loop

Treat your agent like software, not magic.

---

## Suggested stack (practical choices)

| Component       | Recommendation               |
| --------------- | ---------------------------- |
| Repo parsing    | Tree-sitter                  |
| Vector DB       | LanceDB or Chroma            |
| Sandbox         | Docker                       |
| Orchestration   | Python + asyncio             |
| Memory store    | SQLite + embeddings          |
| Patch engine    | diff-match-patch + AST tools |
| Agent framework | Extend bolt.diy core         |

Don’t over-engineer early. Ship increments.

---


