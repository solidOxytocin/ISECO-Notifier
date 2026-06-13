/**
 * Ilocos Sur electric cooperative district boundaries.
 * Used to expand "Whole 1st/2nd District" outages into municipalities.
 */
export const DISTRICT_MUNICIPALITIES = {
  '1st': [
    'Vigan City',
    'Bantay',
    'Cabugao',
    'Caoayan',
    'Magsingal',
    'San Ildefonso',
    'San Juan',
    'San Vicente',
    'Santa Catalina',
    'Santo Domingo',
    'Sinait',
  ],
  '2nd': [
    'Candon City',
    'Alilem',
    'Banayoyo',
    'Burgos',
    'Cervantes',
    'Galimuyod',
    'Gregorio del Pilar',
    'Lidlidda',
    'Nagbukel',
    'Narvacan',
    'Quirino',
    'Salcedo',
    'San Emilio',
    'San Esteban',
    'Santa',
    'Santa Cruz',
    'Santa Lucia',
    'Santa Maria',
    'Santiago',
    'Sigay',
    'Sugpon',
    'Suyo',
    'Tagudin',
  ],
};

/** Detect "1st" or "2nd" from poster text. */
export function parseDistrictFromText(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/whole\s+(1st|first)\s+district/i.test(t) || /\b1st\s+district\b/i.test(t)) {
    return '1st';
  }
  if (/whole\s+(2nd|second)\s+district/i.test(t) || /\b2nd\s+district\b/i.test(t)) {
    return '2nd';
  }
  return null;
}

export function districtLabel(district) {
  if (district === '1st') return '1st District';
  if (district === '2nd') return '2nd District';
  return null;
}
