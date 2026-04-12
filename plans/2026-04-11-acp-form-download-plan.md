# ACP Form Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a qualified R5000 rider download a pre-filled ACP Randonneur 5000 application form (`.docx`) directly from the app, with personal info stored locally in a new Profile page.

**Architecture:** A new `profile` Dexie table holds rider personal info (never synced). A pure `buildR5000TemplateData()` function assembles the docxtemplater data object from profile + qualification status. `generateR5000Form()` loads the `.docx` template asset, fills it via docxtemplater, and triggers a browser download.

**Tech Stack:** docxtemplater, pizzip, Dexie v4, React 19, Vite (template loaded via `?url` fetch), Vitest

---

## Prerequisites (manual steps before coding)

- [ ] Place the tagged R5000 template at `frontend/src/assets/r5000_template.docx` (the `.docx` you prepared in Word with `{placeholder}` tags)
- [ ] Confirm the file exists: `ls frontend/src/assets/r5000_template.docx`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/db/database.ts` | **Modify** | Add `RiderProfile` interface + Dexie version 8 with `profile` table |
| `frontend/src/db/profile.ts` | **Create** | `getProfile()`, `saveProfile()`, `isProfileComplete()` helpers |
| `frontend/src/forms/acpFormGenerator.ts` | **Create** | `buildR5000TemplateData()` (pure), `generateR5000Form()` (IO) |
| `frontend/src/__tests__/forms/acpFormGenerator.test.ts` | **Create** | Unit tests for `buildR5000TemplateData` |
| `frontend/src/pages/ProfilePage.tsx` | **Create** | Profile form UI with local-only notice |
| `frontend/src/App.tsx` | **Modify** | Add `/profile` route |
| `frontend/src/components/Layout.tsx` | **Modify** | Add Profile nav link |
| `frontend/src/pages/QualificationDetailPage.tsx` | **Modify** | Add download button below status banner |
| `frontend/src/pages/AwardsPage.tsx` | **Modify** | Add download button next to R5000 card |
| `frontend/src/pages/AboutPage.tsx` | **Modify** | Update Privacy and Cloud Sync sections |

---

## Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json` (via npm install)

- [ ] **Step 1: Install docxtemplater and pizzip**

```bash
cd frontend && npm install docxtemplater pizzip
```

Expected output: both packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify installation**

```bash
cd frontend && node -e "require('docxtemplater'); require('pizzip'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
jj describe -m "chore: add docxtemplater and pizzip dependencies"
jj new
```

---

## Task 2: Profile data layer

**Files:**
- Create: `frontend/src/db/profile.ts`
- Modify: `frontend/src/db/database.ts`

- [ ] **Step 1: Add `RiderProfile` interface and `profile` table to `frontend/src/db/database.ts`**

`RiderProfile` lives in `database.ts` (matching the pattern used for `Activity`).

Add the interface after the `Activity` interface (around line 31):

```ts
export interface RiderProfile {
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

Update the `db` type declaration to include the new table:

```ts
export const db = new Dexie("AudaxTracker") as Dexie & {
  activities: EntityTable<Activity, "stravaId">;
  profile: EntityTable<RiderProfile, "id">;
};
```

Add version 8 at the end of the file:

```ts
db.version(8).stores({
  activities: "stravaId, date, eventType, type, startCountry, startRegion",
  profile: "id",
});
```

Note: version 8 must include all existing table index definitions alongside `profile: "id"`.

- [ ] **Step 2: Create `frontend/src/db/profile.ts`**

```ts
import { db, type RiderProfile } from "./database";

export type { RiderProfile };

export async function getProfile(): Promise<RiderProfile | undefined> {
  return db.profile.get(1);
}

export async function saveProfile(profile: Omit<RiderProfile, "id">): Promise<void> {
  await db.profile.put({ id: 1, ...profile });
}

export function isProfileComplete(profile: RiderProfile | undefined): boolean {
  if (!profile) return false;
  return !!(
    profile.lastName.trim() &&
    profile.firstName.trim() &&
    profile.clubName.trim() &&
    profile.acpCode.trim()
  );
}
```

- [ ] **Step 3: Run tests to verify nothing broke**

```bash
cd frontend && npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: add profile Dexie table and helpers"
jj new
```

---

## Task 3: Form generator — pure logic + tests

**Files:**
- Create: `frontend/src/forms/acpFormGenerator.ts`
- Create: `frontend/src/__tests__/forms/acpFormGenerator.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `frontend/src/__tests__/forms/acpFormGenerator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildR5000TemplateData } from "../../forms/acpFormGenerator";
import type { RiderProfile } from "../../db/profile";
import type { QualifyingActivity } from "../../qualification/tracker";

const profile: RiderProfile = {
  id: 1,
  lastName: "Murphy",
  firstName: "Ciara",
  birthDate: "15/03/1985",
  address: "42 Main Street",
  zipCode: "D01",
  city: "Dublin",
  country: "Ireland",
  clubName: "Audax Ireland",
  acpCode: "IE001",
};

function makeActivity(overrides: Partial<QualifyingActivity>): QualifyingActivity {
  return {
    stravaId: "1",
    name: "Test Ride",
    date: "2023-06-15T00:00:00.000Z",
    distance: 200,
    elevationGain: 1000,
    eventType: "BRM200",
    dnf: false,
    sourceUrl: "https://strava.com/activities/1",
    classificationSource: "manual",
    manualOverride: true,
    excludeFromAwards: false,
    needsConfirmation: false,
    homologationNumber: null,
    ...overrides,
  };
}

describe("buildR5000TemplateData", () => {
  it("fills personal info from profile", () => {
    const data = buildR5000TemplateData(profile, [], 0);
    expect(data.lastName).toBe("Murphy");
    expect(data.firstName).toBe("Ciara");
    expect(data.birthDate).toBe("15/03/1985");
    expect(data.club).toBe("Audax Ireland");
    expect(data.acpCode).toBe("IE001");
  });

  it("formats dates as dd/mm/yyyy", () => {
    const activities = [makeActivity({ eventType: "BRM200", date: "2023-06-15T00:00:00.000Z" })];
    const data = buildR5000TemplateData(profile, activities, 200);
    expect(data.brm200Date).toBe("15/06/2023");
  });

  it("fills mandatory BRM slots from windowActivities", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "BRM200", name: "BRM 200 Dublin", distance: 200, homologationNumber: "IE-001" }),
      makeActivity({ stravaId: "2", eventType: "BRM300", name: "BRM 300 Cork", distance: 300, homologationNumber: "IE-002", date: "2023-07-01T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 500);
    expect(data.brm200Name).toBe("BRM 200 Dublin");
    expect(data.brm200Cert).toBe("IE-001");
    expect(data.brm300Name).toBe("BRM 300 Cork");
    expect(data.brm300Cert).toBe("IE-002");
  });

  it("leaves mandatory slot empty when no matching activity", () => {
    const data = buildR5000TemplateData(profile, [], 0);
    expect(data.brm200Date).toBe("");
    expect(data.brm200Name).toBe("");
    expect(data.brm200Cert).toBe("");
    expect(data.pbpDate).toBe("");
  });

  it("SR600 fills BRM600 slot", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "SR600", name: "Rocky Road SR600", distance: 600, homologationNumber: "SR-001" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 600);
    expect(data.brm600Name).toBe("Rocky Road SR600");
    expect(data.brm600Cert).toBe("SR-001");
  });

  it("uses null homologation number as empty string", () => {
    const activities = [makeActivity({ eventType: "BRM200", homologationNumber: null })];
    const data = buildR5000TemplateData(profile, activities, 200);
    expect(data.brm200Cert).toBe("");
  });

  it("puts extra BRMs in brmRides balance array", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "BRM200", name: "First BRM200", date: "2023-01-01T00:00:00.000Z" }),
      makeActivity({ stravaId: "2", eventType: "BRM200", name: "Second BRM200", date: "2023-03-01T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 400);
    expect(data.brm200Name).toBe("First BRM200"); // earliest goes to mandatory slot
    expect(data.brmRides).toHaveLength(1);
    expect(data.brmRides[0].name).toBe("Second BRM200");
  });

  it("puts RM1200+ rides in brevet1200Rides", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "RM1200+", name: "LEL 1400", distance: 1400 }),
    ];
    const data = buildR5000TemplateData(profile, activities, 1400);
    expect(data.brevet1200Rides).toHaveLength(1);
    expect(data.brevet1200Rides[0].name).toBe("LEL 1400");
  });

  it("puts Fleche rides in flecheRides beyond the mandatory slot", () => {
    const activities = [
      makeActivity({ stravaId: "1", eventType: "Fleche", name: "Easter Fleche 2022", date: "2022-04-15T00:00:00.000Z" }),
      makeActivity({ stravaId: "2", eventType: "Fleche", name: "Easter Fleche 2023", date: "2023-04-07T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 720);
    expect(data.flecheName).toBe("Easter Fleche 2022"); // earliest to mandatory
    expect(data.flecheRides).toHaveLength(1);
    expect(data.flecheRides[0].name).toBe("Easter Fleche 2023");
  });

  it("computes firstEventDate and lastEventDate", () => {
    const activities = [
      makeActivity({ stravaId: "1", date: "2023-03-15T00:00:00.000Z" }),
      makeActivity({ stravaId: "2", date: "2022-06-01T00:00:00.000Z" }),
      makeActivity({ stravaId: "3", date: "2024-01-10T00:00:00.000Z" }),
    ];
    const data = buildR5000TemplateData(profile, activities, 600);
    expect(data.firstEventDate).toBe("01/06/2022");
    expect(data.lastEventDate).toBe("10/01/2024");
  });

  it("formats totalKm as rounded string with km suffix", () => {
    const data = buildR5000TemplateData(profile, [], 5123.7);
    expect(data.totalKm).toBe("5124 km");
  });
});
```

- [ ] **Step 2: Run tests — expect failures (module not found)**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '../../forms/acpFormGenerator'`

- [ ] **Step 3: Create `frontend/src/forms/acpFormGenerator.ts` with all imports and pure logic**

```ts
import type { RiderProfile } from "../db/profile";
import type { QualifyingActivity, Acp5000Status } from "../qualification/tracker";
import type { EventType } from "../db/types";
import r5000TemplateUrl from "../assets/r5000_template.docx?url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

export interface RideRow {
  distance: string;
  date: string;
  name: string;
  cert: string;
}

export interface R5000TemplateData {
  lastName: string;
  firstName: string;
  birthDate: string;
  address: string;
  zipCode: string;
  city: string;
  country: string;
  club: string;
  acpCode: string;
  firstEventDate: string;
  lastEventDate: string;
  brm200Date: string; brm200Name: string; brm200Cert: string;
  brm300Date: string; brm300Name: string; brm300Cert: string;
  brm400Date: string; brm400Name: string; brm400Cert: string;
  brm600Date: string; brm600Name: string; brm600Cert: string;
  brm1000Date: string; brm1000Name: string; brm1000Cert: string;
  pbpDate: string; pbpName: string; pbpCert: string;
  flecheDate: string; flecheName: string; flecheCert: string;
  brmRides: RideRow[];
  brevet1200Rides: RideRow[];
  flecheFRRides: RideRow[];
  flecheRides: RideRow[];
  traceRides: RideRow[];
  arrowRides: RideRow[];
  totalKm: string;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toRideRow(a: QualifyingActivity): RideRow {
  return {
    distance: String(Math.round(a.distance)),
    date: formatDate(a.date),
    name: a.name,
    cert: a.homologationNumber ?? "",
  };
}

/** Picks the earliest (by date) activity matching the given event types. Returns null if none found. */
function pickSlot(
  activities: QualifyingActivity[],
  types: EventType[],
): QualifyingActivity | null {
  return (
    activities
      .filter((a) => types.includes(a.eventType))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null
  );
}

function slotFields(a: QualifyingActivity | null): { date: string; name: string; cert: string } {
  if (!a) return { date: "", name: "", cert: "" };
  return { date: formatDate(a.date), name: a.name, cert: a.homologationNumber ?? "" };
}

export function buildR5000TemplateData(
  profile: RiderProfile,
  windowActivities: QualifyingActivity[],
  totalKm: number,
): R5000TemplateData {
  // Pick mandatory slots
  const brm200 = pickSlot(windowActivities, ["BRM200"]);
  const brm300 = pickSlot(windowActivities, ["BRM300"]);
  const brm400 = pickSlot(windowActivities, ["BRM400"]);
  const brm600 = pickSlot(windowActivities, ["BRM600", "SR600"]);
  const brm1000 = pickSlot(windowActivities, ["BRM1000"]);
  const pbp = pickSlot(windowActivities, ["PBP"]);
  const fleche = pickSlot(windowActivities, ["Fleche"]);

  const mandatoryIds = new Set(
    [brm200, brm300, brm400, brm600, brm1000, pbp, fleche]
      .filter(Boolean)
      .map((a) => a!.stravaId),
  );

  // Balance rides — activities not used in mandatory slots
  const balanceActivities = windowActivities.filter((a) => !mandatoryIds.has(a.stravaId));

  const brmTypes: EventType[] = ["BRM200", "BRM300", "BRM400", "BRM600", "BRM1000", "SR600"];

  const brmRides = balanceActivities.filter((a) => brmTypes.includes(a.eventType)).map(toRideRow);
  const brevet1200Rides = balanceActivities.filter((a) => a.eventType === "RM1200+").map(toRideRow);
  const flecheFRRides = balanceActivities.filter((a) => a.eventType === "FlecheDeFrance").map(toRideRow);
  const flecheRides = balanceActivities.filter((a) => a.eventType === "Fleche").map(toRideRow);
  const traceRides = balanceActivities.filter((a) => a.eventType === "TraceVelocio").map(toRideRow);
  const arrowRides: RideRow[] = []; // National Arrow not in app event types

  // Window date range
  const sortedByDate = [...windowActivities].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const firstEventDate = sortedByDate.length > 0 ? formatDate(sortedByDate[0].date) : "";
  const lastEventDate = sortedByDate.length > 0 ? formatDate(sortedByDate[sortedByDate.length - 1].date) : "";

  const brm200f = slotFields(brm200);
  const brm300f = slotFields(brm300);
  const brm400f = slotFields(brm400);
  const brm600f = slotFields(brm600);
  const brm1000f = slotFields(brm1000);
  const pbpf = slotFields(pbp);
  const flechef = slotFields(fleche);

  return {
    lastName: profile.lastName,
    firstName: profile.firstName,
    birthDate: profile.birthDate,
    address: profile.address,
    zipCode: profile.zipCode,
    city: profile.city,
    country: profile.country,
    club: profile.clubName,
    acpCode: profile.acpCode,
    firstEventDate,
    lastEventDate,
    brm200Date: brm200f.date, brm200Name: brm200f.name, brm200Cert: brm200f.cert,
    brm300Date: brm300f.date, brm300Name: brm300f.name, brm300Cert: brm300f.cert,
    brm400Date: brm400f.date, brm400Name: brm400f.name, brm400Cert: brm400f.cert,
    brm600Date: brm600f.date, brm600Name: brm600f.name, brm600Cert: brm600f.cert,
    brm1000Date: brm1000f.date, brm1000Name: brm1000f.name, brm1000Cert: brm1000f.cert,
    pbpDate: pbpf.date, pbpName: pbpf.name, pbpCert: pbpf.cert,
    flecheDate: flechef.date, flecheName: flechef.name, flecheCert: flechef.cert,
    brmRides,
    brevet1200Rides,
    flecheFRRides,
    flecheRides,
    traceRides,
    arrowRides,
    totalKm: `${Math.round(totalKm).toLocaleString()} km`,
  };
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|✓|✗|acpForm"
```

Expected: all `acpFormGenerator` tests pass.

- [ ] **Step 5: Add the IO function `generateR5000Form` at the bottom of `frontend/src/forms/acpFormGenerator.ts`**

All imports are already at the top from Step 3. Just add the function:

```ts
export async function generateR5000Form(
  profile: RiderProfile,
  status: Acp5000Status,
): Promise<void> {
  const templateData = buildR5000TemplateData(
    profile,
    status.windowActivities,
    status.totalKm,
  );

  const response = await fetch(r5000TemplateUrl);
  const arrayBuffer = await response.arrayBuffer();
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(templateData);

  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `R5000_application_${profile.lastName}_${new Date().getFullYear()}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: Run all tests to confirm nothing broke**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
jj describe -m "feat: add R5000 form generator with docxtemplater"
jj new
```

---

## Task 4: Profile page

**Files:**
- Create: `frontend/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/ProfilePage.tsx`**

```tsx
import { useState, useEffect } from "react";
import { getProfile, saveProfile, type RiderProfile } from "../db/profile";

const EMPTY_FORM = {
  lastName: "",
  firstName: "",
  birthDate: "",
  address: "",
  zipCode: "",
  city: "",
  country: "",
  clubName: "",
  acpCode: "",
};

export default function ProfilePage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setForm({
          lastName: p.lastName,
          firstName: p.firstName,
          birthDate: p.birthDate,
          address: p.address,
          zipCode: p.zipCode,
          city: p.city,
          country: p.country,
          clubName: p.clubName,
          acpCode: p.acpCode,
        });
      }
    });
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile(form);
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        🔒 Stored on this device only — never synced or sent to any server.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Last Name" name="lastName" value={form.lastName} onChange={handleChange} />
          <Field label="First Name" name="firstName" value={form.firstName} onChange={handleChange} />
        </div>
        <Field label="Date of Birth (dd/mm/yyyy)" name="birthDate" value={form.birthDate} onChange={handleChange} placeholder="15/03/1985" />
        <Field label="Address" name="address" value={form.address} onChange={handleChange} />
        <div className="grid grid-cols-3 gap-4">
          <Field label="ZIP Code" name="zipCode" value={form.zipCode} onChange={handleChange} />
          <Field label="City" name="city" value={form.city} onChange={handleChange} />
          <Field label="Country / State" name="country" value={form.country} onChange={handleChange} />
        </div>
        <Field label="Club Name (NO abbreviations)" name="clubName" value={form.clubName} onChange={handleChange} />
        <Field label="ACP Code" name="acpCode" value={form.acpCode} onChange={handleChange} />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Save
          </button>
          {saved && <span className="text-sm text-green-700 font-medium">Saved ✓</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
    </div>
  );
}
```

- [ ] **Step 2: Run tests to verify no regressions**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
jj describe -m "feat: add Profile page"
jj new
```

---

## Task 5: Wire route and nav

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add `/profile` route to `frontend/src/App.tsx`**

Add the import near the top with other page imports:
```ts
import ProfilePage from "./pages/ProfilePage";
```

Add the route inside `<Routes>`, after the `/awards` route:
```tsx
<Route
  path="/profile"
  element={
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Add Profile nav link to `frontend/src/components/Layout.tsx`**

In the **desktop nav** (line ~171–175), add between Awards and Yearly Summary:
```tsx
<NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
```

In the **mobile hamburger array** (line ~139–145), add between Awards and Yearly Summary:
```tsx
["/profile", "Profile"],
```

- [ ] **Step 3: Run tests to verify no regressions**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
jj describe -m "feat: wire /profile route and nav link"
jj new
```

---

## Task 6: Download button in QualificationDetailPage

**Files:**
- Modify: `frontend/src/pages/QualificationDetailPage.tsx`

- [ ] **Step 1: Add imports at the top of `frontend/src/pages/QualificationDetailPage.tsx`**

```ts
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getProfile, isProfileComplete, type RiderProfile } from "../db/profile";
import { generateR5000Form } from "../forms/acpFormGenerator";
import type { Acp5000Status } from "../qualification/tracker";
```

Note: `useRef` is already imported; add `useState` and `useEffect` to the existing import if not present. `Acp5000Status` may already be imported — check before adding.

- [ ] **Step 2: Add profile state inside `QualificationDetailPage` component, after the existing `activities` query**

```ts
const [profile, setProfile] = useState<RiderProfile | undefined>(undefined);
const [generating, setGenerating] = useState(false);

useEffect(() => {
  getProfile().then(setProfile);
}, []);
```

- [ ] **Step 3: Add the download button JSX after the status banner `</div>` (after the ProgressBar section), inside the `return` — only for R5000 (`is5000 === true`)**

```tsx
{is5000 && status.qualified && (
  <div className="rounded-lg bg-white p-4 shadow">
    <h2 className="mb-2 text-sm font-semibold text-gray-800">ACP Application Form</h2>
    {isProfileComplete(profile) ? (
      <button
        onClick={async () => {
          setGenerating(true);
          try {
            await generateR5000Form(profile!, status as Acp5000Status);
          } finally {
            setGenerating(false);
          }
        }}
        disabled={generating}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {generating ? "Generating…" : "Download R5000 Application Form"}
      </button>
    ) : (
      <p className="text-sm text-gray-600">
        <Link to="/profile" className="font-medium text-orange-600 hover:underline">
          Complete your profile
        </Link>{" "}
        to generate this form.
      </p>
    )}
  </div>
)}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add R5000 download button to qualification detail page"
jj new
```

---

## Task 7: Download button in AwardsPage

**Files:**
- Modify: `frontend/src/pages/AwardsPage.tsx`

- [ ] **Step 1: Add imports at the top of `frontend/src/pages/AwardsPage.tsx`**

```ts
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getProfile, isProfileComplete, type RiderProfile } from "../db/profile";
import { generateR5000Form } from "../forms/acpFormGenerator";
```

- [ ] **Step 2: Add profile state inside `AwardsPage` component, after existing state**

```ts
const [profile, setProfile] = useState<RiderProfile | undefined>(undefined);
const [generating5000, setGenerating5000] = useState(false);

useEffect(() => {
  getProfile().then(setProfile);
}, []);
```

- [ ] **Step 3: Update the R5000 card in `AwardsPage` to show the download button**

The R5000 card is a `<Link>` element at roughly line 189. Replace it with a `<div>` that contains both the existing link AND the download button:

```tsx
{/* R5000 */}
<div className="rounded-lg border border-gray-200 bg-white p-4">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold text-gray-800">Randonneur 5000</h3>
    {status5000.qualified ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        <span className="text-base leading-none">🏆</span> Qualified ✓
      </span>
    ) : (
      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
        {Math.round(status5000.totalKm).toLocaleString()} / 5000 km
      </span>
    )}
  </div>
  <div className="mt-2 flex items-center gap-3">
    <Link to="/qualification/5000" className="text-xs text-orange-600 hover:underline">
      View details →
    </Link>
    {status5000.qualified && (
      isProfileComplete(profile) ? (
        <button
          onClick={async () => {
            setGenerating5000(true);
            try {
              await generateR5000Form(profile!, status5000);
            } finally {
              setGenerating5000(false);
            }
          }}
          disabled={generating5000}
          className="text-xs font-medium text-orange-600 hover:underline disabled:opacity-50"
        >
          {generating5000 ? "Generating…" : "Download application form"}
        </button>
      ) : (
        <Link to="/profile" className="text-xs text-gray-400 hover:underline">
          Complete profile to download form
        </Link>
      )
    )}
  </div>
</div>
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
jj describe -m "feat: add R5000 download button to awards page"
jj new
```

---

## Task 8: Update About page

**Files:**
- Modify: `frontend/src/pages/AboutPage.tsx`

- [ ] **Step 1: Update the Privacy section**

Find the Privacy section `<p>` (around line 228–235). Replace the paragraph content with:

```tsx
<p className="text-gray-600">
  All your Strava activity data is fetched directly from Strava and stored only in your
  own browser using IndexedDB — it never leaves your device and is never sent to any
  external server. This is your own data about your own activities, stored locally for
  your personal use only. Clearing your browser data will remove all stored activities.
  Personal information entered in your Profile (name, address, ACP code) is also stored
  locally only and is explicitly excluded from cloud sync. Optionally, you can enable
  cloud sync (see below) to back up your activity annotations across devices.
</p>
```

- [ ] **Step 2: Update the Cloud Sync section description**

Find the Cloud Sync section `<p>` (around line 243–247). Replace:

```tsx
<p className="mb-3 text-gray-600">
  Optionally sync your activity annotations (event types, DNF flags, homologation numbers)
  across devices. The cloud sync stores <strong>only the annotations you create within
  Audax Tracker</strong> — your Strava activity data, names, distances, GPS tracks, and
  personal information (including anything entered in your Profile) are never stored on
  any server. Stored data consists solely of Strava activity IDs (used as references) and
  your own audax-specific metadata.
</p>
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
jj describe -m "docs: update About page privacy and cloud sync sections for profile data"
jj new
```

---

## Task 9: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify template asset is present**

```bash
ls frontend/src/assets/r5000_template.docx
```

If missing: place the tagged `.docx` file here before continuing.

- [ ] **Step 3: Check Profile page**

Navigate to `/profile`. Verify:
- Local-only notice banner appears
- Form saves and shows "Saved ✓"
- Page is reachable from nav

- [ ] **Step 4: Check download button (incomplete profile)**

Navigate to `/qualification/5000` (if qualified). Verify "Complete your profile" link appears when profile fields are empty.

- [ ] **Step 5: Check download button (complete profile)**

Fill in the Profile page. Navigate back to `/qualification/5000`. Verify "Download R5000 Application Form" button appears. Click it. Verify a `.docx` file downloads.

- [ ] **Step 6: Open the downloaded file**

Open in Word/LibreOffice. Verify:
- Personal info is filled correctly
- Mandatory table rows are populated
- Balance rides appear under correct categories
- KILOMETERS TOTAL shows the correct value
- ACP header and logo are preserved from the original template
