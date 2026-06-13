import '../data/ilocos_sur_districts.dart';

class Outage {
  final String id;
  final DateTime createdAt;
  final DateTime outageDate;
  final String startTime;
  final String endTime;
  final String? district;
  final List<String> areas;
  final List<String> partialAreas;
  final List<String> exclusions;
  final String? purpose;
  final String confidence;

  const Outage({
    required this.id,
    required this.createdAt,
    required this.outageDate,
    required this.startTime,
    required this.endTime,
    this.district,
    required this.areas,
    this.partialAreas = const [],
    this.exclusions = const [],
    this.purpose,
    this.confidence = 'medium',
  });

  factory Outage.fromJson(Map<String, dynamic> json) {
    return Outage(
      id: json['id'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      outageDate: DateTime.parse(json['outage_date'] as String),
      startTime: _formatTime(json['start_time']),
      endTime: _formatTime(json['end_time']),
      district: json['district'] as String?,
      areas: List<String>.from(json['areas'] as List? ?? []),
      partialAreas: List<String>.from(json['partial_areas'] as List? ?? []),
      exclusions: List<String>.from(json['exclusions'] as List? ?? []),
      purpose: json['purpose'] as String?,
      confidence: json['confidence'] as String? ?? 'medium',
    );
  }

  static String _formatTime(dynamic value) {
    if (value is String) {
      return value.length >= 5 ? value.substring(0, 5) : value;
    }
    return value.toString();
  }

  bool get hasPartialAreas => partialAreas.isNotEmpty;

  /// Expanded list of all affected municipalities/barangays.
  List<String> get affectedLocations => getAffectedLocations(
        district: district,
        areas: areas,
        partialAreas: partialAreas,
        exclusions: exclusions,
      );

  bool affectsBarangay(String barangay) {
    return locationMatchesOutage(
      barangay,
      district: district,
      areas: areas,
      partialAreas: partialAreas,
      exclusions: exclusions,
    );
  }

  bool affectsBarangayFull(String barangay) {
    return locationMatchesOutageFull(
      barangay,
      district: district,
      areas: areas,
      exclusions: exclusions,
    );
  }

  bool affectsBarangayPartialOnly(String barangay) {
    return locationMatchesOutagePartialOnly(
      barangay,
      district: district,
      areas: areas,
      partialAreas: partialAreas,
      exclusions: exclusions,
    );
  }
}
