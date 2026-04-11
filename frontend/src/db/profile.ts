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
    profile.birthDate.trim() &&
    profile.address.trim() &&
    profile.zipCode.trim() &&
    profile.city.trim() &&
    profile.country.trim() &&
    profile.clubName.trim() &&
    profile.acpCode.trim()
  );
}
