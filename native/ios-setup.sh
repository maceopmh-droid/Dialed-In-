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

echo "ios-setup: Info.plist, push hooks, entitlement, icon, launch screen, iOS 15 or later"
