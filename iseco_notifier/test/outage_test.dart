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
    test('inline except: Puerto excluded, route area affected', () {
      final outage = Outage(
        id: '4',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 16),
        startTime: '08:30',
        endTime: '17:00',
        areas: ['SIVED to CALAY-AB, Sto. Domingo'],
        exclusions: ['Puerto, Sto. Domingo'],
      );

      expect(outage.affectsBarangay('Puerto'), false);
      expect(outage.affectsBarangay('Puerto, Sto. Domingo'), false);
      expect(outage.affectsBarangay('SIVED'), true);
    });

    test('whole municipality: all barangays in Vigan affected', () {
      final outage = Outage(
        id: '5',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 18),
        startTime: '08:00',
        endTime: '17:00',
        areas: ['Vigan City'],
      );

      expect(outage.affectsBarangay('Vigan City'), true);
      expect(outage.affectsBarangay('Baluarte, Vigan City'), true);
      expect(outage.affectsBarangay('Salindeg'), false);
    });

    test('whole municipality with exclusion', () {
      final outage = Outage(
        id: '6',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 18),
        startTime: '08:00',
        endTime: '17:00',
        areas: ['Vigan City'],
        exclusions: ['Baluarte, Vigan City'],
      );

      expect(outage.affectsBarangay('Baluarte, Vigan City'), false);
      expect(outage.affectsBarangay('Salindeg, Vigan City'), true);
    });

    test('partial areas: match watched barangay, distinguish from full', () {
      final outage = Outage(
        id: '7',
        createdAt: DateTime.now(),
        outageDate: DateTime(2026, 6, 18),
        startTime: '08:00',
        endTime: '17:00',
        areas: ['Darapidap, Candon City'],
        partialAreas: ['San Jose, Candon City'],
      );

      expect(outage.affectsBarangay('San Jose, Candon City'), true);
      expect(outage.affectsBarangayPartialOnly('San Jose, Candon City'), true);
      expect(outage.affectsBarangayFull('San Jose, Candon City'), false);
      expect(outage.affectsBarangayFull('Darapidap, Candon City'), true);
      expect(outage.affectsBarangayPartialOnly('Darapidap, Candon City'), false);
      expect(outage.hasPartialAreas, true);
    });
  });
}
