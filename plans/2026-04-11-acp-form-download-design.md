# ACP Form Download — Design Spec

**Date:** 2026-04-11  
**Scope:** R5000 form download (R10000 to follow as separate PR). Audax Ireland claim emails tracked in issue #30.

---

## Overview

Add the ability to download a pre-filled ACP Randonneur 5000 application form (`.docx`) directly from the app. The form is generated client-side using `docxtemplater` with a tagged `.docx` template derived from the official ACP English form. A new Profile page stores the rider's personal information locally (never synced).

---

## 1. Data Layer

### New Dexie table: `profile`

Single-row table, always keyed by `id: 1`.

```ts
interface RiderProfile {
  id: 1;
  lastName: string;
  firstName: string;
  birthDate: string;   // dd/mm/yyyy — ACP format
  address: string;
  zipCode: string;
  city: string;
  country: string;
  clubName: string;
  acpCode: string;
}
```

**Explicitly excluded from `BackupExport`** — never included in cloud sync. This is a deliberate GDPR design decision: personal info (including birth date) stays on-device only.

---

## 2. Profile Page

**Route:** `/profile`  
**Nav position:** Between Awards and About in `Layout.tsx`.

### Layout

- Page title: "Profile"
- Local-only notice banner at the top:  
  > 🔒 *Stored on this device only — never synced or sent to any server.*
- Form fields: Last Name, First Name, Date of Birth (dd/mm/yyyy), Address, ZIP Code, City, Country / State, Club Name, ACP Code
- Single "Save" button — writes to Dexie, shows brief inline "Saved ✓" confirmation
- No explicit delete button — data is removed by clearing browser storage (consistent with activities)

### Inline prompt (when profile incomplete at download time)

If any required profile field is blank when the user clicks a download button, the button is replaced with:

> *"Complete your profile to generate this form →"* (links to `/profile`)

---

## 3. Template Preparation (one-time offline work)

### R5000 template (`src/assets/r5000_template.docx`)

Derived from the official ACP English form (`20130201_0300_R5000_formulaire_EN.doc`). Converted to `.docx` and tagged with `docxtemplater` placeholders.

**Personal info placeholders:**
`{lastName}`, `{firstName}`, `{birthDate}`, `{address}`, `{zipCode}`, `{city}`, `{country}`, `{club}`, `{acpCode}`, `{firstEventDate}`, `{lastEventDate}`

**Mandatory events table (fixed rows, one placeholder set per distance):**

| Row | Placeholders |
|-----|-------------|
| BRM 200 | `{brm200Date}` `{brm200Name}` `{brm200Cert}` |
| BRM 300 | `{brm300Date}` `{brm300Name}` `{brm300Cert}` |
| BRM 400 | `{brm400Date}` `{brm400Name}` `{brm400Cert}` |
| BRM 600 | `{brm600Date}` `{brm600Name}` `{brm600Cert}` |
| BRM 1000 | `{brm1000Date}` `{brm1000Name}` `{brm1000Cert}` |
| PBP | `{pbpDate}` `{pbpName}` `{pbpCert}` |
| Flèche Vélocio / National Arrow | `{flecheDate}` `{flecheName}` `{flecheCert}` |

**Balance of Required Kilometers table (loop rows, one per category):**

Each category row contains the category label in the Events column and a `docxtemplater` loop in the data columns. The category label repeats for each ride — acceptable behaviour.

| Category | Loop tags |
|----------|-----------|
| Brevets de Randonneurs Mondiaux | `{#brmRides}` … `{/brmRides}` |
| Brevet 1200 &+ | `{#brevet1200Rides}` … `{/brevet1200Rides}` |
| Flèches de France | `{#flecheFRRides}` … `{/flecheFRRides}` |
| Flèche | `{#flecheRides}` … `{/flecheRides}` |
| Traces | `{#traceRides}` … `{/traceRides}` |
| National Arrow | `{#arrowRides}` … `{/arrowRides}` |

Each loop row has columns: `{distance}`, `{date}`, `{name}`, `{cert}`.

**Footer:** `KILOMETERS TOTAL : {totalKm}`

### R10000 template

To be done in a follow-up PR. Structure is identical to R5000 with additional mandatory rows: second BRM series, Mountain BRM 600 (8000m+), RM 1200+ separate from PBP.

---

## 4. Document Generation

**New module: `src/forms/acpFormGenerator.ts`**

### Dependencies

- `docxtemplater` — template rendering
- `pizzip` — ZIP manipulation (required by docxtemplater)

### Template data shape (R5000)

```ts
interface R5000TemplateData {
  // Personal info
  lastName: string; firstName: string; birthDate: string;
  address: string; zipCode: string; city: string; country: string;
  club: string; acpCode: string;
  // Window dates
  firstEventDate: string; lastEventDate: string;
  // Mandatory fixed rows (empty string if no matching ride)
  brm200Date: string; brm200Name: string; brm200Cert: string;
  brm300Date: string; brm300Name: string; brm300Cert: string;
  brm400Date: string; brm400Name: string; brm400Cert: string;
  brm600Date: string; brm600Name: string; brm600Cert: string;
  brm1000Date: string; brm1000Name: string; brm1000Cert: string;
  pbpDate: string; pbpName: string; pbpCert: string;
  flecheDate: string; flecheName: string; flecheCert: string;
  // Balance loops
  brmRides: RideRow[];
  brevet1200Rides: RideRow[];
  flecheFRRides: RideRow[];
  flecheRides: RideRow[];
  traceRides: RideRow[];
  arrowRides: RideRow[];
  // Total
  totalKm: string;
}

interface RideRow {
  distance: string;
  date: string;
  name: string;
  cert: string;
}
```

### Logic

- **Mandatory rows:** use the best qualifying ride per slot from `status.windowActivities` (same rides shown on the qualification detail page). SR600 fills the BRM600 slot.
- **Balance rides:** all other window activities not used in mandatory slots, grouped by `eventType`.
- **Dates:** formatted as `dd/mm/yyyy` (ACP convention).
- **Empty slots:** render as empty string — the cell is left blank in the output.
- **`firstEventDate` / `lastEventDate`:** earliest and latest dates in `windowActivities`.
- **`totalKm`:** `Math.round(status.totalKm).toLocaleString()` + " km".

### Download trigger

Loads the `.docx` asset as an `ArrayBuffer`, passes to PizZip + Docxtemplater, renders, and triggers a `<a download>` click with a `Blob` URL. Filename: `R5000_application_<lastName>_<year>.docx`.

---

## 5. UI Integration

### Download button component

```tsx
// Shown when status.qualified === true AND profile is complete
<button onClick={() => generateR5000Form(profile, status, windowActivities)}>
  Download R5000 Application Form
</button>

// Shown when profile is incomplete
<Link to="/profile">Complete your profile to generate this form →</Link>
```

### Placement

| Location | Condition |
|----------|-----------|
| `QualificationDetailPage` (`/qualification/5000`) | Below status banner, above requirements checklist |
| `AwardsPage` | Next to the R5000 card (same row as "View details →") |

### Nav

Add "Profile" to `Layout.tsx` main nav between Awards and About.

### About page updates

- **Privacy section:** add — *"Personal information entered in your Profile (name, address, ACP code) is stored locally only and is explicitly excluded from cloud sync."*
- **Cloud Sync section:** update existing *"personal information are never stored on any server"* to be explicit that this includes the Profile page data.

---

## 6. Out of scope (this PR)

- R10000 form (follow-up PR)
- Audax Ireland email claim forms — tracked in pallotron/audax_tracker#30
- Greyed-out claim buttons for Audax Ireland awards — also tracked in #30

---

## Fallback

If `docxtemplater` template manipulation proves too fragile during implementation, fall back to generating the `.docx` from scratch using the `docx` npm library (same data shape, no template asset needed, layout will differ from official ACP form).
