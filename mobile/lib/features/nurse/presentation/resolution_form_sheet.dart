import 'package:flutter/material.dart';

class ResolutionFormResult {
  final bool patientContacted;
  final String issueCategory;
  final String resolutionNotes;
  final bool followUpRequired;
  final bool escalateToDoctor;
  final String nurseNotes;

  const ResolutionFormResult({
    required this.patientContacted,
    required this.issueCategory,
    required this.resolutionNotes,
    required this.followUpRequired,
    required this.escalateToDoctor,
    required this.nurseNotes,
  });
}

const _issueCategories = [
  'Pain management',
  'Mobility / walking',
  'Wound care',
  'Medication query',
  'Exercise / physiotherapy',
  'General recovery question',
  'Other',
];

/// Nurse resolution form, per product spec section 33.
Future<ResolutionFormResult?> showResolutionForm(BuildContext context) {
  return showModalBottomSheet<ResolutionFormResult>(
    context: context,
    isScrollControlled: true,
    builder: (context) => const _ResolutionFormSheet(),
  );
}

class _ResolutionFormSheet extends StatefulWidget {
  const _ResolutionFormSheet();

  @override
  State<_ResolutionFormSheet> createState() => _ResolutionFormSheetState();
}

class _ResolutionFormSheetState extends State<_ResolutionFormSheet> {
  bool _patientContacted = true;
  String _issueCategory = _issueCategories.first;
  bool _followUpRequired = false;
  bool _escalateToDoctor = false;
  final _resolutionController = TextEditingController();
  final _notesController = TextEditingController();

  @override
  void dispose() {
    _resolutionController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Resolve Case', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Patient contacted?'),
              value: _patientContacted,
              onChanged: (v) => setState(() => _patientContacted = v),
            ),
            DropdownButtonFormField<String>(
              initialValue: _issueCategory,
              decoration: const InputDecoration(labelText: 'Issue category'),
              items: _issueCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => _issueCategory = v ?? _issueCategory),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _resolutionController,
              decoration: const InputDecoration(labelText: 'Resolution'),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Follow-up required?'),
              value: _followUpRequired,
              onChanged: (v) => setState(() => _followUpRequired = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Escalate to doctor?'),
              value: _escalateToDoctor,
              onChanged: (v) => setState(() => _escalateToDoctor = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(labelText: 'Nurse notes (optional)'),
              maxLines: 2,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(
                ResolutionFormResult(
                  patientContacted: _patientContacted,
                  issueCategory: _issueCategory,
                  resolutionNotes: _resolutionController.text.trim(),
                  followUpRequired: _followUpRequired,
                  escalateToDoctor: _escalateToDoctor,
                  nurseNotes: _notesController.text.trim(),
                ),
              ),
              child: const Text('Mark Resolved'),
            ),
          ],
        ),
      ),
    );
  }
}
