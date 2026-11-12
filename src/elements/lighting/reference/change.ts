// Referência da luz ou da cena que mudou (spec 034, T059, T060e): a regra de `gi_change.wgsl` — as luzes do quadro contra
// as guardadas na série e os quadros de resposta. A luz guardada só troca na mudança (o sol que anda devagar, abaixo das
// tolerâncias a cada quadro, muda quando se afasta da última guardada); a primeira guarda não é mudança.

import { GI_CHANGE_FRAMES } from '../schemas';

/** Os campos de uma luz que a regra compara. */
export interface ChangeLight {
    readonly kind: number;
    readonly castShadow: number;
    readonly intensity: number;
    readonly position: readonly number[];
    readonly direction: readonly number[];
    readonly color: readonly number[];
}

/** O estado da série: as luzes guardadas (`undefined` antes da primeira) e os quadros que faltam da luz e da cena. */
export interface ChangeState {
    readonly lights: readonly ChangeLight[] | undefined;
    readonly light: number;
    readonly scene: number;
}

export const CHANGE_EMPTY: ChangeState = Object.freeze({ lights: undefined, light: 0, scene: 0 });

/**
 * A luz `b` está longe de `a`: o tipo, a sombra, a intensidade ou a cor mais de 3 % (relativo ao maior), a direção mais
 * de 1° ou a posição mais de 1 cm.
 */
export function lightMoved(a: ChangeLight, b: ChangeLight): boolean {
    const rel = (x: number, y: number): boolean =>
        Math.abs(x - y) > 0.03 * Math.max(Math.abs(x), Math.abs(y), 1e-9);
    if (a.kind !== b.kind || a.castShadow !== b.castShadow || rel(a.intensity, b.intensity))
        return true;
    if ([0, 1, 2].some((k) => rel(a.color[k] ?? 0, b.color[k] ?? 0))) return true;
    const dot = [0, 1, 2].reduce(
        (sum, k) => sum + (a.direction[k] ?? 0) * (b.direction[k] ?? 0),
        0,
    );
    const la = Math.hypot(a.direction[0] ?? 0, a.direction[1] ?? 0, a.direction[2] ?? 0);
    const lb = Math.hypot(b.direction[0] ?? 0, b.direction[1] ?? 0, b.direction[2] ?? 0);
    if (la > 0 && lb > 0 && dot / (la * lb) < Math.cos(Math.PI / 180)) return true;
    return Math.hypot(...[0, 1, 2].map((k) => (a.position[k] ?? 0) - (b.position[k] ?? 0))) > 0.01;
}

/**
 * Um quadro: as luzes do quadro e se a cena foi enviada nele (`poolWritten`). Devolve o estado seguinte e os quadros
 * que faltam da resposta (> 0: as sondas e o cache tomam a mudança sem esperar a detecção).
 */
export function changeStep(
    state: ChangeState,
    lights: readonly ChangeLight[],
    sceneWritten: boolean,
): { readonly state: ChangeState; readonly response: number } {
    const last = state.lights;
    const moved = last?.length !== lights.length || lights.some((l, k) => lightMoved(last[k]!, l));
    const light = moved
        ? last === undefined
            ? 0
            : GI_CHANGE_FRAMES
        : Math.max(state.light - 1, 0);
    const scene = sceneWritten ? GI_CHANGE_FRAMES : Math.max(state.scene - 1, 0);
    return {
        state: { lights: moved ? lights : last, light, scene },
        response: Math.max(light, scene),
    };
}
