import jsQR from 'jsqr'
import { qrImageDimensions, validateQrImage } from '@/lib/qr-image'
export function decodeQrFrame(data: Uint8ClampedArray, width: number, height: number) { return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data || null }
/** Repeatedly mask located symbols to discover distinct codes, without arbitrary navigation. */
export function decodeQrCodes(data: Uint8ClampedArray, width: number, height: number): string[] {
  const pixels = new Uint8ClampedArray(data), found = new Set<string>()
  const halfW = Math.ceil(width * .6), halfH = Math.ceil(height * .6)
  const regions = [[0, 0, width, height], [0, 0, halfW, height], [width-halfW, 0, halfW, height], [0, 0, width, halfH], [0, height-halfH, width, halfH], ...[0,width-halfW].flatMap(x => [0,height-halfH].map(y => [x,y,halfW,halfH]))]
  let attempts = 0
  while (found.size < 8 && attempts < 24) {
    let located = false
    for (const [x, y, w, h] of regions) {
      if (attempts++ >= 24) break
      let sample = pixels
      if (w !== width || h !== height) { sample = new Uint8ClampedArray(w*h*4); for (let row=0; row<h; row++) sample.set(pixels.subarray(((y+row)*width+x)*4,((y+row)*width+x+w)*4),row*w*4) }
      const code = jsQR(sample, w, h, { inversionAttempts: 'attemptBoth' }); if (!code) continue
      found.add(code.data); located = true
      const points = [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomLeftCorner, code.location.bottomRightCorner]
      const left = Math.max(0, x + Math.floor(Math.min(...points.map(p => p.x))) - 3), right = Math.min(width, x + Math.ceil(Math.max(...points.map(p => p.x))) + 3)
      const top = Math.max(0, y + Math.floor(Math.min(...points.map(p => p.y))) - 3), bottom = Math.min(height, y + Math.ceil(Math.max(...points.map(p => p.y))) + 3)
      for (let row = top; row < bottom; row++) pixels.fill(255, (row * width + left) * 4, (row * width + right) * 4)
      break
    }
    if (!located) break
  }
  return [...found]
}
export async function decodeQrPhoto(file: File, signal?: AbortSignal): Promise<string[]> {
  const header = new Uint8Array(await file.slice(0, 262144).arrayBuffer())
  signal?.throwIfAborted()
  validateQrImage(file.size, qrImageDimensions(header))
  let bitmap: ImageBitmap | undefined, image: HTMLImageElement | undefined, objectUrl: string | undefined
  const canvas = document.createElement('canvas')
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file)
    else { objectUrl = URL.createObjectURL(file); image = new Image(); image.src = objectUrl; await image.decode() }
    signal?.throwIfAborted()
    const source = bitmap || image!, width = bitmap?.width || image!.naturalWidth, height = bitmap?.height || image!.naturalHeight
    const scale = Math.min(1, 1600 / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Photo scanning is unavailable. Try manual lookup.')
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    bitmap?.close(); bitmap = undefined
    return decodeQrCodes(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
  } finally { bitmap?.close(); if (image) image.src = ''; if (objectUrl) URL.revokeObjectURL(objectUrl); canvas.width = 0; canvas.height = 0 }
}

/** Bounded luminance normalization and mild sharpening for shadowed/small labels. */
export function enhanceQrFrame(data: Uint8ClampedArray, width: number, height: number) {
  const scale = Math.max(width,height)<450 ? 3 : Math.max(width,height)<640 ? 2 : 1
  const w=width*scale,h=height*scale,gray=new Uint8ClampedArray(w*h),histogram=new Uint32Array(256)
  const value=(x:number,y:number)=>{const i=(y*width+x)*4;return (data[i]*77+data[i+1]*150+data[i+2]*29)/256}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(width-1,x/scale),sy=Math.min(height-1,y/scale),left=Math.floor(sx),top=Math.floor(sy),fx=sx-left,fy=sy-top
    const a=value(left,top)*(1-fx)+value(Math.min(width-1,left+1),top)*fx,b=value(left,Math.min(height-1,top+1))*(1-fx)+value(Math.min(width-1,left+1),Math.min(height-1,top+1))*fx
    gray[y*w+x]=a*(1-fy)+b*fy;histogram[gray[y*w+x]]++
  }
  let low=0,high=255,count=0
  while(low<254&&(count+=histogram[low])<w*h*.01)low++
  count=0;while(high>low+1&&(count+=histogram[high])<w*h*.01)high--
  const range=Math.max(24,high-low),adjusted=new Uint8ClampedArray(w*h*4)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,center=gray[i],neighbors=gray[y*w+Math.max(0,x-1)]+gray[y*w+Math.min(w-1,x+1)]+gray[Math.max(0,y-1)*w+x]+gray[Math.min(h-1,y+1)*w+x]
    const luminance=(center+(4*center-neighbors)*.65-low)*255/range,j=i*4
    adjusted[j]=adjusted[j+1]=adjusted[j+2]=luminance;adjusted[j+3]=255
  }
  return {data:adjusted,width:w,height:h}
}
/** Keep the portable decoder; expensive recovery runs only after a miss, never in parallel. */
export function createLiveQrDecoder() {
  let misses = 0
  return (data: Uint8ClampedArray, width: number, height: number): string | null => {
    const normal = jsQR(data,width,height,{inversionAttempts: misses % 6 === 5 ? 'attemptBoth' : 'dontInvert'})?.data
    if (normal) { misses = 0; return normal }
    misses++
    if (misses % 3) return null
    const adjusted=enhanceQrFrame(data,width,height)
    return jsQR(adjusted.data,adjusted.width,adjusted.height,{inversionAttempts:'attemptBoth'})?.data || null
  }
}
