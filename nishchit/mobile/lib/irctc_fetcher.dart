// Fetches IRCTC chart data from the phone itself - the app's equivalent of
// extension/background.js. IRCTC refuses servers, but answers the user's own device.
//
//   1. Direct: an HTTP call from the app (native code has no CORS).
//   2. If IRCTC refuses that, make the call from inside IRCTC's own chart page, loaded in a
//      hidden WebView (same origin as the API, with the session cookies that page sets up).
//      The page is closed again after a couple of idle minutes.
//
// Requests are serialised with a small gap. Which requests are allowed, the headers, timings and
// what counts as a refusal all come from the hosted rules (rules_store.dart), read per call.

import 'dart:async';
import 'dart:convert';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:http/http.dart' as http;

import 'irctc_rules.dart';

class FetchResult {
  FetchResult(this.status, this.text, this.mode);
  final int status;
  final String text;
  final String mode;

  Map<String, Object> toJson() => {'status': status, 'text': text, 'mode': mode};
}

class IrctcFetcher {
  IrctcFetcher({required this.rules, this.userAgent = 'Nishchit/1.0 (Android/iOS app)'});

  /// Current rules; a getter so a refresh of the hosted file applies to the next call.
  final IrctcRules Function() rules;
  final String userAgent;

  static const _pageLoadTimeout = Duration(seconds: 30);
  static const _closePageAfter = Duration(minutes: 2);

  final _client = http.Client();
  Future<void> _queue = Future.value();
  DateTime _lastRequestAt = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _preferPageUntil = DateTime.fromMillisecondsSinceEpoch(0);

  HeadlessInAppWebView? _page;
  Completer<InAppWebViewController>? _pageReady;
  Timer? _closeTimer;

  /// One IRCTC call, queued behind any in flight. [request] comes from the web page:
  /// { method, path, body }. Throws on transport failure.
  Future<FetchResult> fetch(Object? request) {
    final r = rules();
    final req = r.validate(request); // throws FormatException -> 400 for the page
    final result = _queue.then((_) => _run(r, req));
    _queue = result.then((_) {}, onError: (_) {});
    return result;
  }

  Future<FetchResult> _run(IrctcRules r, ValidRequest req) async {
    final wait = _lastRequestAt.add(r.requestGap).difference(DateTime.now());
    if (!wait.isNegative) await Future.delayed(wait);
    _lastRequestAt = DateTime.now();

    if (DateTime.now().isAfter(_preferPageUntil)) {
      try {
        final direct = await _directFetch(r, req);
        if (!r.isRefusal(direct.status, direct.text)) return direct;
      } catch (_) {
        // fall through to the IRCTC page
      }
      _preferPageUntil = DateTime.now().add(r.preferPageFor);
    }
    return _pageFetch(r, req);
  }

  Future<FetchResult> _directFetch(IrctcRules r, ValidRequest req) async {
    final uri = Uri.parse('${r.origin}${req.path}');
    final headers = {...r.headersNow(), 'user-agent': userAgent};
    final res = await (req.method == 'GET'
            ? _client.get(uri, headers: headers)
            : _client.post(uri, headers: headers, body: req.body))
        .timeout(r.requestTimeout);
    return FetchResult(res.statusCode, utf8.decode(res.bodyBytes, allowMalformed: true), 'direct');
  }

  Future<FetchResult> _pageFetch(IrctcRules r, ValidRequest req) async {
    final controller = await _irctcPage(r);
    final out = await controller.callAsyncJavaScript(
      functionBody: '''
        try {
          const res = await fetch(path, { method, headers, body: body ?? undefined, credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
          return { status: res.status, text: await res.text() };
        } catch (err) {
          return { error: 'IRCTC request failed in the IRCTC page: ' + (err && err.message || err) };
        }
      ''',
      arguments: {
        'path': req.path,
        'method': req.method,
        'body': req.body,
        'headers': r.headersNow(),
        'timeoutMs': r.requestTimeout.inMilliseconds,
      },
    );
    _scheduleClose();
    final value = out?.value;
    if (out?.error != null) throw Exception('IRCTC page script failed: ${out!.error}');
    if (value is! Map) throw Exception('The IRCTC page did not return a result.');
    if (value['error'] != null) throw Exception('${value['error']}');
    return FetchResult((value['status'] as num).toInt(), '${value['text'] ?? ''}', 'page');
  }

  /// IRCTC's chart page in a hidden WebView, loaded once and reused.
  Future<InAppWebViewController> _irctcPage(IrctcRules r) async {
    final ready = _pageReady;
    if (ready != null) return ready.future;

    final completer = Completer<InAppWebViewController>();
    _pageReady = completer;
    final page = HeadlessInAppWebView(
      initialUrlRequest: URLRequest(url: WebUri(r.chartsPage)),
      initialSettings: InAppWebViewSettings(javaScriptEnabled: true),
      onLoadStop: (controller, url) async {
        if (completer.isCompleted) return;
        await Future.delayed(r.pageSettle); // let IRCTC set up its session
        if (!completer.isCompleted) completer.complete(controller);
      },
      onReceivedError: (controller, request, error) {
        if (request.isForMainFrame == true && !completer.isCompleted) {
          completer.completeError(Exception('Could not open IRCTC: ${error.description}'));
        }
      },
    );
    _page = page;
    try {
      await page.run();
      return await completer.future.timeout(_pageLoadTimeout, onTimeout: () => throw Exception('IRCTC took too long to load.'));
    } catch (_) {
      await _closePage();
      rethrow;
    }
  }

  void _scheduleClose() {
    _closeTimer?.cancel();
    _closeTimer = Timer(_closePageAfter, _closePage);
  }

  Future<void> _closePage() async {
    _closeTimer?.cancel();
    final page = _page;
    _page = null;
    _pageReady = null;
    await page?.dispose();
  }

  Future<void> dispose() async {
    _client.close();
    await _closePage();
  }
}
