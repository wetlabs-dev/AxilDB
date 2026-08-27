'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Crosshair, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlantImageFrame } from '@/components/PlantImage'

type PhotoFramingEditorProps = {
  src?: string | null
  initial?: PlantImageFrame | null
  fileInputName?: string
  fileInputClassName?: string
  enablePhoneCapture?: boolean
  className?: string
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function initialZoom(frame?: PlantImageFrame | null) {
  const cropWidth = frame?.cropWidth || 100
  const cropHeight = frame?.cropHeight || 100
  return Number(Math.max(1, Math.min(3, 100 / Math.max(25, Math.min(cropWidth, cropHeight)))).toFixed(2))
}

function looksLikePhoneCamera(label: string) {
  return /iphone|continuity/i.test(label)
}

export function PhotoFramingEditor({
  src,
  initial,
  fileInputName,
  fileInputClassName = '',
  enablePhoneCapture = false,
  className = '',
}: PhotoFramingEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputId = useId()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'ready' | 'failed'>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [focalX, setFocalX] = useState(() => clamp(initial?.focalX ?? (initial?.cropX != null && initial?.cropWidth != null ? initial.cropX + initial.cropWidth / 2 : 50)))
  const [focalY, setFocalY] = useState(() => clamp(initial?.focalY ?? (initial?.cropY != null && initial?.cropHeight != null ? initial.cropY + initial.cropHeight / 2 : 50)))
  const [zoom, setZoom] = useState(() => initialZoom(initial))
  const imageSrc = previewUrl || src
  const canCaptureFromPhone = enablePhoneCapture && fileInputName

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = cameraStream
    if (cameraStream) video.play().catch(() => {})
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null
    }
  }, [cameraStream])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const crop = useMemo(() => {
    const cropWidth = clamp(100 / zoom, 25, 100)
    const cropHeight = clamp(100 / zoom, 25, 100)
    const cropX = clamp(focalX - cropWidth / 2, 0, 100 - cropWidth)
    const cropY = clamp(focalY - cropHeight / 2, 0, 100 - cropHeight)
    return { cropX, cropY, cropWidth, cropHeight }
  }, [focalX, focalY, zoom])

  function selectPreviewFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraStream(null)
  }

  async function startCamera() {
    setCameraOpen(true)
    setCameraStatus('starting')
    setCameraError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('failed')
      setCameraError('Camera capture is not available in this browser.')
      return
    }

    try {
      stopCamera()
      const requestedVideo = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
      const initialStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: requestedVideo,
      })
      let stream = initialStream

      const devices = await navigator.mediaDevices.enumerateDevices?.()
      const phoneCamera = devices?.find((device) => device.kind === 'videoinput' && looksLikePhoneCamera(device.label))
      if (phoneCamera) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              ...requestedVideo,
              deviceId: { exact: phoneCamera.deviceId },
            },
          })
          initialStream.getTracks().forEach((track) => track.stop())
        } catch {
          stream = initialStream
        }
      }

      streamRef.current = stream
      setCameraStream(stream)
      setCameraStatus('ready')
    } catch {
      setCameraStatus('failed')
      setCameraError('Safari could not start a camera. Check browser permission and Continuity Camera availability.')
    }
  }

  async function captureCameraFrame() {
    const video = videoRef.current
    const input = fileInputRef.current
    if (!video || !input || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera preview is not ready yet.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      setCameraError('Could not capture a still image from the camera.')
      return
    }

    const file = new File([blob], `iphone-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    selectPreviewFile(file)
    setFocalX(50)
    setFocalY(50)
    setZoom(1)
    stopCamera()
    setCameraOpen(false)
    setCameraStatus('idle')
  }

  return (
    <div className={cn('grid gap-3 rounded-lg border border-[#d6dfc9] bg-[#f7f4e8]/70 p-3', className)}>
      {fileInputName && (
        <div className="grid gap-1 text-sm font-medium text-stone-800">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <label htmlFor={fileInputId}>Image file</label>
            {canCaptureFromPhone && (
              <button
                type="button"
                aria-label="Acquire from iPhone"
                title="Acquire from iPhone"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#b7c9ac] bg-white/80 text-[#2f6b45] shadow-sm transition hover:bg-[#eef5e8] focus:outline-none focus:ring-2 focus:ring-[#8fa58f]/40"
                onClick={() => void startCamera()}
                disabled={cameraStatus === 'starting'}
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <input
            id={fileInputId}
            ref={fileInputRef}
            name={fileInputName}
            type="file"
            accept="image/*"
            className={cn('min-w-0 rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm', fileInputClassName)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              selectPreviewFile(file || null)
            }}
          />
        </div>
      )}

      {canCaptureFromPhone && cameraOpen && (
        <div className="grid gap-2 rounded-lg border border-[#b7c9ac] bg-white/70 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-stone-900">Phone camera</p>
            <button
              type="button"
              className="rounded-md border border-stone-300 bg-white/80 px-2 py-1 text-xs font-medium text-stone-700"
              onClick={() => {
                stopCamera()
                setCameraOpen(false)
                setCameraStatus('idle')
              }}
            >
              Close
            </button>
          </div>
          <div className="aspect-[4/3] overflow-hidden rounded-lg bg-stone-950">
            {cameraStream ? (
              <video ref={videoRef} className="h-full w-full object-contain" muted playsInline autoPlay />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-stone-200">
                {cameraStatus === 'starting' ? 'Starting camera...' : 'Camera unavailable'}
              </div>
            )}
          </div>
          {cameraError && <p className="text-xs text-[#9a3f35]">{cameraError}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#255537] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void captureCameraFrame()}
              disabled={cameraStatus !== 'ready'}
            >
              Use photo
            </button>
            {cameraStatus === 'failed' && (
              <button
                type="button"
                className="rounded-md border border-stone-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-stone-700"
                onClick={() => void startCamera()}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      <input type="hidden" name="cropX" value={crop.cropX.toFixed(3)} />
      <input type="hidden" name="cropY" value={crop.cropY.toFixed(3)} />
      <input type="hidden" name="cropWidth" value={crop.cropWidth.toFixed(3)} />
      <input type="hidden" name="cropHeight" value={crop.cropHeight.toFixed(3)} />
      <input type="hidden" name="focalX" value={focalX.toFixed(3)} />
      <input type="hidden" name="focalY" value={focalY.toFixed(3)} />

      <div className="grid gap-2 sm:grid-cols-[minmax(10rem,16rem)_1fr]">
        <button
          type="button"
          className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#d6dfc9]/45 text-[#2f6b45]"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setFocalX(clamp(((event.clientX - rect.left) / rect.width) * 100))
            setFocalY(clamp(((event.clientY - rect.top) / rect.height) * 100))
          }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${focalX}% ${focalY}%`,
                transform: zoom > 1.01 ? `scale(${zoom})` : undefined,
                transformOrigin: `${focalX}% ${focalY}%`,
              }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-stone-600">Choose an image to preview framing</span>
          )}
          <span
            className="pointer-events-none absolute -ml-3 -mt-3 rounded-full border border-white bg-[#2f6b45] p-1 text-white shadow"
            style={{ left: `${focalX}%`, top: `${focalY}%` }}
          >
            <Crosshair className="h-4 w-4" />
          </span>
        </button>

        <div className="grid content-start gap-3 text-sm">
          <p className="text-stone-600">Click the preview to set the focus point, then tighten or loosen the crop for cards and previews.</p>
          <label className="grid gap-1 font-medium text-stone-800">
            Crop
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.currentTarget.value))}
            />
            <span className="text-xs font-normal text-stone-500">{zoom.toFixed(2)}x</span>
          </label>
          <button
            type="button"
            className="justify-self-start rounded-md border border-stone-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-700"
            onClick={() => {
              setFocalX(50)
              setFocalY(50)
              setZoom(1)
            }}
          >
            Reset framing
          </button>
        </div>
      </div>
    </div>
  )
}
