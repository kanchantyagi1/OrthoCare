import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/presentation/admin_dashboard_screen.dart';
import '../../features/admin/presentation/admin_escalations_screen.dart';
import '../../features/admin/presentation/attendance_screen.dart';
import '../../features/admin/presentation/knowledge_base_screen.dart';
import '../../features/admin/presentation/nurse_management_screen.dart';
import '../../features/admin/presentation/shift_management_screen.dart';
import '../../features/auth/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/nurse/presentation/escalation_detail_screen.dart';
import '../../features/nurse/presentation/escalations_list_screen.dart';
import '../../features/nurse/presentation/nurse_dashboard_screen.dart';
import '../../features/nurse/presentation/profile_screen.dart';
import '../../features/nurse/presentation/shift_screen.dart';
import '../../features/patient/presentation/ai_chat_screen.dart';
import '../../features/patient/presentation/chat_history_screen.dart';
import '../../features/patient/presentation/escalation_status_screen.dart';
import '../../features/patient/presentation/patient_dashboard_screen.dart';
import '../../models/user.dart';

/// Bridges Riverpod state changes into something GoRouter's
/// `refreshListenable` can observe, so auth changes trigger re-evaluation
/// of `redirect` without a full widget rebuild.
class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}

String _homeFor(UserRole role) {
  switch (role) {
    case UserRole.nurse:
      return '/nurse/dashboard';
    case UserRole.patient:
      return '/patient/dashboard';
    case UserRole.doctor:
    case UserRole.admin:
      return '/admin/dashboard';
  }
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier(ref);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final path = state.matchedLocation;
      final atSplash = path == '/splash';
      final atLogin = path == '/login';

      if (auth.status == AuthStatus.unknown) {
        return atSplash ? null : '/splash';
      }
      if (auth.status == AuthStatus.unauthenticated) {
        return atLogin ? null : '/login';
      }
      // Authenticated.
      if (atSplash || atLogin) {
        return _homeFor(auth.user!.role);
      }
      // Guard role-prefixed sections against the wrong role.
      final role = auth.user!.role;
      if (path.startsWith('/nurse') && role != UserRole.nurse) return _homeFor(role);
      if (path.startsWith('/patient') && role != UserRole.patient) return _homeFor(role);
      if (path.startsWith('/admin') && role != UserRole.doctor && role != UserRole.admin) return _homeFor(role);
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),

      // Nurse
      GoRoute(path: '/nurse/dashboard', builder: (context, state) => const NurseDashboardScreen()),
      GoRoute(path: '/nurse/shift', builder: (context, state) => const ShiftScreen()),
      GoRoute(path: '/nurse/escalations', builder: (context, state) => const EscalationsListScreen()),
      GoRoute(
        path: '/nurse/escalations/:id',
        builder: (context, state) => EscalationDetailScreen(escalationId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/nurse/profile', builder: (context, state) => const ProfileScreen()),

      // Patient
      GoRoute(path: '/patient/dashboard', builder: (context, state) => const PatientDashboardScreen()),
      GoRoute(
        path: '/patient/chat',
        builder: (context, state) => AiChatScreen(sessionId: state.uri.queryParameters['sessionId']),
      ),
      GoRoute(path: '/patient/history', builder: (context, state) => const ChatHistoryScreen()),
      GoRoute(path: '/patient/escalations', builder: (context, state) => const EscalationStatusScreen()),

      // Admin / Doctor
      GoRoute(path: '/admin/dashboard', builder: (context, state) => const AdminDashboardScreen()),
      GoRoute(path: '/admin/nurses', builder: (context, state) => const NurseManagementScreen()),
      GoRoute(path: '/admin/shifts', builder: (context, state) => const ShiftManagementScreen()),
      GoRoute(path: '/admin/attendance', builder: (context, state) => const AttendanceScreen()),
      GoRoute(path: '/admin/escalations', builder: (context, state) => const AdminEscalationsScreen()),
      GoRoute(path: '/admin/knowledge', builder: (context, state) => const KnowledgeBaseScreen()),
    ],
  );
});
