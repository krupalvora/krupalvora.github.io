import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nishchit/irctc_rules.dart';

/// The real file the site hosts (nishchit/irctc-rules.json).
final _text = File('../irctc-rules.json').readAsStringSync();
final rules = IrctcRules.parse(_text);

String _with(void Function(Map<String, dynamic>) edit) {
  final m = jsonDecode(_text) as Map<String, dynamic>;
  edit(m);
  return jsonEncode(m);
}

void main() {
  test('allows the schedule GET', () {
    final r = rules.validate({'method': 'GET', 'path': '/eticketing/protected/mapps1/trnscheduleenquiry/19017'});
    expect(r.name, 'schedule');
    expect(r.body, isNull);
  });

  test('rebuilds coachComposition body from known fields only', () {
    final r = rules.validate({
      'method': 'POST',
      'path': '/online-charts/api/coachComposition',
      'body': jsonEncode({
        'trainNo': '19017', 'jDate': '2026-11-22', 'boardingStation': 'bdts', 'remoteStation': 'BDTS',
        'trainSourceStation': 'BDTS', 'coach': 's4', 'cls': 'SL', 'extra': 'dropped',
      }),
    });
    final body = jsonDecode(r.body!) as Map;
    expect(body['boardingStation'], 'BDTS');
    expect(body['coach'], 'S4');
    expect(body.containsKey('extra'), isFalse);
  });

  test('rejects unknown paths, wrong methods and bad input', () {
    expect(() => rules.validate({'method': 'GET', 'path': '/eticketing/login'}), throwsFormatException);
    expect(() => rules.validate({'method': 'GET', 'path': '/online-charts/api/trainComposition'}), throwsFormatException);
    expect(
      () => rules.validate({
        'method': 'POST',
        'path': '/online-charts/api/trainComposition',
        'body': jsonEncode({'trainNo': '1; drop', 'jDate': '2026-11-22', 'boardingStation': 'BDTS'}),
      }),
      throwsFormatException,
    );
  });

  test('isRefusal spots blocks, not data', () {
    expect(rules.isRefusal(403, ''), isTrue);
    expect(rules.isRefusal(200, '<html><title>Access Denied</title>'), isTrue);
    expect(rules.isRefusal(200, '{"error":"Chart not prepared"}'), isFalse);
  });

  test('headers fill {now}', () {
    expect(int.tryParse(rules.headersNow()['greq']!), isNotNull);
  });

  test('a new IRCTC field needs only a rules edit', () {
    final updated = IrctcRules.parse(_with((m) {
      (m['routes'][1]['fields'] as Map)['quota'] = {'re': r'^(GN|TQ)$', 'upper': true};
    }));
    final r = updated.validate({
      'method': 'POST',
      'path': '/online-charts/api/trainComposition',
      'body': jsonEncode({'trainNo': '19017', 'jDate': '2026-11-22', 'boardingStation': 'BDTS', 'quota': 'gn'}),
    });
    expect((jsonDecode(r.body!) as Map)['quota'], 'GN');
  });

  test('unsafe or unknown rules files are refused', () {
    expect(() => IrctcRules.parse(_with((m) => m['origin'] = 'https://evil.example')), throwsFormatException);
    expect(() => IrctcRules.parse(_with((m) => m['origin'] = 'http://www.irctc.co.in')), throwsFormatException);
    expect(() => IrctcRules.parse(_with((m) => m['routes'][0]['path'] = '/.*')), throwsFormatException);
    expect(() => IrctcRules.parse(_with((m) => m['schema'] = supportedSchema + 1)), throwsFormatException);
    expect(() => IrctcRules.parse('not json'), throwsFormatException);
  });

  test('timings are clamped to polite limits', () {
    final fast = IrctcRules.parse(_with((m) => m['timing']['requestGapMs'] = 0));
    expect(fast.requestGap, const Duration(milliseconds: 200));
  });
}
