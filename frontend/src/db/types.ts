export type EventType =
  | null
  | "BRM200"
  | "BRM300"
  | "BRM400"
  | "BRM600"
  | "BRM1000"
  | "PBP"
  | "RM1200+"
  | "Fleche"
  | "SuperRandonneur"
  | "TraceVelocio"
  | "FlecheDeFrance"
  | "Permanent"
  | "Other";

export type ClassificationSource = "auto-name" | "auto-distance" | "manual";
