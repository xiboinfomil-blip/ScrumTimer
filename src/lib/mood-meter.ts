export type MoodMeterMatrix = [number, number, number, number, number, number];

export interface MoodMeterCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MoodMeterOverlay {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform?: MoodMeterMatrix;
  crop?: MoodMeterCrop;
}

export interface MoodMeterSlide {
  image: string;
  overlays: MoodMeterOverlay[];
  aspectRatio?: number;
}

export interface MoodMeterDeck {
  title: string;
  slides: MoodMeterSlide[];
  remoteId?: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 32;

// Validate the exported relative path BEFORE making it root-relative. No URLs,
// encoded traversal, backslashes, query strings, or arbitrary public assets.
export function safeCatalogPath(value: unknown): value is string {
  return typeof value === 'string' &&
    /^mood-meters\/slides\/[\w .\-/]+\.(png|jpe?g|gif|webp|svg)$/i.test(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function parseOverlay(value: unknown): MoodMeterOverlay | null {
  if (!record(value) || !safeCatalogPath(value.src) || !/\.gif$/i.test(value.src) ||
      !finite(value.x) || !finite(value.y) || !finite(value.width) ||
      !finite(value.height) || value.width <= 0 || value.height <= 0) return null;
  let transform: MoodMeterMatrix | undefined;
  if (value.transform !== undefined) {
    if (!Array.isArray(value.transform) || value.transform.length !== 6 ||
        !value.transform.every(finite)) return null;
    transform = [...value.transform] as MoodMeterMatrix;
  }
  let crop: MoodMeterCrop | undefined;
  if (value.crop !== undefined && value.crop !== null) {
    const c = value.crop;
    if (!record(c) || !finite(c.left) || !finite(c.top) || !finite(c.right) ||
        !finite(c.bottom) || c.left + c.right >= 1 || c.top + c.bottom >= 1 ||
        c.left + c.right <= -32 || c.top + c.bottom <= -32) return null;
    crop = { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
  }
  return {
    src: `/${value.src}`, x: value.x, y: value.y,
    width: value.width, height: value.height, transform, crop,
  };
}

function parseSlide(value: unknown): MoodMeterSlide | null {
  if (typeof value === 'string') {
    return safeCatalogPath(value) ? { image: `/${value}`, overlays: [] } : null;
  }
  if (!record(value) || !safeCatalogPath(value.image) || !Array.isArray(value.overlays) ||
      value.overlays.length > 200 || (value.aspectRatio !== undefined &&
      (!finite(value.aspectRatio) || value.aspectRatio < 0.1))) return null;
  const overlays: MoodMeterOverlay[] = [];
  for (const item of value.overlays) {
    const overlay = parseOverlay(item);
    if (!overlay) return null;
    overlays.push(overlay);
  }
  return { image: `/${value.image}`, overlays, aspectRatio: value.aspectRatio as number | undefined };
}

export function displayTitle(deck: Pick<MoodMeterDeck, 'title'>): string {
  return deck.title.replace(/--[A-Za-z0-9_-]+$/, '').trim() || deck.title;
}

export function parseMoodMeterCatalog(value: unknown): MoodMeterDeck[] {
  if (!Array.isArray(value)) throw new Error('Catalogue de baromètres invalide.');
  const decks: MoodMeterDeck[] = [];
  for (const item of value) {
    if (record(item) && typeof item.title === 'string' && typeof item.remoteId === 'string' &&
        /^deck-[a-f0-9]{20}$/.test(item.remoteId) && Array.isArray(item.slides) && item.slides.length === 0) {
      decks.push({ title: item.title, remoteId: item.remoteId, slides: [] });
      continue;
    }
    if (!record(item) || typeof item.title !== 'string' ||
        !Array.isArray(item.slides) || item.slides.length === 0) continue;
    const slides = item.slides.map(parseSlide);
    if (slides.some(slide => slide === null)) continue;
    decks.push({ title: item.title, slides: slides as MoodMeterSlide[] });
  }
  return decks.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'fr', { numeric: true }));
}

export function chooseRandomDeck(count: number, current = -1): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const excludeCurrent = Number.isInteger(current) && current >= 0 && current < count;
  const choice = Math.floor(Math.random() * (excludeCurrent ? count - 1 : count));
  return excludeCurrent && choice >= current ? choice + 1 : choice;
}

export const isAnimatedImage = (src: string): boolean => /\.gif$/i.test(src);

export function overlayMatrix(overlay: MoodMeterOverlay, ratio: number, width: number, height: number): string {
  const m = overlay.transform ?? [overlay.width, 0, 0, overlay.height, overlay.x, overlay.y];
  return `matrix(${m[0]},${m[1] / ratio},${m[2] * ratio},${m[3]},${m[4] * width},${m[5] * height})`;
}

export function overlayCropStyle(crop?: MoodMeterCrop) {
  const c = crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const width = 1 - c.left - c.right;
  const height = 1 - c.top - c.bottom;
  return {
    width: `${100 / width}%`, height: `${100 / height}%`,
    left: `${-100 * c.left / width}%`, top: `${-100 * c.top / height}%`,
  };
}