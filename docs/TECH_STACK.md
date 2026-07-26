# ForgeMind Technology Stack

> **Technology Choices and Architectural Rationale**

---

# Overview

ForgeMind is built using technologies selected for scalability, maintainability and long-term production readiness.

Every technology is chosen based on its strengths for a specific responsibility rather than popularity.

---

# Architecture Overview

```text
Frontend

↓

API Gateway

↓

Microservices

↓

Event Streaming

↓

Storage

↓

Infrastructure
```

---

# Frontend

## Next.js

Purpose

Frontend application and dashboard.

Why Next.js?

- Excellent routing system
- Server-side rendering
- Optimized performance
- Large ecosystem
- Production ready
- Strong TypeScript support

Alternative Considered

React + Vite

Reason for choosing Next.js

Next.js provides routing, server rendering and production optimizations out of the box, reducing boilerplate while supporting a scalable application structure.

---

## React

Purpose

User interface development.

Why React?

- Component-based architecture
- Large ecosystem
- Mature community
- Excellent tooling

---

## TypeScript

Purpose

Type safety across the platform.

Why?

- Fewer runtime errors
- Better refactoring
- Strong IDE support
- Shared models between frontend and backend

---

## Tailwind CSS

Purpose

Application styling.

Why?

- Utility-first workflow
- Fast development
- Consistent design
- Easy theming

---

## shadcn/ui

Purpose

Accessible UI components.

Why?

- Built on Radix UI
- Fully customizable
- No dependency on external runtime
- Fits enterprise applications

---

## Framer Motion

Purpose

Animations.

Why?

- Smooth transitions
- Layout animations
- Well integrated with React

---

## Zustand

Purpose

Client-side state management.

Why?

- Lightweight
- Minimal boilerplate
- Easy to maintain

Alternative

Redux Toolkit

Reason

ForgeMind does not require the complexity of Redux for global UI state.

---

# Backend

## Express.js

Purpose

API Gateway and backend services.

Why?

- Lightweight
- Flexible
- Minimal abstraction
- Easy microservice development

Alternative

NestJS

Reason

ForgeMind prioritises flexibility and explicit architecture over opinionated frameworks.

---

## Python (FastAPI)

Purpose

AI and intelligence services.

Why?

- Rich ecosystem
- Machine learning libraries
- Graph algorithms
- High performance

---

# Event Streaming

## Apache Kafka

Purpose

Asynchronous communication.

Why?

- High throughput
- Reliable messaging
- Event replay
- Loose coupling
- Industry standard

Alternative

RabbitMQ

Reason

Kafka is better suited for high-volume event streaming and event-driven architectures.

---

# Databases

## PostgreSQL

Purpose

Transactional business data.

Stores

- Users
- Projects
- Organisations
- Settings
- Audit Logs

Why?

- ACID transactions
- Excellent SQL support
- Reliable
- Mature ecosystem

---

## Neo4j

Purpose

Software Knowledge Graph.

Stores

- Services
- APIs
- Dependencies
- Runtime relationships
- Software Digital Twin

Why?

Software relationships naturally form graphs.

Graph traversal is significantly more efficient than recursive relational queries for dependency analysis.

---

## Redis

Purpose

Caching and temporary storage.

Stores

- Sessions
- Cache
- Queue state
- Temporary analysis

Why?

- Extremely low latency
- High throughput
- In-memory performance

---

## Object Storage

Purpose

Large files.

Stores

- Reports
- AI Context Packages
- Repository snapshots
- Generated diagrams

Supported providers

- Amazon S3
- Azure Blob Storage
- MinIO

---

# Repository Parsing

## Tree-sitter

Purpose

Source code parsing.

Why?

- Incremental parsing
- Multi-language support
- Excellent performance

---

# Runtime Observability

## OpenTelemetry

Purpose

Tracing.

Why?

Vendor-neutral observability standard.

---

## Prometheus

Purpose

Metrics collection.

---

## Grafana

Purpose

Dashboards and monitoring.

---

## Loki

Purpose

Log aggregation.

---

# Infrastructure

## Docker

Purpose

Containerisation.

Why?

- Consistent environments
- Easy deployment
- Portable services

---

## Kubernetes

Purpose

Container orchestration.

Why?

- Auto healing
- Scaling
- Rolling updates
- Production ready

---

## NGINX

Purpose

Ingress and reverse proxy.

Responsibilities

- SSL termination
- Routing
- Load balancing

---

# CI/CD

## GitHub Actions

Purpose

Continuous Integration and Deployment.

Responsibilities

- Build
- Test
- Security scanning
- Docker builds
- Deployment

---

# API

REST

Purpose

Client communication.

WebSocket

Purpose

Real-time updates.

Kafka

Purpose

Background processing.

---

# Development Tools

Package Manager

pnpm

---

Build System

Turbo

---

Linting

ESLint

---

Formatting

Prettier

---

Testing

Vitest

Playwright

Jest

---

# Why Polyglot Persistence?

ForgeMind stores different types of data.

| Data          | Technology     |
| ------------- | -------------- |
| Business Data | PostgreSQL     |
| Relationships | Neo4j          |
| Cache         | Redis          |
| Files         | Object Storage |

Each database is used where it performs best.

---

# Why Event-Driven Architecture?

Advantages

- Loose coupling
- Better scalability
- Independent deployments
- Fault isolation
- Asynchronous processing

---

# Why Microservices?

Advantages

- Independent scaling
- Independent deployments
- Clear responsibilities
- Easier maintenance
- Better fault isolation

---

# Technology Summary

| Layer          | Technology              |
| -------------- | ----------------------- |
| Frontend       | Next.js                 |
| UI             | React                   |
| Language       | TypeScript              |
| Styling        | Tailwind CSS            |
| Components     | shadcn/ui               |
| Animation      | Framer Motion           |
| Backend        | Express.js              |
| AI             | Python + FastAPI        |
| Messaging      | Apache Kafka            |
| SQL Database   | PostgreSQL              |
| Graph Database | Neo4j                   |
| Cache          | Redis                   |
| Object Storage | MinIO / S3 / Azure Blob |
| Containers     | Docker                  |
| Orchestration  | Kubernetes              |
| CI/CD          | GitHub Actions          |

---

# Summary

The ForgeMind technology stack is designed around the principle of using the right technology for each responsibility.

Rather than relying on a single framework or database for every workload, the platform combines specialised technologies to provide scalability, maintainability and production readiness while supporting the Software Digital Twin and Software Intelligence Platform.
