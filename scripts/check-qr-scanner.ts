import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { parseQrPayload, qrOrigins, qrTargetKey } from '../lib/qr-payload'
import { recordQrUrl } from '../lib/qr-labels'
import { qrImageDimensions, validateQrImage } from '../lib/qr-image'
import { decodeQrCodes } from '../lib/qr-decode'
import { QrCamera, type CameraState } from '../lib/qr-camera'
const origin = 'https://app.example.test', legacy = 'https://old.example.test', origins = [origin, legacy]
async function main() {
 for (const kind of ['plant','location'] as const) {
  const url = recordQrUrl(kind, 'garden', 'cmtest123', origin)
  const target = { kind, collectionSlug:'garden', identifier:'cmtest123' }
  assert.deepEqual(parseQrPayload(url,origins),target)
  assert.deepEqual(parseQrPayload(` \n${url}/ \n`,origins),target)
  assert.deepEqual(parseQrPayload(url.replace(origin,legacy),origins),target)
  assert.deepEqual(parseQrPayload(url.replace(origin,''),origins),target)
  assert.deepEqual(parseQrPayload(url.replace('/cmtest123','/%63mtest123'),origins),target)
  assert.deepEqual(parseQrPayload(url.replace('/c/garden',''),origins),{kind,identifier:'cmtest123'})
  assert.deepEqual(parseQrPayload(url.replace('/c/garden','')+'?collection=garden',origins),target)
  assert.deepEqual(parseQrPayload(url+'?next=https://evil.test#javascript:alert(1)',origins),target,'Query destinations are discarded')
  const png = await QRCode.toBuffer(url,{width:360,margin:4})
  assert.equal(qrImageDimensions(png)!.width,360)
  for (const image of [png,await QRCode.toBuffer(url,{width:256,margin:1}),await QRCode.toBuffer(url),await sharp(png).rotate(11,{background:'#fff'}).png().toBuffer(),await sharp(png).jpeg({quality:80}).toBuffer()]) {
   const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true})
   assert(decodeQrCodes(new Uint8ClampedArray(data),info.width,info.height).includes(url),'Real label symbol decoded, including rotation/JPEG')
  }
 }
 for (const bad of ['javascript:alert(1)','data:text/html,hello','file:///instances/a','//evil.test/instances/a',origin+'.evil.test/instances/a','https://app.example.test:444/instances/a','https://user@app.example.test/instances/a',origin+'/c/garden/plants/a',origin+'/c/garden/instances/a%2fb',origin+'/c/garden/instances/a%255c',origin+'/c/garden/instances/../a',origin+'/c/garden/instances/%2e%2e/a',origin+'/instances/a/edit',origin+'/instances/a\\b',origin+'/instances/a\u0000',origin+'/instances/%', 'x'.repeat(2049)]) assert.equal(parseQrPayload(bad,origins),null,bad)
 assert.deepEqual(parseQrPayload('HOYCAR-MAT-20260815-AC-001',origins,true),{kind:'identifier',identifier:'HOYCAR-MAT-20260815-AC-001'})
 assert.deepEqual(parseQrPayload('LOC-RM-02',origins),{kind:'identifier',identifier:'LOC-RM-02'})
 assert.equal(parseQrPayload(origin+'/instances/a',origins,true),null)
 assert.deepEqual(qrOrigins([origin+'/',origin,'javascript:x','https://a.test/path','https://user@a.test']),[origin])
 assert.equal(qrTargetKey({kind:'plant',identifier:'a',collectionSlug:'garden'}),'plant:garden:a')
 const a=recordQrUrl('plant','garden','plant-a',origin),b=recordQrUrl('location','garden','location-b',origin)
 const first=await QRCode.toBuffer(a,{width:300,margin:4}),second=await QRCode.toBuffer(b,{width:300,margin:4})
 const multi=await sharp({create:{width:640,height:320,channels:4,background:'#fff'}}).composite([{input:first,left:10,top:10},{input:second,left:330,top:10}]).raw().toBuffer()
 assert.deepEqual(new Set(decodeQrCodes(new Uint8ClampedArray(multi),640,320)),new Set([a,b]),'Multiple distinct photo codes')
 const blank=new Uint8ClampedArray(160*160*4).fill(255);assert.deepEqual(decodeQrCodes(blank,160,160),[])
 for(const format of ['png','jpeg','webp','gif'] as const){const bytes=await sharp(first).toFormat(format).toBuffer();const dimensions=qrImageDimensions(bytes);assert(dimensions&&dimensions.width===300&&dimensions.height===300,format);validateQrImage(bytes.length,dimensions)}
 assert.throws(()=>validateQrImage(16000000,{width:100,height:100}));assert.throws(()=>validateQrImage(10,{width:10000,height:10000}));assert.throws(()=>validateQrImage(10,null))
 const {data,info}=await sharp(first).ensureAlpha().raw().toBuffer({resolveWithObject:true});const timings=[]
 for(let i=0;i<20;i++){const start=performance.now();decodeQrCodes(new Uint8ClampedArray(data),info.width,info.height);timings.push(performance.now()-start)}
 await cameraTests()
 console.log(JSON.stringify({passed:true,decodeFixtureMs:{min:Math.min(...timings),max:Math.max(...timings)},checks:'current/legacy/generated labels, origin/path attacks, exact IDs, photo rotation/JPEG/multiple codes, size limits, 40 camera cycles, cancellation, late permission, switching, torch, background, partial initialization failure'}))
}
async function cameraTests(){
 const descriptors = Object.fromEntries(['document','navigator','isSecureContext'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 let calls=0,enumerations=0,decodes=0,selected='rear',canTorch=true,hidden=false,playFailure=false
 const tracks:Track[]=[],constraints:MediaStreamConstraints[]=[]
 class Track extends EventTarget{stopped=false;settings={deviceId:selected}; applied:unknown[]=[];stop(){this.stopped=true}getSettings(){return this.settings}getCapabilities(){return {torch:canTorch}}async applyConstraints(c:unknown){this.applied.push(c)}}
 const getStream=()=>{const t=new Track();tracks.push(t);return {getTracks:()=>[t],getVideoTracks:()=>[t]} as unknown as MediaStream}
 let acquire:(c:MediaStreamConstraints)=>Promise<MediaStream>=async c=>{selected=(c.video as MediaTrackConstraints).deviceId?((c.video as MediaTrackConstraints).deviceId as ConstrainDOMStringParameters).exact as string:'rear';return getStream()}
 const video={pause(){},srcObject:null,async play(){if(playFailure)throw Error('play')},readyState:2,videoWidth:64,videoHeight:64} as unknown as HTMLVideoElement
 Object.defineProperty(globalThis,'document',{configurable:true,value:{get visibilityState(){return hidden?'hidden':'visible'},createElement(){return {width:0,height:0,getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray(64*64*4)}}}}}}}})
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(c:MediaStreamConstraints){calls++;constraints.push(c);return acquire(c)},async enumerateDevices(){enumerations++;return [{kind:'videoinput',deviceId:'rear'},{kind:'videoinput',deviceId:'front'}]}}}})
 Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true})
 try{
  let state:CameraState|undefined,payloads=0,read:string|null=null
  const make=()=>new QrCamera(video,()=>{decodes++;return read},s=>state=s,()=>payloads++)
  for(let i=0;i<40;i++){const engine=make();await engine.start();assert.equal(state!.status,'scanning');engine.stop();assert.equal(video.srcObject,null)}
  assert(tracks.every(t=>t.stopped));const before=decodes;await new Promise(r=>setTimeout(r,220));assert.equal(decodes,before,'Closed timers do not decode')
  const engine=make();await engine.start();assert(state!.canSwitch&&state!.torchSupported);await engine.toggleTorch();assert(state!.torch);const torchCalls=tracks.at(-1)!.applied.length;await Promise.all([engine.toggleTorch(),engine.toggleTorch()]);assert.equal(tracks.at(-1)!.applied.length,torchCalls+1,'Overlapping torch toggles are serialized');engine.switchCamera();await new Promise(r=>setTimeout(r,0));assert.equal(tracks.at(-1)!.settings.deviceId,'front');assert(tracks.at(-2)!.stopped)
  hidden=true;engine.background();assert(tracks.at(-1)!.stopped);hidden=false;engine.foreground();await new Promise(r=>setTimeout(r,0));engine.stop()
  let resolve!:(s:MediaStream)=>void;acquire=()=>new Promise(r=>resolve=r);const late=make(),pending=late.start();late.stop();const lateStream=getStream();resolve(lateStream);await pending;assert(tracks.at(-1)!.stopped,'Late permission response released')
  acquire=async()=>getStream();read='label';const success=make();await success.start();assert.equal(payloads,1);assert(tracks.at(-1)!.stopped);read=null
  canTorch=false;const unsupported=make();await unsupported.start();assert.equal(state!.torchSupported,false);unsupported.stop()
  playFailure=true;const failure=make();await failure.start();assert.equal(state!.status,'unavailable');assert(tracks.at(-1)!.stopped)
  assert(constraints.every(c=>c.audio===false));assert.equal(enumerations,calls-2,'No enumeration before denied/late/failed initialization')
 }finally{for(const [k,d]of Object.entries(descriptors)){if(d)Object.defineProperty(globalThis,k,d);else delete (globalThis as any)[k]}}
}
main().catch(e=>{console.error(e);process.exitCode=1})
