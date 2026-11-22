// Where the app's IRCTC rules come from, newest valid copy wins:
//   1. the hosted file  https://krupalvora.github.io/nishchit/irctc-rules.json  (refreshed at launch)
//   2. the last good hosted copy, cached on the phone (works offline)
//   3. the copy bundled in the app (first launch with no network)
// A file that fails to parse, or has an unknown schema, is ignored and the previous rules stay.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'irctc_rules.dart';

class RulesStore {
  static const _cacheKey = 'nishchit.irctcRules';

  IrctcRules? _rules;
  IrctcRules get rules => _rules!;

  /// Loads the cached or bundled rules (fast, offline), then refreshes from the site in the
  /// background. Call once at startup.
  Future<void> init() async {
    final bundled = _tryParse(await rootBundle.loadString('assets/web/irctc-rules.json'), 'bundled');
    final prefs = await SharedPreferences.getInstance();
    final cachedText = prefs.getString(_cacheKey);
    final cached = cachedText == null ? null : _tryParse(cachedText, 'cached');
    _rules = _newest(cached, bundled) ?? (throw StateError('No usable IRCTC rules: the bundled file is broken.'));
    unawaited(refresh());
  }

  /// Fetches the hosted rules; applies and caches them if valid and not older than ours.
  Future<void> refresh() async {
    try {
      final res = await http.get(Uri.parse(rulesUrl), headers: {'cache-control': 'no-cache'}).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return;
      final remote = _tryParse(res.body, 'hosted');
      if (remote == null || remote.revision < rules.revision) return;
      _rules = remote;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, res.body);
      debugPrint('[nishchit] IRCTC rules revision ${remote.revision} from $rulesUrl');
    } catch (err) {
      debugPrint('[nishchit] could not refresh IRCTC rules: $err'); // keep the current ones
    }
  }

  IrctcRules? _newest(IrctcRules? a, IrctcRules? b) {
    if (a == null) return b;
    if (b == null) return a;
    return a.revision >= b.revision ? a : b;
  }

  IrctcRules? _tryParse(String text, String source) {
    try {
      return IrctcRules.parse(text);
    } catch (err) {
      debugPrint('[nishchit] ignoring $source IRCTC rules: $err');
      return null;
    }
  }
}
