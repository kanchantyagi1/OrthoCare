import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Single source of truth for color/typography. No widget in the app should
/// hard-code a Color or font size outside of this file.
///
/// The palette is taken from the PrimeOrtho mark itself (mobile/branding/): the
/// deep navy of the arrow is the primary colour, and the orange of the arc is a
/// sparing accent - never body text, whose contrast it can't carry on white.
class AppTheme {
  AppTheme._();

  // Brand
  static const Color navy = Color(0xFF0A2C63); // logo arrow
  static const Color navyDeep = Color(0xFF061B42);
  static const Color navySoft = Color(0xFFE8EEF8);
  static const Color orange = Color(0xFFF26B1D); // logo arc
  static const Color orangeSoft = Color(0xFFFFEDE2);

  // Neutrals (cool, to sit with the navy)
  static const Color ink = Color(0xFF0F1B2E);
  static const Color inkMuted = Color(0xFF5A6A82);
  static const Color line = Color(0xFFE2E8F1);
  static const Color canvas = Color(0xFFF5F7FB);

  // Semantic
  static const Color success = Color(0xFF1B8A5A);
  static const Color warning = Color(0xFFB86A00);
  static const Color urgent = Color(0xFFC62828);
  static const Color high = Color(0xFFD9620B);
  static const Color normal = Color(0xFF2F5FA8);

  static const double radiusSm = 10;
  static const double radiusMd = 14;
  static const double radiusLg = 20;

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(seedColor: navy, brightness: Brightness.light).copyWith(
      primary: navy,
      onPrimary: Colors.white,
      primaryContainer: navySoft,
      onPrimaryContainer: navyDeep,
      secondary: orange,
      onSecondary: Colors.white,
      secondaryContainer: orangeSoft,
      onSecondaryContainer: const Color(0xFF6B2600),
      tertiary: normal,
      error: urgent,
      onError: Colors.white,
      errorContainer: const Color(0xFFFDE8E8),
      onErrorContainer: const Color(0xFF7A1414),
      surface: Colors.white,
      onSurface: ink,
      onSurfaceVariant: inkMuted,
      surfaceContainerLowest: Colors.white,
      surfaceContainerLow: canvas,
      surfaceContainer: const Color(0xFFEFF3F9),
      surfaceContainerHigh: const Color(0xFFE9EEF6),
      surfaceContainerHighest: const Color(0xFFE2E8F2),
      outline: const Color(0xFF8A98AD),
      outlineVariant: line,
    );
    return _base(scheme, background: canvas, overlay: SystemUiOverlayStyle.dark);
  }

  static ThemeData dark() {
    const darkCanvas = Color(0xFF0B1324);
    final scheme = ColorScheme.fromSeed(seedColor: navy, brightness: Brightness.dark).copyWith(
      primary: const Color(0xFFAFC6F2),
      onPrimary: navyDeep,
      primaryContainer: const Color(0xFF1C3766),
      onPrimaryContainer: const Color(0xFFDCE6FA),
      secondary: const Color(0xFFFF9A5C),
      onSecondary: const Color(0xFF4A1A00),
      secondaryContainer: const Color(0xFF5C2A0B),
      onSecondaryContainer: const Color(0xFFFFDCC7),
      tertiary: const Color(0xFF9DBCF0),
      error: const Color(0xFFFF8A80),
      onError: const Color(0xFF5C0A0A),
      errorContainer: const Color(0xFF5A1616),
      onErrorContainer: const Color(0xFFFFDAD6),
      surface: const Color(0xFF111B30),
      onSurface: const Color(0xFFE6ECF6),
      onSurfaceVariant: const Color(0xFFA7B3C7),
      surfaceContainerLowest: darkCanvas,
      surfaceContainerLow: darkCanvas,
      surfaceContainer: const Color(0xFF16223A),
      surfaceContainerHigh: const Color(0xFF1B2843),
      surfaceContainerHighest: const Color(0xFF22304D),
      outline: const Color(0xFF6F7D94),
      outlineVariant: const Color(0xFF26334D),
    );
    return _base(scheme, background: darkCanvas, overlay: SystemUiOverlayStyle.light);
  }

  static ThemeData _base(ColorScheme scheme, {required Color background, required SystemUiOverlayStyle overlay}) {
    final base = ThemeData(useMaterial3: true, colorScheme: scheme);
    final text = base.textTheme
        .copyWith(
          headlineMedium: base.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
          headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2),
          titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          titleSmall: base.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          bodyLarge: base.textTheme.bodyLarge?.copyWith(height: 1.45),
          bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.45),
          labelLarge: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: 0.1),
        )
        .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface);

    final buttonShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd));
    const buttonMinSize = Size(64, 52);
    final buttonText = text.labelLarge?.copyWith(fontSize: 16);

    OutlineInputBorder inputBorder(Color color, [double width = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: color, width: width),
        );

    return base.copyWith(
      textTheme: text,
      scaffoldBackgroundColor: background,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        shadowColor: scheme.shadow.withValues(alpha: 0.2),
        centerTitle: false,
        titleTextStyle: text.titleLarge?.copyWith(fontSize: 20, color: scheme.onSurface),
        systemOverlayStyle: overlay.copyWith(statusBarColor: Colors.transparent),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg - 4),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: buttonMinSize,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: buttonShape,
          textStyle: buttonText,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: buttonMinSize,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: buttonShape,
          textStyle: buttonText,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: buttonMinSize,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: buttonShape,
          textStyle: buttonText,
          foregroundColor: scheme.primary,
          side: BorderSide(color: scheme.primary.withValues(alpha: 0.55), width: 1.2),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 44),
          shape: buttonShape,
          textStyle: text.labelLarge,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: inputBorder(scheme.outlineVariant),
        enabledBorder: inputBorder(scheme.outlineVariant),
        focusedBorder: inputBorder(scheme.primary, 1.6),
        errorBorder: inputBorder(scheme.error),
        focusedErrorBorder: inputBorder(scheme.error, 1.6),
        labelStyle: TextStyle(color: scheme.onSurfaceVariant),
        floatingLabelStyle: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600),
        hintStyle: TextStyle(color: scheme.onSurfaceVariant.withValues(alpha: 0.8)),
        prefixIconColor: scheme.onSurfaceVariant,
        suffixIconColor: scheme.onSurfaceVariant,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: scheme.primary,
        titleTextStyle: text.titleMedium,
        subtitleTextStyle: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1, thickness: 1),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusLg)),
        side: BorderSide(color: scheme.outlineVariant),
        backgroundColor: scheme.surface,
        labelStyle: text.labelLarge?.copyWith(color: scheme.primary),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusSm + 2)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusLg + 4)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(radiusLg + 4))),
      ),
      drawerTheme: DrawerThemeData(backgroundColor: scheme.surface, surfaceTintColor: Colors.transparent),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd + 2)),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
      popupMenuTheme: PopupMenuThemeData(
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusMd)),
      ),
    );
  }
}
