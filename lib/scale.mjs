// Fit maths for the PixelStage (ADR-0002).
//
// Pure ES module: no Qt, no window. The stage hands in its logical size and
// the compositor's device pixel ratio as plain numbers; everything here is in
// logical units except `k`, which is device pixels per native pixel.

export const NATIVE_WIDTH = 224;
export const NATIVE_HEIGHT = 248;

/**
 * Arcade mode: every native pixel becomes a k x k block of device pixels, k an
 * integer, never below 1. The scale is chosen in device pixels (not logical
 * ones) so fractional compositor scaling still yields square, equal blocks,
 * and the offsets land on whole device pixels so no block straddles two.
 *
 * Returns { k, scale, x, y, width, height }: `scale` is logical units per
 * native unit (k / dpr); x, y, width, height are the centred box in logical
 * units. A window smaller than native still gets k = 1 and clips.
 */
export function fitArcade(width, height, dpr, nativeWidth = NATIVE_WIDTH, nativeHeight = NATIVE_HEIGHT) {
  const devW = width * dpr;
  const devH = height * dpr;
  const k = Math.max(1, Math.floor(Math.min(devW / nativeWidth, devH / nativeHeight)));
  const scale = k / dpr;
  const boxW = nativeWidth * scale;
  const boxH = nativeHeight * scale;
  const devX = Math.max(0, Math.floor((devW - nativeWidth * k) / 2));
  const devY = Math.max(0, Math.floor((devH - nativeHeight * k) / 2));
  return { k, scale, x: devX / dpr, y: devY / dpr, width: boxW, height: boxH };
}

/**
 * Smooth mode: fractional fit-to-window scale, centred. `dpr` is accepted for
 * signature parity with fitArcade and does not affect the result.
 */
export function fitSmooth(width, height, dpr, nativeWidth = NATIVE_WIDTH, nativeHeight = NATIVE_HEIGHT) {
  void dpr;
  const scale = Math.min(width / nativeWidth, height / nativeHeight);
  const boxW = nativeWidth * scale;
  const boxH = nativeHeight * scale;
  return { k: scale, scale, x: (width - boxW) / 2, y: (height - boxH) / 2, width: boxW, height: boxH };
}
