/**
 * A lista dos blocos da tela da composição das nuvens (spec 041, T074) em f64: espelho de `cloud_upsample.wgsl` (a marca
 * de cada bloco), de `cloud_tiles.wgsl` (o bloco ou um dos 8 vizinhos marcado) e da composição — a do passe de desenho
 * (`sky_composite.wgsl`, em todo pixel, com o descarte por pixel) e a por compute só nos blocos da lista
 * (`sky_composite_tiles.wgsl`). Os testes mostram que compor só nos blocos da lista dá a composição da tela inteira, a
 * menos da luz abaixo da precisão que o passe de desenho também descartava.
 */

/** A precisão da composição (`SKY_COMPOSITE_EPS`, `CLOUD_COMPOSE_EPS`). */
export const COMPOSE_EPS = 1 / 4096;

/** Uma imagem RGBA em f64 (`data[(y·w + x)·4 + c]`). */
export interface Rgba {
    readonly width: number;
    readonly height: number;
    readonly data: Float64Array;
}

/** A composição do valor `v` (rgb a luz, a a transmitância) muda a cor do pixel (`cloud_composes`). */
export function composes(v: ArrayLike<number>, o: number, white: number): boolean {
    return (
        v[o + 3]! <= 1 - COMPOSE_EPS
        || Math.abs(v[o]!) >= COMPOSE_EPS * white
        || Math.abs(v[o + 1]!) >= COMPOSE_EPS * white
        || Math.abs(v[o + 2]!) >= COMPOSE_EPS * white
    );
}

/** As marcas dos blocos `tile` × `tile` da nuvem aumentada `view` (1 = algum pixel compõe). */
export function tileMarks(view: Rgba, tile: number, white: number): Uint8Array {
    const tw = Math.ceil(view.width / tile);
    const th = Math.ceil(view.height / tile);
    const marks = new Uint8Array(tw * th);
    for (let y = 0; y < view.height; y++)
        for (let x = 0; x < view.width; x++)
            if (composes(view.data, (y * view.width + x) * 4, white))
                marks[Math.floor(y / tile) * tw + Math.floor(x / tile)] = 1;
    return marks;
}

/** A lista dos blocos (x, y) com eles mesmos ou um dos 8 vizinhos marcado, na ordem do índice. */
export function tileList(marks: Uint8Array, tw: number, th: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < tw * th; i++) {
        const tx = i % tw;
        const ty = Math.floor(i / tw);
        let any = 0;
        for (let k = 0; k < 9; k++) {
            const qx = tx + (k % 3) - 1;
            const qy = ty + Math.floor(k / 3) - 1;
            if (qx >= 0 && qy >= 0 && qx < tw && qy < th) any |= marks[qy * tw + qx]!;
        }
        if (any !== 0) out.push([tx, ty]);
    }
    return out;
}

/** A nuvem passa-baixa no pixel (`sky_composite_cloud_low`): a média de 3 × 3 leituras a 3 pixels. */
export function cloudLow(view: Rgba, x: number, y: number): [number, number, number, number] {
    const s: [number, number, number, number] = [0, 0, 0, 0];
    for (let k = 0; k < 9; k++) {
        const qx = Math.min(Math.max(x + 3 * ((k % 3) - 1), 0), view.width - 1);
        const qy = Math.min(Math.max(y + 3 * (Math.floor(k / 3) - 1), 0), view.height - 1);
        const o = (qy * view.width + qx) * 4;
        for (let c = 0; c < 4; c++) s[c]! += view.data[o + c]! / 9;
    }
    return s;
}

/**
 * A composição de um pixel com a luz que chega (`luz` com r, g): o produto pela transmitância quando a do pixel ou a
 * passa-baixa passa da precisão, a soma sempre — a regra dos dois passes de desenho com o alvo da luz.
 */
export function composePixel(color: Rgba, light: Rgba, view: Rgba, x: number, y: number): void {
    const o = (y * view.width + x) * 4;
    const k = view.data[o + 3]!;
    const low = cloudLow(view, x, y);
    if (Math.min(k, low[3]) <= 1 - COMPOSE_EPS) {
        for (let c = 0; c < 3; c++) color.data[o + c]! *= k;
        light.data[o]! *= low[3];
        light.data[o + 1]! *= low[3];
    }
    const yl = Math.min(Math.max(0.25 * low[0] + 0.5 * low[1] + 0.25 * low[2], 0), 60000);
    for (let c = 0; c < 3; c++) color.data[o + c]! += view.data[o + c]!;
    light.data[o]! += yl;
    light.data[o + 1]! += yl;
}

/** A composição pelo passe de desenho: em todo pixel da tela. */
export function composeScreen(color: Rgba, light: Rgba, view: Rgba): void {
    for (let y = 0; y < view.height; y++)
        for (let x = 0; x < view.width; x++) composePixel(color, light, view, x, y);
}

/** A composição por compute: só nos pixels dos blocos da lista. */
export function composeTiles(
    color: Rgba,
    light: Rgba,
    view: Rgba,
    tile: number,
    list: readonly (readonly [number, number])[],
): void {
    for (const [tx, ty] of list)
        for (let j = 0; j < tile; j++)
            for (let i = 0; i < tile; i++) {
                const x = tx * tile + i;
                const y = ty * tile + j;
                if (x < view.width && y < view.height) composePixel(color, light, view, x, y);
            }
}
