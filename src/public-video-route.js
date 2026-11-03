// Netlify pretty URLs may lowercase paths. Resolve only against verified public
// records, preserving the original case-sensitive ID in embeds and links.
export function resolvePublicVideo(episodes, id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return null;
  const matches = episodes.filter(video => video.id.toLowerCase() === id.toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}
