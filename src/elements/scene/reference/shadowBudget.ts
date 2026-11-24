// Espelho da fila de alocação das páginas de sombra entre as vistas (spec 013, R7; só para testes): a ordem em que
// `sp_allocate_main` (`shadow_pages.wgsl`) atende as filas das vistas de sombra num quadro, com a mesma aritmética — os
// trechos da ordem, o rodízio por bisseção e o orçamento. As filas de uma vista são por nível (o último é o mais
// grosso: a reserva); um passo conta os níveis a partir do mais grosso de cada vista.
//
// A ordem: a reserva grossa das vistas cujo cache recomeça; a das que seguem; os níveis seguintes das que recomeçam; os
// das que seguem. Em cada passo as vistas se revezam página a página. As páginas das vistas que seguem contam no
// orçamento do quadro; as das que recomeçam, não (entram até o atlas inteiro). Uma página nova só entra com uma página
// física livre: nenhuma vista toma as que outra segura.

/** Uma página na fila: nova (precisa de página física) ou a redesenhar (já tem a sua). */
export type ShadowQueuedPage = 'new' | 'redraw';

/** As filas de uma vista por nível (índice = nível; o último é o mais grosso) e se o cache dela recomeça no quadro. */
export interface ShadowViewQueues {
    readonly levels: readonly (readonly ShadowQueuedPage[])[];
    readonly reset: boolean;
}

/** Uma posição atendida: a vista, o nível e a posição na fila do nível. */
export interface ShadowQueuePosition {
    readonly view: number;
    readonly level: number;
    readonly index: number;
}

/** Uma página que entra no quadro; `free`: a posição da página física livre que recebeu (a nova). */
export interface ShadowEnteringPage extends ShadowQueuePosition {
    readonly free?: number;
}

/** O orçamento do quadro e as posições percorridas no máximo (o atlas inteiro, até o teto de um quadro). */
export interface ShadowBudget {
    readonly budget: number;
    readonly capacity: number;
}

/** Rodadas da bisseção (`SP_ROUND_STEPS`) e a maior fila (`SP_ROUND_MAX`). */
const ROUND_STEPS = 13;
const ROUND_MAX = 4096;

/** Páginas das filas `counts`, cada uma contada até `cap` (`sp_step_count`). */
function stepCount(counts: readonly number[], cap: number): number {
    return counts.reduce((total, c) => total + Math.min(c, cap), 0);
}

/**
 * A posição `t` do rodízio das filas `counts` (uma por vista; `sp_step_pick`): a rodada é a maior com
 * `stepCount(counts, rodada) ≤ t`, por bisseção; devolve a vista e a posição na fila dela, ou `undefined` além do total.
 */
export function shadowStepPick(counts: readonly number[], t: number): [number, number] | undefined {
    if (t >= stepCount(counts, ROUND_MAX)) return undefined;
    let lo = 0;
    let hi = ROUND_MAX;
    for (let i = 0; i < ROUND_STEPS && lo < hi; i++) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (stepCount(counts, mid) <= t) lo = mid;
        else hi = mid - 1;
    }
    let rest = t - stepCount(counts, lo);
    for (let v = 0; v < counts.length; v++) {
        if ((counts[v] ?? 0) <= lo) continue;
        if (rest === 0) return [v, lo];
        rest--;
    }
    return undefined;
}

/** A fila da vista no passo `step` (0 = o nível mais grosso dela); vazia além dos níveis. */
function stepQueue(view: ShadowViewQueues, step: number): readonly ShadowQueuedPage[] {
    return view.levels[view.levels.length - 1 - step] ?? [];
}

/** As filas no passo `step` das vistas com `reset` igual a `resetting` (as outras contam 0). */
function stepCounts(
    views: readonly ShadowViewQueues[],
    resetting: boolean,
    step: number,
): number[] {
    return views.map((v) => (v.reset === resetting ? stepQueue(v, step).length : 0));
}

/** A posição `t0` da ordem das vistas de uma classe nos passos de `first` a `last` (exclusivo; `sp_order_pick`). */
function orderPick(
    views: readonly ShadowViewQueues[],
    resetting: boolean,
    first: number,
    last: number,
    t0: number,
): ShadowQueuePosition | undefined {
    let t = t0;
    for (let step = first; step < last; step++) {
        const counts = stepCounts(views, resetting, step);
        const total = stepCount(counts, ROUND_MAX);
        if (t < total) {
            const pick = shadowStepPick(counts, t);
            if (pick === undefined) return undefined;
            const [view, index] = pick;
            return { view, level: (views[view]?.levels.length ?? 0) - 1 - step, index };
        }
        t -= total;
    }
    return undefined;
}

/** O maior número de níveis entre as vistas (os passos percorridos). */
function stepsOf(views: readonly ShadowViewQueues[]): number {
    return Math.max(0, ...views.map((v) => v.levels.length));
}

/**
 * As posições das filas atendidas no quadro, na ordem (`sp_allocate_main`, antes das páginas físicas): `capacity`
 * posições no máximo quando alguma vista recomeça; senão, o orçamento.
 */
export function shadowAllocationOrder(
    views: readonly ShadowViewQueues[],
    { budget, capacity }: ShadowBudget,
): ShadowQueuePosition[] {
    const steps = stepsOf(views);
    const anyReset = views.some((v) => v.reset);
    const coarseReset = stepCount(stepCounts(views, true, 0), ROUND_MAX);
    const coarseFollow = stepCount(stepCounts(views, false, 0), ROUND_MAX);
    let fineReset = 0;
    for (let step = 1; step < steps; step++)
        fineReset += stepCount(stepCounts(views, true, step), ROUND_MAX);
    const limit = anyReset ? capacity : Math.min(budget, capacity);
    const out: ShadowQueuePosition[] = [];
    for (let t = 0; t < limit; t++) {
        let pick: ShadowQueuePosition | undefined;
        if (t < coarseReset) {
            pick = orderPick(views, true, 0, 1, t);
        } else if (t < coarseReset + coarseFollow) {
            if (t - coarseReset < budget) pick = orderPick(views, false, 0, 1, t - coarseReset);
        } else if (t < coarseReset + coarseFollow + fineReset) {
            pick = orderPick(views, true, 1, steps, t - coarseReset - coarseFollow);
        } else {
            const u = t - coarseReset - coarseFollow - fineReset;
            if (coarseFollow + u < budget) pick = orderPick(views, false, 1, steps, u);
        }
        if (pick !== undefined) out.push(pick);
    }
    return out;
}

/**
 * As páginas que entram no quadro, na ordem da lista das sujas: a nova recebe a página física livre da sua posição
 * entre as novas (até `free` livres; sem livre, não entra); a que já tem a sua entra sempre.
 */
export function shadowAllocate(
    views: readonly ShadowViewQueues[],
    limits: ShadowBudget & { readonly free: number },
): ShadowEnteringPage[] {
    const out: ShadowEnteringPage[] = [];
    let fresh = 0;
    for (const position of shadowAllocationOrder(views, limits)) {
        const page = views[position.view]?.levels[position.level]?.[position.index];
        if (page === 'redraw') {
            out.push(position);
            continue;
        }
        if (fresh < limits.free) out.push({ ...position, free: fresh });
        fresh++;
    }
    return out;
}
