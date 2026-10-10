import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/presentation/admin_dashboard_screen.dart';
import '../../features/admin/presentation/admin_escalations_screen.dart';
import '../../features/admin/presentation/attendance_screen.dart';
import '../../features/admin/presentation/knowledge_base_screen.dart';
import '../../features/admin/presentation/doctor_management_screen.dart';
import '../../features/admin/presentation/shift_management_screen.dart';
import '../../features/auth/auth_controller.dart';
import '../../features/auth/presentation/change_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/auth/presentation/welcome_screen.dart';
import '../../features/doctor/presentation/doctor_dashboard_screen.dart';
import '../../features/doctor/presentation/escalation_detail_screen.dart';
import '../../features/doctor/presentation/escalations_list_screen.dart';
import '../../features/doctor/presentation/profile_screen.dart';
import '../../features/doctor/presentation/shift_screen.dart';
import '../../features/patient/presentation/chat_screen.dart';
import '../../features/patient/presentation/chat_history_screen.dart';
import '../../features/patient/presentation/escalation_status_screen.dart';
import '../../features/patient/presentation/patient_dashboard_screen.dart';
import '../../features/patient/presentation/patient_start_screen.dart';
import '../../features/patient/patient_session_controller.dart';
import '../../models/user.dart';

/// Bridges Riverpod state changes into something GoRouter's
/// `refreshListenable` can observe, so auth changes trigger re-evaluation
/// of `redirect` without a full widget rebuild.
class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
    ref.listen(patientSessionProvider, (_, __) => notifyListeners());
  }
}

/// Only staff sign in. `UserRole.patient` should never reach here (patients are
/// account-less), but it is handled rather than thrown on, so a legacy
/// patient-role account can't hard-crash the router.
String _homeFor(UserRole role) {
  switch (role) {
    case UserRole.doctor:
      return '/doctor/dashboard';
    case UserRole.admin:
      return '/admin/dashboard';
    case UserRole.patient:
      return '/patient/dashboard';
  }
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier(ref);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final patient = ref.read(patientSessionProvider);
      final path = state.matchedLocation;
      final atSplash = path == '/splash';
      final atLogin = path == '/login';
      final atWelcome = path == '/welcome';
      final atPatientStart = path == '/patient/start';

      // Wait for both sessions to be restored from secure storage first.
      if (auth.status == AuthStatus.unknown || patient.status == PatientSessionStatus.unknown) {
        return atSplash ? null : '/splash';
      }

      final staffSignedIn = auth.status == AuthStatus.authenticated;
      final patientActive = patient.status == PatientSessionStatus.active;

      // Staff take precedence: a signed-in doctor/admin lands in their section.
      if (staffSignedIn) {
        if (atSplash || atLogin || atWelcome || atPatientStart) return _homeFor(auth.user!.role);
        final role = auth.user!.role;
        if (path.startsWith('/doctor') && role != UserRole.doctor) return _homeFor(role);
        if (path.startsWith('/admin') && role != UserRole.admin) return _homeFor(role);
        // Staff have no business in the patient-facing chat.
        if (path.startsWith('/patient')) return _homeFor(role);
        return null;
      }

      // Patients: no login, just a phone-number session.
      if (patientActive) {
        if (atSplash || atWelcome || atPatientStart) return '/patient/dashboard';
        // Not signed in as staff, so staff sections - and the staff-only
        // password change screen - are off limits.
        if (path.startsWith('/doctor') || path.startsWith('/admin') || path == '/change-password') {
          return '/patient/dashboard';
        }
        return null;
      }

      // Nobody identified yet: allow only the landing screen, staff login and
      // the patient phone-entry screen.
      if (atWelcome || atLogin || atPatientStart) return null;
      return '/welcome';
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/welcome', builder: (context, state) => const WelcomeScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/patient/start', builder: (context, state) => const PatientStartScreen()),
      GoRoute(path: '/change-password', builder: (context, state) => const ChangePasswordScreen()),

      // Doctor
      GoRoute(path: '/doctor/dashboard', builder: (context, state) => const DoctorDashboardScreen()),
      GoRoute(path: '/doctor/shift', builder: (context, state) => const ShiftScreen()),
      GoRoute(path: '/doctor/escalations', builder: (context, state) => const EscalationsListScreen()),
      GoRoute(
        path: '/doctor/escalations/:id',
        builder: (context, state) => EscalationDetailScreen(escalationId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/doctor/profile', builder: (context, state) => const ProfileScreen()),

      // Patient
      GoRoute(path: '/patient/dashboard', builder: (context, state) => const PatientDashboardScreen()),
      GoRoute(
        path: '/patient/chat',
        builder: (context, state) => ChatScreen(sessionId: state.uri.queryParameters['sessionId']),
      ),
      GoRoute(path: '/patient/history', builder: (context, state) => const ChatHistoryScreen()),
      GoRoute(path: '/patient/escalations', builder: (context, state) => const EscalationStatusScreen()),

      // Admin / Doctor
      GoRoute(path: '/admin/dashboard', builder: (context, state) => const AdminDashboardScreen()),
      GoRoute(path: '/admin/doctors', builder: (context, state) => const DoctorManagementScreen()),
      GoRoute(path: '/admin/shifts', builder: (context, state) => const ShiftManagementScreen()),
      GoRoute(path: '/admin/attendance', builder: (context, state) => const AttendanceScreen()),
      GoRoute(
        path: '/admin/escalations',
        // `extra` carries the optional dashboard-card filter (see
        // AdminEscalationsScreen) - not deep-linkable, but this is an
        // internal tap-through from the dashboard, not a shareable URL.
        builder: (context, state) => AdminEscalationsScreen(filter: state.extra as EscalationDashboardFilter?),
      ),
      GoRoute(path: '/admin/knowledge', builder: (context, state) => const KnowledgeBaseScreen()),
    ],
  );
});
