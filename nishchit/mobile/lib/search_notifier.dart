// "Your chart is ready" notifications.
//
// A chart search takes a while: IRCTC is asked for one coach at a time. If the user switches to
// another app meanwhile, the search keeps going (the IRCTC calls run in the app's Dart code), and
// when the page reports the result we post a notification. If the app is on screen, no
// notification: the result is already in front of them.
//
// The page tells us via the bridge (js/app/notify.js): 'nishchit:search-started' and
// 'nishchit:search-done' { title, body }.
//
// Platform limits: Android keeps the app running in the background for several minutes, which is
// plenty for a search. iOS suspends apps a few seconds after they leave the screen, so on iPhone a
// long search usually finishes when the user comes back rather than in the background.

import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class SearchNotifier with WidgetsBindingObserver {
  final _plugin = FlutterLocalNotificationsPlugin();
  AppLifecycleState _state = AppLifecycleState.resumed;
  bool _ready = false;
  bool _askedPermission = false;

  static const _channel = AndroidNotificationDetails(
    'search_results',
    'Search results',
    channelDescription: 'Tells you when a chart search finishes while Nishchit is in the background.',
    importance: Importance.high,
    priority: Priority.high,
  );

  Future<void> init() async {
    WidgetsBinding.instance.addObserver(this);
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        // Ask for permission on the first search, not at launch.
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    _ready = true;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => _state = state;

  /// First search: ask for notification permission, when the user can see why it's useful.
  Future<void> searchStarted() async {
    if (!_ready || _askedPermission) return;
    _askedPermission = true;
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    await _plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, sound: true);
  }

  /// Notify only if the user isn't looking at the app.
  Future<void> searchDone(String title, String body) async {
    if (!_ready || _state == AppLifecycleState.resumed) return;
    await _plugin.show(
      id: 1, // one at a time: a newer result replaces the older one
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
        android: _channel,
        iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true),
      ),
    );
  }

  void dispose() => WidgetsBinding.instance.removeObserver(this);
}
