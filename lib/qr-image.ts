/** Inspect supported file headers before allowing browser image decompression. */
export function qrImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
  if (bytes.length >= 24 && text(1, 3) === 'PNG' && bytes[0] === 137) return { width: v.getUint32(16), height: v.getUint32(20) }
  if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(text(0, 6))) return { width: v.getUint16(6, true), height: v.getUint16(8, true) }
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const kind = text(12, 4)
    if (kind === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }
    if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return { width: v.getUint16(26, true) & 16383, height: v.getUint16(28, true) & 16383 }
    if (kind === 'VP8L' && bytes[20] === 47) { const bits = v.getUint32(21, true); return { width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 } }
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let i = 2
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 255) return null
      while (bytes[i] === 255) i++
      const marker = bytes[i++]; if (marker === 217 || marker === 218) break
      if (marker === 1 || marker >= 208 && marker <= 215) continue
      if (i + 2 > bytes.length) return null
      const length = v.getUint16(i); if (length < 2 || i + length > bytes.length) return null
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { height: v.getUint16(i + 3), width: v.getUint16(i + 5) }
      i += length
    }
  }
  return null
}
export function validateQrImage(size: number, dimensions: ReturnType<typeof qrImageDimensions>) {
  if (size > 15 * 1024 * 1024 || !dimensions || dimensions.width < 1 || dimensions.height < 1 || Math.max(dimensions.width, dimensions.height) > 12000 || dimensions.width * dimensions.height > 24000000) throw new Error('Choose a JPEG, PNG, WebP or GIF up to 15 MB and 24 megapixels. Crop or export larger photos first.')
}
