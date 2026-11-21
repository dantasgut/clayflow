// Referência f64 do orçamento por necessidade do cache de espalhamento das nuvens e do panorama (spec 041, T074): a
// mudança do que um registro guarda desde o último caminho (o sol, o vento, a câmera, a evolução da forma, o conteúdo), a
// fila da página na escolha do quadro e o panorama a refazer. Espelho de `cloud_scatter_change`, `cloud_scatter_key` e
// `cloud_scatter_panorama_redo` em `cloud_scatter.wgsl`.
import type { Vec3 } from './cloudModel';

/** Ângulo (rad) do sol que reduz a média das sondas a 1/e (`CLOUD_SCATTER_SUN_MEMORY`: 0,25°). */
export const CLOUD_SCATTER_SUN_MEMORY = (0.25 * Math.PI) / 180;
/** A fila da página que nunca caminhou nesta geração. */
export const CLOUD_SCATTER_KEY_FRESH = 31;
/** Peso (m) da distância do centro da página à câmera na fila (metade a esta distância). */
export const CLOUD_SCATTER_NEAR_WEIGHT = 32_000;

/** O que o último caminho (desenho) de um registro viu. */
export interface ScatterSeen {
    readonly sun: Vec3;
    /** O deslocamento das nuvens pelo vento (m, xz). */
    readonly offset: readonly [number, number];
    readonly eye: Vec3;
    /** O tempo simulado (s). */
    readonly time: number;
    readonly signature: number;
}

/** O quadro de agora (o mesmo arranjo) e os parâmetros da mudança. */
export interface ScatterNow extends ScatterSeen {
    /** O cosseno do corte da fase (o pico de frente truncado). */
    readonly cosCut: number;
    /** O tempo (s) em que a evolução da forma muda a transmitância de 1/e; 0 sem evolução. */
    readonly evolution: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
    const l = len(a);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** O ângulo (rad) entre duas direções unitárias pela corda. */
export function scatterAngle(a: Vec3, b: Vec3): number {
    return 2 * Math.asin(Math.min(Math.max(0.5 * len(sub(a, b)), 0), 1));
}

/**
 * A mudança (0…1, em frações da média das sondas) do que o registro `seen` guarda até o quadro `now`, num ponto `at`
 * com sondas espaçadas de `spacing` m: a maior entre o sol (`1 − e^(−Δθ/memória)`), o vento (o deslocamento pelo
 * espaçamento), a câmera (o ângulo da direção dela ao ponto pelo corte da fase), a evolução (o tempo pelo da evolução) e
 * o conteúdo (outra assinatura: 1).
 */
export function scatterChange(seen: ScatterSeen, now: ScatterNow, at: Vec3, spacing: number): number {
    let c = 1 - Math.exp(-scatterAngle(seen.sun, now.sun) / CLOUD_SCATTER_SUN_MEMORY);
    c = Math.max(
        c,
        Math.hypot(now.offset[0] - seen.offset[0], now.offset[1] - seen.offset[1]) / spacing,
    );
    const view = scatterAngle(unit(sub(at, seen.eye)), unit(sub(at, now.eye)));
    c = Math.max(c, view / Math.max(Math.acos(Math.min(Math.max(now.cosCut, -1), 1)), 1e-4));
    if (now.evolution > 0) c = Math.max(c, Math.max(now.time - seen.time, 0) / now.evolution);
    if (seen.signature !== now.signature) c = 1;
    return Math.min(c, 1);
}

/** A página na fila: o que ela viu, se tem nuvem, os caminhos efetivos e o quadro do último caminho. */
export interface ScatterPage {
    readonly seen: ScatterSeen;
    readonly cloudy: boolean;
    readonly paths: number;
    readonly frame: number;
    /** A página vale nesta geração (carimbada na época atual). */
    readonly current: boolean;
}

/**
 * A fila da página (0: nada a fazer; 1…30 em oitavas; `CLOUD_SCATTER_KEY_FRESH`: nunca caminhou nesta geração): a
 * mudança desde o último caminho ou, com nuvem, a falta para encher a janela (`1 − caminhos/janela`), de pelo menos um
 * caminho da janela; a prioridade, a mudança em caminhos × os quadros desde o último × 1/8 sem nuvem × √(proximidade ×
 * 2 vista).
 */
export function scatterPageKey(
    page: ScatterPage,
    now: ScatterNow,
    frame: number,
    at: Vec3,
    spacing: number,
    window: number,
    visible: boolean,
): number {
    if (!page.current) return CLOUD_SCATTER_KEY_FRESH;
    let change = scatterChange(page.seen, now, at, spacing);
    if (page.cloudy) change = Math.max(change, 1 - page.paths / window);
    if (change * window < 1) return 0;
    const age = Math.max(frame - page.frame, 1);
    const d = Math.max(Math.abs(at[0] - now.eye[0]), Math.abs(at[2] - now.eye[2]));
    const near = 1 / (1 + d / CLOUD_SCATTER_NEAR_WEIGHT);
    const pr =
        change * window * age * (page.cloudy ? 1 : 0.125) * Math.sqrt(near * (visible ? 2 : 1));
    if (pr < 1) return 1;
    return Math.min(Math.max(1 + Math.floor(Math.log2(pr)), 1), CLOUD_SCATTER_KEY_FRESH - 1);
}

/**
 * Os caminhos efetivos da página depois de um caminho com o esquecimento `forget` (o do sol): esquecidos junto com a
 * média das sondas e mais um, até a janela.
 */
export function scatterPagePaths(paths: number, forget: number, window: number): number {
    return Math.min(paths * forget + 1, window);
}

/**
 * O panorama a refazer: a série que não vale, o cache que caminha (ou recomeça) no quadro, ou o que ele viu mudou de pelo
 * menos um caminho da janela (a mudança num ponto a `spacing` acima da câmera: a paralaxe da nuvem mais perto).
 */
export function scatterPanoramaRedo(
    valid: boolean,
    walked: boolean,
    seen: ScatterSeen,
    now: ScatterNow,
    spacing: number,
    window: number,
): boolean {
    if (!valid || walked) return true;
    const at: Vec3 = [now.eye[0], now.eye[1] + spacing, now.eye[2]];
    return scatterChange(seen, now, at, spacing) * window >= 1;
}

/** O espaçamento (m) das sondas no plano na coordenada normalizada `a` ∈ (−1, 1) da grade de `n` sondas. */
export function scatterSpacing(x0: number, reach: number, a: number, n: number): number {
    return (x0 * reach * Math.cosh(reach * a) * 2) / n;
}
