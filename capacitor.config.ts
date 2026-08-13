/**
 * Capacitor wraps the live HydraTax site in iOS/Android WebViews.
 * Prefer pointing at production (or a preview URL) so Next.js SSR/API routes keep working.
 *
 * Setup: see mobile/README.md
 */
const config = {
  appId: "uk.hydratax.app",
  appName: "HydraTax",
  webDir: "public",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://hydratax.uk",
    cleartext: false,
    allowNavigation: [
      "hydratax.uk",
      "*.hydratax.uk",
      "hydratax-549.netlify.app",
      "*.netlify.app",
      "localhost",
      "127.0.0.1",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0f766e",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f766e",
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
