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
 * Font carregada (o `FontLoader` do `clayflow/web` a gera; spec 038: o núcleo só recebe os pixels do atlas e as métricas).
 * `atlas` é null onde o ambiente não rasteriza texto.
 */
export interface LoadedFont {
    /** Nome da font family (e.g. 'Inter', 'monospace'). */
    readonly family: string;
    /** URL do arquivo .woff/.ttf/.otf. */
    readonly url: string;
    /** Os pixels do atlas com todos os glyphs (RGBA, 8 bits por canal, linha a linha). */
    readonly atlas: Uint8Array | null;
    /** Largura do atlas em pixels. */
    readonly atlasWidth: number;
    /** Altura do atlas em pixels. */
    readonly atlasHeight: number;
    /** Map char → glyph metadata (UV + advance). */
    readonly glyphs: ReadonlyMap<string, FontGlyph>;
    /** Pixel size usado para renderizar o atlas. */
    readonly fontSize: number;
}
