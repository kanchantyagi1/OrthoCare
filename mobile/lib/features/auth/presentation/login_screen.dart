import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/brand.dart';
import '../../../widgets/loading_overlay.dart';
import '../../../widgets/powered_by_practigo.dart';
import '../auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).login(
            identifier: _identifierController.text.trim(),
            password: _passwordController.text,
          );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return EntryScaffold(
      body: SafeArea(
        // A scroll view that is at least as tall as the screen: on a typical
        // phone everything fits with no scrolling and the credit sits at the
        // bottom; on a small screen, or with the keyboard open, it scrolls and
        // Flutter keeps the focused field in view, so nothing is ever clipped.
        child: CustomScrollView(
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Builder(builder: _buildContent),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Form(
      key: _formKey,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                icon: const Icon(Icons.arrow_back),
                tooltip: 'Back',
                onPressed: () => context.go('/welcome'),
              ),
            ),
            const BrandHero(heightFraction: 0.30, minHeight: 130, maxHeight: 270),
            const SizedBox(height: 20),
            Text('Welcome back', style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(
              'Sign in to your Prime Ortho staff account.\nPatients don\'t need an account.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 28),
            TextFormField(
              controller: _identifierController,
              decoration: const InputDecoration(
                labelText: 'Phone number or email',
                prefixIcon: Icon(Icons.person_outline),
              ),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.username, AutofillHints.email],
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _passwordController,
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  tooltip: _obscurePassword ? 'Show password' : 'Hide password',
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                ),
              ),
              obscureText: _obscurePassword,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.password],
              onFieldSubmitted: (_) => _submit(),
              validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              InlineErrorBanner(message: _error!),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: scheme.onPrimary),
                    )
                  : const Text('Log in'),
            ),
            const Spacer(),
            const SizedBox(height: 24),
            const Center(child: PoweredByPractiGo()),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
