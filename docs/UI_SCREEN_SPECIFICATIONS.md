# UI Screen Specifications

> **ForgeMind User Interface Blueprint**

---

# Overview

This document defines every major screen within ForgeMind.

Each screen includes:

- Purpose
- Primary Components
- User Actions
- API Dependencies
- Loading States
- Empty States
- Error States

The goal is to ensure a consistent user experience across the platform.

---

# Application Navigation

```text
Dashboard

Repositories

Repository Details

Architecture

Software Digital Twin

Knowledge Graph

Runtime Intelligence

Impact Analysis

AI Context Export

Reports

Settings
```

---

# Dashboard

## Purpose

Provide a high-level overview of all projects and platform activity.

---

## Components

- Welcome Header
- Search Bar
- Recent Repositories
- Analysis Status
- Active Projects
- Runtime Health
- Recent Activity
- Quick Actions

---

## Quick Actions

- Import Repository
- View Reports
- Start Analysis
- Export AI Context

---

## API Calls

```text
GET /projects

GET /repositories

GET /runtime

GET /analysis
```

---

## Empty State

Display

> No repositories have been added.

Button

> Import Repository

---

## Loading

Skeleton cards.

---

# Repository Explorer

## Purpose

Browse repositories.

---

## Components

- Search
- Filters
- Repository Cards
- Language Badge
- Status Badge
- Last Updated
- Import Button

---

## Actions

- Open Repository
- Synchronize
- Delete
- Export

---

## API

```text
GET /repositories

POST /repositories
```

---

# Repository Details

## Purpose

View repository information.

---

## Components

- Repository Header
- Technology Stack
- Languages
- Frameworks
- Dependencies
- Analysis Status
- Tabs

Tabs

- Overview
- Architecture
- Runtime
- Digital Twin
- Impact
- Reports

---

## API

```text
GET /repositories/:id
```

---

# Architecture

## Purpose

Visualize system architecture.

---

## Components

- Interactive Graph
- Service List
- Dependency Tree
- Search
- Filters
- Details Panel

---

## User Actions

- Zoom
- Pan
- Search
- Click Node
- Highlight Dependencies

---

## API

```text
GET /architecture
```

---

# Software Digital Twin

## Purpose

Explore the Digital Twin.

---

## Components

- System Overview
- Software Graph
- Runtime State
- Infrastructure
- Timeline
- Dependencies

---

## User Actions

- Select Node
- View Metadata
- Navigate Relationships

---

## API

```text
GET /digital-twin
```

---

# Knowledge Graph

## Purpose

Visualize software relationships.

---

## Components

- Graph
- Search
- Filters
- Node Inspector
- Relationship Viewer

---

## User Actions

- Expand Node
- Collapse Node
- Highlight Paths

---

## API

```text
GET /graph
```

---

# Runtime Intelligence

## Purpose

Monitor runtime behaviour.

---

## Components

- Service Health
- CPU Usage
- Memory Usage
- Logs
- Traces
- Deployments

---

## API

```text
GET /runtime
```

---

# Change Impact Analysis

## Purpose

Predict software impact.

---

## Components

- Changed Component
- Risk Score
- Blast Radius
- Affected Services
- Recommendations

---

## User Actions

- Run Analysis
- Export Report

---

## API

```text
POST /impact
```

---

# AI Context Export

## Purpose

Generate AI-ready project intelligence.

---

## Components

- Export Format
- Included Sections
- Download Button
- Export History

Formats

- Markdown
- JSON
- PDF
- GraphML

---

## API

```text
POST /export
```

---

# Reports

## Purpose

View generated reports.

---

## Components

- Report List
- Search
- Download
- Delete

---

## API

```text
GET /reports
```

---

# Settings

## Purpose

Configure the application.

---

## Sections

General

Repositories

Notifications

Users

Security

Appearance

API Keys

Plugins

About

---

## API

```text
GET /settings

PUT /settings
```

---

# Global Components

Every page uses these shared components.

- Sidebar
- Top Navigation
- Command Palette
- Search
- Notifications
- User Menu
- Breadcrumbs
- Loading Skeleton
- Toast
- Modal

---

# Loading States

Every page must display loading placeholders while data is being fetched.

Use:

- Skeleton Cards
- Skeleton Tables
- Skeleton Graphs

Never display empty white space.

---

# Empty States

Every page should explain why no data is available and provide a clear next action.

Example:

No repositories available.

[ Import Repository ]

---

# Error States

Every page should display meaningful errors.

Example:

Unable to load repository.

[ Retry ]

---

# Responsive Behaviour

Desktop

- Full dashboard
- Sidebar expanded

Tablet

- Collapsible sidebar

Mobile

- Bottom navigation
- Simplified tables
- Responsive graphs

---

# Keyboard Shortcuts

Global shortcuts:

Ctrl + K

Open Command Palette

---

Ctrl + /

Open Search

---

Esc

Close Dialog

---

Ctrl + Shift + E

Export AI Context

---

# Design Goals

Every screen should be:

- Fast
- Clean
- Explainable
- Responsive
- Accessible
- Consistent

The interface should help engineers understand software, not overwhelm them with information.

---

# Summary

The UI specifications define the functional blueprint for every screen in ForgeMind.

Following these specifications ensures a consistent user experience while providing a clear implementation guide for frontend development.
