---
name: web-service-ui-ux
description: Use when designing, revising, or reviewing the UI/UX of a browser-based web service, dashboard, demo site, or AI web app. This skill captures the user's preferred direction: presentation-friendly layouts, clear status visibility, focused task flows, Traditional Chinese (Taiwan) wording, bold but disciplined visual design, and practical operator-first interactions instead of generic SaaS chrome.
---

# Web Service UI/UX

This skill captures the user's preferred approach for building web-service UI/UX.

Use it when the task involves:

- Designing a new web page, dashboard, landing page, or feature page
- Revising UI structure, copy, or interaction flow
- Reviewing whether a page feels too generic, too busy, or too unclear
- Building demo-oriented AI tooling, operator consoles, or browser-based control panels

## Default Direction

Design for clarity first, then atmosphere.

The preferred UI is:

- Presentation-friendly, but still usable by an operator during live interaction
- Visually intentional, not a generic SaaS dashboard clone
- Status-driven, with key runtime or system state visible early
- Focused on one main job per page
- Written in Traditional Chinese used in Taiwan when the product is user-facing
- Simple enough to understand quickly in a demo, but not visually bland

## Core Principles

### 1. Start from task flow, not decoration

Each page should answer three questions quickly:

- What is this page for?
- What can I do right now?
- Is the system currently ready?

The first screen should expose purpose, primary action, and current status without requiring scrolling or explanation.

### 2. Prefer explicit state over hidden logic

If the service depends on runtime state, model state, server state, GPU state, queue state, or device availability, show that directly in the UI.

Good patterns:

- A hero/status band with 2-4 critical indicators
- Runtime cards that show current model, device, or stream source
- Clear loading, restarting, unloading, recording, processing, and completed states

Avoid:

- Burying critical state in logs only
- Making the user guess whether a button is safe to press
- Silent failures or stalled screens with no visible progress

### 3. One page, one dominant job

Prefer a structure where:

- Home page acts as a navigation and system overview hub
- Feature pages each focus on one mode or workflow
- Secondary tools stay nearby, but do not compete with the primary interaction

Examples:

- Home: system summary, model management, entry points
- Voice page: recording, transcript, response, audio playback
- Vision page: image input, prompt, result, presets
- Detection page: source selection, live result, metrics

### 4. Demo-safe beats feature-dense

When there is tension between "more capability" and "cleaner live operation", prefer cleaner live operation.

The user values interfaces that:

- Are easy to explain verbally
- Are hard to misuse during a presentation
- Recover gracefully from slow startup or heavy model loading
- Keep important controls visible and understandable

### 5. Bold, but disciplined visuals

The user does not want bland AI-generated layout patterns.

Preferred visual traits:

- Strong visual hierarchy
- Clear section rhythm with cards, panels, and grouped actions
- Background depth through gradients, glow, texture, or layered surfaces
- A deliberate accent color strategy instead of default purple-on-white
- Typography that feels chosen, not accidental

Avoid:

- Flat default enterprise styling
- Random decorative effects with no hierarchy benefit
- Overcrowded glassmorphism everywhere
- Too many equally prominent cards on first view

### 6. Preserve established patterns when extending an existing product

If a project already has a visual language, extend it instead of replacing it casually.

Preserve where possible:

- Existing card geometry
- Existing spacing rhythm
- Existing status presentation model
- Existing naming and wording conventions
- Existing page roles and user expectations

Only introduce a stronger new art direction if the user is clearly asking for a redesign.

## Information Architecture Preferences

Use this order by default:

1. Purpose
2. Current system status
3. Primary action area
4. Supporting controls
5. Output or result area
6. Examples, presets, or guidance

For home pages, use:

1. Hero with product purpose
2. System or runtime status
3. Navigation cards into major workflows
4. Operational detail cards if needed

For feature pages, use:

1. Feature hero with concise explanation
2. Runtime/status summary
3. Main workspace
4. Right-side or lower supporting stack
5. Result and troubleshooting feedback

## Interaction Preferences

### Primary actions

Make the main action obvious and singular.

Examples:

- Start recording
- Analyze image
- Open demo page
- Load model
- Restart service

Primary controls should look intentionally primary. Destructive or expensive actions should be visually distinct.

### Async operations

For any action that takes time, always provide:

- Immediate acknowledgement
- In-progress status text
- Completion feedback
- Error feedback with a next step

Do not leave the user staring at a frozen button.

### Presets and shortcuts

Presets are welcome when they help a demo or speed onboarding.

Good preset design:

- Show a small set of meaningful scenarios
- Name them by outcome, not internal implementation
- Let users trigger a complete happy-path example quickly

### New-window behavior

If the product is a control hub that opens specialized tools, opening feature pages separately is acceptable when it supports demo flow and reduces context switching confusion.

## Copywriting Preferences

When the UI is user-facing, prefer Traditional Chinese used in Taiwan.

Tone:

- Direct
- Calm
- Practical
- Confident without marketing fluff

Prefer labels that describe user intent or system state clearly.

Good examples:

- 目前模型
- 系統狀態
- 重新啟動中
- 影像分析結果
- 開始語音互動

Avoid:

- Overly technical internal jargon as primary labels
- China-variant wording when Taiwan wording is intended
- Empty hype language that does not help operation

## Layout Heuristics

Use these patterns by default:

- Hero + status cards for top-of-page orientation
- Two-column workspace when the task has input on one side and supporting context on the other
- Card-based grouping for related controls
- A dedicated result surface instead of scattering outputs across the page

Responsive behavior:

- Desktop can prioritize live-demo readability and operator efficiency
- Mobile still needs to work, but should simplify stacking rather than preserve every desktop arrangement
- On narrow screens, collapse columns cleanly into a clear top-to-bottom task order

## Visual Guardrails

Before finalizing a UI, check:

- Is the first screen immediately understandable?
- Is the primary action obvious?
- Are critical statuses visible?
- Does the page look intentional rather than generic?
- Is there unnecessary clutter competing with the main workflow?
- Does the copy match Traditional Chinese (Taiwan) usage if applicable?

If the answer to any of these is no, simplify before adding more.

## Preferred Review Lens

When reviewing a UI/UX implementation for this user, prioritize:

1. Confusing task flow
2. Missing status visibility
3. Weak primary action hierarchy
4. Generic or mismatched visual direction
5. Copy that is not presentation-friendly or not aligned with Taiwan Traditional Chinese
6. Mobile collapse that breaks comprehension

## When Working In This Repository

For this repository specifically, assume these preferences unless the user says otherwise:

- The UI should stay simple and presentation-friendly
- Traditional Chinese wording should be preserved in user-facing copy
- Home should work as a control-and-navigation hub
- Feature pages should stay mode-specific
- Runtime, model, and device status should remain visible
- Changes should improve clarity and confidence before adding novelty

If you redesign a page here, keep the existing "hero + status + workspace cards" mental model unless the user explicitly wants a bigger departure.
