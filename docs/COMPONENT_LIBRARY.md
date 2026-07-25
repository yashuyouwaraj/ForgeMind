# Forge UI Component Library

> **Reusable Design System Components for ForgeMind**

---

# Overview

Forge UI is the internal design system used throughout ForgeMind.

Every interface is built using reusable components that provide a consistent visual language, interaction model and developer experience.

The goal is to ensure every page looks and behaves consistently.

---

# Design Principles

Every component should be:

- Reusable
- Accessible
- Responsive
- Themeable
- Animated
- Typed
- Well documented

---

# Component Categories

```text
Layout

Navigation

Forms

Feedback

Data Display

Graph Components

Repository Components

Runtime Components

Digital Twin Components
```

---

# Layout Components

## ForgeAppShell

Purpose

Application layout wrapper.

Contains

- Sidebar
- Top Navigation
- Main Content
- Status Bar

---

## ForgePage

Purpose

Standard page container.

Features

- Page title
- Actions
- Breadcrumb
- Responsive spacing

---

## ForgeSection

Purpose

Logical grouping of content.

---

## ForgeCard

Purpose

Primary content container.

Variants

- Default
- Elevated
- Glass
- Interactive

Properties

- Header
- Content
- Footer
- Loading

---

## ForgeGlassCard

Purpose

Glassmorphism container.

Use only for:

- Floating panels
- Modals
- Side panels
- Dashboard widgets

Avoid using glass cards for every component.

---

# Navigation Components

## ForgeSidebar

Contains

- Navigation Items
- Collapse Button
- Workspace Selector

---

## ForgeTopbar

Contains

- Search
- Notifications
- Profile
- Theme Switcher

---

## ForgeBreadcrumb

Displays page hierarchy.

---

## ForgeTabs

Variants

- Underline
- Pill
- Segmented

---

# Form Components

## ForgeButton

Variants

- Primary
- Secondary
- Outline
- Ghost
- Danger

States

- Default
- Hover
- Focus
- Loading
- Disabled

Sizes

- Small
- Medium
- Large

---

## ForgeInput

Features

- Label
- Placeholder
- Validation
- Error Message
- Prefix
- Suffix

---

## ForgeTextarea

Supports

- Auto resize
- Character counter

---

## ForgeSelect

Supports

- Search
- Multi-select
- Groups

---

## ForgeCheckbox

Supports

- Single
- Group

---

## ForgeSwitch

Used for boolean settings.

---

# Feedback Components

## ForgeToast

Types

- Success
- Error
- Warning
- Information

---

## ForgeModal

Sizes

- Small
- Medium
- Large
- Fullscreen

---

## ForgeDrawer

Slides from

- Right
- Left
- Bottom

---

## ForgeConfirmDialog

Used for destructive actions.

Examples

- Delete Repository
- Remove User
- Reset Analysis

---

# Data Components

## ForgeTable

Features

- Sorting
- Filtering
- Pagination
- Column resizing
- Row selection

---

## ForgeBadge

Variants

- Primary
- Success
- Warning
- Error
- Neutral

---

## ForgeAvatar

Supports

- User
- Team
- Repository

---

## ForgeTimeline

Used for

- Repository History
- Deployments
- Runtime Events

---

## ForgeStatCard

Displays

- KPI
- Trend
- Icon
- Percentage Change

---

# Search Components

## ForgeSearch

Supports

- Global search
- Filters
- Suggestions
- Keyboard navigation

---

## ForgeCommandPalette

Shortcut

Ctrl + K

Capabilities

- Search pages
- Search repositories
- Execute actions

---

# Graph Components

## ForgeGraph

Purpose

Interactive graph visualisation.

Technology

React Flow

Supports

- Zoom
- Pan
- Search
- Grouping
- Node selection

---

## ForgeDependencyGraph

Displays

- Dependencies
- Service relationships
- API connections

---

## ForgeArchitectureGraph

Displays

- System architecture
- Services
- Infrastructure

---

# Repository Components

## RepositoryCard

Displays

- Name
- Languages
- Frameworks
- Status
- Last Scan

Actions

- Open
- Sync
- Export

---

## RepositoryStatus

Shows

- Analysing
- Synced
- Failed
- Updating

---

## LanguageBadge

Displays detected programming language.

Examples

- Java
- TypeScript
- Python
- Go

---

# Digital Twin Components

## DigitalTwinViewer

Displays

- Components
- Relationships
- Runtime state

---

## DependencyViewer

Displays

- Incoming dependencies
- Outgoing dependencies

---

## ImpactViewer

Displays

- Blast Radius
- Risk Score
- Recommendations

---

# Runtime Components

## RuntimeHealthCard

Displays

- CPU
- Memory
- Latency
- Errors

---

## DeploymentTimeline

Displays deployment history.

---

## IncidentTimeline

Displays production incidents.

---

# Loading Components

## ForgeSkeleton

Used for

- Cards
- Tables
- Graphs
- Lists

---

## ForgeSpinner

Small loading indicator.

---

## ForgeProgress

Displays long-running operations.

Examples

- Repository Import
- Analysis
- Export

---

# Animation Guidelines

Use animations for:

- Hover
- Navigation
- Modals
- Notifications
- Layout changes

Avoid unnecessary animation.

Recommended duration

150–300 ms

---

# Accessibility

Every component must support:

- Keyboard navigation
- Focus indicators
- Screen readers
- ARIA attributes
- High contrast
- Reduced motion preferences

---

# Theme Support

Every component supports:

- Dark Mode
- Light Mode

No component should hard-code colours.

---

# Naming Convention

Every reusable component uses the Forge prefix.

Examples

```text
ForgeButton

ForgeCard

ForgeTable

ForgeSidebar

ForgeGraph

ForgeModal

ForgeBadge

ForgeToast

ForgeInput

ForgeTimeline
```

---

# Folder Structure

```text
packages/ui/

buttons/

cards/

forms/

navigation/

graphs/

tables/

feedback/

layout/

hooks/

styles/

icons/

index.ts
```

---

# Component Development Rules

- One responsibility per component.
- Fully typed with TypeScript.
- Reusable before custom.
- Responsive by default.
- Accessible by default.
- Unit tested.
- Documented with Storybook.

---

# Summary

Forge UI provides the reusable building blocks that power every screen in ForgeMind.

By standardising components, interactions and styling, the platform maintains a consistent, scalable and professional user experience while reducing duplication and improving development speed.