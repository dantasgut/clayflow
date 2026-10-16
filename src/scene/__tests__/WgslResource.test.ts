import { describe, expect, it, vi } from 'vitest';
import type {
    BindingLayoutEntry,
    EngineCore,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { createComputeKernel } from '../flows/createComputeKernel';
import { composeWgsl } from '../shaders/composeWgsl';
import { sharedConstant } from '../shaders/SharedConstant';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import { wgslModule } from '../shaders/WgslModule';
import {
    isWgslResource,
    resourceTypeText,
    wgslResource,
    type WgslResource,
} from '../shaders/WgslResource';
import type { BindingSource } from '../flows/FlowBinding';
import { LayoutInferencer } from '../systems/LayoutInferencer';
import { checkLayoutLimits } from '../systems/flowBinding/limits';
import { defaultCapabilities } from './helpers/defaultCapabilities';

const Item = new StructSchema('ResItem', { a: FieldType.f32, b: FieldType.u32 });

const items = wgslResource({
    name: 'items',
    binding: { storage: 'read' },
    type: { schema: Item, array: true },
    frequency: 'stage',
    provider: { pool: 'ResItem' },
});
const out = wgslResource({
    name: 'out_values',
    binding: { storage: 'read_write' },
    type: { wgsl: 'f32', array: true },
    frequency: 'draw',
    provider: 'private',
});
const params = wgslResource({
    name: 'params',
    binding: { uniform: true },
    type: { wgsl: 'vec4u' },
    frequency: 'draw',
    provider: 'private',
});
const time = wgslResource({
    name: 'scene_time',
    binding: { uniform: true },
    type: { wgsl: 'vec4f' },
    frequency: 'frame',
    provider: { consumer: 'Time' },
});

describe('wgslResource (spec 031, R1)', () => {
    it('é um módulo congelado sem fonte, com o símbolo da variável e o struct do tipo', () => {
        expect(isWgslResource(items)).toBe(true);
        expect(Object.isFrozen(items)).toBe(true);
        expect(items.source).toBe('');
        expect(items.symbols).toEqual([{ name: 'items', kind: 'var' }]);
        expect(items.structs).toEqual([Item]);
        expect(isWgslResource(wgslModule({ name: 'm', source: 'fn f() {}' }))).toBe(false);
    });

    it('texto do tipo para cada ligação', () => {
        const t = (o: Parameters<typeof wgslResource>[0]) =>
            resourceTypeText(wgslResource(o).resource);
        const base = { frequency: 'draw', provider: 'private' } as const;
        expect(
            t({
                ...base,
                name: 'a',
                binding: { storage: 'read' },
                type: { schema: Item, array: true },
            }),
        ).toBe('array<ResItem>');
        expect(t({ ...base, name: 'b', binding: { uniform: true }, type: { schema: Item } })).toBe(
            'ResItem',
        );
        expect(t({ ...base, name: 'c', binding: { texture: { sample: 'f32' } } })).toBe(
            'texture_2d<f32>',
        );
        expect(t({ ...base, name: 'd', binding: { texture: { sample: 'depth' } } })).toBe(
            'texture_depth_2d',
        );
        expect(
            t({
                ...base,
                name: 'e',
                binding: { texture: { sample: 'depth', multisampled: true } },
            }),
        ).toBe('texture_depth_multisampled_2d');
        expect(
            t({ ...base, name: 'f', binding: { texture: { sample: 'u32', dimension: 'cube' } } }),
        ).toBe('texture_cube<u32>');
        expect(
            t({
                ...base,
                name: 'g',
                binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
            }),
        ).toBe('texture_storage_2d<rgba16float, write>');
        expect(t({ ...base, name: 'h', binding: { sampler: 'comparison' } })).toBe(
            'sampler_comparison',
        );
        expect(t({ ...base, name: 'i', binding: { sampler: 'filtering' } })).toBe('sampler');
    });

    it('buffer sem tipo → erro', () => {
        expect(() =>
            wgslResource({
                name: 'x',
                binding: { uniform: true },
                frequency: 'frame',
                provider: 'private',
            }),
        ).toThrow(/buffer sem tipo/);
    });
});

describe('composeWgsl — ligações emitidas pelo motor (spec 031, T005)', () => {
    const kernel = wgslModule({
        name: 'res_kernel',
        requires: [items, out, params],
        source: `@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.x) { return; }
    out_values[id.x] = items[id.x].a;
}`,
    });

    it('declarações depois dos structs; grupo = posto da frequência presente; ligação = ordem do nome', () => {
        const c = composeWgsl(kernel);
        expect(c.groupFrequencies).toEqual(['stage', 'draw']);
        expect(c.bindings.map((b) => [b.name, b.group, b.binding])).toEqual([
            ['items', 0, 0],
            ['out_values', 1, 0],
            ['params', 1, 1],
        ]);
        const src = c.spec.source;
        expect(src).toContain('@group(0) @binding(0) var<storage, read> items: array<ResItem>;');
        expect(src).toContain(
            '@group(1) @binding(0) var<storage, read_write> out_values: array<f32>;',
        );
        expect(src).toContain('@group(1) @binding(1) var<uniform> params: vec4u;');
        expect(src.indexOf('struct ResItem')).toBeLessThan(src.indexOf('@group(0)'));
        expect(src.indexOf('@group(1) @binding(1)')).toBeLessThan(src.indexOf('fn main'));
    });

    it('determinístico e memorizado', () => {
        expect(composeWgsl(kernel)).toBe(composeWgsl(kernel));
    });

    it('o mesmo recurso por dois caminhos aparece uma vez', () => {
        const a = wgslModule({
            name: 'res_a',
            requires: [items],
            source: 'fn ra(i: u32) -> f32 { return items[i].a; }',
        });
        const b = wgslModule({
            name: 'res_b',
            requires: [items],
            source: 'fn rb(i: u32) -> u32 { return items[i].b; }',
        });
        const e = wgslModule({
            name: 'res_ab',
            requires: [a, b],
            source: '@compute @workgroup_size(1) fn main() { let x = ra(0u) + f32(rb(0u)); }',
        });
        const c = composeWgsl(e);
        expect(c.bindings.map((x) => x.name)).toEqual(['items']);
        expect(c.spec.source.match(/var<storage, read> items/g)).toHaveLength(1);
    });

    it('dois recursos diferentes com o mesmo nome → symbol-conflict', () => {
        const other = wgslResource({
            name: 'items',
            binding: { storage: 'read' },
            type: { wgsl: 'f32', array: true },
            frequency: 'frame',
            provider: 'private',
        });
        const e = wgslModule({ name: 'res_dup', requires: [items, other], source: 'fn f() {}' });
        expect(() => composeWgsl(e)).toThrow(WgslCompositionError);
    });

    it('recurso declarado junto com ligação escrita à mão → mixed-bindings', () => {
        const manual = wgslModule({
            name: 'res_manual',
            source: '@group(0) @binding(0) var<storage, read> legacy: array<f32>;\nfn g() -> f32 { return legacy[0]; }',
        });
        const e = wgslModule({ name: 'res_mixed', requires: [items, manual], source: 'fn f() {}' });
        expect(() => composeWgsl(e)).toThrow(/ligações escritas à mão em res_manual/);
    });

    it('módulo que usa um recurso sem requerê-lo (global implícito) → unresolved-reference', () => {
        const helper = wgslModule({
            name: 'res_helper',
            source: 'fn h(i: u32) -> f32 { return items[i].a; }',
        });
        const e = wgslModule({
            name: 'res_host',
            requires: [items, helper],
            source: '@compute @workgroup_size(1) fn main() { let x = h(0u); }',
        });
        try {
            composeWgsl(e);
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(WgslCompositionError);
            expect((err as WgslCompositionError).kind).toBe('unresolved-reference');
            expect((err as WgslCompositionError).detail).toEqual(['res_helper', 'items']);
        }
    });

    it('módulo que usa um recurso declarado ausente do shader → unresolved-reference', () => {
        const helper = wgslModule({
            name: 'res_absent',
            source: 'fn ab(i: u32) -> f32 { return out_values[i]; }',
        });
        const e = wgslModule({
            name: 'res_absent_host',
            requires: [helper],
            source: '@compute @workgroup_size(1) fn main() { let x = ab(0u); }',
        });
        expect(() => composeWgsl(e)).toThrow(
            /'res_absent' usa 'out_values' sem requerer o recurso/,
        );
    });

    it('membro e campo com o nome do recurso não acusam (só identificadores livres)', () => {
        const ok = wgslModule({
            name: 'res_member',
            requires: [time],
            source: 'struct Holder { items: f32 }\nfn m(h: Holder) -> f32 { return h.items + scene_time.x; }',
        });
        const e = wgslModule({
            name: 'res_member_host',
            requires: [ok, items],
            source: 'fn z() -> f32 { return items[0].a; }',
        });
        expect(() => composeWgsl(e)).not.toThrow();
    });
});

describe('LayoutInferencer com recursos declarados (spec 031, T009)', () => {
    it('entradas levam o recurso; grupos levam a frequência; recurso não alcançado fica fora', () => {
        const unused = wgslResource({
            name: 'unused_tex',
            binding: { texture: { sample: 'f32' } },
            frequency: 'stage',
            provider: 'private',
        });
        const e = wgslModule({
            name: 'res_infer',
            requires: [items, out, params, unused],
            source: '@compute @workgroup_size(1) fn main() { out_values[0] = items[params.x].a; }',
        });
        const layout = new LayoutInferencer().infer(composeWgsl(e), ['main']);
        expect(layout.groups.map((g) => g.frequency)).toEqual(['stage', 'draw']);
        expect(layout.groups[0]!.entries.map((x) => x.name)).toEqual(['items']);
        expect(layout.groups[0]!.entries[0]!.declared).toBe(items);
        expect(layout.groups[1]!.entries.map((x) => x.name)).toEqual(['out_values', 'params']);
    });
});

describe('sharedConstant (spec 031, T007)', () => {
    it('valor TS e módulo WGSL const', () => {
        const wg = sharedConstant('RES_WG', 64, 'u32');
        expect(wg.value).toBe(64);
        expect(wg.module.source).toBe('const RES_WG: u32 = 64u;');
        expect(sharedConstant('RES_NONE', 0xffffffff, 'u32').module.source).toBe(
            'const RES_NONE: u32 = 4294967295u;',
        );
        expect(sharedConstant('RES_F', 1e9, 'f32').module.source).toBe(
            'const RES_F: f32 = 1000000000.0f;',
        );
        expect(sharedConstant('RES_H', 0.5, 'f32').module.source).toBe('const RES_H: f32 = 0.5f;');
        expect(sharedConstant('RES_D', [0.4, -1, 0.6], 'vec3f').module.source).toBe(
            'const RES_D: vec3f = vec3f(0.4f, -1.0f, 0.6f);',
        );
    });

    it('@workgroup_size(NOME) compõe', () => {
        const wg = sharedConstant('RES_WG2', 64, 'u32');
        const k = wgslModule({
            name: 'res_wg_kernel',
            requires: [wg.module],
            source: '@compute @workgroup_size(RES_WG2) fn main() {}',
        });
        expect(composeWgsl(k).spec.source).toContain('const RES_WG2: u32 = 64u;');
    });

    it('valor fora do tipo → erro', () => {
        expect(() => sharedConstant('X', -1, 'u32')).toThrow(RangeError);
        expect(() => sharedConstant('Y', 1.5, 'i32')).toThrow(RangeError);
        expect(() => sharedConstant('Z', [1, 2], 'vec3f')).toThrow(RangeError);
    });
});

describe('checkLayoutLimits (spec 031, T006)', () => {
    const storage = (binding: number, visibility = 4): BindingLayoutEntry => ({
        binding,
        visibility,
        kind: 'buffer',
        type: 'read-only-storage',
    });

    it('grupos, ligações por grupo e storage por estágio', () => {
        expect(() => {
            checkLayoutLimits('p', [[], [], [], [], []], { maxBindGroups: 4 });
        }).toThrow(/p: maxBindGroups excedido — 5 > 4/);
        expect(() => {
            checkLayoutLimits('p', [[storage(8)]], { maxBindingsPerBindGroup: 8 });
        }).toThrow(/maxBindingsPerBindGroup excedido no grupo 0/);
        expect(() => {
            checkLayoutLimits('p', [[storage(0), storage(1)], [storage(0)]], {
                maxStorageBuffersPerShaderStage: 2,
            });
        }).toThrow(/maxStorageBuffersPerShaderStage excedido no estágio compute — 3 > 2/);
        expect(() => {
            checkLayoutLimits('p', [[storage(0, 1), storage(1, 2)]], {
                maxStorageBuffersPerShaderStage: 1,
            });
        }).not.toThrow();
        expect(() => {
            checkLayoutLimits('p', [[storage(0)]], {});
        }).not.toThrow();
    });
});

describe('createComputeKernel com recursos declarados (spec 031, T011)', () => {
    const ubo: UniformBufferSpec = {
        kind: 'buffer',
        subkind: 'uniform',
        discriminator: 'u',
        byteSize: 16,
    };
    const sbo: StorageBufferSpec = {
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 's',
        byteSize: 64,
    };
    const core = {
        create: vi.fn(<S>(spec: S) => spec),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(spec)),
        capabilities: vi.fn(defaultCapabilities),
    } as unknown as EngineCore;
    const kernel = wgslModule({
        name: 'res_ck',
        requires: [items, out, params],
        source: '@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { out_values[id.x] = items[params.x].a; }',
    });

    it('fontes por objeto do recurso; grupos por frequência', () => {
        const k = createComputeKernel(core, {
            discriminator: 'res_ck',
            shader: kernel,
            entryPoint: 'main',
            bindings: new Map<WgslResource, BindingSource>([
                [items, sbo],
                [out, sbo],
                [params, ubo],
            ]),
        });
        expect(k.groupsOf('stage').map((g) => g.index)).toEqual([0]);
        expect(k.groupsOf('draw').map((g) => g.index)).toEqual([1]);
        expect(k.groupsOf('frame')).toEqual([]);
    });

    it('recurso usado sem fonte → erro', () => {
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'res_ck2',
                shader: kernel,
                entryPoint: 'main',
                bindings: new Map<WgslResource, BindingSource>([
                    [items, sbo],
                    [out, sbo],
                ]),
            }),
        ).toThrow(/binding 'params'/);
    });

    it('constants repassados ao pipeline', () => {
        const k = createComputeKernel(core, {
            discriminator: 'res_ck3',
            shader: kernel,
            entryPoint: 'main',
            bindings: new Map<WgslResource, BindingSource>([
                [items, sbo],
                [out, sbo],
                [params, ubo],
            ]),
            constants: { SCALE: 2 },
        });
        expect(k.pipeline.constants).toEqual({ SCALE: 2 });
    });
});
