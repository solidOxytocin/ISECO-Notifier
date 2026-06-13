import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../data/barangay_list.dart';
import '../services/supabase_service.dart';

/// Phase 5: Barangay preference screen.
/// Saves selections to Supabase devices table for server-side FCM filtering.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _supabase = SupabaseService();
  final Set<String> _selected = {};
  bool _loading = true;
  String? _fcmToken;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _fcmToken = await FirebaseMessaging.instance.getToken();
    if (_fcmToken != null) {
      final saved = await _supabase.getSavedBarangays(_fcmToken!);
      _selected.addAll(saved);
    }
    setState(() => _loading = false);
  }

  Future<void> _save() async {
    if (_fcmToken != null) {
      await _supabase.registerDevice(
        fcmToken: _fcmToken!,
        platform: Platform.isAndroid ? 'android' : 'ios',
        barangays: _selected.toList(),
      );
    }
    if (mounted) Navigator.pop(context, _selected.toList());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Areas'),
        actions: [
          TextButton(onPressed: _save, child: const Text('Save')),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'Select barangays or municipalities to highlight outages that affect you. '
                    'Leave empty to see all outages.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                if (_selected.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Wrap(
                      spacing: 8,
                      children: _selected
                          .map((b) => InputChip(
                                label: Text(b),
                                onDeleted: () =>
                                    setState(() => _selected.remove(b)),
                              ))
                          .toList(),
                    ),
                  ),
                Expanded(
                  child: ListView.builder(
                    itemCount: ilocosSurLocations.length,
                    itemBuilder: (context, index) {
                      final location = ilocosSurLocations[index];
                      final checked = _selected.contains(location);
                      return CheckboxListTile(
                        title: Text(location),
                        value: checked,
                        onChanged: (v) {
                          setState(() {
                            if (v == true) {
                              _selected.add(location);
                            } else {
                              _selected.remove(location);
                            }
                          });
                        },
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() => _selected.clear());
                    },
                    child: const Text('Clear all (show every outage)'),
                  ),
                ),
              ],
            ),
    );
  }
}
