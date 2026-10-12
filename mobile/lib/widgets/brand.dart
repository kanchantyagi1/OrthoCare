import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_theme.dart';

/// Brand images, generated from mobile/branding/ by tool/generate_brand_images.py.
class BrandAssets {
  BrandAssets._();

  static const hero = 'assets/images/brand_hero.png';
  static const mark = 'assets/images/brand_mark.png';

  /// brand_hero.png is 765x750.
  static const heroAspectRatio = 765 / 750;
}

/// Scaffold for the entry screens (splash, welcome, staff login, patient start).
///
/// These always render light, even in system dark mode: the hero art is drawn
/// on a white glow and only works on a light page, and the entry flow is the
/// brand's first impression, so it stays consistent with the launcher icon and
/// the Android splash (both white).
class EntryScaffold extends StatelessWidget {
  const EntryScaffold({super.key, required this.body});

  final Widget body;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: AppTheme.light(),
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark.copyWith(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: Colors.white,
          systemNavigationBarIconBrightness: Brightness.dark,
        ),
        child: Scaffold(backgroundColor: Colors.white, body: body),
      ),
    );
  }
}

/// The PrimeOrtho lockup (mark, wordmark, taglines) from lockscreen.png.
///
/// Its height is a fraction of the screen height, clamped, so it is generous on
/// tall phones and compact on small ones, where the form below matters more. It
/// is sized from the full screen height (not the space left by the keyboard), so
/// it doesn't jump around as the keyboard opens - the screen scrolls instead.
class BrandHero extends StatelessWidget {
  const BrandHero({super.key, this.heightFraction = 0.32, this.minHeight = 140, this.maxHeight = 300});

  final double heightFraction;
  final double minHeight;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final height = (screenHeight * heightFraction).clamp(minHeight, maxHeight);
    return Semantics(
      image: true,
      label: 'PrimeOrtho. Restoring strength. Renewing mobility.',
      child: ExcludeSemantics(
        child: SizedBox(
          height: height,
          child: Center(
            child: AspectRatio(
              aspectRatio: BrandAssets.heroAspectRatio,
              child: Image.asset(BrandAssets.hero, fit: BoxFit.contain, filterQuality: FilterQuality.medium),
            ),
          ),
        ),
      ),
    );
  }
}

/// The PrimeOrtho mark in a soft circle - the assistant's avatar in chat and a
/// compact brand glyph elsewhere.
class BrandAvatar extends StatelessWidget {
  const BrandAvatar({super.key, this.size = 36});

  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.16),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Image.asset(BrandAssets.mark, filterQuality: FilterQuality.medium),
    );
  }
}
