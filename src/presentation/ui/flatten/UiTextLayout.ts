import type { LoadedFont } from '../../assets/FontLoader';
import type { UiText } from '../UiText';
import type { UiQuadCpu } from './UiQuadCpu';

/**
 * Word-wrap + glyph atlas lookup. Recebe um `LoadedFont` (atlas pré-renderizado)
 * e converte um `UiText` em quads texturados que `UiGpuPipeline` envia ao GPU.
 *
 * Glifos ausentes usam `fontSize * 0.5` como advance default. Quebras de linha
 * acontecem em palavras separadas por whitespace ou no `\n` literal.
 */
export class UiTextLayout {
    constructor(private readonly font: LoadedFont) {}

    layout(el: UiText, into: UiQuadCpu[]): void {
        if (el.text.length === 0) return;
        const baseSize = this.font.fontSize;
        const scale = el.fontSize / baseSize;
        const lineHeight = baseSize * scale * 1.2;
        const maxWidth = el.bounds.width > 0 ? el.bounds.width : Number.POSITIVE_INFINITY;
        const startX = el.bounds.x;
        let cursorX = startX;
        let cursorY = el.bounds.y;

        const words = el.text.split(/(\s+)/); // mantém whitespace
        for (const word of words) {
            if (word === '') continue;
            if (word === '\n') {
                cursorX = startX;
                cursorY += lineHeight;
                continue;
            }
            const wordWidth = this.measureText(word, scale);
            if (wordWidth + (cursorX - startX) > maxWidth && cursorX > startX && /\S/.test(word)) {
                cursorX = startX;
                cursorY += lineHeight;
            }
            for (const ch of word) {
                const glyph = this.font.glyphs.get(ch);
                if (glyph === undefined) {
                    cursorX += baseSize * 0.5 * scale;
                    continue;
                }
                const w = glyph.width * scale;
                const h = glyph.height * scale;
                into.push({
                    rect: [cursorX, cursorY, w, h],
                    color: [...el.color] as [number, number, number, number],
                    uv: [
                        glyph.x / this.font.atlasWidth,
                        glyph.y / this.font.atlasHeight,
                        (glyph.x + glyph.width) / this.font.atlasWidth,
                        (glyph.y + glyph.height) / this.font.atlasHeight,
                    ],
                    textured: 1,
                });
                cursorX += glyph.advance * scale;
            }
        }
    }

    private measureText(s: string, scale: number): number {
        let w = 0;
        for (const ch of s) {
            const glyph = this.font.glyphs.get(ch);
            w += (glyph?.advance ?? this.font.fontSize * 0.5) * scale;
        }
        return w;
    }
}
