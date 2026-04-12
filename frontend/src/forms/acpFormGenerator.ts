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
      .filter((a) => a.eventType !== null && types.includes(a.eventType))
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

  // Balance rides — activities not used in mandatory slots, capped at 5000 km total
  const allBalanceActivities = windowActivities.filter((a) => !mandatoryIds.has(a.stravaId));

  const mandatoryKm = [brm200, brm300, brm400, brm600, brm1000, pbp, fleche]
    .filter(Boolean)
    .reduce((sum, a) => sum + a!.distance, 0);
  const balanceBudgetKm = Math.max(0, 5000 - mandatoryKm);

  let balanceAccumulatedKm = 0;
  const balanceActivities = allBalanceActivities
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter((a) => {
      if (balanceAccumulatedKm >= balanceBudgetKm) return false;
      balanceAccumulatedKm += a.distance;
      return true;
    });

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
    lastName: profile.lastName ?? "",
    firstName: profile.firstName ?? "",
    birthDate: profile.birthDate ?? "",
    address: profile.address ?? "",
    zipCode: profile.zipCode ?? "",
    city: profile.city ?? "",
    country: profile.country ?? "",
    club: profile.clubName ?? "",
    acpCode: profile.acpCode ?? "",
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
    totalKm: `${Math.round(totalKm)} km`,
  };
}

/**
 * Generates and downloads a pre-filled R5000 application form.
 * @throws If the template asset cannot be fetched or the document fails to render.
 */
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
