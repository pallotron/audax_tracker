const MIGRATION_FLAG = "audax_awards_filter_migrated";

export function shouldShowMigrationNotice(): boolean {
  return localStorage.getItem(MIGRATION_FLAG) !== "1";
}

export function dismissMigrationNotice(): void {
  localStorage.setItem(MIGRATION_FLAG, "1");
}
