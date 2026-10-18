function configuredApplicationUrl() {
  // Read host configuration at runtime rather than inlining a NEXT_PUBLIC build value.
  const environment = process.env
  return environment.NEXT_PUBLIC_APP_URL
}

/** Validate browser mutations across TLS termination without trusting forwarded hosts. */
export function validRequestOrigin(
  request: Pick<Request, 'url' | 'headers'>,
  applicationUrl = configuredApplicationUrl()
) {
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return false
  try {
    const supplied = new URL(origin)
    if (
      !['http:', 'https:'].includes(supplied.protocol) ||
      supplied.origin !== origin
    )
      return false
    const host = request.headers.get('host')
    if (!host || /[\\/\s?#,@]/.test(host)) return false
    new URL(`http://${host}`)
    // The operator-configured public origin remains valid when a tunnel rewrites Host.
    const configured = applicationUrl ? new URL(applicationUrl) : undefined
    if (configured && !['http:', 'https:'].includes(configured.protocol))
      return false
    if (configured?.origin === origin) return true

    const forwarded = request.headers.get('x-forwarded-proto')
    if (forwarded && forwarded !== 'https' && forwarded !== 'http') return false
    const protocol = forwarded ? `${forwarded}:` : new URL(request.url).protocol
    if (!['http:', 'https:'].includes(protocol)) return false
    const expected = new URL(`${protocol}//${host}`)
    // A configured public host must use its configured scheme and port.
    if (configured?.hostname === expected.hostname) return false
    return expected.origin === origin
  } catch {
    return false
  }
}
