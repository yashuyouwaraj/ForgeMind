 <div align="center">

# ForgeMind

### Universal Software Intelligence Platform

**Understand Software. Not Just Code.**

Transform repositories into a living Software Digital Twin that will connect architecture, dependencies, runtime behaviour, and engineering knowledge.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-Backend-green.svg)
![pnpm](https://img.shields.io/badge/pnpm-Workspace-F69220.svg)
![Kafka](https://img.shields.io/badge/Apache_Kafka-Event--Driven-black.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Workflow_Storage-336791.svg)
![Neo4j](https://img.shields.io/badge/Neo4j-Graph_Architecture-008CC1.svg)

**Status: Active Development — Foundation and Repository Intelligence**

</div>

---

## Overview

ForgeMind is a Universal Software Intelligence Platform designed to help engineering teams understand complex software systems.

Rather than treating a repository as a collection of files, ForgeMind is being built to create a structured, evolving model of software architecture, dependencies, and behaviour.

Its long-term objective is to help developers understand unfamiliar systems, trace dependencies, assess the impact of changes, and export reusable engineering context for people and AI-assisted workflows.

ForgeMind is not an IDE, Git hosting platform, generic chatbot, or wrapper around a commercial LLM API. Its core intelligence is designed around deterministic software analysis, explicit relationships, traceable evidence, and a language-independent software model.

## Why ForgeMind?

Modern software systems span multiple languages, frameworks, services, databases, APIs, containers, infrastructure, and deployment pipelines.

Understanding a large system often requires engineers to piece together information from disconnected tools and repositories.

ForgeMind aims to connect that information through a consistent processing pipeline, enabling software knowledge to be built, queried, and updated as repositories evolve.

## Core Capabilities

The platform is designed around these capabilities:

- **Repository Intelligence** — register repositories and coordinate repository operations.
- **Multi-language Analysis** — discover source files and parse supported languages through extensible language integrations.
- **Universal Intermediate Representation (UIR)** — normalize language-specific analysis into a canonical software model.
- **Software Knowledge Graph** — represent components and their relationships.
- **Software Digital Twin** — maintain a structured representation of the software system.
- **Change Impact Analysis** — trace dependencies and identify potentially affected components.
- **Runtime Intelligence** — correlate runtime evidence with software architecture.
- **Software Reasoning Engine** — explain conclusions using graph relationships, engineering rules, and evidence.
- **AI Context Export** — produce reusable, structured software context for engineering workflows.
- **Plugin System** — extend language, framework, integration, and visualization support.

These are platform capabilities at different stages of implementation; the list describes the product direction, not a claim that every capability is already operational.

## Architecture

ForgeMind preserves a canonical processing pipeline:

```text
Repository
    |
    v
Repository Operations
    |
    v
Parser
    |
    v
Semantic Analysis
    |
    v
Universal Intermediate Representation (UIR)
    |
    v
Software Knowledge Graph
    |
    v
Software Digital Twin
    |
    v
Software Reasoning Engine
    |
    v
Impact Analysis | Search | Reports | AI Context Export
```

Apache Kafka provides asynchronous communication between services where event-driven processing is appropriate. PostgreSQL supports transactional data and workflow persistence; Neo4j is the planned graph store for software relationships.

The pipeline represents the intended end-to-end architecture. The complete repository-to-Digital-Twin flow is still under development.

## Current Implementation

### Seven-service monorepo

ForgeMind uses a pnpm workspace organized around independently structured services, shared packages, applications, and infrastructure.

| Service | Responsibility | Current implementation status |
|---|---|---|
| `api-gateway` | API entry point and request routing | Initial service infrastructure |
| `auth-service` | Authentication and identity-related operations | Foundation implemented; broader integration remains |
| `project-service` | Project management | Foundation implemented; broader integration remains |
| `repository-service` | Repository registration and repository events | Registration and outbox infrastructure |
| `git-service` | Repository clone, synchronization, and Git event handling | Core operations and Kafka event handling implemented |
| `parser-service` | Source discovery, parsing, and parsing events | Parser components and Kafka worker implemented |
| `workflow-orchestrator` | Workflow lifecycle and persistent execution state | Domain, PostgreSQL persistence, and concurrency tests implemented |

Service maturity varies. Having a service in the workspace does not imply that its complete production feature set is finished.

### Verified engineering milestones

The latest local development checkpoints include:

- `07d6a59` — `feat(parser-service): add Kafka repository parsing worker`
- `97e8bc3` — `feat(workflow-orchestrator): add persistent workflow state`

The parser-service build and typecheck passed, with **30 automated tests passing** at the latest recorded verification.

The workflow-orchestrator foundation includes a persistent workflow model, Prisma schema and migration, optimistic concurrency protection, and automated tests. Its PostgreSQL integration test has also passed in the recorded development run.

The next major milestone is to verify the complete service-to-service workflow, including event delivery, retry and recovery behaviour, duplicate-event handling, and correct repository revision processing.

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand
- TanStack Query

### Backend and Services

- Node.js
- TypeScript
- Express.js
- Prisma
- Zod-based validation where applicable

### Repository Analysis

- Tree-sitter
- Extensible language registry
- Bounded source discovery and parsing
- Kafka-driven parsing worker

### Data and Messaging

- PostgreSQL — transactional and workflow persistence
- Neo4j — software knowledge graph architecture
- Redis — caching and coordination architecture
- Apache Kafka — asynchronous event-driven communication

### Infrastructure and Tooling

- pnpm workspaces
- Turborepo
- TypeScript project builds
- Vitest
- Docker-based development infrastructure

Kubernetes, full production deployment, and complete CI/CD are roadmap concerns rather than claims of a finished production deployment.

## Repository Structure

```text
forgemind/
├── apps/                    # Frontend applications
├── services/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── project-service/
│   ├── repository-service/
│   ├── git-service/
│   ├── parser-service/
│   └── workflow-orchestrator/
├── packages/                # Shared packages and contracts
├── infrastructure/          # Infrastructure configuration
├── docs/                    # Product and architecture documentation
├── .ai/                     # Machine-readable project context
├── assets/                  # Design assets
├── specs/                   # Technical specifications
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Some directories may be under active development. The repository contents remain the source of truth for what is currently implemented.

## Development Roadmap

### Phase 1 — Platform Foundation

- [x] Establish the pnpm monorepo and shared-package architecture.
- [x] Define product, architecture, and design specifications.
- [x] Establish initial API, authentication, project, and repository service foundations.
- [ ] Complete and verify workspace-wide build, lint, test, and CI workflows.

### Phase 2 — Repository Intelligence

- [x] Implement repository registration and initial event/outbox infrastructure.
- [x] Implement Git clone and synchronization operations.
- [x] Implement bounded source discovery and a language registry.
- [x] Add the Kafka-based parser worker and parsing outcome events.
- [x] Establish persistent workflow state and concurrency protection.
- [ ] Verify repository import → synchronization → parsing end to end.
- [ ] Harden revision consistency, retries, idempotency, and workflow recovery.
- [ ] Expand language, framework, and build-tool detection.

### Phase 3 — Semantic Analysis and UIR

- [ ] Extract semantic entities and relationships from parsed source.
- [ ] Define and validate the canonical UIR contract.
- [ ] Preserve source traceability and repository revision metadata.
- [ ] Add deterministic semantic-analysis tests.

### Phase 4 — Software Knowledge Graph

- [ ] Persist validated UIR relationships to Neo4j.
- [ ] Implement graph updates and consistency checks.
- [ ] Support dependency traversal and graph queries.

### Phase 5 — Software Digital Twin

- [ ] Assemble repository, graph, configuration, and runtime evidence.
- [ ] Track software state by repository revision.
- [ ] Support incremental updates.

### Phase 6 — Reasoning and Impact Analysis

- [ ] Implement evidence-backed graph traversal and engineering rules.
- [ ] Generate explainable dependency and change-impact results.
- [ ] Validate conclusions against known software relationships.

### Phase 7 — Runtime Intelligence and Enterprise Readiness

- [ ] Integrate runtime telemetry with software entities.
- [ ] Add operational observability and failure-recovery verification.
- [ ] Harden authentication, authorization, tenant isolation, and auditability.
- [ ] Complete CI/CD, deployment automation, and production-readiness checks.

### Phase 8 — Dashboard and AI Context Export

- [ ] Connect the dashboard to implemented service APIs.
- [ ] Visualize repositories, architecture, dependencies, and analysis progress.
- [ ] Export versioned, reusable software context.
- [ ] Expand the plugin and integration ecosystem.

## Engineering Principles

ForgeMind is being developed with the following principles:

- **Deterministic analysis:** engineering conclusions should be based on explicit analysis and evidence.
- **Language independence:** downstream intelligence consumes UIR rather than language-specific syntax.
- **Evidence-backed reasoning:** never invent software dependencies or relationships.
- **Event-driven boundaries:** use asynchronous events to reduce unnecessary service coupling.
- **Reliable workflows:** support persistent state, concurrency control, retry handling, and recovery.
- **Modularity:** keep service responsibilities clear and reuse shared contracts.
- **Extensibility:** add languages, frameworks, parsers, and integrations through defined extension points.
- **AI independence:** commercial LLM APIs are optional interfaces, not platform dependencies.
- **Production quality:** test behaviour, validate inputs, protect secrets, and verify operational assumptions.

## Documentation

ForgeMind maintains detailed product and engineering documentation, including:

- `ForgeMind_Master_Documentation.md`
- `ForgeMind_AI_Context.json`
- `ARCHITECTURE_DECISIONS.md`
- `TECH_STACK.md`
- `DESIGN_SYSTEM.md`
- `COMPONENT_LIBRARY.md`
- `UI_SCREEN_SPECIFICATIONS.md`
- `PROJECT_STATUS.md`

These documents define the intended product and architecture. Implementation status should be updated separately as features are completed and verified.

## Contributing

Contributions are welcome as the platform evolves.

Before proposing architectural changes, review the existing specifications, service boundaries, shared event contracts, and engineering decisions. Prefer extending existing components over introducing duplicate services or parallel workflows.

## License

ForgeMind is licensed under the MIT License. See [LICENSE](LICENSE) for details.

<div align="center">

### ForgeMind

**Universal Software Intelligence Platform**

**Understand Software. Not Just Code.**

</div>
