#!/usr/bin/swift
// Generates src-tauri/assets/dmg-background.png
// Run: swift scripts/gen-dmg-bg.swift
import AppKit

_ = NSApplication.shared

// 2× image for Retina — Tauri window is set to 540×380
let W: CGFloat = 1080
let H: CGFloat = 760

let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(
    data: nil, width: Int(W), height: Int(H),
    bitsPerComponent: 8, bytesPerRow: 0, space: cs,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else { print("ERROR: CGContext failed"); exit(1) }

// ── Background: deep navy ────────────────────────────────────────────────
ctx.setFillColor(CGColor(red: 0.051, green: 0.051, blue: 0.102, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

// ── Vignette: darker corners ─────────────────────────────────────────────
let vigColors = [
    CGColor(red: 0, green: 0, blue: 0, alpha: 0),
    CGColor(red: 0, green: 0, blue: 0, alpha: 0.5)
] as CFArray
if let vg = CGGradient(colorsSpace: cs, colors: vigColors, locations: [0, 1] as [CGFloat]) {
    ctx.drawRadialGradient(
        vg,
        startCenter: CGPoint(x: W / 2, y: H / 2), startRadius: 0,
        endCenter:   CGPoint(x: W / 2, y: H / 2), endRadius: W * 0.75,
        options: .drawsAfterEndLocation
    )
}

// ── Moon watermark (top-right, very faint) ───────────────────────────────
let projectRoot = URL(fileURLWithPath: #file).deletingLastPathComponent().deletingLastPathComponent()
let moonURL = projectRoot.appendingPathComponent("public/moon.svg")
if let moonNS = NSImage(contentsOf: moonURL),
   let moonCG = moonNS.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let size: CGFloat = 600
    let rect = CGRect(x: W - size * 0.55, y: H - size * 0.5, width: size, height: size)
    ctx.saveGState()
    ctx.setAlpha(0.07)
    ctx.draw(moonCG, in: rect)
    ctx.restoreGState()
    print("✓ Moon watermark drawn")
} else {
    print("⚠  Could not load moon.svg — skipping watermark")
}

// ── "ORBIT" lettermark at top ─────────────────────────────────────────────
func drawCentered(_ text: String, size: CGFloat, alpha: CGFloat, y: CGFloat) {
    let font = CTFontCreateWithName("SF Pro Display" as CFString, size, nil)
    let color = CGColor(red: 1, green: 1, blue: 1, alpha: alpha)
    let attrs: [CFString: Any] = [
        kCTFontAttributeName: font,
        kCTForegroundColorAttributeName: color
    ]
    let attrStr = CFAttributedStringCreate(nil, text as CFString, attrs as CFDictionary)!
    let line = CTLineCreateWithAttributedString(attrStr)
    let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)
    ctx.textMatrix = .identity
    ctx.textPosition = CGPoint(x: (W - bounds.width) / 2, y: y)
    CTLineDraw(line, ctx)
}

drawCentered("O  R  B  I  T", size: 28, alpha: 0.28, y: H - 66)

// ── Arrow between icon positions ─────────────────────────────────────────
// Tauri config positions (logical px, from top-left of 540×380 window):
//   appPosition:               x=140, y=175
//   applicationFolderPosition: x=400, y=175
// In this 2× CGContext (y from bottom):
let appCX:  CGFloat = 140 * 2          // = 280
let appsFX: CGFloat = 400 * 2          // = 800
let iconY:  CGFloat = (380 - 175) * 2  // = 410  (y from bottom in 2× context)
let iconHalf: CGFloat = 160            // generous clearance around each icon

let arrowX0 = appCX + iconHalf + 10
let arrowX1 = appsFX - iconHalf - 10
let lineColor = CGColor(red: 1, green: 1, blue: 1, alpha: 0.22)

ctx.saveGState()
ctx.setStrokeColor(lineColor)
ctx.setLineWidth(2.5)
ctx.move(to: CGPoint(x: arrowX0, y: iconY))
ctx.addLine(to: CGPoint(x: arrowX1 - 20, y: iconY))
ctx.strokePath()

ctx.setFillColor(lineColor)
ctx.move(to: CGPoint(x: arrowX1, y: iconY))
ctx.addLine(to: CGPoint(x: arrowX1 - 22, y: iconY + 11))
ctx.addLine(to: CGPoint(x: arrowX1 - 22, y: iconY - 11))
ctx.closePath()
ctx.fillPath()
ctx.restoreGState()

// ── Save PNG ──────────────────────────────────────────────────────────────
guard let cgImg = ctx.makeImage() else { print("ERROR: makeImage failed"); exit(1) }
let nsImg = NSImage(cgImage: cgImg, size: NSSize(width: 540, height: 380))
if let tiff   = nsImg.tiffRepresentation,
   let bitmap = NSBitmapImageRep(data: tiff),
   let png    = bitmap.representation(using: .png, properties: [:]) {
    let outURL = projectRoot.appendingPathComponent("src-tauri/assets/dmg-background.png")
    try! png.write(to: outURL)
    print("✓ Saved src-tauri/assets/dmg-background.png (\(Int(W))×\(Int(H)))")
}
