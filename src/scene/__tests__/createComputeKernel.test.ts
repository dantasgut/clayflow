import { describe, expect, it, vi } from 'vitest';
import { createComputeKernel, destroyComputeKernel } from '../flows/createComputeKernel';
import { fakeResourceCore } from './helpers/fakeResourceCore';
import { defaultCapabilities } from './helpers/defaultCapabilities';
import { wgslModule } from '../shaders/WgslModule';
import { wgslResource } from '../shaders/WgslResource';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import type { BindingKey, BindingSource } from '../flows/FlowBinding';
import type { EngineCore, StorageBufferSpec, UniformBufferSpec } from '../../core/contracts/index';

function recordingCore(): {
    core: EngineCore;
    creates: { kind: string; discriminator?: string }[];
    asyncCreates: { kind: string; discriminator?: string }[];
} {
    const creates: { kind: string; discriminator?: string }[] = [];
    const asyncCreates: { kind: string; discriminator?: string }[] = [];
    const entry = (spec: unknown) => {
        const s = spec as { kind: string; discriminator?: string };
        return s.discriminator !== undefined
            ? { kind: s.kind, discriminator: s.discriminator }
            : { kind: s.kind };
    };
    const core = {
        create: vi.fn(<S>(spec: S) => {
            creates.push(entry(spec));
            return spec;
        }),
        createAsync: vi.fn(<S>(spec: S) => {
            asyncCreates.push(entry(spec));
            return Promise.resolve(spec);
        }),
        capabilities: vi.fn(defaultCapabilities),
    } as unknown as EngineCore;
    return { core, creates, asyncCreates };
}

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

// Grupos atribuídos pela montagem: 0 = stage (data, params — ordem de nome), 1 = draw (table).
const params = wgslResource({
    name: 'params',
    binding: { uniform: true },
    type: { wgsl: 'vec4u' },
    frequency: 'stage',
    provider: 'private',
});
const data = wgslResource({
    name: 'data',
    binding: { storage: 'read_write' },
    type: { wgsl: 'f32', array: true },
    frequency: 'stage',
    provider: 'private',
});
const table = wgslResource({
    name: 'table',
    binding: { storage: 'read' },
    type: { wgsl: 'f32', array: true },
    frequency: 'draw',
    provider: 'private',
});

const KERNEL = wgslModule({
    name: 'kernel',
    requires: [params, data, table],
    source: `
fn get(i: u32) -> f32 { return table[i]; }
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.x) { return; }
    data[id.x] = get(id.x);
}
@compute @workgroup_size(64) fn other(@builtin(global_invocation_id) id: vec3u) { data[id.x] = 0.0; }
`,
});

describe('createComputeKernel — bindings por nome, layout inferido (T025)', () => {
    it('cria layouts, shader, pipeline e bind groups numa chamada; grupos e tipos vêm do WGSL', () => {
        const { core, creates, asyncCreates } = recordingCore();
        const k = createComputeKernel(core, {
            discriminator: 'k1',
            shader: KERNEL,
            entryPoint: 'main',
            bindings: new Map<BindingKey, BindingSource>([
                [params, ubo],
                [data, sbo],
                [table, sbo],
            ]),
        });
        expect(k.pipeline).toMatchObject({
            kind: 'pipeline',
            subkind: 'compute',
            entryPoint: 'main',
        });
        expect(k.layouts).toHaveLength(2);
        expect(k.layouts[0]!.entries).toEqual([
            { binding: 0, visibility: 4, kind: 'buffer', type: 'storage' },
            { binding: 1, visibility: 4, kind: 'buffer', type: 'uniform' },
        ]);
        expect(k.layouts[1]!.entries).toEqual([
            { binding: 0, visibility: 4, kind: 'buffer', type: 'read-only-storage' },
        ]);
        expect(k.bindGroups[0]!.bindings).toEqual([
            { binding: 0, kind: 'buffer', buffer: sbo },
            { binding: 1, kind: 'buffer', buffer: ubo },
        ]);
        expect(k.groupsOf('stage').map((g) => g.index)).toEqual([0]);
        expect(k.groupsOf('draw').map((g) => g.index)).toEqual([1]);
        expect(creates.map((c) => c.kind).sort()).toEqual([
            'bindgroup',
            'bindgroup',
            'layout',
            'layout',
            'pipeline',
            'shader',
        ]);
        expect(asyncCreates).toHaveLength(0);
        expect(k.dynamic).toEqual([false, false]);
    });

    it('só os bindings que a entrada alcança entram; fonte para variável não usada é erro', () => {
        const { core } = recordingCore();
        const k = createComputeKernel(core, {
            discriminator: 'kOther',
            shader: KERNEL,
            entryPoint: 'other',
            bindings: new Map<BindingKey, BindingSource>([[data, sbo]]),
        });
        expect(k.layouts.map((l) => l.entries.length)).toEqual([1]);
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kExtra',
                shader: KERNEL,
                entryPoint: 'other',
                bindings: new Map<BindingKey, BindingSource>([
                    [data, sbo],
                    [params, ubo],
                ]),
            }),
        ).toThrow(/fonte para 'params', que a entrada 'other' não usa/);
    });

    it('binding usado sem fonte → erro nomeando binding e grupo', () => {
        const { core } = recordingCore();
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kMissing',
                shader: KERNEL,
                entryPoint: 'main',
                bindings: new Map<BindingKey, BindingSource>([
                    [params, ubo],
                    [data, sbo],
                ]),
            }),
        ).toThrow(/binding 'table' \(@group\(1\) @binding\(0\)\) sem fonte/);
    });

    it('fonte incompatível (storage num uniform) → erro', () => {
        const { core } = recordingCore();
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kWrong',
                shader: KERNEL,
                entryPoint: 'main',
                bindings: new Map<BindingKey, BindingSource>([
                    [params, sbo],
                    [data, sbo],
                    [table, sbo],
                ]),
            }),
        ).toThrow(/'params' incompatível/);
    });

    it('fonte dinâmica → hasDynamicOffset e grupo marcado', () => {
        const { core } = recordingCore();
        const k = createComputeKernel(core, {
            discriminator: 'kDyn',
            shader: KERNEL,
            entryPoint: 'main',
            bindings: new Map<BindingKey, BindingSource>([
                [params, { kind: 'buffer', buffer: ubo, size: 16, dynamic: { stride: 256 } }],
                [data, sbo],
                [table, sbo],
            ]),
        });
        expect(k.layouts[0]!.entries[1]).toMatchObject({ hasDynamicOffset: true });
        expect(k.layouts[0]!.entries[0]).not.toHaveProperty('hasDynamicOffset', true);
        expect(k.bindGroups[0]!.bindings[1]).toMatchObject({ size: 16 });
        expect(k.dynamic).toEqual([true, false]);
    });

    it('preferAsync=true usa createAsync para o pipeline', () => {
        const { core, creates, asyncCreates } = recordingCore();
        createComputeKernel(core, {
            discriminator: 'k_async',
            shader: KERNEL,
            entryPoint: 'other',
            bindings: new Map<BindingKey, BindingSource>([[data, sbo]]),
            preferAsync: true,
        });
        expect(creates.find((c) => c.kind === 'pipeline')).toBeUndefined();
        expect(asyncCreates.map((c) => c.kind)).toEqual(['pipeline']);
    });

    it('discriminadores prefixados pelo opts.discriminator (grupo único sem sufixo)', () => {
        const { core, creates } = recordingCore();
        createComputeKernel(core, {
            discriminator: 'kP',
            shader: KERNEL,
            entryPoint: 'other',
            bindings: new Map<BindingKey, BindingSource>([[data, sbo]]),
        });
        expect(
            creates
                .filter((c) => c.discriminator !== undefined)
                .map((c) => c.discriminator)
                .sort(),
        ).toEqual(['kP_bg', 'kP_layout', 'kP_pipeline', 'wgsl:kernel']);
    });
});

describe('createComputeKernel — buffers de vértice, índice e indireto (FR-015)', () => {
    it.each([
        {
            kind: 'buffer',
            subkind: 'vertex',
            discriminator: 'vbo',
            byteSize: 64,
            stride: 16,
            count: 4,
        },
        {
            kind: 'buffer',
            subkind: 'index',
            discriminator: 'ibo',
            byteSize: 12,
            count: 6,
            format: 'uint16',
        },
        { kind: 'buffer', subkind: 'indirect', discriminator: 'args', byteSize: 20 },
    ] as const)('$subkind entra como binding de storage do kernel', (buffer) => {
        const { core } = recordingCore();
        const k = createComputeKernel(core, {
            discriminator: `k_${buffer.subkind}`,
            shader: KERNEL,
            entryPoint: 'other',
            bindings: new Map<BindingKey, BindingSource>([[data, buffer]]),
        });
        expect(k.bindGroup.bindings[0]).toEqual({ binding: 0, kind: 'buffer', buffer });
        expect(k.layout.entries[0]).toMatchObject({ kind: 'buffer', type: 'storage' });
    });
});

describe('createComputeKernel — montagem e posse', () => {
    it('shader inválido (chamada a função ausente) lança antes de chegar ao core', () => {
        const { core } = recordingCore();
        const bad = wgslModule({
            name: 'bad',
            source: '@compute @workgroup_size(1) fn driver() { missing_helper(0.0); }',
        });
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kBad',
                shader: bad,
                entryPoint: 'driver',
                bindings: new Map(),
            }),
        ).toThrowError(/missing_helper/);
    });

    it('entry point que não é função do módulo de entrada → erro legível', () => {
        const { core } = recordingCore();
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kEntry',
                shader: KERNEL,
                entryPoint: 'nao_existe',
                bindings: new Map(),
            }),
        ).toThrowError(/entry point 'nao_existe'.*'kernel'/);
    });

    it('erro de montagem propagado com o motivo', () => {
        const { core } = recordingCore();
        const a = wgslModule({ name: 'dup', source: 'fn x() {}' });
        const b = wgslModule({ name: 'dup', source: 'fn y() {}' });
        const entry = wgslModule({
            name: 'e',
            source: '@compute @workgroup_size(1) fn main() { x(); y(); }',
            requires: [a, b],
        });
        try {
            createComputeKernel(core, {
                discriminator: 'kDup',
                shader: entry,
                entryPoint: 'main',
                bindings: new Map(),
            });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(WgslCompositionError);
            expect((e as WgslCompositionError).kind).toBe('duplicate-module-name');
        }
    });

    it('cada kernel recebe a sua cópia da spec montada (posse independente), com o mesmo texto', () => {
        const { core } = recordingCore();
        const opts = {
            shader: KERNEL,
            entryPoint: 'other',
            bindings: new Map<BindingKey, BindingSource>([[data, sbo]]),
        };
        const k1 = createComputeKernel(core, { discriminator: 'kA', ...opts });
        const k2 = createComputeKernel(core, { discriminator: 'kB', ...opts });
        expect(k1.pipeline.shader).not.toBe(k2.pipeline.shader);
        expect(k1.pipeline.shader).toEqual(k2.pipeline.shader);
    });

    it('destroyComputeKernel libera bind groups, pipeline, shader e layouts', () => {
        const { core } = fakeResourceCore();
        const kernel = createComputeKernel(core, {
            discriminator: 'k',
            shader: KERNEL,
            entryPoint: 'main',
            bindings: new Map<BindingKey, BindingSource>([
                [params, ubo],
                [data, sbo],
                [table, sbo],
            ]),
        });
        destroyComputeKernel(core, kernel);
        expect(vi.mocked(core.destroy).mock.calls.map((c) => c[0])).toEqual([
            kernel.bindGroups[0],
            kernel.bindGroups[1],
            kernel.pipeline,
            kernel.pipeline.shader,
            kernel.layouts[0],
            kernel.layouts[1],
        ]);
    });
});
