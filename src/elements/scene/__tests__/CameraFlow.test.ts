/**
 * Estágio de câmera com o deslocamento da amostra (spec 034, T025): a sequência Halton (2, 3) de 8 posições enviada por
 * quadro ao estágio (em NDC e em pixels), nenhum deslocamento sem o antisserrilhado temporal ou de acumulação, e o
 * corte (`Camera.cut()`) que vale um quadro e recomeça a sequência. As matrizes (projeção com e sem o deslocamento, a
 * anterior) são compostas na GPU — conferidas pela leitura do pool no smoke `transforms`.
 */
import { describe, expect, it, vi } from 'vitest';
import { Camera } from '../Camera';
import { Transform } from '../Transform';
import { TemporalAntialiasing, type AntialiasingMode } from '../TemporalAntialiasing';
import { CameraComposeParamsSchema } from '../flows/CameraSchemas';
import {
    discOf,
    renderScene,
    registerStages,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

/** Halton de base 2 e de base 3, índices 1 a 8 (o oráculo, independente da implementação). */
const HALTON_2 = [1 / 2, 1 / 4, 3 / 4, 1 / 8, 5 / 8, 3 / 8, 7 / 8, 1 / 16];
const HALTON_3 = [1 / 3, 2 / 3, 1 / 9, 4 / 9, 7 / 9, 2 / 9, 5 / 9, 8 / 9];
/** Canvas do harness. */
const WIDTH = 800;
const HEIGHT = 600;

/** Cena com uma câmera e o antisserrilhado no modo dado (sem ele, `undefined`). */
async function cameraScene(mode: AntialiasingMode | undefined) {
    const s = await renderScene();
    registerStages(s.scene, {});
    if (mode !== undefined) s.scene.world.insert(new TemporalAntialiasing({ mode, sequence: 8 }));
    const camera = new Camera().add(new Transform({ position: [0, 0, 5, 1] }));
    s.scene.world.insert(camera);
    return { s, camera };
}

/** O último deslocamento (NDC xy, pixels zw) escrito nos parâmetros do estágio. */
function lastJitter(s: Awaited<ReturnType<typeof renderScene>>): number[] {
    const writes = vi
        .mocked(s.core.write)
        .mock.calls.filter(([spec]) => discOf(spec) === 'camera_compose_params');
    const [, data] = writes.at(-1)!;
    const f32 = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    const at = CameraComposeParamsSchema.offsetOf('jitter') / 4;
    return Array.from(f32.subarray(at, at + 4));
}

/** O deslocamento esperado da posição `i` (0–7) da sequência. */
function expected(i: number): number[] {
    const px = HALTON_2[i]! - 0.5;
    const py = HALTON_3[i]! - 0.5;
    return [(2 * px) / WIDTH, (-2 * py) / HEIGHT, px, py];
}

function expectJitter(actual: number[], want: number[]): void {
    actual.forEach((v, k) => {
        expect(v).toBeCloseTo(want[k]!, 7);
    });
}

describe('CameraFlow — deslocamento da amostra (spec 034)', () => {
    it.each(['temporal', 'accumulate'] as const)(
        '%s: Halton (2, 3) de 8 posições por quadro, em NDC (y para cima) e em pixels; repete depois da oitava',
        async (mode) => {
            const { s } = await cameraScene(mode);
            for (let frame = 0; frame < 10; frame++) {
                s.step();
                expectJitter(lastJitter(s), expected(frame % 8));
            }
        },
    );

    it.each([['msaa'], ['off'], [undefined]] as const)(
        'modo %s: nenhum deslocamento',
        async (mode) => {
            const { s } = await cameraScene(mode);
            for (let frame = 0; frame < 3; frame++) {
                s.step();
                expect(lastJitter(s)).toEqual([0, 0, 0, 0]);
            }
        },
    );

    it('Camera.cut(): vale um quadro (o estágio desliga no seguinte) e recomeça a sequência', async () => {
        const { s, camera } = await cameraScene('temporal');
        for (let frame = 0; frame < 5; frame++) s.step();
        expectJitter(lastJitter(s), expected(4));
        camera.cut();
        s.step();
        expect(camera.data.cut).toBe(1);
        expectJitter(lastJitter(s), expected(0));
        s.step();
        expect(camera.data.cut).toBe(0);
        expectJitter(lastJitter(s), expected(1));
    });
});
