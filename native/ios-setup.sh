#!/bin/bash
# Fills in the iPhone project after `npx cap add ios` (run from native/, on a Mac): what the app asks permission for,
# the export-compliance answer, Apple push hooks, the push entitlement, the icon and a plain launch screen.
# Safe to run again.
set -euo pipefail
cd "$(dirname "$0")"
APP=ios/App/App
PL="$APP/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PL" >/dev/null 2>&1 || true; }
setstr() { pb "Delete :$1"; /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PL"; }
setbool() { pb "Delete :$1"; /usr/libexec/PlistBuddy -c "Add :$1 bool $2" "$PL"; }

# what the app asks for (session photos: take one, pick one, save a recap card)
setstr NSCameraUsageDescription "Take a photo of your coffee for a session."
setstr NSPhotoLibraryUsageDescription "Add a photo of your coffee to a session."
setstr NSPhotoLibraryAddUsageDescription "Save images you share from Dialed In."
setstr CFBundleDisplayName "Dialed In"
# encryption: only the phone's own HTTPS (exempt), so no export paperwork
setbool ITSAppUsesNonExemptEncryption false
# portrait on iPhone (the app is laid out for it)
pb "Delete :UISupportedInterfaceOrientations"
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations array" -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PL"
setbool UIViewControllerBasedStatusBarAppearance true

# Apple push: hand the device token to the PushNotifications plugin (Capacitor's documented AppDelegate hooks)
AD="$APP/AppDelegate.swift"
if ! grep -q capacitorDidRegisterForRemoteNotifications "$AD"; then
  python3 - "$AD" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read().rstrip()
assert s.endswith('}')
hooks = '''
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
'''
open(p, 'w').write(s[:-1].rstrip() + '\n' + hooks)
PY
fi

# v21.11: the app's own background behind the page follows the app's theme. Maceo, Nov 11: "the weird white space above
# the keyboard that shows sometimes when you type in log". When the keyboard comes up iOS can slide the page up past its
# end, and what shows there is the native background, which was always the light cream (#F3EEE4), so in dark mode a pale
# strip sat above the keyboard. Capacitor's own way in: a subclass of its view controller (set in Main.storyboard) that
# listens for the page's color ("dialedBg", sent by theme-boot.js whenever the theme is set or changes) and paints the
# view, the web view, its scroller and the area past the page's end. Before the page says, it follows the phone's setting.
if ! grep -q DialedBridgeViewController "$AD"; then
  python3 - "$AD" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
assert 'import Capacitor' in s, 'AppDelegate.swift: no "import Capacitor" line'
if 'import WebKit' not in s:
    s = s.replace('import Capacitor', 'import Capacitor\nimport WebKit', 1)
s = s.rstrip() + '\n' + """
// v21.11: the native background follows the page's theme (see ios-setup.sh)
class DialedBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    static let cream = UIColor(red: 0xF3 / 255.0, green: 0xEE / 255.0, blue: 0xE4 / 255.0, alpha: 1)
    static let ink = UIColor(red: 0x0C / 255.0, green: 0x10 / 255.0, blue: 0x0D / 255.0, alpha: 1)

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        // until the page says which theme it's in: the phone's own light or dark setting
        paint(UIColor { $0.userInterfaceStyle == .dark ? DialedBridgeViewController.ink : DialedBridgeViewController.cream })
        guard let controller = webView?.configuration.userContentController else { return }
        controller.add(self, name: "dialedBg")
        // the page also sends its color each time it loads (after its own scripts have run)
        controller.addUserScript(WKUserScript(source: "window.__dialedTheme && window.__dialedTheme.sendBg && window.__dialedTheme.sendBg();", injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "dialedBg", let hex = message.body as? String else { return }
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return }
        paint(UIColor(red: CGFloat((v >> 16) & 0xFF) / 255.0, green: CGFloat((v >> 8) & 0xFF) / 255.0, blue: CGFloat(v & 0xFF) / 255.0, alpha: 1))
    }

    private func paint(_ color: UIColor) {
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
        if #available(iOS 15.0, *) { webView?.underPageBackgroundColor = color }
    }
}
"""
open(p, 'w').write(s + '\n')
PY
fi
SB="$APP/Base.lproj/Main.storyboard"
if ! grep -q DialedBridgeViewController "$SB"; then
  python3 - "$SB" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
pat = r'customClass="CAPBridgeViewController" customModule="Capacitor"( customModuleProvider="target")?'
n = len(re.findall(pat, s))
assert n == 1, f'Main.storyboard: expected one Capacitor view controller, found {n}'
s = re.sub(pat, 'customClass="DialedBridgeViewController" customModule="App" customModuleProvider="target"', s)
open(p, 'w').write(s)
PY
fi
grep -q DialedBridgeViewController "$AD" && grep -q DialedBridgeViewController "$SB" || { echo "ios-setup: the background patch didn't go in" >&2; exit 1; }

# the push entitlement (TestFlight and the App Store use Apple's production push service)
cat > "$APP/App.entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
PLIST

# the icon (one 1024 image; the phone makes the rest)
ICON="$APP/Assets.xcassets/AppIcon.appiconset"
rm -rf "$ICON"; mkdir -p "$ICON"
cp assets/AppIcon-1024.png "$ICON/AppIcon-1024.png"
cat > "$ICON/Contents.json" <<'JSON'
{ "images": [ { "filename": "AppIcon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024" } ],
  "info": { "author": "xcode", "version": 1 } }
JSON

# the launch screen: just the app's background color (light or dark), so opening looks like the app appearing
SPL="$APP/Assets.xcassets/Splash.imageset"
rm -rf "$SPL"; mkdir -p "$SPL"
cp assets/splash-light.png "$SPL/splash-light.png"; cp assets/splash-dark.png "$SPL/splash-dark.png"
cat > "$SPL/Contents.json" <<'JSON'
{ "images": [
    { "filename": "splash-light.png", "idiom": "universal" },
    { "appearances": [ { "appearance": "luminosity", "value": "dark" } ], "filename": "splash-dark.png", "idiom": "universal" } ],
  "info": { "author": "xcode", "version": 1 } }
JSON

# iOS 15 or later (Apple, ITMS-90068: from April 2027 apps must target iOS 15). Every iPhone that ran iOS 14 can run 15,
# so nobody who has the app is left out. The app's own project, then CocoaPods or Swift Package Manager, whichever
# this Capacitor made.
PBX=ios/App/App.xcodeproj/project.pbxproj
python3 - "$PBX" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'IPHONEOS_DEPLOYMENT_TARGET = (1[0-4]\.\d+|[0-9]\.\d+);', 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;', s)
open(p, 'w').write(s)
PY
if [ -f ios/App/Podfile ] && grep -qE "platform :ios, '1[0-4]" ios/App/Podfile; then
  python3 -c "import re,sys; p=sys.argv[1]; s=open(p).read(); open(p,'w').write(re.sub(r\"platform :ios, '1[0-4][.0-9]*'\", \"platform :ios, '15.0'\", s))" ios/App/Podfile
  (cd ios/App && pod install >/dev/null)
fi
for P in ios/App/CapApp-SPM/Package.swift; do
  [ -f "$P" ] && python3 -c "import re,sys; p=sys.argv[1]; s=open(p).read(); open(p,'w').write(re.sub(r'\.iOS\(\.v1[0-4]\)', '.iOS(.v15)', s))" "$P"
done
if grep -qE 'IPHONEOS_DEPLOYMENT_TARGET = (1[0-4]|[0-9])\.' "$PBX"; then echo "ios-setup: the app still targets an iOS below 15" >&2; exit 1; fi

echo "ios-setup: Info.plist, push hooks, background color, entitlement, icon, launch screen, iOS 15 or later"
