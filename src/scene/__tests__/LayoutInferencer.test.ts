import { describe, expect, it } from 'vitest';
import { LayoutInferencer, LayoutInferenceError } from '../systems/LayoutInferencer';

const S = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 } as const;

function entry(source: string, entryPoints: readonly string[], group = 0, binding = 0) {
    const layout = new LayoutInferencer().infer(source, entryPoints);
    return layout.groups.find((g) => g.group === group)?.entries.find((e) => e.binding === binding);
}

describe('LayoutInferencer.parseWGSL', () => {
    it('extrai grupo, binding, nome, address space, acesso e tipo', () => {
        const info = new LayoutInferencer().parseWGSL(`
@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(2) var<storage, read_write> bodies: array<RigidBody>;
@vertex fn vs() -> @builtin(position) vec4f { return camera.viewProjection[0]; }
@compute @workgroup_size(64) fn cs() { bodies[0].pos = vec4f(0.0); }
`);
        expect(info.bindings).toHaveLength(2);
        const [cam, bodies] = info.bindings;
        expect(cam).toMatchObject({
            group: 0,
            binding: 0,
            name: 'camera',
            addressSpace: 'uniform',
        });
        expect(bodies).toMatchObject({
            group: 1,
            binding: 2,
            name: 'bodies',
            addressSpace: 'storage',
            access: 'read_write',
            typeText: 'array<RigidBody>',
        });
        expect([...cam!.stages]).toEqual(['vertex']);
        expect([...bodies!.stages]).toEqual(['compute']);
    });

    it('estágios por alcance de chamadas: binding citado só numa função auxiliar chamada pela entrada', () => {
        const info = new LayoutInferencer().parseWGSL(`
@group(0) @binding(0) var<uniform> light: Light;
fn shade(n: vec3f) -> f32 { return dot(n, light.dir.xyz); }
fn indirect(n: vec3f) -> f32 { return shade(n); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(indirect(vec3f(0.0, 1.0, 0.0))); }
`);
        expect([...info.bindings[0]!.stages]).toEqual(['fragment']);
    });

    it('comentários não contam como uso', () => {
        const info = new LayoutInferencer().parseWGSL(`
@group(0) @binding(0) var<uniform> unused: Params;
@compute @workgroup_size(1) fn main() { // unused
}
`);
        expect(info.bindings[0]!.stages.size).toBe(0);
    });
});

describe('LayoutInferencer.infer — visibilidade (FR-010)', () => {
    const shared = `
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> material: StandardMaterial;
fn tint() -> vec4f { return material.albedo; }
@vertex fn vs_main() -> @builtin(position) vec4f { return camera.viewProjection[0]; }
@fragment fn fs_main() -> @location(0) vec4f { return tint() * camera.viewProjection[1]; }
`;

    it('binding usado só no fragment (via função auxiliar) → só FRAGMENT', () => {
        expect(entry(shared, ['vs_main', 'fs_main'], 0, 1)?.visibility).toBe(S.FRAGMENT);
    });

    it('binding usado por vertex e fragment → ambos', () => {
        expect(entry(shared, ['vs_main', 'fs_main'], 0, 0)?.visibility).toBe(S.VERTEX | S.FRAGMENT);
    });

    it('binding não alcançado pelas entradas listadas fica fora do layout; o grupo é mantido', () => {
        const layout = new LayoutInferencer().infer(
            `
@group(0) @binding(0) var<storage, read_write> a: array<f32>;
@group(1) @binding(0) var<storage, read_write> b: array<f32>;
@compute @workgroup_size(64) fn only_b() { b[0] = 1.0; }
@compute @workgroup_size(64) fn only_a() { a[0] = 1.0; }
`,
            ['only_b'],
        );
        expect(layout.groups).toHaveLength(2);
        expect(layout.groups[0]).toEqual({ group: 0, entries: [] });
        expect(layout.groups[1]!.entries.map((e) => e.name)).toEqual(['b']);
    });

    it('entrada inexistente → erro nomeando a entrada', () => {
        expect(() =>
            new LayoutInferencer().infer('@compute @workgroup_size(1) fn a() {}', ['b']),
        ).toThrow(LayoutInferenceError);
        expect(() =>
            new LayoutInferencer().infer('@compute @workgroup_size(1) fn a() {}', ['b']),
        ).toThrow(/'b'/);
    });
});

describe('LayoutInferencer.infer — tipos de binding', () => {
    const cases: [string, string, unknown][] = [
        ['var<uniform> p: Params', 'Params', 'uniform'],
        ['var<storage> p: array<Particle>', 'Particle', 'read-only-storage'],
        ['var<storage, read> p: array<Particle>', 'Particle', 'read-only-storage'],
        ['var<storage, read_write> p: array<Particle>', 'Particle', 'storage'],
        ['var<storage, read_write> p: array<atomic<u32>>', 'atomic<u32>', 'storage'],
        ['var<storage, read_write> p: array<vec4f, 64>', 'vec4f', 'storage'],
        [
            'var p: texture_depth_2d',
            'texture_depth_2d',
            { texture: { sampleType: 'depth', viewDimension: '2d', multisampled: false } },
        ],
        [
            'var p: texture_2d<f32>',
            'texture_2d<f32>',
            { texture: { sampleType: 'float', viewDimension: '2d', multisampled: false } },
        ],
        [
            'var p: texture_2d_array<u32>',
            'texture_2d_array<u32>',
            { texture: { sampleType: 'uint', viewDimension: '2d-array', multisampled: false } },
        ],
        [
            'var p: texture_3d<i32>',
            'texture_3d<i32>',
            { texture: { sampleType: 'sint', viewDimension: '3d', multisampled: false } },
        ],
        [
            'var p: texture_multisampled_2d<f32>',
            'texture_multisampled_2d<f32>',
            { texture: { sampleType: 'float', viewDimension: '2d', multisampled: true } },
        ],
        [
            'var p: texture_storage_2d<rgba16float, write>',
            'texture_storage_2d<rgba16float, write>',
            {
                storageTexture: {
                    format: 'rgba16float',
                    access: 'write-only',
                    viewDimension: '2d',
                },
            },
        ],
        [
            'var p: texture_storage_3d<r32float, read_write>',
            'texture_storage_3d<r32float, read_write>',
            { storageTexture: { format: 'r32float', access: 'read-write', viewDimension: '3d' } },
        ],
        ['var p: sampler', 'sampler', { sampler: 'filtering' }],
        ['var p: sampler_comparison', 'sampler_comparison', { sampler: 'comparison' }],
    ];

    it.each(cases)('%s → typeName %s', (decl, typeName, resource) => {
        const e = entry(`@group(0) @binding(0) ${decl};\n@fragment fn fs() { _ = p; }`, ['fs']);
        expect(e).toMatchObject({ name: 'p', typeName, resource, visibility: S.FRAGMENT });
    });
});
