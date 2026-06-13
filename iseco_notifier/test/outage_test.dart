import 'package:flutter_test/flutter_test.dart';
import 'package:iseco_notifier/models/outage.dart';

void main() {
  group('Outage.affectsBarangay', () {
    test('district-wide excludes specific barangay', () {
      final outage = Outage(
        id: '1',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 15),
        startTime: '05:30',
        endTime: '13:30',
        areas: ['Whole 1st District of Ilocos Sur'],
        exclusions: ['Puro, Caoayan'],
        isDistrictWide: true,
      );

      expect(outage.affectsBarangay('Puro, Caoayan'), false);
      expect(outage.affectsBarangay('Vigan City'), true);
    });

    test('specific barangay match', () {
      final outage = Outage(
        id: '2',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 17),
        startTime: '08:30',
        endTime: '17:00',
        areas: ['Baluarte, Vigan City', 'Salindeg, Vigan City'],
      );

      expect(outage.affectsBarangay('Baluarte'), true);
      expect(outage.affectsBarangay('Candon City'), false);
    });
  });
}
