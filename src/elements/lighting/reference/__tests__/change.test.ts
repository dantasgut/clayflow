/**
 * A luz ou a cena que mudou (spec 034, T060e): a referência de `gi_change.wgsl` — a primeira guarda não é mudança; a
 * intensidade, a cor, a direção, a posição ou a contagem de luzes abrem os quadros de resposta; o sol que anda devagar
 * muda quando se afasta da última luz guardada; o envio da cena abre os mesmos quadros.
 */
import { describe, expect, it } from 'vitest';
import { GI_CHANGE_FRAMES } from '../../schemas';
import { CHANGE_EMPTY, changeStep, type ChangeLight, type ChangeState } from '../change';

const sun = (deg: number, intensity = 1): ChangeLight => {
    const a = (deg * Math.PI) / 180;
    return {
        kind: 0,
        castShadow: 1,
        intensity,
        position: [0, 0, 0],
        direction: [Math.cos(a), -Math.sin(a), 0],
        color: [1, 1, 1],
    };
};

function run(
    frames: readonly (readonly ChangeLight[])[],
    scene: readonly boolean[] = [],
): number[] {
    let state: ChangeState = CHANGE_EMPTY;
    return frames.map((lights, k) => {
        const r = changeStep(state, lights, scene[k] ?? false);
        state = r.state;
        return r.response;
    });
}

describe('a luz ou a cena que mudou (referência de gi_change.wgsl)', () => {
    it('a primeira guarda não é mudança; a intensidade 5 % acima abre os quadros, que contam até zero', () => {
        const r = run([[sun(40)], [sun(40)], [sun(40, 1.05)], [sun(40, 1.05)], [sun(40, 1.05)]]);
        expect(r).toEqual([0, 0, GI_CHANGE_FRAMES, GI_CHANGE_FRAMES - 1, GI_CHANGE_FRAMES - 2]);
    });

    it('abaixo das tolerâncias nada muda; o sol a 0,4° por quadro muda quando passa de 1° da última guardada', () => {
        expect(run([[sun(40)], [sun(40, 1.02)]])).toEqual([0, 0]);
        const r = run([[sun(40)], [sun(40.4)], [sun(40.8)], [sun(41.2)], [sun(41.6)]]);
        expect(r).toEqual([0, 0, 0, GI_CHANGE_FRAMES, GI_CHANGE_FRAMES - 1]);
    });

    it('a cor, a posição e outra contagem de luzes', () => {
        const red = { ...sun(40), color: [1, 0.9, 1] };
        expect(run([[sun(40)], [red]])[1]).toBe(GI_CHANGE_FRAMES);
        const moved = { ...sun(40), position: [0, 0.02, 0] };
        expect(run([[sun(40)], [moved]])[1]).toBe(GI_CHANGE_FRAMES);
        expect(run([[sun(40)], [sun(40), sun(10)]])[1]).toBe(GI_CHANGE_FRAMES);
    });

    it('o envio da cena abre os quadros; a resposta é a maior das duas', () => {
        const lights = Array.from({ length: 6 }, () => [sun(40)]);
        const r = run(lights, [false, true, false, false, true, false]);
        expect(r).toEqual([
            0,
            GI_CHANGE_FRAMES,
            GI_CHANGE_FRAMES - 1,
            GI_CHANGE_FRAMES - 2,
            GI_CHANGE_FRAMES,
            GI_CHANGE_FRAMES - 1,
        ]);
    });
});
