import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../geometry/BoxGeometry';
import { StandardMaterial } from '../material/StandardMaterial';
import { FluidBody } from '../physics/bodies/FluidBody';
import { RigidBody } from '../physics/bodies/RigidBody';
import { SoftBody } from '../physics/bodies/SoftBody';
import { DistanceConstraint } from '../physics/constraints/DistanceConstraint';
import { GravityField } from '../physics/forcefields/GravityField';
import { Camera } from '../scene/Camera';
import { DirectionalLight } from '../scene/DirectionalLight';
import { Transform } from '../scene/Transform';
import { registerPresentationDefaults } from '../../presentation/flows/defaults';
import { Vignette } from '../../presentation/flows/effects/Vignette';
import { UiPanel } from '../../presentation/ui/UiPanel';
import { renderScene } from '../../presentation/flows/__tests__/helpers/renderHarness';

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
        w.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        for (let i = 0; i < 4; i++) {
            w.insert(
                new BoxGeometry()
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [i, 0, 0, 1] })),
            );
        }
        w.insert(
            new RigidBody({
                shape: 'box',
                mass: 0,
                halfExtents: [4, 0.5, 4],
                position: [0, -0.5, 0],
            }),
        );
        w.insert(new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [0, 1, 0] }));
        for (let i = 0; i < 4; i++) {
            w.insert(
                new SoftBody({
                    algorithm: 'XPBD',
                    position: [i * 0.1, 2, 0],
                    mass: i === 0 ? 0 : 0.1,
                }),
            );
        }
        for (let i = 0; i + 1 < 4; i++) {
            w.insert(new DistanceConstraint({ i, j: i + 1, restLength: 0.1, compliance: 1e-6 }));
        }
        w.insert(new SoftBody({ algorithm: 'FEM', position: [0, 3, 0], mass: 0.05 }));
        w.insert(new SoftBody({ algorithm: 'MPM', position: [1, 3, 0] }));
        for (const algorithm of ['MPM', 'SPH', 'PBF'] as const) {
            w.insert(new FluidBody({ algorithm, position: [2, 3, 0] }));
        }
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
                'transform',
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
