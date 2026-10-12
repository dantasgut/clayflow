import { describe, expect, it } from 'vitest';
import { UIFlow } from '../UIFlow';
import { UiPanel } from '../../ui/UiPanel';
import { discOf, renderScene } from './helpers/renderHarness';

async function scene() {
    const s = await renderScene();
    const ui = s.scene.flows.register((ctx) => new UIFlow(ctx), { type: 'ui', phase: 'ui' }).flow!;
    return { ...s, ui };
}

describe('UIFlow — slots', () => {
    it('árvore vazia: nenhum passe', async () => {
        const s = await scene();
        expect(s.step().filter((p) => p.label === 'UIFlow')).toEqual([]);
    });

    it('desenha os quads por cima do canvas, carregando o conteúdo (loadOp load)', async () => {
        const s = await scene();
        const panel = new UiPanel();
        panel.bounds = { x: 10, y: 10, width: 100, height: 40 };
        s.ui.ui
            .add(panel)
            .add(Object.assign(new UiPanel(), { bounds: { x: 0, y: 0, width: 5, height: 5 } }));
        const [pass] = s.step().filter((p) => p.label === 'UIFlow');
        expect(pass!.target.colorAttachments[0]).toMatchObject({
            loadOp: 'load',
            storeOp: 'store',
        });
        expect(discOf(pass!.target.colorAttachments[0]!.view)).toBe('canvas');
        expect(pass!.fullscreen).toBe(1);
    });

    it('quadros estáveis só reenviam os quads; a tela é escrita só quando muda', async () => {
        const s = await scene();
        s.ui.ui.add(Object.assign(new UiPanel(), { bounds: { x: 0, y: 0, width: 5, height: 5 } }));
        s.step();
        s.resetCounts();
        s.step();
        expect(s.creates()).toEqual([]);
        const written = s.writes().map(discOf);
        expect(written).toContain('ui_quads');
        expect(written).not.toContain('ui_screen');
    });
});
