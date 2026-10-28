import type { Mood } from '../../types/team.ts';

export interface MoodPicture {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function selectMoodPicture(pictures: MoodPicture[], mood: Mood): string | null {
  const right = mood === 3 || mood === 4;
  const bottom = mood === 2 || mood === 3;
  const candidates = pictures.filter(picture =>
    [picture.x, picture.y, picture.width, picture.height].every(Number.isFinite) &&
    picture.width >= .12 && picture.height >= .12 && picture.width <= .7 && picture.height <= .7 &&
    picture.x >= -.05 && picture.y >= -.05 && picture.x + picture.width <= 1.05 && picture.y + picture.height <= 1.05 &&
    (picture.x + picture.width / 2 >= .5) === right &&
    (picture.y + picture.height / 2 >= .5) === bottom);
  candidates.sort((first, second) => second.width * second.height - first.width * first.height);
  return candidates[0]?.src ?? null;
}

export function extractMoodPictures(svg: string): (string | null)[] {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror')) return [null, null, null, null];
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) return [null, null, null, null];
  const pictures: MoodPicture[] = [];
  for (const image of Array.from(document.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'image'))) {
    const src = image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(src)) continue;
    try {
      let matrix = new DOMMatrix();
      for (let element: Element | null = image; element && element !== root; element = element.parentElement) {
        const transform = (element as SVGGraphicsElement).transform?.baseVal.consolidate();
        if (transform) matrix = DOMMatrix.fromMatrix(transform.matrix).multiply(matrix);
      }
      const x = Number(image.getAttribute('x') ?? 0);
      const y = Number(image.getAttribute('y') ?? 0);
      const width = Number(image.getAttribute('width'));
      const height = Number(image.getAttribute('height'));
      const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
        .map(([left, top]) => matrix.transformPoint({ x: left, y: top }));
      const left = Math.min(...corners.map(point => point.x));
      const top = Math.min(...corners.map(point => point.y));
      pictures.push({ src, x: (left - viewBox[0]) / viewBox[2], y: (top - viewBox[1]) / viewBox[3],
        width: (Math.max(...corners.map(point => point.x)) - left) / viewBox[2],
        height: (Math.max(...corners.map(point => point.y)) - top) / viewBox[3] });
    } catch { continue; }
  }
  return ([1, 2, 3, 4] as const).map(mood => selectMoodPicture(pictures, mood));
}