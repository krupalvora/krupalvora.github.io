// Nishchit mobile: the Nishchit website running in a WebView, with IRCTC's chart fetched by the
// phone itself.
//
// Nothing IRCTC-specific is compiled into the app (see config.dart):
//   - the page and its chart parsing load live from the site, so a fix pushed to GitHub Pages
//     reaches every phone on its next launch, with no app update;
//   - which IRCTC requests the phone may make comes from irctc-rules.json on the same site.
// The bundled copies are only used when the site can't be reached.
//
// The page already talks to the browser extension over window.postMessage
// (js/data/extensionBridge.js). The app speaks the same protocol:
//   page -> { type: 'nishchit:ping' }               -> { type: 'nishchit:ready', version }
//   page -> { type: 'nishchit:fetch', id, request } -> { type: 'nishchit:response', id, status, text | error }

import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';
import 'irctc_fetcher.dart';
import 'rules_store.dart';

final _server = InAppLocalhostServer(documentRoot: 'assets/web', port: localPort, shared: true);
final _rules = RulesStore();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([_server.start(), _rules.init()]);
  runApp(const NishchitApp());
}

/// Pages allowed to use the bridge and to load inside the app: the live site under /nishchit/
/// and the bundled copy. Everything else opens in the phone's browser.
bool _isNishchitPage(Uri? uri) {
  if (uri == null) return false;
  final site = Uri.parse(siteUrl);
  if (uri.scheme == site.scheme && uri.host == site.host && uri.path.startsWith(site.path)) return true;
  return '${uri.scheme}://${uri.host}:${uri.port}' == localOrigin;
}

class NishchitApp extends StatelessWidget {
  const NishchitApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nishchit',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF0F766E), useMaterial3: true),
      home: const NishchitPage(),
    );
  }
}

class NishchitPage extends StatefulWidget {
  const NishchitPage({super.key});

  @override
  State<NishchitPage> createState() => _NishchitPageState();
}

class _NishchitPageState extends State<NishchitPage> {
  final _fetcher = IrctcFetcher(rules: () => _rules.rules, userAgent: 'Nishchit/$appVersion (mobile app)');
  InAppWebViewController? _web;
  bool _loading = true;
  bool _usingBundled = false;

  @override
  void dispose() {
    _fetcher.dispose();
    super.dispose();
  }

  Future<Object> _handleFetch(InAppWebViewController controller, List<dynamic> args) async {
    if (!_isNishchitPage(await controller.getUrl())) {
      return {'error': 'This page is not allowed to use the Nishchit app.'};
    }
    try {
      final result = await _fetcher.fetch(args.isEmpty ? null : args.first);
      return result.toJson();
    } on FormatException catch (err) {
      return {'status': 400, 'text': jsonEncode({'error': 'Bad request: ${err.message}'})};
    } catch (err) {
      return {'error': '$err'.replaceFirst('Exception: ', '')};
    }
  }

  Future<NavigationActionPolicy> _route(InAppWebViewController controller, NavigationAction action) async {
    final uri = action.request.url;
    if (uri == null || const {'about', 'data', 'blob'}.contains(uri.scheme) || _isNishchitPage(uri)) {
      return NavigationActionPolicy.ALLOW;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication); // IRCTC, GitHub, portfolio...
    return NavigationActionPolicy.CANCEL;
  }

  /// The live site couldn't load (offline, Pages down): show the copy bundled in the app.
  Future<void> _fallBackToBundled(InAppWebViewController controller) async {
    if (_usingBundled) return;
    _usingBundled = true;
    debugPrint('[nishchit] live site unreachable, using the bundled copy');
    await controller.loadUrl(urlRequest: URLRequest(url: WebUri('$localOrigin/index.html')));
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          final web = _web;
          if (web != null && await web.canGoBack()) {
            await web.goBack();
          } else {
            await SystemNavigator.pop();
          }
        },
        child: Scaffold(
          backgroundColor: const Color(0xFFF8FAFC),
          body: SafeArea(
            child: Stack(
              children: [
                InAppWebView(
                  initialUrlRequest: URLRequest(url: WebUri(siteUrl)),
                  initialSettings: InAppWebViewSettings(
                    javaScriptEnabled: true,
                    useShouldOverrideUrlLoading: true,
                    supportMultipleWindows: true,
                    javaScriptCanOpenWindowsAutomatically: true,
                    allowsBackForwardNavigationGestures: true,
                    transparentBackground: true,
                    isInspectable: kDebugMode, // chrome://inspect / Safari Web Inspector in debug builds
                  ),
                  initialUserScripts: UnmodifiableListView([
                    UserScript(source: _bridgeScript, injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START),
                  ]),
                  onWebViewCreated: (controller) {
                    _web = controller;
                    controller.addJavaScriptHandler(
                      handlerName: 'nishchitFetch',
                      callback: (args) => _handleFetch(controller, args),
                    );
                  },
                  shouldOverrideUrlLoading: _route,
                  // target=_blank links (e.g. "Check the chart on IRCTC") open in the browser.
                  onCreateWindow: (controller, action) async {
                    final uri = action.request.url;
                    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
                    return false;
                  },
                  onReceivedError: (controller, request, error) {
                    if (request.isForMainFrame == true && !_isLocal(request.url)) _fallBackToBundled(controller);
                  },
                  onReceivedHttpError: (controller, request, response) {
                    final status = response.statusCode ?? 0;
                    if (request.isForMainFrame == true && status >= 500 && !_isLocal(request.url)) _fallBackToBundled(controller);
                  },
                  onLoadStop: (_, __) => setState(() => _loading = false),
                ),
                if (_loading) const LinearProgressIndicator(minHeight: 2),
              ],
            ),
          ),
        ),
      ),
    );
  }

  bool _isLocal(Uri? uri) => uri != null && '${uri.scheme}://${uri.host}:${uri.port}' == localOrigin;
}

final _allowedOrigins = jsonEncode([Uri.parse(siteUrl).origin, localOrigin]);

/// Injected into Nishchit pages at document start: the app's version of extension/content.js.
final _bridgeScript = '''
(() => {
  if (!$_allowedOrigins.includes(location.origin)) return;
  const version = 'app-$appVersion';
  const root = document.documentElement;
  root.dataset.nishchitExtension = version;
  root.dataset.nishchitApp = '$appVersion';
  const origin = location.origin;
  const post = (msg) => window.postMessage(msg, origin);

  const bridge = new Promise((resolve) => {
    const ready = () => window.flutter_inappwebview && window.flutter_inappwebview.callHandler;
    if (ready()) return resolve(window.flutter_inappwebview);
    window.addEventListener('flutterInAppWebViewPlatformReady', () => resolve(window.flutter_inappwebview), { once: true });
    const poll = setInterval(() => { if (ready()) { clearInterval(poll); resolve(window.flutter_inappwebview); } }, 50);
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== origin) return;
    const msg = event.data;
    if (msg && msg.type === 'nishchit:ping') { post({ type: 'nishchit:ready', version }); return; }
    if (!msg || msg.type !== 'nishchit:fetch' || typeof msg.id !== 'string') return;
    bridge
      .then((b) => b.callHandler('nishchitFetch', msg.request))
      .then(
        (reply) => post({ type: 'nishchit:response', id: msg.id, ...(reply || { error: 'No reply from the Nishchit app.' }) }),
        (err) => post({ type: 'nishchit:response', id: msg.id, error: 'Nishchit app error: ' + ((err && err.message) || err) }),
      );
  });

  post({ type: 'nishchit:ready', version });
})();
''';
