// Renders the real screens on small/typical/large-text phones, light and dark.
// Any overflow ("RenderFlex overflowed") or other layout error fails the test.
//
// Locally, `SCREENSHOTS=1 flutter test --update-goldens test/screens` also
// writes PNGs to test/screenshots/ for visual review (not committed, not in CI).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orthocare_ai/features/admin/admin_controller.dart';
import 'package:orthocare_ai/features/admin/presentation/admin_dashboard_screen.dart';
import 'package:orthocare_ai/features/auth/auth_controller.dart';
import 'package:orthocare_ai/features/auth/presentation/login_screen.dart';
import 'package:orthocare_ai/features/auth/presentation/splash_screen.dart';
import 'package:orthocare_ai/features/auth/presentation/welcome_screen.dart';
import 'package:orthocare_ai/features/doctor/doctor_controller.dart';
import 'package:orthocare_ai/features/doctor/presentation/doctor_dashboard_screen.dart';
import 'package:orthocare_ai/features/doctor/presentation/escalation_detail_screen.dart';
import 'package:orthocare_ai/features/doctor/presentation/escalations_list_screen.dart';
import 'package:orthocare_ai/features/patient/patient_controller.dart';
import 'package:orthocare_ai/features/patient/patient_session_controller.dart';
import 'package:orthocare_ai/features/patient/presentation/chat_screen.dart';
import 'package:orthocare_ai/features/patient/presentation/escalation_status_screen.dart';
import 'package:orthocare_ai/features/patient/presentation/patient_dashboard_screen.dart';
import 'package:orthocare_ai/features/patient/presentation/patient_start_screen.dart';
import 'package:orthocare_ai/models/chat_message.dart';
import 'package:orthocare_ai/models/dashboard_stats.dart';
import 'package:orthocare_ai/models/escalation.dart';
import 'package:orthocare_ai/models/shift.dart';
import 'package:orthocare_ai/models/user.dart';

import '../support/harness.dart';

final _now = DateTime(2026, 10, 12, 15, 42);

ChatMessage _p(String id, String text) =>
    ChatMessage(id: id, sender: MessageSender.patient, text: text, createdAt: _now);

ChatMessage _a(String id, String text, {String reason = 'answered', bool needsHuman = false}) => ChatMessage(
      id: id,
      sender: MessageSender.assistant,
      text: text,
      createdAt: _now,
      reason: reason,
      needsHumanFollowUp: needsHuman,
    );

/// Four assistant responses: greeting, a question back, then two real answers.
final _fourResponseConversation = [
  _p('p1', 'Hi'),
  _a('a1', "Hi! I'm Dr. Shekhar Srivastav's Assistant. Hope you're feeling well. How can I help you today?",
      reason: 'greeting'),
  _p('p2', 'My leg is swollen since yesterday'),
  _a('a2', 'I\'m sorry to hear that. Which surgery did you have — knee replacement, arthroscopy, or fracture fixation?',
      reason: 'awaiting_patient_reply: asked_surgery'),
  _p('p3', 'Knee replacement 2 weeks ago'),
  _a('a3', 'Thanks. Are you experiencing any shortness of breath, chest pain, or a sudden rapid heartbeat?',
      reason: 'awaiting_patient_reply: dvt_q1'),
  _p('p4', 'No'),
  _a(
    'a4',
    'Mild, generalised swelling is normal after a knee replacement.\n\n'
        '- Do ankle pump exercises regularly.\n'
        '- Keep the leg elevated above heart level.\n'
        '- Pillows go under the ankle, never directly under the knee.',
    reason: 'green_flag',
  ),
];

Override _chat(List<ChatMessage> messages, {bool sending = false, String? error}) =>
    chatControllerProvider.overrideWith((ref) =>
        FixedChatController(ref, ChatState(sessionId: 's1', messages: messages, sending: sending, error: error)));

Override _signedIn(UserRole role, String name) => authControllerProvider.overrideWith(
      (ref) => FixedAuthController(
        ref,
        AuthState(status: AuthStatus.authenticated, user: AppUser(id: 'u1', name: name, role: role)),
      ),
    );

final _escalation = Escalation(
  id: 'e1',
  patientId: 'pt1',
  patientName: 'Ramesh Kumar Sharma',
  patientPhone: '9876543210',
  surgeryType: 'Total Knee Replacement',
  chatSessionId: 's1',
  question: 'My calf is red, warm and very painful since this morning. Is this normal after my knee replacement?',
  aiResponse: 'Please take a clear photo of both of your legs side-by-side. I am escalating this to the team.',
  reason: 'dvt_yellow_flag',
  priority: EscalationPriority.urgent,
  status: EscalationStatus.waitingForDoctor,
  createdAt: _now,
);

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    stubPlatformChannels();
    await loadAppFonts();
  });

  for (final device in TestDevice.all) {
    group(device.name, () {
      testWidgets('welcome', (tester) async {
        await pumpScreen(tester, const WelcomeScreen(), device: device);
        // On a typical phone both entry actions are visible without scrolling.
        if (device == TestDevice.typical) {
          expect(isFullyOnScreen(tester, find.text("I'm a patient")), isTrue);
          expect(isFullyOnScreen(tester, find.text('Clinic staff sign in')), isTrue);
        }
        await maybeScreenshot(tester, '${device.name}/welcome');
      });

      testWidgets('splash', (tester) async {
        await pumpScreen(tester, const SplashScreen(), device: device, settle: false);
        await maybeScreenshot(tester, '${device.name}/splash');
      });

      testWidgets('staff login, keyboard closed', (tester) async {
        await pumpScreen(tester, const LoginScreen(), device: device);
        await maybeScreenshot(tester, '${device.name}/login');
      });

      testWidgets('staff login, keyboard open: the Log in button can always be reached', (tester) async {
        const keyboard = 300.0;
        await pumpScreen(tester, const LoginScreen(), device: device, keyboardHeight: keyboard);
        await tester.tap(find.byType(TextFormField).last);
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Log in'));
        await tester.pumpAndSettle();
        expect(isFullyOnScreen(tester, find.text('Log in'), keyboardHeight: keyboard), isTrue);
        await maybeScreenshot(tester, '${device.name}/login-keyboard');
      });

      testWidgets('patient start', (tester) async {
        await pumpScreen(tester, const PatientStartScreen(), device: device);
        await maybeScreenshot(tester, '${device.name}/patient-start');
      });

      for (final dark in [false, true]) {
        final mode = dark ? 'dark' : 'light';

        testWidgets('patient dashboard ($mode)', (tester) async {
          await pumpScreen(
            tester,
            const PatientDashboardScreen(),
            device: device,
            dark: dark,
            overrides: [
              patientSessionProvider.overrideWith((ref) => FixedPatientSessionController(
                    ref,
                    const PatientSession(status: PatientSessionStatus.active, sessionId: 's1', name: 'Anita'),
                  )),
            ],
          );
          await maybeScreenshot(tester, '${device.name}/patient-dashboard-$mode');
        });

        testWidgets('chat: four responses, feedback only on the latest answer ($mode)', (tester) async {
          await pumpScreen(tester, const ChatScreen(), device: device, dark: dark, overrides: [
            _chat(_fourResponseConversation),
          ]);
          expect(find.text('Was this helpful?'), findsOneWidget);
          // The conversation opens on the newest message, and the
          // doctor-escalation action is fully visible inside the message list -
          // not clipped at the right edge (the old Row) or hidden behind the
          // composer - with no scrolling needed.
          final list = find.byType(ListView);
          final button = find.ancestor(of: find.text('No, talk to a doctor'), matching: find.byType(FilledButton));
          expect(isFullyInside(tester, button, list), isTrue);
          expect(isFullyInside(tester, find.text('Yes, thanks'), list), isTrue);
          await maybeScreenshot(tester, '${device.name}/chat-$mode');
        });

        testWidgets('chat: waiting for a reply ($mode)', (tester) async {
          await pumpScreen(
            tester,
            const ChatScreen(),
            device: device,
            dark: dark,
            settle: false,
            overrides: [_chat(_fourResponseConversation.sublist(0, 3), sending: true)],
          );
          expect(find.text('Was this helpful?'), findsNothing);
          await maybeScreenshot(tester, '${device.name}/chat-typing-$mode');
        });

        testWidgets('doctor dashboard ($mode)', (tester) async {
          await pumpScreen(tester, const DoctorDashboardScreen(), device: device, dark: dark, overrides: [
            _signedIn(UserRole.doctor, 'Dr. Shekhar Srivastav'),
            doctorDashboardProvider.overrideWith((ref) async => const DoctorDashboardData(
                  todayShift: Shift(id: 'sh1', doctorId: 'd1', doctorName: 'Dr', startTime: '09:00', endTime: '17:00'),
                  newCases: 3,
                  pending: 5,
                  resolved: 12,
                  averageResponseMinutes: 14,
                )),
            attendanceControllerProvider.overrideWith(
              (ref) => FixedAttendanceController(ref, AsyncValue.data(AttendanceRecord(id: 'at1', punchIn: _now))),
            ),
          ]);
          await maybeScreenshot(tester, '${device.name}/doctor-dashboard-$mode');
        });

        testWidgets('admin dashboard ($mode)', (tester) async {
          await pumpScreen(tester, const AdminDashboardScreen(), device: device, dark: dark, overrides: [
            _signedIn(UserRole.admin, 'Admin'),
            adminDashboardProvider.overrideWith((ref) async => const AdminDashboardStats(
                  activeDoctors: 2,
                  patientChats: 148,
                  resolvedByAssistant: 121,
                  humanEscalations: 27,
                  pending: 4,
                  urgent: 1,
                  doctorPerformance: [
                    DoctorPerformance(
                      doctorId: 'd1',
                      doctorName: 'Dr. Shekhar Srivastav',
                      assigned: 18,
                      resolved: 16,
                      pending: 2,
                      averageResponseMinutes: 11,
                      slaBreaches: 1,
                    ),
                  ],
                )),
          ]);
          await maybeScreenshot(tester, '${device.name}/admin-dashboard-$mode');
        });

        testWidgets('doctor case list ($mode)', (tester) async {
          await pumpScreen(tester, const EscalationsListScreen(), device: device, dark: dark, overrides: [
            _signedIn(UserRole.doctor, 'Dr. Shekhar Srivastav'),
            doctorEscalationsProvider.overrideWith((ref) async => [_escalation]),
          ]);
          await maybeScreenshot(tester, '${device.name}/cases-$mode');
        });

        testWidgets('doctor case detail ($mode)', (tester) async {
          await pumpScreen(tester, const EscalationDetailScreen(escalationId: 'e1'),
              device: device,
              dark: dark,
              overrides: [
                _signedIn(UserRole.doctor, 'Dr. Shekhar Srivastav'),
                escalationDetailProvider('e1').overrideWith((ref) async => _escalation),
                doctorEscalationsProvider.overrideWith((ref) async => [_escalation]),
              ]);
          await maybeScreenshot(tester, '${device.name}/case-detail-$mode');
        });

        testWidgets('patient requests ($mode)', (tester) async {
          await pumpScreen(tester, const EscalationStatusScreen(), device: device, dark: dark, overrides: [
            patientEscalationsProvider.overrideWith((ref) async => [_escalation]),
          ]);
          await maybeScreenshot(tester, '${device.name}/patient-requests-$mode');
        });
      }
    });
  }

  group('chat feedback eligibility, on screen', () {
    testWidgets('after the first response: no feedback', (tester) async {
      await pumpScreen(tester, const ChatScreen(), overrides: [
        _chat([_p('p1', 'Can I shower?'), _a('a1', 'Keep the dressing dry.')]),
      ]);
      expect(find.text('Was this helpful?'), findsNothing);
      expect(find.text('No, talk to a doctor'), findsNothing);
    });

    testWidgets('after the second response: feedback on that response', (tester) async {
      await pumpScreen(tester, const ChatScreen(), overrides: [
        _chat([
          _p('p1', 'Can I shower?'),
          _a('a1', 'Keep the dressing dry.'),
          _p('p2', 'When are stitches removed?'),
          _a('a2', 'Usually around 21 days after a knee replacement.'),
        ]),
      ]);
      expect(find.text('Was this helpful?'), findsOneWidget);
      expect(find.text('No, talk to a doctor'), findsOneWidget);
    });

    testWidgets('an escalated reply shows it was shared, not the feedback prompt', (tester) async {
      await pumpScreen(tester, const ChatScreen(), overrides: [
        _chat([
          _p('p1', 'Hi'),
          _a('a1', 'Hi!', reason: 'greeting'),
          _p('p2', 'I have chest pain'),
          _a('a2', 'Please go to the nearest Emergency Room immediately.', needsHuman: true),
        ]),
      ]);
      expect(find.text('Was this helpful?'), findsNothing);
      expect(find.text('Shared with the clinic team'), findsOneWidget);
    });

    testWidgets('tapping "Yes, thanks" dismisses the prompt', (tester) async {
      await pumpScreen(tester, const ChatScreen(), overrides: [
        _chat([_p('p1', 'q'), _a('a1', 'a'), _p('p2', 'q2'), _a('a2', 'a2')]),
      ]);
      await tester.tap(find.text('Yes, thanks'));
      await tester.pumpAndSettle();
      expect(find.text('Was this helpful?'), findsNothing);
    });
  });
}
