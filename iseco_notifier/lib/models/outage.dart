class Outage {
  final String id;
  final DateTime createdAt;
  final DateTime outageDate;
  final String startTime;
  final String endTime;
  final List<String> areas;
  final List<String> exclusions;
  final bool isDistrictWide;
  final String? purpose;
  final String confidence;

  const Outage({
    required this.id,
    required this.createdAt,
    required this.outageDate,
    required this.startTime,
    required this.endTime,
    required this.areas,
    this.exclusions = const [],
    this.isDistrictWide = false,
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
      areas: List<String>.from(json['areas'] as List? ?? []),
      exclusions: List<String>.from(json['exclusions'] as List? ?? []),
      isDistrictWide: json['is_district_wide'] as bool? ?? false,
      purpose: json['purpose'] as String?,
      confidence: json['confidence'] as String? ?? 'medium',
    );
  }

  static String _formatTime(dynamic value) {
    if (value is String) {
      // Postgres TIME may come as "08:30:00"
      return value.length >= 5 ? value.substring(0, 5) : value;
    }
    return value.toString();
  }

  bool affectsBarangay(String barangay) {
    final normalized = barangay.toLowerCase().trim();
    if (normalized.isEmpty) return false;

    if (isDistrictWide) {
      final excluded = exclusions.any(
        (e) =>
            e.toLowerCase().contains(normalized) ||
            normalized.contains(e.toLowerCase()),
      );
      return !excluded;
    }

    return areas.any(
      (a) =>
          a.toLowerCase().contains(normalized) ||
          normalized.contains(a.toLowerCase().split(',').first.trim()),
    );
  }
}
