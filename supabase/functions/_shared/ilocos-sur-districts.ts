export const DISTRICT_MUNICIPALITIES: Record<"1st" | "2nd", string[]> = {
  "1st": [
    "Vigan City",
    "Bantay",
    "Cabugao",
    "Caoayan",
    "Magsingal",
    "San Ildefonso",
    "San Juan",
    "San Vicente",
    "Santa Catalina",
    "Santo Domingo",
    "Sinait",
  ],
  "2nd": [
    "Candon City",
    "Alilem",
    "Banayoyo",
    "Burgos",
    "Cervantes",
    "Galimuyod",
    "Gregorio del Pilar",
    "Lidlidda",
    "Nagbukel",
    "Narvacan",
    "Quirino",
    "Salcedo",
    "San Emilio",
    "San Esteban",
    "Santa",
    "Santa Cruz",
    "Santa Lucia",
    "Santa Maria",
    "Santiago",
    "Sigay",
    "Sugpon",
    "Suyo",
    "Tagudin",
  ],
};

export type DistrictId = "1st" | "2nd";

export function parseDistrictFromText(text: string): DistrictId | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/whole\s+(1st|first)\s+district/i.test(t) || /\b1st\s+district\b/i.test(t)) {
    return "1st";
  }
  if (/whole\s+(2nd|second)\s+district/i.test(t) || /\b2nd\s+district\b/i.test(t)) {
    return "2nd";
  }
  return null;
}

export function districtLabel(district: DistrictId): string {
  return district === "1st" ? "1st District" : "2nd District";
}
