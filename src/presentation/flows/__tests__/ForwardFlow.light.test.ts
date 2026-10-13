/**
 * Spec 007 (US6): o render principal lê a direção da luz no pool `Light` pelo `lightSlot` dos parâmetros do quadro —
 * nenhum dado da luz é lido na CPU; sem luz que projeta sombra, a sentinela (direção padrão no shader).
 */
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { ForwardFrameParamsSchema, NO_LIGHT_SLOT } from '../../../elements/material/forwardSchemas';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

async function scene(castShadow: boolean) {
    const s = await renderScene();
    registerStages(s.scene, { shadow: true, forward: 'canvas' });
    s.scene.world.insert(new Camera().add(new Transform({ position: [0, 2, 6, 1] })));
    s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: false }));
    const light = new DirectionalLight({ direction: [0.3, -1, 0.2, 0], castShadow });
    const lightId = s.scene.world.insert(light);
    s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
    return { ...s, light, lightId };
}

/** Os parâmetros do quadro de cada escrita do forward, em ordem. */
function frameWrites(core: Awaited<ReturnType<typeof renderScene>>['core']) {
    return vi
        .mocked(core.write)
        .mock.calls.filter(([spec]) => discOf(spec) === 'forward_frame_params')
        .map(([, data]) => {
            const u32 = new Uint32Array(data.buffer, data.byteOffset, 4);
            const f32 = new Float32Array(data.buffer, data.byteOffset, 4);
            const at = (f: string) => ForwardFrameParamsSchema.offsetOf(f) / 4;
            return {
                lightSlot: u32[at('lightSlot')],
                shadowEnabled: f32[at('shadowEnabled')],
                shadowSlot: u32[at('shadowSlot')],
            };
        });
}

describe('ForwardFlow — luz pelo pool (spec 007)', () => {
    it('lightSlot é o slot no pool Light da direcional que projeta; o mapa dela no shadowSlot', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        const rs = s.scene.resourceSystem;
        const last = frameWrites(s.core).at(-1)!;
        expect(last.lightSlot).toBe(rs.poolSlotOf('Light', s.lightId));
        expect(last.shadowEnabled).toBe(1);
        expect(last.shadowSlot).toBe(rs.poolSlotOf('ShadowMap', s.lightId));
    });

    it('sem direcional que projeta sombra: a sentinela (direção padrão no shader)', async () => {
        const s = await scene(false);
        s.step();
        const last = frameWrites(s.core).at(-1)!;
        expect(last.lightSlot).toBe(NO_LIGHT_SLOT);
        expect(last.shadowEnabled).toBe(0);
    });

    it('nenhuma escrita dos parâmetros do quadro sem mudança — nem quando a direção da luz muda', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        const before = frameWrites(s.core).length;
        s.step();
        s.light.data.direction = [0.5, -1, 0, 0];
        s.step();
        s.step();
        expect(frameWrites(s.core)).toHaveLength(before);
    });
});
