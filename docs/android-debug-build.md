# NOEMA — Android debug APK (local-first preview)

This GitHub Actions build bundles the current NOEMA web UI into a **Capacitor 7** Android APK.
The APK includes local chat, the basic workspace, IndexedDB-backed state, the invitation **demo**, and the current settings. The APK uses its own local HTTPS asset origin and does **not** simply open a Vercel URL.

## Build / download

1. Open **Actions → NOEMA Android Debug APK** in the NOEMA GitHub repository.
2. Choose a successful run from the `build/android-debug-apk` branch or the related PR.
3. Under **Artifacts**, download `noema-android-debug-<run number>` (ZIP).
4. Extract `app-debug.apk`. On a connected Android device (USB debugging enabled):

```bash
adb devices -l
adb install -r app-debug.apk
scrcpy
```

The package identifier is `app.noema.debug`. The debug APK is development-signed and is **not suitable for production distribution**. It expires from GitHub Actions' artifact storage after 14 days.

## Scope and security

**This is a local UI smoke test, not a production messaging or AI-agent release.** The Next.js `/api/agent` and `/api/stt/transcribe` development server routes are intentionally excluded from the APK's static assets. Their dependent actions will not work unless proper, authenticated native/backend replacements are built. Do not enter real customer information, share public invitations, or mistake the offline invite demo for live messaging.

- No Cloudflare relay is deployed by this workflow.
- No E2EE messaging is implemented by this workflow. The current chats are local device content; do not claim encrypted chat history or authenticated remote delivery.
- No Android foreground service, automatic agent wake, FCM, or system-level battery privilege is installed.
- No production signing credentials, Google Play release, billable services, or AI API keys are configured in GitHub.
- Data saved within the Android WebView's IndexedDB belongs to this app installation and may be lost when its app data is removed. Back up anything important.

## How the pipeline works

`npm ci` → security checks and existing tests → temporarily exclude Next.js server-only API routes in CI → `NOEMA_ANDROID_EXPORT=1 npm run build` → copy the generated `out/` into Capacitor `mobile/www` → `cap add android` / `cap sync android` → Gradle `assembleDebug` → upload artifact.

The regular web deployment and Next.js server behavior are unaffected by the conditional export configuration. Android native sources are generated in CI for this first packaging experiment. Once device tests pass, we should commit and maintain the generated native project, replace server-only features with authenticated transports, implement Android 16 lifecycle/notification integration, and create a signed release process.

## Manual Android smoke test

Open the NOEMA app and test: launch without a remote web host, switch tabs, create/send local draft messages, reopen after force-closing, interact with settings, navigate to the invitation demo and back, rotate/relaunch, and inspect logs through `adb logcat` if something fails. Agent/server actions are expected to be unavailable at this stage.

If the Actions build fails, inspect the failed GitHub Actions job first. A successful web build **does not** establish that the Android APK compiled; the Gradle job and APK artifact must also succeed.
