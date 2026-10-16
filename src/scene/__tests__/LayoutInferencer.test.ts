import { describe, expect, it } from 'vitest';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { composeWgsl } from '../shaders/composeWgsl';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import {
    wgslResource,
    type BindingFrequency,
    type WgslBindingKind,
    type WgslResourceType,
} from '../shaders/WgslResource';
import { LayoutInferencer, LayoutInferenceError } from '../systems/LayoutInferencer';

const S = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 } as const;

const Camera = new StructSchema('LiCamera', { viewProjection: FieldType.mat4x4f });
const Material = new StructSchema('LiMaterial', { albedo: FieldType.vec4f });
const Light = new StructSchema('LiLight', { dir: FieldType.vec4f });
const Body = new StructSchema('LiBody', { pos: FieldType.vec4f });
const Params = new StructSchema('LiParams', { k: FieldType.vec4f });
const Particle = new StructSchema('LiParticle', { p: FieldType.vec4f });

let seq = 0;
function res(
    name: string,
    binding: WgslBindingKind,
    type?: WgslResourceType,
    frequency: BindingFrequency = 'draw',
) {
    return wgslResource({
        name,
        binding,
        ...(type !== undefined ? { type } : {}),
        frequency,
        provider: 'private',
    });
}

function shader(source: string, requires: readonly WgslModule[]) {
    return composeWgsl(wgslModule({ name: `li_${seq++}`, requires, source }));
}

function entry(
    composed: ReturnType<typeof composeWgsl>,
    entryPoints: readonly string[],
    name: string,
) {
    const layout = new LayoutInferencer().infer(composed, entryPoints);
    return layout.groups.flatMap((g) => g.entries).find((e) => e.name === name);
}

describe('LayoutInferencer.infer — grupo, ligação, tipo e estágios dos recursos declarados', () => {
    it('grupo e ligação atribuídos pela montagem; address space, acesso e tipo vêm da declaração', () => {
        const camera = res('camera', { uniform: true }, { schema: Camera }, 'frame');
        const bodies = res(
            'bodies',
            { storage: 'read_write' },
            { schema: Body, array: true },
            'stage',
        );
        const c = shader(
            `@vertex fn vs() -> @builtin(position) vec4f { return camera.viewProjection[0]; }
@compute @workgroup_size(64) fn cs() { bodies[0].pos = vec4f(0.0); }`,
            [camera, bodies],
        );
        expect(c.bindings.map((b) => [b.name, b.group, b.binding])).toEqual([
            ['camera', 0, 0],
            ['bodies', 1, 0],
        ]);
        const layout = new LayoutInferencer().infer(c, ['vs', 'cs']);
        expect(layout.groups.map((g) => g.frequency)).toEqual(['frame', 'stage']);
        const cam = layout.groups[0]!.entries[0]!;
        const bod = layout.groups[1]!.entries[0]!;
        expect(cam).toMatchObject({
            binding: 0,
            name: 'camera',
            typeName: 'LiCamera',
            resource: 'uniform',
            visibility: S.VERTEX,
            declared: camera,
        });
        expect(bod).toMatchObject({
            binding: 0,
            name: 'bodies',
            typeName: 'LiBody',
            resource: 'storage',
            visibility: S.COMPUTE,
            declared: bodies,
        });
        expect(layout.stages.get('vs')).toBe('vertex');
        expect(layout.stages.get('cs')).toBe('compute');
    });

    it('estágios por alcance de chamadas: recurso citado só numa função auxiliar chamada pela entrada', () => {
        const light = res('light', { uniform: true }, { schema: Light });
        const c = shader(
            `fn shade(n: vec3f) -> f32 { return dot(n, light.dir.xyz); }
fn indirect(n: vec3f) -> f32 { return shade(n); }
@fragment fn fs() -> @location(0) vec4f { return vec4f(indirect(vec3f(0.0, 1.0, 0.0))); }`,
            [light],
        );
        expect(entry(c, ['fs'], 'light')?.visibility).toBe(S.FRAGMENT);
    });

    it('comentários não contam como uso', () => {
        const unused = res('unused', { uniform: true }, { schema: Params });
        const c = shader(
            `@compute @workgroup_size(1) fn main() { // unused
}`,
            [unused],
        );
        expect(entry(c, ['main'], 'unused')).toBeUndefined();
    });
});

describe('LayoutInferencer.infer — visibilidade (FR-010)', () => {
    const camera = res('camera', { uniform: true }, { schema: Camera });
    const material = res('material', { uniform: true }, { schema: Material });
    const shared = shader(
        `fn tint() -> vec4f { return material.albedo; }
@vertex fn vs_main() -> @builtin(position) vec4f { return camera.viewProjection[0]; }
@fragment fn fs_main() -> @location(0) vec4f { return tint() * camera.viewProjection[1]; }`,
        [camera, material],
    );

    it('binding usado só no fragment (via função auxiliar) → só FRAGMENT', () => {
        expect(entry(shared, ['vs_main', 'fs_main'], 'material')?.visibility).toBe(S.FRAGMENT);
    });

    it('binding usado por vertex e fragment → ambos', () => {
        expect(entry(shared, ['vs_main', 'fs_main'], 'camera')?.visibility).toBe(
            S.VERTEX | S.FRAGMENT,
        );
    });

    it('binding não alcançado pelas entradas listadas fica fora do layout; o grupo é mantido', () => {
        const a = res('a', { storage: 'read_write' }, { wgsl: 'f32', array: true }, 'stage');
        const b = res('b', { storage: 'read_write' }, { wgsl: 'f32', array: true }, 'draw');
        const c = shader(
            `@compute @workgroup_size(64) fn only_b() { b[0] = 1.0; }
@compute @workgroup_size(64) fn only_a() { a[0] = 1.0; }`,
            [a, b],
        );
        const layout = new LayoutInferencer().infer(c, ['only_b']);
        expect(layout.groups).toHaveLength(2);
        expect(layout.groups[0]).toEqual({ group: 0, entries: [], frequency: 'stage' });
        expect(layout.stages.get('only_b')).toBe('compute');
        expect(layout.groups[1]!.entries.map((e) => e.name)).toEqual(['b']);
    });

    it('entrada inexistente → erro nomeando a entrada', () => {
        const c = shader('@compute @workgroup_size(1) fn a() {}', []);
        expect(() => new LayoutInferencer().infer(c, ['b'])).toThrow(LayoutInferenceError);
        expect(() => new LayoutInferencer().infer(c, ['b'])).toThrow(/'b'/);
    });
});

describe('LayoutInferencer.infer — tipos de binding', () => {
    const cases: [string, WgslBindingKind, WgslResourceType | undefined, string, unknown][] = [
        ['uniform struct', { uniform: true }, { schema: Params }, 'LiParams', 'uniform'],
        [
            'storage read array<struct>',
            { storage: 'read' },
            { schema: Particle, array: true },
            'LiParticle',
            'read-only-storage',
        ],
        [
            'storage read_write array<struct>',
            { storage: 'read_write' },
            { schema: Particle, array: true },
            'LiParticle',
            'storage',
        ],
        [
            'storage read_write array<atomic<u32>>',
            { storage: 'read_write' },
            { wgsl: 'atomic<u32>', array: true },
            'atomic<u32>',
            'storage',
        ],
        [
            'storage read_write array<vec4f>',
            { storage: 'read_write' },
            { wgsl: 'vec4f', array: true },
            'vec4f',
            'storage',
        ],
        [
            'texture_depth_2d',
            { texture: { sample: 'depth' } },
            undefined,
            'texture_depth_2d',
            { texture: { sampleType: 'depth', viewDimension: '2d', multisampled: false } },
        ],
        [
            'texture_2d<f32>',
            { texture: { sample: 'f32' } },
            undefined,
            'texture_2d<f32>',
            { texture: { sampleType: 'float', viewDimension: '2d', multisampled: false } },
        ],
        [
            'texture_2d_array<u32>',
            { texture: { sample: 'u32', dimension: '2d_array' } },
            undefined,
            'texture_2d_array<u32>',
            { texture: { sampleType: 'uint', viewDimension: '2d-array', multisampled: false } },
        ],
        [
            'texture_3d<i32>',
            { texture: { sample: 'i32', dimension: '3d' } },
            undefined,
            'texture_3d<i32>',
            { texture: { sampleType: 'sint', viewDimension: '3d', multisampled: false } },
        ],
        [
            'texture_multisampled_2d<f32>',
            { texture: { sample: 'f32', multisampled: true } },
            undefined,
            'texture_multisampled_2d<f32>',
            { texture: { sampleType: 'float', viewDimension: '2d', multisampled: true } },
        ],
        [
            'texture_storage_2d<rgba16float, write>',
            { storageTexture: { format: 'rgba16float', access: 'write' } },
            undefined,
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
            'texture_storage_3d<r32float, read_write>',
            { storageTexture: { format: 'r32float', access: 'read_write', dimension: '3d' } },
            undefined,
            'texture_storage_3d<r32float, read_write>',
            { storageTexture: { format: 'r32float', access: 'read-write', viewDimension: '3d' } },
        ],
        ['sampler', { sampler: 'filtering' }, undefined, 'sampler', { sampler: 'filtering' }],
        [
            'sampler_comparison',
            { sampler: 'comparison' },
            undefined,
            'sampler_comparison',
            { sampler: 'comparison' },
        ],
    ];

    it.each(cases)('%s → typeName %s', (_label, binding, type, typeName, resource) => {
        const p = res('p', binding, type);
        const c = shader('@fragment fn fs() { _ = p; }', [p]);
        expect(entry(c, ['fs'], 'p')).toMatchObject({
            binding: 0,
            name: 'p',
            typeName,
            resource,
            visibility: S.FRAGMENT,
        });
    });
});
