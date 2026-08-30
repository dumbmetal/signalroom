# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-24
- Primary product surfaces: Daily report, report archive, source settings
- Evidence reviewed: Empty repository; a16z crypto homepage reference

## Brand
- Personality: Editorial, confident, curious, precise
- Trust signals: Source counts, timestamps, evidence links, health states, explicit uncertainty
- Avoid: Generic SaaS card grids, noisy gradients, fabricated metrics

## Product goals
- Goals: Make emerging conversation themes legible in under a minute; preserve evidence; support daily habit
- Non-goals: Real-time trading terminal, social network, unrestricted web crawler
- Success signals: Report opened daily, topics expanded, source health understood

## Personas and jobs
- Primary personas: Crypto researcher, founder, operator, investor
- User jobs: Scan what matters, compare narratives, trace summaries back to source posts
- Key contexts of use: Morning desktop scan, quick mobile check

## Information architecture
- Primary navigation: Today, Crypto, AI, Archive, Sources
- Core routes/screens: Single-page report shell with view state for today/archive/sources
- Content hierarchy: Date -> section -> lead narrative -> ranked topics -> evidence

## Design principles
- Signal before interface: content headlines carry the page
- Evidence is one click away: every narrative exposes provenance
- Calm density: generous spacing, compact metadata, no visual chrome without meaning

## Visual language
- Color: Warm paper #f4f1eb, ink #151515, citrus yellow for crypto, electric blue for AI
- Typography: Display serif for editorial headlines; neutral sans for controls and metadata
- Spacing/layout rhythm: Wide 12-column desktop canvas, narrow reading measure for summaries
- Shape/radius/elevation: Mostly square, thin ink borders, restrained 2px radii
- Motion: Short accordion transitions; respect reduced motion
- Imagery/iconography: Lucide line icons, no decorative stock imagery

## Components
- Existing components to reuse: None; greenfield
- New/changed components: Masthead, report hero, topic row, source chip, archive item, settings row
- Variants and states: Crypto/AI, open/closed, connected/attention/disabled, loading/empty/error
- Token/component ownership: `src/styles.css` owns tokens; `src/App.tsx` owns page composition

## Accessibility
- Target standard: WCAG 2.1 AA intent
- Keyboard/focus behavior: All controls are buttons/links with visible focus rings
- Contrast/readability: Dark ink on warm paper; accent colors are never sole status signal
- Screen-reader semantics: Main/section/nav landmarks, live report status, descriptive labels
- Reduced motion and sensory considerations: `prefers-reduced-motion` disables transitions

## Responsive behavior
- Supported breakpoints/devices: Desktop, tablet, mobile
- Layout adaptations: Two-column report becomes one column; source rail wraps; masthead controls collapse
- Touch/hover differences: Larger tap targets; hover decoration is optional

## Interaction states
- Loading: Quiet skeleton/status line
- Empty: Explain missing sources and offer setup route
- Error: Per-source error row; report remains usable
- Success: Delivery badge and last-generated timestamp
- Disabled: Unconfigured sources remain visible with setup affordance
- Offline/slow network, if applicable: Preserve last report in local state

## Content voice
- Tone: Clear, compact, observational
- Terminology: Topic, source, evidence, signal, report
- Microcopy rules: Avoid hype; distinguish “high activity” from “high confidence”

## Implementation constraints
- Framework/styling system: Vite + React + TypeScript; CSS tokens, no UI framework
- Design-token constraints: Keep palette and type hierarchy centralized
- Performance constraints: No image dependency for the first release; lazy-expand evidence
- Compatibility constraints: Modern evergreen browsers
- Test/screenshot expectations: Build/typecheck and responsive browser verification

## Open questions
- [ ] Production persistence/provider selection / owner: implementation / impact: backend deployment
- [ ] Credentials and exact source lists / owner: product / impact: live ingestion
