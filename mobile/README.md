# HydraTax mobile path (web → PWA → native)

HydraTax stays a **Next.js** app. Phones get a great experience first via responsive web + PWA. Native iOS/Android shells wrap the same URL with **Capacitor** (no rewrite to React Native).

## 1. Responsive web (done in app)

- Shared `SiteHeader` with mobile drawer (Sign in / Sign up)
- App shell already uses `MobileNav`
- Safe-area and touch-friendly base styles in `globals.css`
- `src/lib/platform.ts` detects web / PWA / Capacitor

## 2. Install as PWA (no App Store)

1. Deploy the site (e.g. https://hydratax.uk)
2. Open in mobile Safari / Chrome → **Add to Home Screen** / **Install app**
3. Manifest: `src/app/manifest.ts` (theme teal, standalone display)

## 3. Native apps with Capacitor

```bash
npm i @capacitor/core @capacitor/app @capacitor/status-bar @capacitor/keyboard @capacitor/splash-screen
npm i -D @capacitor/cli @capacitor/ios @capacitor/android

# config already at /capacitor.config.ts
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```

Set the WebView URL (production or preview):

```bash
# .env / CI
CAPACITOR_SERVER_URL=https://hydratax.uk
```

Then `npx cap sync` and rebuild.

### Why `server.url` instead of static export?

Next.js uses SSR, Server Actions, and API routes. Capacitor loads the hosted site so auth, Stripe, HMRC, and Companies House keep working. Offline-first static export is a later optimisation.

### App IDs

| Store    | Bundle / application id |
|----------|-------------------------|
| Apple    | `uk.hydratax.app`       |
| Google   | `uk.hydratax.app`       |

## 4. Checklist before store submit

- [ ] Apple Developer + Google Play accounts
- [ ] Privacy policy URL (already on site)
- [ ] Splash + app icons (1024 / adaptive)
- [ ] Deep links for Stripe return URLs
- [ ] Test Sign in / CS01 / checkout on real devices
