/**
 * Tabelas de transição dos estágios de apresentação (R5): forward, sombra, pós, UI e debug têm um estado (`idle`); a
 * tabela declara todo evento que a C2 lhes pode entregar, e evento fora dela lança. Em cena real, os eventos
 * provocados (canvas redimensionado, pools que crescem, entidades removidas, luz alterada, efeito ligado) são
 * tratados sem sair do estado nem do ciclo `ready`.
 */
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { TintMaterial } from './helpers/tintMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { expectTransitionTable } from '../../../scene/__tests__/helpers/flowEvents';
import { registerPresentationDefaults } from '../defaults';
import { Bloom } from '../effects/Bloom';
import { Vignette } from '../effects/Vignette';
import { UiPanel } from '../../ui/UiPanel';
import { renderScene } from './helpers/renderHarness';

async function presentationScene() {
    const s = await renderScene();
    const defaults = registerPresentationDefaults(s.scene.flows, { world: s.scene.world });
    defaults.post.addEffect(new Vignette());
    defaults.ui.ui.add(
        Object.assign(new UiPanel(), { bounds: { x: 0, y: 0, width: 50, height: 20 } }),
    );
    const light = new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true });
    s.scene.world.insert(new Camera().add(new Transform()));
    s.scene.world.insert(light);
    const boxes = Array.from({ length: 5 }, () =>
        new BoxGeometry().add(new StandardMaterial()).add(new Transform()),
    );
    for (const b of boxes) s.scene.world.insert(b);
    s.step();
    const stages = () => [
        defaults.forward,
        defaults.shadow,
        defaults.post,
        defaults.ui,
        defaults.debug,
    ];
    return { ...s, defaults, light, boxes, stages };
}

describe('apresentação — tabelas de transição', () => {
    it('forward, sombra, pós, UI e debug ficam prontos em `idle`', async () => {
        const s = await presentationScene();
        for (const flow of s.stages()) {
            expect(flow.lifecycle, flow.type).toBe('ready');
            expect(flow.state, flow.type).toBe('idle');
        }
    });

    it('cada tabela declara todo evento entregável e lança nos demais', async () => {
        const s = await presentationScene();
        for (const flow of s.stages()) expectTransitionTable(flow);
    });

    it('eventos provocados em cena real: tratados sem sair de idle/ready', async () => {
        const s = await presentationScene();
        vi.mocked(s.core.canvasSize).mockReturnValue({ width: 640, height: 360 });
        s.scene.events.emit('canvasReconfigured', {
            width: 640,
            height: 360,
            format: s.core.canvasFormat,
        });
        for (let i = 0; i < 300; i++) {
            s.scene.world.insert(new BoxGeometry().add(new TintMaterial()).add(new Transform()));
        }
        s.step();
        for (const b of s.boxes) s.scene.world.remove(b);
        s.light.data.direction = [1, -1, 0, 0];
        s.defaults.post.addEffect(new Bloom());
        s.step();
        s.step();
        for (const flow of s.stages()) {
            expect(flow.lifecycle, flow.type).toBe('ready');
            expect(flow.state, flow.type).toBe('idle');
        }
        expect(s.draws('ForwardFlow').reduce((n, d) => n + d.instanceCount, 0)).toBe(300);
        expect(s.createdWhileRecording()).toBe(0);
    });
});
