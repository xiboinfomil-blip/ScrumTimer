import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

type TextRun = { t?: string; rPr?: { sz?: string } };
type Paragraph = { r?: TextRun | TextRun[]; pPr?: { defRPr?: { sz?: string } } };
type Point = { x?: string; y?: string };
type Extent = { cx?: string; cy?: string };
type Transform = { off?: Point; ext?: Extent; chOff?: Point; chExt?: Extent; rot?: string };
type Shape = { spPr?: { xfrm?: Transform }; txBody?: { p?: Paragraph | Paragraph[] } };
type ShapeTree = { sp?: Shape | Shape[]; grpSp?: ShapeTree | ShapeTree[]; grpSpPr?: { xfrm?: Transform } };
const array = <Value,>(value: Value | Value[] | undefined): Value[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

export function extractMoodText(bytes: Uint8Array): { titles: (string | null)[]; subtitles: (string | null)[] } {
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Presentation too large');
  const files = unzipSync(bytes, { filter: file => {
    if (!['ppt/presentation.xml', 'ppt/slides/slide2.xml'].includes(file.name)) return false;
    if (file.originalSize > 1024 * 1024) throw new Error('Slide text too large');
    return true;
  } });
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseTagValue: false, trimValues: false });
  const parse = (name: string) => {
    const text = files[name] ? strFromU8(files[name]) : '';
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Unsupported XML declarations');
    return text ? parser.parse(text) : null;
  };
  const presentation: { presentation?: { sldSz?: Extent } } | null = parse('ppt/presentation.xml');
  const slide: { sld?: { cSld?: { spTree?: ShapeTree } } } | null = parse('ppt/slides/slide2.xml');
  const width = Number(presentation?.presentation?.sldSz?.cx);
  const height = Number(presentation?.presentation?.sldSz?.cy);
  const titles: (string | null)[] = [null, null, null, null];
  const subtitles: (string | null)[] = [null, null, null, null];
  const scores = [0, 0, 0, 0];
  if (!(width > 0 && height > 0) || !slide?.sld?.cSld?.spTree) return { titles, subtitles };
  const visit = (tree: ShapeTree, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1) => {
    for (const shape of array(tree.sp)) {
      const transform = shape.spPr?.xfrm;
      if (!transform || Number(transform.rot ?? 0) !== 0) continue;
      const paragraphs = array(shape.txBody?.p);
      const paragraphIndex = paragraphs.findIndex(item => array(item.r).some(run => run.t?.trim()));
      const paragraph = paragraphs[paragraphIndex];
      if (!paragraph) continue;
      const title = array(paragraph.r).map(run => run.t ?? '').join('').replace(/\s+/g, ' ').trim();
      if (!title || title.length > 120 || title.split(' ').length > 12) continue;
      const left = offsetX + Number(transform.off?.x) * scaleX;
      const top = offsetY + Number(transform.off?.y) * scaleY;
      const boxWidth = Number(transform.ext?.cx) * scaleX;
      const boxHeight = Number(transform.ext?.cy) * scaleY;
      if (![left, top, boxWidth, boxHeight].every(Number.isFinite) || boxWidth <= 0 || boxHeight <= 0) continue;
      if (left < 0 || top < 0 || left + boxWidth > width * 1.01 || top + boxHeight > height * 1.01 || boxWidth > width * .51 || boxHeight > height * .51) continue;
      const right = left + boxWidth / 2 >= width / 2;
      const bottom = top + boxHeight / 2 >= height / 2;
      const index = right ? bottom ? 2 : 3 : bottom ? 1 : 0;
      const fontSize = Math.max(Number(paragraph.pPr?.defRPr?.sz ?? 0), ...array(paragraph.r).map(run => Number(run.rPr?.sz ?? 0)));
      const score = fontSize || boxWidth * boxHeight / (width * height);
      if (score > scores[index]) {
        titles[index] = title;
        const subtitle = paragraphs.slice(paragraphIndex + 1).map(item => array(item.r).map(run => run.t ?? '').join('').replace(/\s+/g, ' ').trim()).find(Boolean);
        subtitles[index] = subtitle && subtitle.length <= 300 ? subtitle : null;
        scores[index] = score;
      }
    }
    for (const group of array(tree.grpSp)) {
      const transform = group.grpSpPr?.xfrm;
      if (!transform || Number(transform.rot ?? 0) !== 0) continue;
      const nextScaleX = scaleX * Number(transform.ext?.cx) / Number(transform.chExt?.cx);
      const nextScaleY = scaleY * Number(transform.ext?.cy) / Number(transform.chExt?.cy);
      if (![nextScaleX, nextScaleY].every(value => Number.isFinite(value) && value > 0)) continue;
      visit(group, offsetX + Number(transform.off?.x) * scaleX - Number(transform.chOff?.x) * nextScaleX,
        offsetY + Number(transform.off?.y) * scaleY - Number(transform.chOff?.y) * nextScaleY, nextScaleX, nextScaleY);
    }
  };
  visit(slide.sld.cSld.spTree);
  return { titles, subtitles };
}

export function extractMoodTitles(bytes: Uint8Array): (string | null)[] {
  return extractMoodText(bytes).titles;
}