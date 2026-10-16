# The iPhone app

The same `index.html` inside a native shell ([Capacitor](https://capacitorjs.com)), so it can be on the App Store and
use what a website can't: notifications through Apple's push service, the phone's own haptics, the status bar, the share
sheet. It opens offline with its files built in; updates come through the App Store.

Nothing here needs a Mac: `.github/workflows/ios.yml` builds it on GitHub's Mac computers.

- `package.json`: the Capacitor packages (installed fresh on every build; `ios/` is generated, not committed)
- `capacitor.config.json`: the app's name and bundle ID (the workflow swaps in the `IOS_BUNDLE_ID` variable if set)
- `scripts/www.js`: copies `index.html`, `icon.png`, `terms.html`, `privacy.html` and `support.html` into the app
- `ios-setup.sh`: fills in the generated project (permission texts, export answer, push hooks and entitlement, icon,
  launch screen)
- `assets/`: the 1024 × 1024 icon (from `icon.png`) and the plain launch screens (light and dark)

The app's JavaScript side is `src/js/app/36-native.js`; everything there is skipped on the website.

Every build opens the app in the simulator and puts light and dark screenshots on the `ios-shots` branch. With the App
Store Connect key in the secrets (see the workflow's header), the same run signs it and sends it to TestFlight.
