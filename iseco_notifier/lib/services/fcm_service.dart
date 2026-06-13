import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';

import 'supabase_service.dart';

const fcmTopic = 'iseco_outages';

class FcmService {
  FcmService(this._supabase);

  final SupabaseService _supabase;
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  Future<String?> initialize({List<String> barangays = const []}) async {
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

  // Subscribe to broadcast topic for MVP (all outages)
    await _messaging.subscribeToTopic(fcmTopic);

    final token = await _messaging.getToken();
    if (token != null) {
      await _supabase.registerDevice(
        fcmToken: token,
        platform: Platform.isAndroid ? 'android' : 'ios',
        barangays: barangays,
      );
    }

    _messaging.onTokenRefresh.listen((newToken) async {
      await _supabase.registerDevice(
        fcmToken: newToken,
        platform: Platform.isAndroid ? 'android' : 'ios',
        barangays: barangays,
      );
    });

    return token;
  }

  void setupForegroundHandler(void Function(RemoteMessage) onMessage) {
    FirebaseMessaging.onMessage.listen(onMessage);
  }

  void setupOpenedAppHandler(void Function(RemoteMessage) onOpen) {
    FirebaseMessaging.onMessageOpenedApp.listen(onOpen);
  }

  static Future<void> backgroundHandler(RemoteMessage message) async {
    // Firebase handles display when notification payload is present
  }
}
