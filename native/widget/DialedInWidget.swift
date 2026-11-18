// Dialed In's lock screen widget (v21.13). Maceo, Nov 18: "I want just a more general aesthetic little thing that you
// can tap on and open the app but it's on your lock screen". No data, nothing to refresh: the app icon's flavor shape,
// seen from above (its outline, two inner rings and the peak, traced from the icon), and a tap opens the app. Lock screen
// widgets are drawn by iOS in one color, matched to the clock. Four looks to try on a real lock screen (the gallery
// lists them all); the one Maceo picks stays. Built into the iPhone app by native/ios-setup.sh (add-widget.rb).
import SwiftUI
import WidgetKit

struct DialedEntry: TimelineEntry { let date: Date }

struct DialedProvider: TimelineProvider {
    func placeholder(in context: Context) -> DialedEntry { DialedEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (DialedEntry) -> Void) { completion(DialedEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DialedEntry>) -> Void) {
        completion(Timeline(entries: [DialedEntry(date: Date())], policy: .never))   // it never changes
    }
}

// the shape, in a box 1 wide and 0.7969 tall: 48 points around the outline (a smooth curve runs through them) and the peak
enum DialedShape {
    static let aspect: CGFloat = 1.2548   // width / height
    static let outline: [(CGFloat, CGFloat)] = [(0.9635, 0.4992), (0.9699, 0.5768), (0.9607, 0.6541), (0.9367, 0.7262), (0.9008, 0.7896), (0.8564, 0.8424), (0.8070, 0.8844), (0.7548, 0.9160), (0.7017, 0.9377), (0.6491, 0.9511), (0.5980, 0.9583), (0.5484, 0.9615), (0.4999, 0.9623), (0.4515, 0.9608), (0.4025, 0.9556), (0.3526, 0.9454), (0.3023, 0.9288), (0.2519, 0.9048), (0.2023, 0.8727), (0.1550, 0.8312), (0.1125, 0.7799), (0.0770, 0.7190), (0.0507, 0.6502), (0.0349, 0.5760), (0.0300, 0.4992), (0.0361, 0.4226), (0.0525, 0.3488), (0.0784, 0.2801), (0.1122, 0.2183), (0.1521, 0.1643), (0.1966, 0.1186), (0.2447, 0.0819), (0.2957, 0.0552), (0.3485, 0.0404), (0.4016, 0.0385), (0.4528, 0.0496), (0.4999, 0.0716), (0.5418, 0.1003), (0.5787, 0.1305), (0.6127, 0.1577), (0.6470, 0.1794), (0.6848, 0.1969), (0.7272, 0.2140), (0.7738, 0.2355), (0.8219, 0.2659), (0.8683, 0.3077), (0.9097, 0.3614), (0.9425, 0.4261)]
    static let peak: (CGFloat, CGFloat) = (0.4946, 0.4272)
}

// one ring: the outline drawn smaller around the peak (scale 1 is the outline itself)
struct DialedRing: Shape {
    var scale: CGFloat
    func path(in rect: CGRect) -> Path {
        let (kx, ky) = DialedShape.peak
        let pts = DialedShape.outline.map { p -> CGPoint in
            CGPoint(x: rect.minX + (kx + scale * (p.0 - kx)) * rect.width, y: rect.minY + (ky + scale * (p.1 - ky)) * rect.height)
        }
        var path = Path()
        let n = pts.count
        path.move(to: pts[0])
        for i in 0..<n {   // a closed Catmull-Rom curve, as cubic Béziers
            let p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
            path.addCurve(to: p2, control1: CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6),
                          control2: CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6))
        }
        path.closeSubpath()
        return path
    }
}

struct DialedPeak: Shape {
    var radius: CGFloat
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.minX + DialedShape.peak.0 * rect.width, y: rect.minY + DialedShape.peak.1 * rect.height)
        return Path(ellipseIn: CGRect(x: c.x - radius, y: c.y - radius, width: radius * 2, height: radius * 2))
    }
}

// the rings look: outline bright, the two inner rings softer, the peak a dot (line widths in points)
struct DialedRingsMark: View {
    var width: CGFloat
    var line: CGFloat = 1.7
    var body: some View {
        let style = StrokeStyle(lineWidth: line, lineCap: .round, lineJoin: .round)
        let inner = StrokeStyle(lineWidth: line * 0.72, lineCap: .round, lineJoin: .round)
        ZStack {
            DialedRing(scale: 1).stroke(style: style).opacity(0.96)
            DialedRing(scale: 0.66).stroke(style: inner).opacity(0.58)
            DialedRing(scale: 0.36).stroke(style: inner).opacity(0.58)
            DialedPeak(radius: 1.5)
        }
        .frame(width: width, height: width / DialedShape.aspect)
    }
}

// the solid look: the shape filled, with the rings and the peak cut out of it
struct DialedSolidMark: View {
    var width: CGFloat
    var body: some View {
        ZStack {
            DialedRing(scale: 1).fill()
            DialedRing(scale: 0.66).stroke(lineWidth: 1.3).blendMode(.destinationOut)
            DialedRing(scale: 0.36).stroke(lineWidth: 1.3).blendMode(.destinationOut)
            DialedPeak(radius: 1.7).blendMode(.destinationOut)
        }
        .compositingGroup()
        .opacity(0.94)
        .frame(width: width, height: width / DialedShape.aspect)
    }
}

// iOS 17 and later want a widget to name its background
extension View {
    @ViewBuilder func dialedBackground(circle: Bool) -> some View {
        if #available(iOS 17.0, *) {
            if circle { self.containerBackground(for: .widget) { AccessoryWidgetBackground() } }
            else { self.containerBackground(for: .widget) { Color.clear } }
        } else {
            if circle { ZStack { AccessoryWidgetBackground(); self } } else { self }
        }
    }
}

struct DialedRingsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DialedInRings", provider: DialedProvider()) { _ in
            DialedRingsMark(width: 46).dialedBackground(circle: true)
        }
        .configurationDisplayName("Dialed In · Rings")
        .description("Tap to open Dialed In.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct DialedSolidWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DialedInSolid", provider: DialedProvider()) { _ in
            DialedSolidMark(width: 44).dialedBackground(circle: true)
        }
        .configurationDisplayName("Dialed In · Solid")
        .description("Tap to open Dialed In.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct DialedFloatWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DialedInFloat", provider: DialedProvider()) { _ in
            DialedRingsMark(width: 62, line: 1.9).dialedBackground(circle: false)
        }
        .configurationDisplayName("Dialed In · Rings, no circle")
        .description("Tap to open Dialed In.")
        .supportedFamilies([.accessoryCircular])
    }
}

struct DialedNameWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DialedInName", provider: DialedProvider()) { _ in
            HStack(spacing: 12) {
                DialedRingsMark(width: 40)
                Text("Dialed In").font(.system(size: 15, weight: .semibold)).tracking(3.2).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.leading, 6)
            .dialedBackground(circle: false)
        }
        .configurationDisplayName("Dialed In · Rings and name")
        .description("Tap to open Dialed In.")
        .supportedFamilies([.accessoryRectangular])
    }
}

@main
struct DialedInWidgets: WidgetBundle {
    var body: some Widget {
        DialedRingsWidget()
        DialedSolidWidget()
        DialedFloatWidget()
        DialedNameWidget()
    }
}
