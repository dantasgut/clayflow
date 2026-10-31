/**
 * Câmera da spec 007: parâmetros + `Transform`, matrizes produzidas na GPU pelo `CameraFlow` num segundo descritor do
 * mesmo slot; câmera sem `Transform` é erro; a razão do canvas entra pelo uniform do estágio; `Transform.lookRotation`.
 */
import { describe, expect, it, vi } from 'vitest';
import { Camera } from '../Camera';
import { Transform } from '../Transform';
import { CameraComposeParamsSchema } from '../flows/CameraSchemas';
import {
    renderScene,
    registerStages,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

describe('Camera (spec 007)', () => {
    it('parâmetros em domínio → dado do schema; dois descritores em pool (parâmetros e matrizes, só GPU)', () => {
        const camera = new Camera({ projection: 'orthographic', aspectMode: 'fixed', aspect: 2 });
        expect(camera.data).toMatchObject({ projection: 1, aspectMode: 1, aspect: 2 });
        expect(new Camera().data).toMatchObject({ projection: 0, aspectMode: 0 });
        expect(camera.getDescriptors().map((d) => [d.id, d.storage, d.upload ?? 'always'])).toEqual(
            [
                ['camera', 'pool', 'always'],
                ['matrices', 'pool', 'never'],
            ],
        );
    });

    it('parâmetros e matrizes no mesmo slot; o estágio de câmera despacha com a razão do canvas', async () => {
        const s = await renderScene();
        registerStages(s.scene, {});
        const camera = new Camera().add(new Transform());
        const id = s.scene.world.insert(camera);
        s.step();
        const rs = s.scene.resourceSystem;
        expect(rs.poolSlotOf('Camera', id)).toBe(rs.poolSlotOf('CameraMatrices', id));
        const params = vi.mocked(s.core.write).mock.calls.filter(([spec]) =>
            // O uniforme do estágio é o descritor `camera_compose` do Resource de trabalho (spec 039).
            ((spec as { discriminator?: string }).discriminator ?? '').startsWith(
                'camera_compose:',
            ),
        );
        expect(params).toHaveLength(1);
        const [, data] = params[0]!;
        const f32 = new Float32Array(data.buffer, data.byteOffset, 4);
        expect(f32[CameraComposeParamsSchema.offsetOf('canvas_aspect') / 4]).toBeCloseTo(800 / 600);
    });

    it('câmera sem Transform na entidade é erro que nomeia a entidade', async () => {
        const s = await renderScene();
        registerStages(s.scene, {});
        s.scene.world.insert(new Transform()); // pool WorldTransform presente
        const id = s.scene.world.insert(new Camera());
        expect(() => s.step()).toThrow(new RegExp(`entidade ${id} não tem Transform`));
    });

    it('lookRotation: a câmera olha para o alvo (−Z local) com o "para cima" Y', () => {
        const q = Transform.lookRotation([0, 3, 6], [0, 0, 0]);
        const [x, y, z, w] = q;
        // Eixo −Z local em mundo = −(coluna z da rotação).
        const forward = [
            -(2 * (x * z + w * y)),
            -(2 * (y * z - w * x)),
            -(1 - 2 * (x * x + y * y)),
        ];
        const expected = [0, -3, -6].map((v) => v / Math.hypot(3, 6));
        forward.forEach((v, i) => {
            expect(v).toBeCloseTo(expected[i]!, 6);
        });
        expect(Math.hypot(...q)).toBeCloseTo(1, 6);
    });
});
