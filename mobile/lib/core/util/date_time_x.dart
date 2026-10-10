/// Timestamp parsing for values that come back from the API.
///
/// The backend sends UTC ISO-8601 instants (e.g. `2026-10-07T04:28:48.599Z`).
/// `DateTime.parse` on those yields a **UTC** DateTime, and formatting a UTC
/// DateTime renders UTC — which showed clinic staff times hours behind the
/// phone's clock (5h30m behind in IST). Every API instant must therefore be
/// converted to the device's local zone at the parse boundary, which is why
/// models call these helpers instead of `DateTime.parse` directly.
///
/// This applies only to *instants*. Shift windows are "HH:mm" wall-clock
/// strings in the clinic's own day and must NOT be shifted — see
/// `models/shift.dart`.
library;

/// Parses an API instant into local time. Returns null for null/blank input,
/// or when the value is not a parseable timestamp.
DateTime? parseApiDateTime(Object? value) {
  if (value is! String || value.isEmpty) return null;
  final parsed = DateTime.tryParse(value);
  return parsed?.toLocal();
}

/// Same as [parseApiDateTime] but for fields the UI treats as always present.
/// Falls back to [fallback] (default: now) rather than throwing, so one bad
/// timestamp can't break a whole list screen.
DateTime parseApiDateTimeOr(Object? value, [DateTime? fallback]) =>
    parseApiDateTime(value) ?? fallback ?? DateTime.now();
