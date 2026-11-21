export type QrCrop = { x: number; y: number; width: number; height: number }
/** Source rectangle represented by a centered object-fit:cover video. No stretching. */
export function visibleQrCrop(width: number, height: number, viewWidth: number, viewHeight: number): QrCrop {
  const ratio = viewWidth > 0 && viewHeight > 0 ? viewWidth / viewHeight : width / height
  const w = Math.min(width, height * ratio), h = Math.min(height, width / ratio)
  return { x: (width-w)/2, y: (height-h)/2, width: w, height: h }
}
/** Whole visible view, center detail, then a full visible-view recovery pass. */
export function qrFrameCrop(width: number, height: number, viewWidth: number, viewHeight: number, attempt: number): QrCrop {
  const visible = visibleQrCrop(width,height,viewWidth,viewHeight), scale = attempt % 3 === 1 ? .72 : 1
  return { x: visible.x + visible.width*(1-scale)/2, y: visible.y + visible.height*(1-scale)/2, width: visible.width*scale, height: visible.height*scale }
}
/** Target up to 12 fps; slow devices automatically get breathing room. No overlapping work. */
export function qrDecodeDelay(workMs: number) { return Math.max(16, 84-workMs, workMs*.5) }
