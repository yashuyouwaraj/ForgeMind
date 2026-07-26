# Architecture Decisions

> **Architecture Decision Records (ADR)**

---

# Overview

This document records the major architectural decisions made during the development of ForgeMind.

Each Architecture Decision Record (ADR) explains why a specific technology, pattern or approach was selected, along with the alternatives that were considered.

The goal is to document the reasoning behind important technical choices and provide context for future contributors.

---

# ADR-001

## Title

Microservices Architecture

### Status

Accepted

---

### Context

ForgeMind performs multiple independent responsibilities including:

- Repository analysis
- Parsing
- Semantic analysis
- Knowledge Graph generation
- Runtime processing
- AI Context generation

Each responsibility has different scalability and performance requirements.

---

### Decision

ForgeMind will use a microservices architecture where each major capability is implemented as an independent service.

---

### Consequences

Advantages

- Independent deployments
- Independent scaling
- Better fault isolation
- Clear service ownership
- Easier long-term maintenance

Trade-offs

- Increased operational complexity
- Service communication overhead
- More deployment infrastructure

---

# ADR-002

## Title

Express.js for Backend Services

### Status

Accepted

---

### Context

ForgeMind requires lightweight backend services with minimal framework restrictions.

---

### Decision

Express.js is used for the API Gateway and backend services.

---

### Alternatives Considered

- NestJS
- Fastify

---

### Rationale

Express.js provides complete flexibility and a minimal abstraction layer, making it easier to build custom service architectures.

---

# ADR-003

## Title

Next.js for Frontend

### Status

Accepted

---

### Context

The frontend requires routing, server-side rendering and production-ready optimisations.

---

### Decision

Use Next.js for the web application.

---

### Alternatives Considered

- React + Vite
- Remix

---

### Rationale

Next.js provides an excellent developer experience, strong TypeScript support and a mature ecosystem suitable for enterprise applications.

---

# ADR-004

## Title

Universal Intermediate Representation (UIR)

### Status

Accepted

---

### Context

ForgeMind must support repositories written in multiple programming languages.

Building separate intelligence engines for each language would significantly increase complexity.

---

### Decision

All supported languages are transformed into a Universal Intermediate Representation before intelligence processing.

---

### Consequences

Benefits

- Language-independent analysis
- Reusable intelligence engine
- Easier language support
- Consistent software model

---

# ADR-005

## Title

Software Knowledge Graph

### Status

Accepted

---

### Context

Software systems consist of highly connected entities and relationships.

Representing these relationships in a relational database would require complex recursive queries.

---

### Decision

Represent software relationships using a graph model.

---

### Technology

Neo4j

---

### Benefits

- Efficient graph traversal
- Better dependency analysis
- Natural relationship modelling
- Faster impact analysis

---

# ADR-006

## Title

Software Digital Twin

### Status

Accepted

---

### Context

Static repository analysis becomes outdated as software evolves.

ForgeMind requires a continuously updated understanding of software systems.

---

### Decision

Maintain a Software Digital Twin that synchronises repository, runtime and infrastructure changes.

---

### Benefits

- Live software understanding
- Runtime correlation
- Continuous synchronisation
- Better engineering insights

---

# ADR-007

## Title

Apache Kafka

### Status

Accepted

---

### Context

Repository analysis contains long-running background processes.

Synchronous communication would tightly couple services and reduce scalability.

---

### Decision

Use Apache Kafka for asynchronous communication between services.

---

### Alternatives Considered

- RabbitMQ
- Redis Streams

---

### Benefits

- Event-driven architecture
- High throughput
- Event replay
- Independent services

---

# ADR-008

## Title

Polyglot Persistence

### Status

Accepted

---

### Context

ForgeMind manages several categories of data with different access patterns.

No single database is ideal for every workload.

---

### Decision

Use multiple storage technologies based on responsibility.

---

### Storage Strategy

| Storage        | Responsibility  |
| -------------- | --------------- |
| PostgreSQL     | Business data   |
| Neo4j          | Knowledge Graph |
| Redis          | Cache           |
| Object Storage | Large files     |

---

### Benefits

- Better performance
- Simpler data models
- Scalability
- Clear data ownership

---

# ADR-009

## Title

Tree-sitter Parsing

### Status

Accepted

---

### Context

ForgeMind must support parsing repositories written in multiple programming languages.

---

### Decision

Use Tree-sitter as the primary parsing engine where supported.

Language-specific parsers may be used when additional semantic information is required.

---

### Benefits

- Incremental parsing
- High performance
- Multi-language support
- Active ecosystem

---

# ADR-010

## Title

Incremental Analysis

### Status

Accepted

---

### Context

Rebuilding the entire Software Digital Twin after every repository change would be inefficient.

---

### Decision

Only modified components are re-analysed.

---

### Benefits

- Faster updates
- Lower resource usage
- Better scalability
- Improved user experience

---

# ADR Lifecycle

Every architecture decision follows the same lifecycle.

```text
Proposal

↓

Technical Discussion

↓

Evaluation

↓

Decision

↓

Implementation

↓

Review
```

---

# Decision Principles

Architecture decisions should:

- Solve a real engineering problem.
- Consider alternative approaches.
- Be documented before implementation.
- Prioritise maintainability.
- Support long-term scalability.
- Be revisited when requirements change.

---

# Summary

Architecture Decision Records document the reasoning behind ForgeMind's technical choices.

Maintaining these records ensures that future contributors understand not only **what** decisions were made, but also **why** they were made, promoting consistency and informed evolution of the platform.
