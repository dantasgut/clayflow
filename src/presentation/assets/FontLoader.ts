export interface FontGlyph {
    readonly char: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly advance: number;
}

export interface LoadedFont {
    readonly family: string;
    readonly url: string;
    readonly atlas: ImageBitmap | null;
    readonly atlasWidth: number;
    readonly atlasHeight: number;
    readonly glyphs: ReadonlyMap<string, FontGlyph>;
    readonly fontSize: number;
}

export interface FontLoaderOptions {
    readonly fontSize?: number;
    readonly chars?: string;
    readonly padding?: number;
}

const DEFAULT_CHARS =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`'
    + 'abcdefghijklmnopqrstuvwxyz{|}~';

export class FontLoader {
    async load(family: string, url: string, options: FontLoaderOptions = {}): Promise<LoadedFont> {
        const fontSize = options.fontSize ?? 32;
        const chars = options.chars ?? DEFAULT_CHARS;
        const padding = options.padding ?? 2;

        if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
            try {
                const face = new FontFace(family, `url(${url})`);
                const loaded = await face.load();
                (document as { fonts?: { add(face: FontFace): void } }).fonts?.add(loaded);
            } catch {
                /* offline / unsupported — fall back to system rendering */
            }
        }

        const atlas = this.buildAtlas(family, fontSize, chars, padding);
        return {
            family,
            url,
            atlas: atlas?.bitmap ?? null,
            atlasWidth: atlas?.width ?? 0,
            atlasHeight: atlas?.height ?? 0,
            glyphs: atlas?.glyphs ?? new Map(),
            fontSize,
        };
    }

    private buildAtlas(
        family: string,
        fontSize: number,
        chars: string,
        padding: number,
    ): {
        bitmap: ImageBitmap | null;
        width: number;
        height: number;
        glyphs: Map<string, FontGlyph>;
    } | null {
        if (typeof OffscreenCanvas === 'undefined') return null;
        const measureCanvas = new OffscreenCanvas(1, 1);
        const measureCtx = measureCanvas.getContext('2d');
        if (measureCtx === null) return null;
        measureCtx.font = `${fontSize}px ${family}`;

        const cell = fontSize + padding * 2;
        const cols = Math.ceil(Math.sqrt(chars.length));
        const rows = Math.ceil(chars.length / cols);
        const width = cols * cell;
        const height = rows * cell;

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (ctx === null) return null;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, width, height);
        ctx.font = `${fontSize}px ${family}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'white';

        const glyphs = new Map<string, FontGlyph>();
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i]!;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * cell + padding;
            const y = row * cell + padding;
            ctx.fillText(ch, x, y);
            const metrics = ctx.measureText(ch);
            glyphs.set(ch, {
                char: ch,
                x,
                y,
                width: metrics.width,
                height: fontSize,
                advance: metrics.width,
            });
        }
        const bitmap = canvas.transferToImageBitmap();
        return { bitmap, width, height, glyphs };
    }
}
