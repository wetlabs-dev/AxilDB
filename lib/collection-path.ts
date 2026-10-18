export function collectionPath(slug: string, path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (normalized === '/') return `/c/${slug}`
  return `/c/${slug}${normalized}`
}

