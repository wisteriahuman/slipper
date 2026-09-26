// The Google Slides editor URL carries the presentation and the visible page:
// /presentation/d/<presentationId>/edit#slide=id.<pageId>
export type SlidesLocation = {url: string; presentationId: string | null; pageId: string | null};

export function parseSlidesUrl(url: string): SlidesLocation {
  try {
    const u = new URL(url);
    if (u.hostname !== 'docs.google.com') return {url, presentationId: null, pageId: null};
    const presentationId = u.pathname.match(/\/presentation\/d\/([\w-]+)/)?.[1] ?? null;
    const pageId = decodeURIComponent(u.hash).match(/slide=id\.([\w-]+)/)?.[1] ?? u.searchParams.get('slide')?.replace(/^id\./, '') ?? null;
    return {url, presentationId, pageId: presentationId ? pageId : null};
  } catch {
    return {url, presentationId: null, pageId: null};
  }
}
