import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orthocare_ai/core/network/api_client.dart';
import 'package:orthocare_ai/core/theme/app_theme.dart';
import 'package:orthocare_ai/features/auth/auth_controller.dart';
import 'package:orthocare_ai/features/doctor/doctor_controller.dart';
import 'package:orthocare_ai/features/patient/patient_controller.dart';
import 'package:orthocare_ai/features/patient/patient_session_controller.dart';
import 'package:orthocare_ai/models/shift.dart';

/// Screen sizes (logical px) the layout tests run against.
class TestDevice {
  const TestDevice(this.name, this.size, {this.textScale = 1.0});

  final String name;
  final Size size;
  final double textScale;

  /// A small phone (e.g. older 4.7" Android): the tightest common width.
  static const small = TestDevice('small', Size(320, 640));

  /// A typical modern phone (Pixel 7/8 class).
  static const typical = TestDevice('typical', Size(393, 852));

  /// Typical phone with Android's largest font setting.
  static const largeText = TestDevice('large-text', Size(393, 852), textScale: 2.0);

  /// Small phone with a raised font size - the worst realistic combination.
  static const smallLargeText = TestDevice('small-large-text', Size(320, 640), textScale: 1.5);

  static const all = [small, typical, largeText, smallLargeText];
}

bool _fontsLoaded = false;

/// Real Roboto + Material Icons, so screenshots show real text instead of the
/// test font's boxes, and text metrics match a device.
///
/// They come from the Flutter SDK's material_fonts cache artifact, which some
/// SDK installs (e.g. the CI runner's) don't have. Without it the tests still
/// run - every overflow/clipping check still applies, with Flutter's test font
/// (whose square glyphs are wider than Roboto's, so it errs on the strict side)
/// - and only the optional screenshots lose real typography.
Future<void> loadAppFonts() async {
  if (_fontsLoaded) return;
  final dir = Directory('${_flutterRoot()}/bin/cache/artifacts/material_fonts');
  // TEST_FONTS=off reproduces an SDK without the font cache (as on CI).
  final files = dir.existsSync() && Platform.environment['TEST_FONTS'] != 'off'
      ? {for (final f in dir.listSync().whereType<File>()) f.uri.pathSegments.last.toLowerCase(): f}
      : <String, File>{};
  if (!files.containsKey('roboto-regular.ttf') || !files.containsKey('materialicons-regular.otf')) {
    // ignore: avoid_print
    print('Bundled fonts not found in ${dir.path}; rendering with the test font.');
    _fontsLoaded = true;
    return;
  }
  Future<ByteData> read(String name) async => ByteData.sublistView(await files[name]!.readAsBytes());

  final roboto = FontLoader('Roboto');
  for (final weight in ['regular', 'medium', 'bold', 'black']) {
    if (files.containsKey('roboto-$weight.ttf')) roboto.addFont(read('roboto-$weight.ttf'));
  }
  await roboto.load();
  await (FontLoader('MaterialIcons')..addFont(read('materialicons-regular.otf'))).load();
  _fontsLoaded = true;
}

/// The Flutter SDK root: FLUTTER_ROOT (set by the flutter tool), else derived
/// from the test runner's own path (<root>/bin/cache/artifacts/engine/...).
String _flutterRoot() {
  final env = Platform.environment['FLUTTER_ROOT'];
  if (env != null && env.isNotEmpty) return env.replaceAll(r'\', '/');
  final exe = File(Platform.resolvedExecutable).absolute.path.replaceAll(r'\', '/');
  final idx = exe.indexOf('/bin/cache/');
  if (idx == -1) throw StateError('Cannot locate the Flutter SDK from $exe; set FLUTTER_ROOT.');
  return exe.substring(0, idx);
}

/// Secure storage is a platform channel; in tests it simply holds nothing.
void stubPlatformChannels() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
    const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
    (call) async => null,
  );
}

/// No network in tests: every call resolves immediately and empty.
class FakeApiClient extends ApiClient {
  @override
  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async => {};
  @override
  Future<Map<String, dynamic>> post(String path, {Object? data}) async => {};
  @override
  Future<Map<String, dynamic>> put(String path, {Object? data}) async => {};
  @override
  Future<Map<String, dynamic>> delete(String path) async => {};
}

/// The real controllers restore themselves from storage/network when created;
/// these keep whatever state the test gives them.
class FixedAuthController extends AuthController {
  FixedAuthController(super.ref, AuthState fixed) {
    super.state = fixed;
    _locked = true;
  }
  bool _locked = false;
  @override
  set state(AuthState value) {
    if (!_locked) super.state = value;
  }
}

class FixedPatientSessionController extends PatientSessionController {
  FixedPatientSessionController(super.ref, PatientSession fixed) {
    super.state = fixed;
    _locked = true;
  }
  bool _locked = false;
  @override
  set state(PatientSession value) {
    if (!_locked) super.state = value;
  }
}

class FixedAttendanceController extends AttendanceController {
  FixedAttendanceController(super.ref, AsyncValue<AttendanceRecord?> fixed) {
    super.state = fixed;
    _locked = true;
  }
  bool _locked = false;
  @override
  set state(AsyncValue<AttendanceRecord?> value) {
    if (!_locked) super.state = value;
  }
}

class FixedChatController extends ChatController {
  FixedChatController(super.ref, ChatState fixed) {
    state = fixed;
  }
}

/// Overrides every test needs: no network, nobody signed in.
List<Override> baseOverrides() => [
      apiClientProvider.overrideWithValue(FakeApiClient()),
      authControllerProvider.overrideWith(
        (ref) => FixedAuthController(ref, const AuthState(status: AuthStatus.unauthenticated)),
      ),
      patientSessionProvider.overrideWith(
        (ref) => FixedPatientSessionController(ref, const PatientSession(status: PatientSessionStatus.none)),
      ),
    ];

/// Renders [screen] on [device] the way the app does (same themes), with an
/// optional on-screen keyboard of [keyboardHeight] logical px.
Future<void> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  TestDevice device = TestDevice.typical,
  List<Override> overrides = const [],
  bool dark = false,
  double keyboardHeight = 0,
  bool settle = true,
}) async {
  const dpr = 2.0;
  tester.view.devicePixelRatio = dpr;
  tester.view.physicalSize = device.size * dpr;
  // Status bar + gesture navigation bar, as on a real Android phone.
  tester.view.padding = const FakeViewPadding(top: 24 * dpr, bottom: 16 * dpr);
  tester.view.viewInsets = FakeViewPadding(bottom: keyboardHeight * dpr);
  tester.platformDispatcher.textScaleFactorTestValue = device.textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [...baseOverrides(), ...overrides],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        home: screen,
      ),
    ),
  );
  // Image decoding is real async work that pump() doesn't wait for.
  await tester.runAsync(() async {
    for (final element in find.byType(Image).evaluate()) {
      await precacheImage((element.widget as Image).image, element);
    }
  });
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump(const Duration(milliseconds: 300));
  }
}

/// Saves a PNG of the current screen to test/screenshots/<name>.png - only when
/// run locally with SCREENSHOTS=1 and --update-goldens (CI never writes them).
Future<void> maybeScreenshot(WidgetTester tester, String name) async {
  if (Platform.environment['SCREENSHOTS'] != '1') return;
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('../screenshots/$name.png'));
}

/// True when [finder]'s widget lies entirely inside [container]'s visible area -
/// e.g. a chat message inside the message list's viewport (above the composer).
bool isFullyInside(WidgetTester tester, Finder finder, Finder container) {
  final rect = tester.getRect(finder);
  final bounds = tester.getRect(container);
  return rect.left >= bounds.left - 0.01 &&
      rect.top >= bounds.top - 0.01 &&
      rect.right <= bounds.right + 0.01 &&
      rect.bottom <= bounds.bottom + 0.01;
}

/// True when [finder]'s widget is laid out entirely within the visible screen
/// (not clipped by its edges, the status bar, or the keyboard).
bool isFullyOnScreen(WidgetTester tester, Finder finder, {double keyboardHeight = 0}) {
  final rect = tester.getRect(finder);
  final view = tester.view;
  final size = view.physicalSize / view.devicePixelRatio;
  return rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= size.width + 0.01 &&
      rect.bottom <= size.height - keyboardHeight + 0.01;
}
