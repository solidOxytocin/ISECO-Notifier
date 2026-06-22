import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/outage.dart';

class SupabaseService {
  SupabaseClient get _client => Supabase.instance.client;

  Future<List<Outage>> fetchUpcomingOutages() async {
    final today = DateTime.now().toIso8601String().split('T').first;

    final data = await _client
        .from('outages')
        .select()
        .gte('outage_date', today)
        .order('outage_type')
        .order('outage_date')
        .order('start_time');

    final outages = (data as List)
        .map((row) => Outage.fromJson(row as Map<String, dynamic>))
        .toList();

    outages.sort((a, b) {
      if (a.isEmergency != b.isEmergency) {
        return a.isEmergency ? -1 : 1;
      }
      final dateCmp = a.outageDate.compareTo(b.outageDate);
      if (dateCmp != 0) return dateCmp;
      return a.startTime.compareTo(b.startTime);
    });

    return outages;
  }

  Future<void> registerDevice({
    required String fcmToken,
    required String platform,
    List<String> barangays = const [],
  }) async {
    await _client.from('devices').upsert({
      'fcm_token': fcmToken,
      'platform': platform,
      'barangays': barangays,
      'updated_at': DateTime.now().toIso8601String(),
    }, onConflict: 'fcm_token');
  }

  Future<List<String>> getSavedBarangays(String fcmToken) async {
    final data = await _client
        .from('devices')
        .select('barangays')
        .eq('fcm_token', fcmToken)
        .maybeSingle();

    if (data == null) return [];
    return List<String>.from(data['barangays'] as List? ?? []);
  }
}
