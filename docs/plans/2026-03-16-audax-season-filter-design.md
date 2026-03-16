# Audax Season Filter Design

**Date:** 2026-03-16
**Status:** Approved

## Overview

Add an Audax season filter (Nov–Oct) alongside the existing calendar year filter, mutually exclusive with it. Applies to ActivitiesPage and YearlySummaryPage. RRTY tracking is unaffected (it uses rolling 12-month windows).

## Season Definition

Reuses existing `activitySeason()` in `awards/awards.ts`:
- Nov–Dec belong to the **next** calendar year's season
- Jan–Oct belong to the **current** calendar year's season
- Format: "YYYY-YY" (e.g., "2025-26" = Nov 2025 – Oct 2026)

## ActivitiesPage

### URL Params
- Existing: `?year=2025`
- New: `?season=2025-26`
- Mutually exclusive: selecting a season removes `year` param, selecting a year removes `season` param
- Reset button clears both (already works via clearing all params)

### Season Dropdown
- Populated from unique `activitySeason(a.date)` values across all activities, sorted descending
- Placed next to the existing Year dropdown in Row 1
- Labels match the "YYYY-YY" format from `activitySeason()`

### Filter Logic
- When `seasonFilter !== "all"`: use `activitySeason(a.date) !== seasonFilter` instead of year comparison
- When `yearFilter !== "all"`: existing `d.getFullYear() !== Number(yearFilter)` logic unchanged

## YearlySummaryPage

### Year/Season Toggle
- A toggle (e.g., "Year | Season" buttons) above the selector buttons
- Switches the selector buttons between calendar years and seasons
- Default: calendar year mode (no behavior change on load)

### Season Mode
- Selector buttons populated from unique seasons derived via `activitySeason()`
- Activity grouping uses `activitySeason()` instead of `getFullYear()`
- Comparison table (when enabled) compares seasons instead of years

## Out of Scope
- RRTY display/tracking (already uses rolling 12-month windows, not season-bound)
- Backend changes (all filtering is client-side)
