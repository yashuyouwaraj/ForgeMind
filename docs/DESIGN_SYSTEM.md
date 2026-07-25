# ForgeMind Design System

> **Design Principles and UI Guidelines**

---

# Overview

The ForgeMind Design System defines the visual language, interaction patterns and reusable components used across the platform.

The objective is to provide a consistent, premium and enterprise-grade user experience while maintaining accessibility, usability and scalability.

Every interface should feel modern, clean and purposeful.

---

# Design Philosophy

ForgeMind follows five core design principles.

## Professional

Every screen should feel suitable for enterprise engineering teams.

---

## Minimal

Only show information that helps users make decisions.

Avoid unnecessary visual noise.

---

## Functional

Every UI element must have a clear purpose.

Decoration should never reduce usability.

---

## Consistent

Spacing, colours, typography and interactions should behave consistently throughout the application.

---

## Fast

The interface should feel responsive through smooth transitions and immediate visual feedback.

---

# Visual Style

ForgeMind combines:

- Modern SaaS
- Soft Glassmorphism
- Minimalism
- Clean Typography

Glass effects should be used only for navigation, floating panels and modal surfaces.

Primary content areas should remain solid for readability.

---

# Colour Palette

## Background

```text
Primary Background

#09090B

Secondary Background

#111827

Surface

#18181B

Elevated Surface

#27272A
```

---

## Glass Surface

```text
Background

rgba(255,255,255,0.08)

Border

rgba(255,255,255,0.12)

Blur

20px
```

---

## Brand

```text
Primary

#3B82F6

Secondary

#2563EB

Accent

#06B6D4
```

---

## Status

```text
Success

#22C55E

Warning

#F59E0B

Error

#EF4444

Info

#3B82F6
```

---

## Text

```text
Primary

#FFFFFF

Secondary

#A1A1AA

Muted

#71717A

Disabled

#52525B
```

---

# Typography

Primary Font

```text
Geist
```

Fallback

```text
Inter
```

Monospace

```text
JetBrains Mono
```

---

# Typography Scale

| Element | Size | Weight |
|----------|------|--------|
| Hero | 56px | Bold |
| H1 | 40px | Bold |
| H2 | 32px | Bold |
| H3 | 24px | SemiBold |
| H4 | 20px | SemiBold |
| Body | 16px | Regular |
| Small | 14px | Regular |
| Caption | 12px | Medium |

---

# Spacing System

Use an 8-point grid.

```text
4px

8px

16px

24px

32px

40px

48px

64px

96px
```

Avoid arbitrary spacing values.

---

# Border Radius

```text
Small

8px

Medium

12px

Large

16px

Extra Large

24px

Pill

999px
```

---

# Shadows

Cards

```text
0 8px 24px rgba(0,0,0,.18)
```

Modal

```text
0 16px 48px rgba(0,0,0,.30)
```

Hover

```text
0 12px 32px rgba(0,0,0,.24)
```

---

# Borders

Every component should use subtle borders.

```css
border: 1px solid rgba(255,255,255,.08);
```

Avoid heavy outlines.

---

# Icons

Use

```text
Lucide React
```

Rules

- 20px default
- 16px inside buttons
- Consistent stroke width

Avoid mixing icon libraries.

---

# Animations

Animation should support usability.

Use:

- Fade
- Scale
- Slide
- Opacity
- Layout transitions

Duration

```text
150ms

200ms

300ms
```

Avoid long animations.

---

# Dashboard Layout

```text
┌───────────────────────────────────────────┐
│ Top Navigation                            │
├───────────────┬───────────────────────────┤
│               │                           │
│               │                           │
│ Sidebar       │ Main Workspace            │
│               │                           │
│               │                           │
├───────────────┴───────────────────────────┤
│ Bottom Status Bar                         │
└───────────────────────────────────────────┘
```

---

# Navigation

Top Navigation

Contains

- Workspace
- Search
- Notifications
- User Profile

Sidebar

Contains

- Dashboard
- Repositories
- Digital Twin
- Architecture
- Runtime
- Impact Analysis
- AI Context
- Reports
- Settings

---

# Cards

Cards are the primary content container.

Properties

- Rounded corners
- Soft shadow
- Thin border
- Optional glass effect
- Consistent padding

---

# Buttons

Variants

- Primary
- Secondary
- Outline
- Ghost
- Danger

Buttons should include hover, focus and disabled states.

---

# Tables

Requirements

- Sticky headers
- Sorting
- Filtering
- Pagination
- Search
- Responsive layout

---

# Graph Visualisation

Technology

- React Flow
- Cytoscape.js

Capabilities

- Zoom
- Pan
- Search
- Node grouping
- Edge highlighting
- Side panel details

---

# Charts

Technology

- Recharts

Supported charts

- Line
- Bar
- Area
- Pie
- Heatmap

Charts should prioritise readability over decoration.

---

# Notifications

Types

- Success
- Error
- Warning
- Information

Notifications should appear unobtrusively and dismiss automatically when appropriate.

---

# Loading States

Every asynchronous action should provide feedback.

Use

- Skeleton loaders
- Progress indicators
- Loading overlays

Avoid blank screens.

---

# Empty States

Every empty page should explain:

- Why the page is empty
- What the user should do next

Include a primary call-to-action.

---

# Accessibility

ForgeMind follows accessibility best practices.

Requirements

- Keyboard navigation
- Visible focus states
- High colour contrast
- Screen reader support
- Semantic HTML
- Accessible form labels

---

# Responsive Design

Supported layouts

Desktop

- Full dashboard

Tablet

- Collapsible sidebar

Mobile

- Simplified navigation
- Responsive tables
- Responsive graphs

---

# Theme

Dark mode is the default experience.

Light mode is available but optional.

Both themes use the same spacing, typography and interaction rules.

---

# Component Naming

Reusable UI components follow the Forge naming convention.

Examples

```text
ForgeButton

ForgeCard

ForgeGlassCard

ForgeSidebar

ForgeModal

ForgeTable

ForgeSearch

ForgeGraph

ForgeBadge

ForgeToast
```

---

# User Experience Principles

Every interaction should answer three questions immediately:

- Where am I?
- What can I do?
- What changed?

The interface should always provide clear feedback after user actions.

---

# Summary

The ForgeMind Design System establishes a consistent visual and interaction language for the platform.

By following these guidelines, every screen, component and workflow maintains the same high standard of usability, accessibility and visual quality, creating a professional product experience that scales as the platform evolves.