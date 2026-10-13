import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../geometry/BoxGeometry';
import { StandardMaterial } from '../material/StandardMaterial';
import { Camera } from '../scene/Camera';
import { DirectionalLight } from '../scene/DirectionalLight';
import { Transform } from '../scene/Transform';
import { registerPresentationDefaults } from '../../presentation/flows/defaults';
import { Vignette } from '../../presentation/flows/effects/Vignette';
import { UiPanel } from '../../presentation/ui/UiPanel';
import { renderScene } from '../../presentation/flows/__tests__/helpers/renderHarness';
import { insertGravity, insertSolverBodies } from '../physics/__tests__/helpers/solverBodies';

// Spec 006 (SC-004): layouts e bind groups são da C2 — inferidos do WGSL e ligados aos slots, a `consumes` e aos
// privados por nome. Nenhum estágio de C3/C4 cria layout nem bind group, e nenhum `dispatch` cria objeto de GPU.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...tsFiles(p));
        else if (entry.endsWith('.ts')) out.push(p);
    }
    return out;
}

const files = [...tsFiles(join(SRC, 'elements')), ...tsFiles(join(SRC, 'presentation'))]
    .map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }))
    .filter((f) => !f.rel.includes('__tests__/'));

describe('nenhum layout nem bind group criado por estágio (SC-004)', () => {
    it('C3/C4 não criam specs `layout` nem `bindgroup`', () => {
        const offenders = files
            .filter((f) =>
                /kind:\s*'(?:layout|bindgroup)'|create(?:Async)?<(?:LayoutSpec|BindGroupSpec)>/.test(
                    f.src,
                ),
            )
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });

    it('com todos os estágios padrão ativos, nenhum dispatch cria objeto de GPU', async () => {
        const s = await renderScene();
        const defaults = registerPresentationDefaults(s.scene.flows, { world: s.scene.world });
        defaults.post.addEffect(new Vignette());
        defaults.ui.ui.add(
            Object.assign(new UiPanel(), { bounds: { x: 0, y: 0, width: 50, height: 20 } }),
        );
        const w = s.scene.world;
        w.insert(new Camera());
        w.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
        insertGravity(w);
        for (let i = 0; i < 4; i++) {
            w.insert(
                new BoxGeometry()
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [i, 0, 0, 1] })),
            );
        }
        insertSolverBodies(w);
        for (let i = 0; i < 5; i++) s.step();

        const active = [...s.scene.flows.allFlows()]
            .filter((f) => f.lifecycle === 'ready')
            .map((f) => f.type);
        expect(active).toEqual(
            expect.arrayContaining([
                'LCPFlow',
                'XPBDFlow',
                'FEMFlow',
                'MPMFlow',
                'SPHFlow',
                'PBFFlow',
                'TransformFlow',
                'ShadowFlow',
                'ForwardFlow',
                'PostFlow',
                'DebugFlow',
                'UIFlow',
            ]),
        );
        expect(s.draws('ForwardFlow').length).toBeGreaterThan(0);
        expect(s.createdWhileRecording()).toBe(0);
    });
});
