# dx.bi for iPhone

dx.bi for iPhone (iOS 26 and later). For what it does and how to install it, see the [main README](../README.md#on-an-iphone).

How it works:

- Like dx.bi for Android phones, it runs Stremio's web app (web.stremio.com) out of sight, in a `WKWebView` kept in the window, with the same scripts: `tv/app/src/main/assets/dxbi-tv.js`, `tv/app/src/mobile/assets/dxbi-engine.js` and the dx.bi plugin at the repository root, bundled at build time. Its identity includes `dxbi-tv/<version> dxbi-ios`, so the plugin runs as it does in the TV and phone apps.
- `Engine/Page.swift` hosts the page. A WKWebView can only post messages, so the page gets a stand-in for Android's `DxbiTV` bridge that answers from what the app wrote into it (settings, the plugin, the player's state) and posts the rest. There's no `torrentUrl`: an iPhone can't download torrents itself, so they need a streaming server on the network.
- `Engine/Stremio.swift` is Stremio as the screens see it, through `dxbi-engine.js`, as Android's `phone/Stremio.kt` is. The screens (`UI/`) are SwiftUI with Liquid Glass.
- Playing goes through Stremio's player route and `dxbi-tv.js`'s handoff, as on Android. The player (`Player/`) is mpv through MPVKit (Streamyfin's GPL build, whose AVFoundation video output makes picture-in-picture possible), presented in its own sideways screen (`PlayerHost`), with lock screen controls, downloads (`Downloads`, a background `URLSession`) and other players (`OtherApp`: Infuse, VLC, Outplayer, SenPlayer).
- `Engine/Updates.swift` offers new releases of the repository the app was built from (`DXBI_UPDATE_REPO`), opening the release page for the IPA.

## Building

There's no Xcode project in git: [XcodeGen](https://github.com/yonaskolb/XcodeGen) makes it from `project.yml`. On a Mac with Xcode 26:

```sh
cd ios
xcodegen generate
open Dxbi.xcodeproj
```

GitHub Actions builds it on every push that touches the app (`.github/workflows/ios.yml`) and keeps an unsigned `dxbi.ipa` as the run's artifact; publishing a release attaches it to the release. It needs no signing key: SideStore, AltStore and Sideloadly sign the IPA with the user's own Apple ID when they install it. When GitHub's Apple-chip Macs are all busy, run the workflow by hand with `macos-15-intel`.

The app's version is the dx.bi plugin's, as the Android apps' is.
