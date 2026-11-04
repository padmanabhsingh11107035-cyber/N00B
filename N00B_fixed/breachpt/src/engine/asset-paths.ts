/** Resolve a project asset: plain files next to the page (public/assets/...), asked for relative to the page. */
export function resolveAssetUrl(sourcePath: string): string {
  const key = sourcePath.replace(/^\.\//, '').replace(/^\/+/, '')
  const rel = `${import.meta.env.BASE_URL}${key}`
  return typeof document === 'undefined' ? rel : new URL(rel, document.baseURI).toString()
}

export const assetUrl = (sourcePath: string): string => resolveAssetUrl(sourcePath)
