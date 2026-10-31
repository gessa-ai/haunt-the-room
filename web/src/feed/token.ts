// The presenter token (server PRESENTER_TOKEN): the stage, the feed and the presenter keys send it as
// x-presenter-token. Read once from ?token= and kept in localStorage, so /stage and /feed both have it.
const KEY = "haunt.presenterToken"

export function presenterToken(): string {
  const fromUrl = new URLSearchParams(location.search).get("token")
  try {
    if (fromUrl) localStorage.setItem(KEY, fromUrl)
    return fromUrl ?? localStorage.getItem(KEY) ?? ""
  } catch {
    return fromUrl ?? ""
  }
}
