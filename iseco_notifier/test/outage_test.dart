import 'package:flutter_test/flutter_test.dart';
import 'package:iseco_notifier/models/outage.dart';

void main() {
  group('Outage district expansion', () {
    test('1st district: Vigan yes, Caoayan excluded', () {
      final outage = Outage(
        id: '1',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 15),
        startTime: '05:30',
        endTime: '13:30',
        district: '1st',
        areas: ['Nagpanaoan, Santa'],
        exclusions: ['Puro, Caoayan'],
      );

      expect(outage.affectedLocations, contains('Vigan City'));
      expect(outage.affectedLocations, isNot(contains('Caoayan')));
      expect(outage.affectsBarangay('Vigan City'), true);
      expect(outage.affectsBarangay('Puro, Caoayan'), false);
      expect(outage.affectsBarangay('Nagpanaoan'), true);
    });

    test('2nd district does not affect Vigan', () {
      final outage = Outage(
        id: '2',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 15),
        startTime: '08:00',
        endTime: '17:00',
        district: '2nd',
        areas: [],
      );

      expect(outage.affectsBarangay('Candon City'), true);
      expect(outage.affectsBarangay('Vigan City'), false);
    });

    test('specific barangay only', () {
      final outage = Outage(
        id: '3',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 17),
        startTime: '08:30',
        endTime: '17:00',
        areas: ['Baluarte, Vigan City'],
      );

      expect(outage.affectsBarangay('Baluarte'), true);
      expect(outage.affectsBarangay('Salindeg'), false);
    });
  });
}
