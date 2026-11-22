// What the app is allowed to fetch from IRCTC, and how. Loaded from irctc-rules.json (hosted
// with the site, see rules_store.dart), so a change in IRCTC's endpoints, request fields,
// headers or block pages needs a JSON edit, not an app release.
//
// Hard limits that no rules file can lift: HTTPS only, host must be irctc.co.in.

import 'dart:convert';

/// Highest irctc-rules.json "schema" this app understands. Files with a higher schema are
/// ignored (the app keeps its previous rules), so the format can evolve without breaking old apps.
const supportedSchema = 1;

class ValidRequest {
  ValidRequest(this.name, this.method, this.path, this.body);
  final String name;
  final String method;
  final String path;
  final String? body;
}

class FieldRule {
  FieldRule(this.re, this.upper);
  final RegExp re;
  final bool upper;
}

class RouteRule {
  RouteRule(this.name, this.method, this.path, this.fields);
  final String name;
  final String method;
  final RegExp path;
  final Map<String, FieldRule>? fields; // null for GET (no body)
}

class IrctcRules {
  IrctcRules._({
    required this.revision,
    required this.origin,
    required this.chartsPage,
    required this.routes,
    required this.headers,
    required this.refusalStatuses,
    required this.refusalPatterns,
    required this.requestGap,
    required this.requestTimeout,
    required this.pageSettle,
    required this.preferPageFor,
  });

  final int revision;
  final String origin;
  final String chartsPage;
  final List<RouteRule> routes;
  final Map<String, String> headers;
  final Set<int> refusalStatuses;
  final List<RegExp> refusalPatterns;
  final Duration requestGap;
  final Duration requestTimeout;
  final Duration pageSettle;
  final Duration preferPageFor;

  /// Parses and checks a rules file. Throws [FormatException] if anything is off, so a bad
  /// file is never half-applied.
  factory IrctcRules.parse(String text) {
    final Object? root;
    try {
      root = jsonDecode(text);
    } catch (_) {
      throw const FormatException('rules: not JSON');
    }
    if (root is! Map) throw const FormatException('rules: not an object');
    final schema = root['schema'];
    if (schema is! int || schema < 1 || schema > supportedSchema) throw FormatException('rules: unsupported schema $schema');

    final origin = _str(root, 'origin');
    final chartsPage = _str(root, 'chartsPage');
    _checkIrctcUrl(origin);
    _checkIrctcUrl(chartsPage);

    final routesRaw = root['routes'];
    if (routesRaw is! List || routesRaw.isEmpty) throw const FormatException('rules: routes missing');
    final routes = routesRaw.map((r) {
      if (r is! Map) throw const FormatException('rules: bad route');
      final method = _str(r, 'method').toUpperCase();
      if (method != 'GET' && method != 'POST') throw FormatException('rules: method $method not allowed');
      final fieldsRaw = r['fields'];
      Map<String, FieldRule>? fields;
      if (method == 'POST') {
        if (fieldsRaw is! Map || fieldsRaw.isEmpty) throw const FormatException('rules: POST route needs fields');
        fields = fieldsRaw.map((k, v) {
          if (v is! Map) throw FormatException('rules: bad field $k');
          return MapEntry('$k', FieldRule(_anchored(_str(v, 're')), v['upper'] == true));
        });
      }
      return RouteRule(_str(r, 'name'), method, _anchored(_str(r, 'path')), fields);
    }).toList();

    final headersRaw = root['headers'];
    if (headersRaw is! Map) throw const FormatException('rules: headers missing');
    final headers = headersRaw.map((k, v) => MapEntry('$k'.toLowerCase(), '$v'));

    final refusal = root['refusal'] is Map ? root['refusal'] as Map : const {};
    final timing = root['timing'] is Map ? root['timing'] as Map : const {};
    Duration ms(String key, int fallback, {int min = 0, int max = 120000}) {
      final v = timing[key];
      return Duration(milliseconds: (v is num ? v.toInt() : fallback).clamp(min, max));
    }

    return IrctcRules._(
      revision: root['revision'] is int ? root['revision'] as int : 0,
      origin: origin.replaceAll(RegExp(r'/+$'), ''),
      chartsPage: chartsPage,
      routes: routes,
      headers: headers,
      refusalStatuses: {for (final s in (refusal['statuses'] as List? ?? const [401, 403, 429, 520])) (s as num).toInt()},
      refusalPatterns: [for (final p in (refusal['bodyPatterns'] as List? ?? const [])) RegExp('$p', caseSensitive: false)],
      // A gap of at least 200 ms keeps the app polite to IRCTC whatever the file says.
      requestGap: ms('requestGapMs', 300, min: 200, max: 10000),
      requestTimeout: ms('requestTimeoutMs', 20000, min: 3000, max: 60000),
      pageSettle: ms('pageSettleMs', 1500, max: 10000),
      preferPageFor: Duration(minutes: ((timing['preferPageForMinutes'] as num?) ?? 10).toInt().clamp(0, 120)),
    );
  }

  /// Validates a request from the page and rebuilds its body from known fields only.
  /// Throws [FormatException] with a short reason.
  ValidRequest validate(Object? req) {
    if (req is! Map) throw const FormatException('request required');
    final path = '${req['path'] ?? ''}';
    final route = routes.where((r) => r.path.hasMatch(path)).firstOrNull;
    if (route == null) throw const FormatException('unknown endpoint');
    if (req['method'] != route.method) throw FormatException('use ${route.method}');
    final fields = route.fields;
    if (fields == null) return ValidRequest(route.name, route.method, path, null);

    Object? b;
    try {
      final raw = req['body'];
      b = raw is String ? jsonDecode(raw) : raw;
    } catch (_) {
      throw const FormatException('JSON body required');
    }
    if (b is! Map) throw const FormatException('JSON body required');
    final out = <String, String>{};
    for (final MapEntry(key: name, value: rule) in fields.entries) {
      var v = '${b[name] ?? ''}'.trim();
      if (rule.upper) v = v.toUpperCase();
      if (!rule.re.hasMatch(v)) throw FormatException('invalid $name');
      out[name] = v;
    }
    return ValidRequest(route.name, route.method, path, jsonEncode(out));
  }

  /// True when IRCTC refused the request outright (as opposed to answering with data or an error body).
  bool isRefusal(int status, String text) =>
      refusalStatuses.contains(status) || refusalPatterns.any((p) => p.hasMatch(text));

  /// Headers for one call; "{now}" becomes the current epoch milliseconds.
  Map<String, String> headersNow() {
    final now = '${DateTime.now().millisecondsSinceEpoch}';
    return headers.map((k, v) => MapEntry(k, v.replaceAll('{now}', now)));
  }
}

String _str(Map m, String key) {
  final v = m[key];
  if (v is! String || v.isEmpty) throw FormatException('rules: $key missing');
  return v;
}

/// Path and field patterns must match the whole value, so a loose rule can't widen access.
RegExp _anchored(String pattern) {
  if (!pattern.startsWith('^') || !pattern.endsWith(r'$')) throw FormatException('rules: pattern must be anchored: $pattern');
  return RegExp(pattern);
}

void _checkIrctcUrl(String url) {
  final u = Uri.tryParse(url);
  final ok = u != null && u.scheme == 'https' && (u.host == 'irctc.co.in' || u.host.endsWith('.irctc.co.in'));
  if (!ok) throw FormatException('rules: $url is not an https irctc.co.in address');
}
