import { describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import type { Resource } from '../contracts/Resource';
import { ResourceState } from '../contracts/ResourceState';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import { composeWgsl } from '../shaders/composeWgsl';
import { instantiateModule } from '../shaders/instantiate';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import type { ContributionPoint, SceneContribution } from '../shaders/WgslPoint';
import {
    ProbeBody,
    ProbeBodySchema,
    ProbeCam,
    ProbeFlow,
    probeParams,
    probePipeline,
    probeScene,
} from './helpers/probeFlow';

describe('instantiateModule (spec 031, T008)', () => {
    const m = wgslModule({
        name: 'inst',
        source: `// foo é citado no comentário: foo
struct Foo { foo: f32 }
const K: f32 = 2.0;
fn foo(x: Foo) -> f32 { return x.foo * K; }
fn foobar() -> f32 { return foo(Foo(1.0)); }`,
    });

    it('renomeia por token os símbolos de nível superior, sem tocar comentários, membros nem substrings', () => {
        const a = instantiateModule(m, '_0');
        expect(a.source).toContain('// foo é citado no comentário: foo');
        expect(a.source).toContain('struct Foo_0 { foo: f32 }');
        expect(a.source).toContain('const K_0: f32 = 2.0;');
        expect(a.source).toContain('fn foo_0(x: Foo_0) -> f32 { return x.foo * K_0; }');
        expect(a.source).toContain('fn foobar_0() -> f32 { return foo_0(Foo_0(1.0)); }');
        expect(a.symbols.map((s) => s.name)).toEqual(['Foo_0', 'K_0', 'foo_0', 'foobar_0']);
    });

    it('duas instâncias convivem no mesmo shader; memorizada por (módulo, sufixo)', () => {
        const host = wgslModule({
            name: 'inst_host',
            requires: [instantiateModule(m, '_0'), instantiateModule(m, '_1')],
            source: 'fn h() -> f32 { return foo_0(Foo_0(1.0)) + foo_1(Foo_1(2.0)); }',
        });
        expect(() => composeWgsl(host)).not.toThrow();
        expect(instantiateModule(m, '_0')).toBe(instantiateModule(m, '_0'));
    });
});

// Ponto de contribuição de teste: `probe_gain(x) -> f32`, pronto = 1.0; vários contribuintes multiplicam em ordem.
const gainReady = wgslModule({
    name: 'probe_gain_ready',
    source: 'fn probe_gain(x: f32) -> f32 { return 1.0; }',
});
const gainPoint: ContributionPoint = {
    name: 'probe_gain',
    ready: gainReady,
    functionName: 'probe_gain',
    combine: (modules) =>
        wgslModule({
            name: `probe_gain_combined:${modules.map((m) => m.name).join('+')}`,
            requires: modules,
            source: `fn probe_gain(x: f32) -> f32 { return ${modules.map((_, k) => `probe_gain_${k}(x)`).join(' * ')}; }`,
        }),
};

const gainModules = new Map<string, WgslModule>();
function gainModule(slot: number, factor: number): WgslModule {
    const key = `${slot}:${factor}`;
    let m = gainModules.get(key);
    if (m === undefined) {
        m = wgslModule({
            name: `probe_gain_c${key.replace(':', '_')}`,
            source: `fn probe_gain(x: f32) -> f32 { return x * ${factor}.0 + f32(${slot}u); }`,
        });
        gainModules.set(key, m);
    }
    return m;
}

class GainSource extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    on = true;
    constructor(
        readonly factor: number,
        readonly order: number,
    ) {
        super();
        this.data = { v: [0, 0, 0, 0] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'body', role: 'storage-rw', schema: ProbeBodySchema, storage: 'pool' }];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
    getSceneContributions(): readonly SceneContribution[] {
        return [
            {
                point: gainPoint,
                order: this.order,
                pools: [ProbeBodySchema],
                build: (slotOf) => {
                    const slot = slotOf(ProbeBodySchema);
                    return !this.on || slot === undefined
                        ? undefined
                        : gainModule(slot, this.factor);
                },
            },
        ];
    }
}

describe('contribuições de cena (spec 031, T042)', () => {
    it('sem contribuinte o pronto; com um, o módulo dele; com dois, a combinação em ordem; removidos, o pronto', async () => {
        const s = await probeScene();
        const ready = vi.fn();
        s.scene.events.on('flowReady', ready);
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    pipelines: [
                        probePipeline(),
                        {
                            id: 'gain',
                            role: 'compute',
                            shader: wgslModule({
                                name: 'probe_gain_kernel',
                                requires: [gainReady],
                                source: '@compute @workgroup_size(1) fn gain_main() { let g = probe_gain(2.0); }',
                            }),
                            entryPoints: ['gain_main'],
                            consumes: [],
                        },
                    ],
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        s.scene.world.insert(new ProbeBody());
        const bound = ready.mock.calls[0]![0].payload.bound;
        const shaderOf = (): string => bound.compute('gain').spec.shader.source as string;
        const settle = (): void => {
            s.frame();
            s.frame();
        };
        expect(shaderOf()).toContain('return 1.0;');
        const a = new GainSource(3, 1);
        s.scene.world.insert(a);
        settle();
        expect(shaderOf()).toContain('return x * 3.0');
        const b = new GainSource(5, 0);
        s.scene.world.insert(b);
        settle();
        const src = shaderOf();
        expect(src).toContain(
            'fn probe_gain(x: f32) -> f32 { return probe_gain_0(x) * probe_gain_1(x); }',
        );
        expect(src.indexOf('x * 5.0')).toBeLessThan(src.indexOf('x * 3.0'));
        a.on = false;
        a.data = { v: [1, 0, 0, 0] };
        settle();
        expect(shaderOf()).toContain('return x * 5.0');
        expect(shaderOf()).not.toContain('x * 3.0');
        s.scene.world.remove(b);
        s.scene.world.remove(a);
        settle();
        expect(shaderOf()).toContain('return 1.0;');
    });
});
