import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/powered_by_practigo.dart';
import '../../auth/auth_controller.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          CircleAvatar(
            radius: 36,
            child: Text(
              (user?.name.isNotEmpty ?? false) ? user!.name[0].toUpperCase() : '?',
              style: const TextStyle(fontSize: 28),
            ),
          ),
          const SizedBox(height: 12),
          Center(child: Text(user?.name ?? '', style: Theme.of(context).textTheme.titleLarge)),
          Center(
            child: Text(
              user?.role.name.toUpperCase() ?? '',
              style: TextStyle(color: Theme.of(context).colorScheme.outline),
            ),
          ),
          const SizedBox(height: 32),
          OutlinedButton.icon(
            onPressed: () => context.push('/change-password'),
            icon: const Icon(Icons.lock_reset_outlined),
            label: const Text('Change password'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Log out'),
          ),
          const SizedBox(height: 32),
          const Center(child: PoweredByPractiGo()),
        ],
      ),
    );
  }
}
