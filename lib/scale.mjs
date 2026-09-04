// Fit maths for the PixelStage (ADR-0002).
//
// Pure ES module: no Qt, no window. The stage hands in its logical size and
// the compositor's device pixel ratio as plain numbers; everything here is in
// logical units except `k`, which is device pixels per native pixel.

// The native screen is the original's 28 x 36 tiles: three HUD rows above the
// 28 x 31 maze and two below. Game code works in maze pixels; renderers add
// BOARD_ORIGIN.
export const NATIVE_WIDTH = 224;
export const NATIVE_HEIGHT = 288;
export const BOARD_ORIGIN = Object.freeze({ x: 0, y: 24 });

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
  const ratio = saneDpr(dpr);
  const devW = width * ratio;
  const devH = height * ratio;
  const k = Math.max(1, Math.floor(Math.min(devW / nativeWidth, devH / nativeHeight)));
  const scale = k / ratio;
  const boxW = nativeWidth * scale;
  const boxH = nativeHeight * scale;
  const devX = Math.max(0, Math.floor((devW - nativeWidth * k) / 2));
  const devY = Math.max(0, Math.floor((devH - nativeHeight * k) / 2));
  return { k, scale, x: devX / ratio, y: devY / ratio, width: boxW, height: boxH };
}

/** A device pixel ratio that is not a finite number >= 1 is treated as 1. */
export function saneDpr(dpr) {
  return typeof dpr === "number" && Number.isFinite(dpr) && dpr >= 1 ? dpr : 1;
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
