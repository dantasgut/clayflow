/**
 * Posição e dimensões de um glyph dentro do atlas. UIFlow usa estes
 * valores para gerar UV coordinates dos quads texturados.
 */
export interface FontGlyph {
    /** Caractere representado (e.g. 'A'). */
    readonly char: string;
    /** X do canto superior esquerdo no atlas (pixels). */
    readonly x: number;
    /** Y do canto superior esquerdo no atlas. */
    readonly y: number;
    /** Largura visual do glyph (em pixels). */
    readonly width: number;
    /** Altura do glyph (geralmente igual ao fontSize). */
    readonly height: number;
    /** Quanto avançar o cursor para o próximo glyph (kerning simplificado). */
    readonly advance: number;
}

/**
 * Font carregada pelo `FontLoader`. Inclui ImageBitmap atlas + glyph
 * metadata para text layout. `atlas` é null em ambientes sem
 * OffscreenCanvas (Node-side, alguns mobile browsers).
 */
export interface LoadedFont {
    /** Nome da font family (e.g. 'Inter', 'monospace'). */
    readonly family: string;
    /** URL do arquivo .woff/.ttf/.otf. */
    readonly url: string;
    /** ImageBitmap renderizado com todos os glyphs (RGBA). */
    readonly atlas: ImageBitmap | null;
    /** Largura do atlas em pixels. */
    readonly atlasWidth: number;
    /** Altura do atlas em pixels. */
    readonly atlasHeight: number;
    /** Map char → glyph metadata (UV + advance). */
    readonly glyphs: ReadonlyMap<string, FontGlyph>;
    /** Pixel size usado para renderizar o atlas. */
    readonly fontSize: number;
}

/**
 * Opções de carregamento. `chars` permite limitar o atlas aos caracteres
 * efetivamente usados (atlas menor → menos GPU memory).
 */
export interface FontLoaderOptions {
    /** Tamanho em pixels para renderizar os glyphs. Default: 32. */
    readonly fontSize?: number;
    /** String com todos os chars a incluir. Default: ASCII printable. */
    readonly chars?: string;
    /** Padding entre glyphs no atlas (evita bleeding). Default: 2px. */
    readonly padding?: number;
}

const DEFAULT_CHARS =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`'
    + 'abcdefghijklmnopqrstuvwxyz{|}~';

/**
 * FontLoader carrega arquivos de font (woff, ttf, otf) e gera um atlas
 * de glyphs em ImageBitmap. UIFlow usa o atlas + glyph metadata para
 * renderizar texto via quads texturados.
 *
 * Implementação: usa FontFace API (browser) para registrar a font e
 * OffscreenCanvas para renderizar cada char. Fallback gracioso se APIs
 * não disponíveis (retorna LoadedFont com atlas=null).
 */
export class FontLoader {
    /**
     * Carrega font + gera atlas. Retorna LoadedFont mesmo se renderização
     * falhar (atlas=null nesse caso) para que o app não quebre.
     */
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
