/// Ilocos Sur cooperative district boundaries for outage expansion.
library;

const districtMunicipalities = {
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

String? parseDistrictFromText(String text) {
  final t = text.toLowerCase();
  if (RegExp(r'whole\s+(1st|first)\s+district', caseSensitive: false).hasMatch(t) ||
      RegExp(r'\b1st\s+district\b', caseSensitive: false).hasMatch(t)) {
    return '1st';
  }
  if (RegExp(r'whole\s+(2nd|second)\s+district', caseSensitive: false).hasMatch(t) ||
      RegExp(r'\b2nd\s+district\b', caseSensitive: false).hasMatch(t)) {
    return '2nd';
  }
  return null;
}

String districtLabel(String district) =>
    district == '1st' ? '1st District' : '2nd District';

List<String> municipalitiesForDistrict(String district) =>
    List<String>.from(districtMunicipalities[district] ?? []);

String _normalize(String s) => s.toLowerCase().trim().replaceAll(RegExp(r'\s+'), ' ');

bool locationsMatch(String a, String b) {
  final na = _normalize(a);
  final nb = _normalize(b);
  if (na.isEmpty || nb.isEmpty) return false;
  return na == nb || na.contains(nb) || nb.contains(na);
}

/// True if a municipality is excluded (e.g. "Puro, Caoayan" excludes Caoayan).
bool municipalityIsExcluded(String municipality, List<String> exclusions) {
  final muniNorm = _normalize(municipality);
  for (final ex in exclusions) {
    final exNorm = _normalize(ex);
    if (exNorm.contains(muniNorm) || muniNorm.contains(exNorm)) return true;
    // "Puro, Caoayan" → check part after comma
    final parts = ex.split(',');
    if (parts.length > 1) {
      final muniPart = _normalize(parts.last);
      if (muniNorm.contains(muniPart) || muniPart.contains(muniNorm)) return true;
    }
  }
  return false;
}

/// All municipalities/barangays affected by this outage (expanded).
List<String> getAffectedLocations({
  String? district,
  List<String> areas = const [],
  List<String> partialAreas = const [],
  List<String> exclusions = const [],
}) {
  final locations = <String>{};

  if (district == '1st' || district == '2nd') {
    for (final muni in municipalitiesForDistrict(district!)) {
      if (!municipalityIsExcluded(muni, exclusions)) {
        locations.add(muni);
      }
    }
  }

  for (final area in [...areas, ...partialAreas]) {
    if (!RegExp(r'whole.*district', caseSensitive: false).hasMatch(area)) {
      locations.add(area);
    }
  }

  return locations.toList();
}

bool locationMatchesOutage(
  String userLocation, {
  String? district,
  List<String> areas = const [],
  List<String> partialAreas = const [],
  List<String> exclusions = const [],
}) {
  final normalized = _normalize(userLocation);
  if (normalized.isEmpty) return false;

  if (exclusions.any((ex) => locationsMatch(ex, userLocation))) {
    return false;
  }

  final affected = getAffectedLocations(
    district: district,
    areas: areas,
    partialAreas: partialAreas,
    exclusions: exclusions,
  );

  return affected.any((a) => locationsMatch(a, userLocation));
}

bool locationMatchesOutageFull(
  String userLocation, {
  String? district,
  List<String> areas = const [],
  List<String> exclusions = const [],
}) {
  return locationMatchesOutage(
    userLocation,
    district: district,
    areas: areas,
    partialAreas: const [],
    exclusions: exclusions,
  );
}

bool locationMatchesOutagePartialOnly(
  String userLocation, {
  String? district,
  List<String> areas = const [],
  List<String> partialAreas = const [],
  List<String> exclusions = const [],
}) {
  if (!locationMatchesOutage(
    userLocation,
    district: district,
    areas: areas,
    partialAreas: partialAreas,
    exclusions: exclusions,
  )) {
    return false;
  }
  return !locationMatchesOutageFull(
    userLocation,
    district: district,
    areas: areas,
    exclusions: exclusions,
  );
}

bool isLocationExcluded(String userLocation, List<String> exclusions) {
  return exclusions.any((ex) => locationsMatch(ex, userLocation));
}
