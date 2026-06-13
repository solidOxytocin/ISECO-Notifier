import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'cubit/outages_cubit.dart';
import 'screens/disclaimer_screen.dart';
import 'screens/outages_screen.dart';
import 'services/fcm_service.dart';
import 'services/supabase_service.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  await FcmService.backgroundHandler(message);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await dotenv.load(fileName: '.env');

  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  await Supabase.initialize(
    url: dotenv.env['SUPABASE_URL']!,
    anonKey: dotenv.env['SUPABASE_ANON_KEY']!,
  );

  runApp(const IsecoNotifierApp());
}

class IsecoNotifierApp extends StatefulWidget {
  const IsecoNotifierApp({super.key});

  @override
  State<IsecoNotifierApp> createState() => _IsecoNotifierAppState();
}

class _IsecoNotifierAppState extends State<IsecoNotifierApp> {
  final _supabase = SupabaseService();
  late final FcmService _fcm;
  late final OutagesCubit _outagesCubit;
  bool _disclaimerAccepted = false;

  @override
  void initState() {
    super.initState();
    _fcm = FcmService(_supabase);
    _outagesCubit = OutagesCubit(_supabase)..fetchOutages();
    _initFcm();
  }

  Future<void> _initFcm() async {
    final token = await _fcm.initialize();
    if (token != null) {
      final barangays = await _supabase.getSavedBarangays(token);
      _outagesCubit.setWatchedBarangays(barangays);
    }

    _fcm.setupForegroundHandler((message) {
      _outagesCubit.fetchOutages();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message.notification?.title ?? 'New outage')),
        );
      }
    });

    _fcm.setupOpenedAppHandler((_) => _outagesCubit.fetchOutages());
  }

  @override
  void dispose() {
    _outagesCubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _outagesCubit,
      child: MaterialApp(
        title: 'ISECO Notifier',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFFE53935),
            brightness: Brightness.light,
          ),
          useMaterial3: true,
        ),
        home: _disclaimerAccepted
            ? const OutagesScreen()
            : DisclaimerScreen(
                onAccept: () => setState(() => _disclaimerAccepted = true),
              ),
      ),
    );
  }
}
