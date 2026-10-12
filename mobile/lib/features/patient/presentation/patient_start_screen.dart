import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../widgets/brand.dart';
import '../../../widgets/loading_overlay.dart';
import '../patient_session_controller.dart';

/// Patients have no login. They enter a phone number once, which starts their
/// chat session and is the number a doctor calls back on if their question is
/// escalated.
class PatientStartScreen extends ConsumerStatefulWidget {
  const PatientStartScreen({super.key});

  @override
  ConsumerState<PatientStartScreen> createState() => _PatientStartScreenState();
}

class _PatientStartScreenState extends ConsumerState<PatientStartScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _nameController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(patientSessionProvider.notifier).start(
            phone: _phoneController.text.trim(),
            name: _nameController.text.trim(),
          );
      if (mounted) context.go('/patient/dashboard');
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return EntryScaffold(
      body: SafeArea(
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
          const BrandHero(heightFraction: 0.24, minHeight: 110, maxHeight: 220),
          const SizedBox(height: 20),
          Text('Your phone number', style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(
            'We use this only so a clinic doctor can call you back if your '
            'question needs a human. No password, no account.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 28),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            autofocus: true,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: const InputDecoration(
              labelText: 'Phone number',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
            validator: (v) {
              final value = (v ?? '').trim();
              if (value.isEmpty) return 'Required';
              final digits = value.replaceAll(RegExp(r'\D'), '');
              if (digits.length < 7) return 'Enter a valid phone number';
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _nameController,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.name],
            decoration: const InputDecoration(
              labelText: 'Your name (optional)',
              prefixIcon: Icon(Icons.person_outline),
            ),
            onFieldSubmitted: (_) => _submit(),
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
                : const Text('Continue'),
          ),
          const Spacer(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
