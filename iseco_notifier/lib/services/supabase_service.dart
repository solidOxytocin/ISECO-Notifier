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
      if (a.isCancelled != b.isCancelled) {
        return a.isCancelled ? 1 : -1;
      }
      if (a.isEmergency != b.isEmergency) {
        return a.isEmergency ? -1 : 1;
      }
      final dateCmp = a.outageDate.compareTo(b.outageDate);
      if (dateCmp != 0) return dateCmp;
      return a.startTime.compareTo(b.startTime);
    });

    return outages;
  }

  /// Upserts the device row. When [barangays] is null the column is left
  /// untouched so token registration (e.g. on every launch / token refresh)
  /// never clobbers the user's saved area preferences — only an explicit
  /// Settings save passes a non-null list.
  Future<void> registerDevice({
    required String fcmToken,
    required String platform,
    List<String>? barangays,
  }) async {
    final payload = <String, dynamic>{
      'fcm_token': fcmToken,
      'platform': platform,
      'updated_at': DateTime.now().toIso8601String(),
    };
    if (barangays != null) {
      payload['barangays'] = barangays;
    }
    await _client.from('devices').upsert(payload, onConflict: 'fcm_token');
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
