/**
 * Spec 031, US4 (T081, research R8): registros de parâmetros tipados — cada forma de função de ponto (ponto + nomes e
 * tipos dos parâmetros) gera o seu struct `<alias>_<hash>` com os campos tipados, sem `bitcast` e sem teto de
 * escalares, num pool por forma (`<ponto>:<hash>`); os campos prontos de `field` têm o registro `FieldBuiltinRecord`;
 * as listas posicionais dos estágios são structs gerados (`CameraFnEntry`, `TransformFnPair`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldType } from '../descriptors/FieldType';
import { composeWgsl } from '../shaders/composeWgsl';
import { bindPoints } from '../shaders/bindPoints';
import { wgslModule } from '../shaders/WgslModule';
import { NodeGraph, graphArgument } from '../graph/NodeGraph';
import type { EngineCore } from '../contracts/gpu';
import type { PoolDirectory } from '../contracts/PoolDirectory';
import { ScenePoints } from '../systems/flowBinding/ScenePoints';
import type { World } from '../world/World';
import { xpbdPredict } from '../../elements/physics/shaders/xpbd';
import { defineNode } from '../graph/NodeDefinition';
import type { ExtensionFunction } from '../contracts/ExtensionFunction';
import { CameraFunction } from '../../elements/extension/CameraFunction';
import { EmitFunction } from '../../elements/extension/EmitFunction';
import { FieldFunction } from '../../elements/extension/FieldFunction';
import { MaterialFunction } from '../../elements/extension/MaterialFunction';
import { SpaceFunction } from '../../elements/extension/SpaceFunction';
import { SurfaceFunction } from '../../elements/extension/SurfaceFunction';
import { TransformFunction } from '../../elements/extension/TransformFunction';
import {
    FIELD_BUOYANCY,
    FIELD_DRAG,
    FIELD_GRAVITY_POINT,
    FIELD_VORTEX,
    FIELD_WIND,
} from '../../elements/gpu/shaders/constants';
import { FieldKind } from '../../elements/physics/forcefields/ForceField';
import { VortexField } from '../../elements/physics/forcefields/VortexField';
import { WindField } from '../../elements/physics/forcefields/WindField';
import {
    fieldBuiltin,
    FieldBuiltinRecordSchema,
    fieldPoint,
    fieldResources,
} from '../../elements/physics/shaders/fields';
import { CameraFnEntrySchema } from '../../elements/scene/flows/CameraSchemas';
import {
    cameraComposeFn,
    cameraResources,
    transformComposeFn,
    transformPoint,
    transformResources,
} from '../../elements/scene/flows/shaders';
import { TransformFnPairSchema } from '../../elements/scene/flows/TransformParams';
import {
    discOf,
    registerStages,
    renderScene,
} from '../../presentation/flows/__tests__/helpers/renderHarness';
import { BoxGeometry } from '../../elements/geometry/BoxGeometry';
import { Transform } from '../../elements/scene/Transform';

afterEach(() => {
    vi.restoreAllMocks();
});

/** Parâmetros de todos os tipos aceitos. */
const PARAMS = {
    k: 'f32',
    n: 'u32',
    s: 'i32',
    uv: 'vec2f',
    offset: 'vec3f',
    color: 'vec4f',
    cell: 'vec3u',
    dir: 'vec2i',
} as const;

/** Uma função de cada ponto da 009, com os mesmos parâmetros. */
const FUNCTIONS: readonly (readonly [string, string, () => ExtensionFunction])[] = [
    [
        'transform',
        'TransformFnParams',
        () =>
            new TransformFunction({
                params: PARAMS,
                code: 'fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f { var m = transform_local(t).world; m[3] = vec4f(data.offset * data.k, 1.0); return m; }',
            }),
    ],
    [
        'camera',
        'CameraFnParams',
        () =>
            new CameraFunction({
                params: PARAMS,
                code: 'fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut { var o: CameraOut; o.view = camera_view(world); o.projection = camera_perspective(c.fov * data.k, aspect, c.near, c.far); return o; }',
            }),
    ],
    [
        'surface',
        'SurfaceFnParams',
        () =>
            new SurfaceFunction({
                params: PARAMS,
                code: 'fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f { return vec3f(u, data.k, v) + data.offset; }',
            }),
    ],
    [
        'space',
        'SpaceFnParams',
        () =>
            new SpaceFunction({
                params: PARAMS,
                code: 'fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f { return x * data.k; }',
            }),
    ],
    [
        'field',
        'FieldFnParams',
        () =>
            new FieldFunction({
                params: PARAMS,
                code: 'fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f { return data.offset * data.k; }',
            }),
    ],
    [
        'emit',
        'EmitFnParams',
        () =>
            new EmitFunction({
                params: PARAMS,
                code: 'fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle { return EmittedParticle(data.offset, vec3f(0.0), data.k, data.color); }',
            }),
    ],
    [
        'material',
        'MaterialFnParams',
        () =>
            new MaterialFunction({
                params: PARAMS,
                code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams { return SurfaceParams(data.color, m.roughness * data.k, m.metallic, vec3f(0.0)); }',
            }),
    ],
];

describe('registro tipado das funções de ponto (spec 031, R8)', () => {
    it.each(FUNCTIONS)(
        '%s: struct <alias>_<hash> com os campos tipados, pool <ponto>:<hash>, carregador sem bitcast',
        (point, alias, make) => {
            const fn = make();
            const record = fn.record;
            expect(record.name).toMatch(new RegExp(`^${point}:[0-9a-f]{8}$`));
            const hash = record.name.slice(point.length + 1);
            expect(record.wgslName).toBe(`${alias}_${hash}`);
            expect(fn.paramsStruct).toBe(record.wgslName);
            expect([...record.fields.keys()]).toEqual([...Object.keys(PARAMS), 'revision']);
            for (const [name, type] of Object.entries(PARAMS))
                expect(record.typeOf(name)).toBe(FieldType[type]);
            expect(record.typeOf('revision')).toBe(FieldType.u32);
            expect(fn.getDescriptors()).toEqual([
                { id: 'params', role: 'storage-ro', schema: record, storage: 'pool' },
            ]);
            // O módulo traz o pool da forma (recurso declarado) e o carregador por slot; nada de bits.
            const source = fn.module.source;
            expect(source).not.toContain('bitcast');
            expect(source).not.toMatch(/\bv[0-7]\b/);
            expect(source).toContain(`alias ${alias}`);
            expect(source).toContain(`(slot: u32) -> ${record.wgslName} {`);
            expect(source).toContain(`return ${point}_records_${hash}[slot];`);
            expect(record.toWGSL()).toContain(`struct ${record.wgslName} {`);
            // Montado no kernel do ponto (nos de cena, pela composição): o struct gerado e o pool da forma.
            const scene = fn.point.scene;
            const impl = scene === undefined ? fn.module : scene.combine([{ impl: fn, slot: 0 }]);
            const host = fn.point.hosts()[0]!;
            const src = composeWgsl(bindPoints(host, new Map([[fn.point, impl]]))).spec.source;
            expect(src).toContain(`struct ${record.wgslName} {`);
            expect(src).toContain('offset: vec3f,');
            expect(src).toContain(`${point}_records_${hash}: array<${record.wgslName}>`);
        },
    );

    it('acima de 32 escalares: 16 vec4f (64 escalares) num registro só, valores de volta por nome', () => {
        const params = Object.fromEntries(
            Array.from({ length: 16 }, (_, i) => [`p${i}`, 'vec4f' as const]),
        );
        const values = Object.fromEntries(
            Array.from({ length: 16 }, (_, i) => [`p${i}`, [i, i + 0.5, -i, 2 * i]]),
        );
        const fn = new SurfaceFunction({
            params,
            values,
            code: 'fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f { return data.p15.xyz + vec3f(u, 0.0, v); }',
        });
        expect(fn.record.stride).toBe(16 * 16 + 16);
        expect(fn.values.p15).toEqual([15, 15.5, -15, 30]);
        expect(fn.data.p7).toEqual([7, 7.5, -7, 14]);
        fn.values.p9 = [1, 2, 3, 4];
        expect(fn.data.p9).toEqual([1, 2, 3, 4]);
        // O empacotamento é o do struct: o campo p15 no seu offset, sem bits à mão.
        const packed = new Float32Array(fn.record.pack(fn.data).buffer);
        const at = fn.record.offsetOf('p15') / 4;
        expect([...packed.slice(at, at + 4)]).toEqual([15, 15.5, -15, 30]);
        expect(fn.module.source).not.toContain('bitcast');
    });

    it('mesma forma com valores diferentes → mesmo schema, pool e módulo; outra forma ou outro ponto → outro', () => {
        const code =
            'fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f { return x * data.k; }';
        const a = new SpaceFunction({ code, params: { k: 'f32' }, values: { k: 1 } });
        const b = new SpaceFunction({ code, params: { k: 'f32' }, values: { k: 7 } });
        expect(b.record).toBe(a.record);
        expect(b.module).toBe(a.module);
        expect([a.values.k, b.values.k]).toEqual([1, 7]);
        // Outro código, mesma forma: mesmo registro (pool), outro módulo.
        const c = new SpaceFunction({
            code: code.replace('x * data.k', 'x + data.k'),
            params: { k: 'f32' },
        });
        expect(c.record).toBe(a.record);
        expect(c.module).not.toBe(a.module);
        // Outra forma (tipo, nome ou ordem) → outro registro.
        const d = new SpaceFunction({ code, params: { k: 'u32' } as never });
        const e = new SpaceFunction({ code, params: { k: 'f32', j: 'f32' } });
        expect(new Set([a.record, d.record, e.record]).size).toBe(3);
        // Mesmos parâmetros noutro ponto: outro pool (a chave tem o ponto).
        const f = new FieldFunction({
            code: 'fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f { return x * data.k; }',
            params: { k: 'f32' },
        });
        expect(f.record.name).toMatch(/^field:/);
        expect(f.record.name.split(':')[1]).not.toBe(a.record.name.split(':')[1]);
        expect(fieldPoint.isRecord(f.record)).toBe(true);
        expect(fieldPoint.isRecord(a.record)).toBe(false);
    });

    it('na cena: um pool por forma, um registro por função, valores enviados por campo', async () => {
        const s = await renderScene();
        const code =
            'fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f { return x * data.k + data.offset; }';
        const params = { k: 'f32', offset: 'vec3f' } as const;
        const a = new SpaceFunction({ code, params, values: { k: 2, offset: [1, 2, 3] } });
        const b = new SpaceFunction({ code, params, values: { k: 5, offset: [4, 5, 6] } });
        const ia = s.scene.world.insert(a);
        const ib = s.scene.world.insert(b);
        const rs = s.scene.resourceSystem;
        const key = a.record.name;
        expect(rs.poolInfo(key)?.count).toBe(2);
        expect(rs.poolSlotOf(key, ia)).not.toBe(rs.poolSlotOf(key, ib));
        s.step();
        const writes = vi
            .mocked(s.core.write)
            .mock.calls.filter(([spec]) => discOf(spec) === `pool:${key}`);
        expect(writes.length).toBeGreaterThan(0);
        const [, data, offset = 0] = writes.at(-1)!;
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const slotB = rs.poolSlotOf(key, ib)!;
        const at = slotB * a.record.stride - offset;
        const unpacked = a.record.unpack(bytes, at);
        expect(unpacked.k).toBe(5);
        expect(unpacked.offset).toEqual([4, 5, 6]);
    });

    it('setGraph com outra forma: a C2 passa a função para o pool da forma nova e recompõe a entidade', async () => {
        const nodes = wgslModule({
            name: 'typed_records_nodes',
            source: [
                'fn tr_plane(u: f32, v: f32, h: f32) -> vec3f { return vec3f(u, h, v); }',
                'fn tr_lift(u: f32, v: f32, off: vec3f) -> vec3f { return vec3f(u, 0.0, v) + off; }',
            ].join('\n'),
        });
        const plane = defineNode({
            name: 'typed.plane',
            inputs: { u: 'f32', v: 'f32' },
            outputs: { value: 'vec3f' },
            params: { h: { type: 'f32', default: 1 } },
            code: nodes,
            fn: 'tr_plane',
        });
        const lift = defineNode({
            name: 'typed.lift',
            inputs: { u: 'f32', v: 'f32' },
            outputs: { value: 'vec3f' },
            params: { off: { type: 'vec3f', default: [0, 1, 0] } },
            code: nodes,
            fn: 'tr_lift',
        });
        const graph = (node: typeof plane) =>
            new NodeGraph({
                nodes: { u: graphArgument('u'), v: graphArgument('v'), p: node },
                links: [
                    ['u.value', 'p.u'],
                    ['v.value', 'p.v'],
                ],
                output: 'p.value',
            });
        const s = await renderScene();
        const fn = new SurfaceFunction({ graph: graph(plane), values: { p_h: 3 } });
        const id = s.scene.world.insert(fn);
        const rs = s.scene.resourceSystem;
        const before = fn.record;
        expect(rs.poolSlotOf(before.name, id)).toBe(0);
        const recomposed: number[] = [];
        s.scene.events.on('entitiesRecomposed', (e) => recomposed.push(...e.entityIds));
        fn.setGraph(graph(lift));
        expect(fn.record).not.toBe(before);
        expect(fn.record.typeOf('p_off')).toBe(FieldType.vec3f);
        expect(fn.getDescriptors()[0]!.schema).toBe(fn.record);
        expect(rs.poolSlotOf(before.name, id)).toBeUndefined();
        expect(rs.poolSlotOf(fn.record.name, id)).toBe(0);
        expect(recomposed).toEqual([id]);
        expect(fn.revision).toBe(1);
        expect(fn.values.p_off).toEqual([0, 1, 0]);
        fn.values.p_off = [2, 3, 4];
        expect(fn.data.p_off).toEqual([2, 3, 4]);
        // Mesma forma de novo: só a revisão sobe, sem trocar de pool.
        const record = fn.record;
        fn.setGraph(graph(lift));
        expect(fn.record).toBe(record);
        expect(fn.revision).toBe(2);
        expect(fn.values.p_off).toEqual([2, 3, 4]);
        expect(recomposed).toEqual([id]);
    });
});

describe('um pool por forma nos shaders, conferido contra o limite de storage (spec 031, R8)', () => {
    const points = () => {
        const core = {
            create: vi.fn(<S>(spec: S) => spec),
            destroy: vi.fn(),
        } as unknown as EngineCore;
        const world = { entityIdOfResource: () => 1 } as unknown as World;
        const pools = { poolSlotOf: () => 0 } as unknown as PoolDirectory;
        return new ScenePoints(core, world, pools);
    };
    const field = (params: Readonly<Record<string, 'f32' | 'vec3f'>>) =>
        new FieldFunction({
            params,
            code: 'fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f { return vec3f(0.0); }',
        });
    const storageOf = (shader: Parameters<typeof composeWgsl>[0]) =>
        composeWgsl(shader).bindings.filter((b) => 'storage' in b.resource.resource.binding).length;

    it('ponto de cena: duas formas, dois pools a mais no kernel; a mesma forma, um só', () => {
        const base = storageOf(xpbdPredict);
        const same = points();
        same.resourcesChanged([field({ k: 'f32' }), field({ k: 'f32' })], []);
        expect(storageOf(same.bind(xpbdPredict, vi.fn()).shader)).toBe(base + 1);
        const two = points();
        two.resourcesChanged([field({ k: 'f32' }), field({ c: 'vec3f' })], []);
        expect(storageOf(two.bind(xpbdPredict, vi.fn()).shader)).toBe(base + 2);
    });

    it('acima do limite de storage do device: a função é rejeitada (extensionRejected) e o TRS continua', async () => {
        const s = await renderScene();
        registerStages(s.scene, {});
        const fn = new TransformFunction({
            params: { k: 'f32' },
            code: 'fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f { return transform_local(t).world * data.k; }',
        });
        // O kernel com a pronta cabe; com a função, o pool da forma dela é uma ligação de storage a mais.
        const limit = storageOf(transformComposeFn);
        expect(
            storageOf(bindPoints(transformComposeFn, new Map([[transformPoint, fn.module]]))),
        ).toBe(limit + 1);
        const caps = s.core.capabilities();
        vi.mocked(s.core.capabilities).mockReturnValue({
            ...caps,
            limits: { ...caps.limits, maxStorageBuffersPerShaderStage: limit },
        });
        const rejected: string[] = [];
        s.scene.events.on('extensionRejected', (e) => rejected.push(e.message));
        s.scene.world.insert(new BoxGeometry().add(new Transform()).add(fn));
        const computes: string[] = [];
        for (let i = 0; i < 4; i++) {
            s.step();
            computes.push(...s.computes());
            for (let k = 0; k < 20; k++) await Promise.resolve();
        }
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatch(/maxStorageBuffersPerShaderStage excedido no estágio compute/);
        expect(computes).toContain('TransformFlow');
        expect(computes).not.toContain('TransformFlow.function');
    });
});

describe('FieldBuiltinRecord: registro próprio dos campos prontos (spec 031, R8)', () => {
    it('campos a, b, s (vec4f) e o código de tipo; os códigos são as constantes compartilhadas', () => {
        expect(FieldBuiltinRecordSchema.name).toBe('FieldBuiltinRecord');
        expect([...FieldBuiltinRecordSchema.fields]).toEqual([
            ['a', FieldType.vec4f],
            ['b', FieldType.vec4f],
            ['s', FieldType.vec4f],
            ['kind', FieldType.u32],
        ]);
        expect(FieldKind).toEqual({
            none: 0,
            gravityPoint: FIELD_GRAVITY_POINT.value,
            wind: FIELD_WIND.value,
            vortex: FIELD_VORTEX.value,
            drag: FIELD_DRAG.value,
            buoyancy: FIELD_BUOYANCY.value,
        });
        const vortex = new VortexField({ axis: [0, 2, 0, 0], center: [1, 0, 0, 1], magnitude: 4 });
        expect(vortex.getDescriptors()[0]!.schema).toBe(FieldBuiltinRecordSchema);
        const packed = FieldBuiltinRecordSchema.pack(
            vortex.data as unknown as Record<string, unknown>,
        );
        const f = new Float32Array(packed.buffer, packed.byteOffset, 12);
        expect([...f.slice(0, 4)]).toEqual([0, 1, 0, 0]);
        expect([...f.slice(4, 8)]).toEqual([1, 0, 0, 1]);
        const kind = new Uint32Array(packed.buffer, packed.byteOffset, 13)[12];
        expect(kind).toBe(FieldKind.vortex);
    });

    it('campo que sai da cena: a C2 zera o slot (kind 0, fora do laço) — sem bitset de vivos', async () => {
        const s = await renderScene();
        const wind = new WindField({ direction: [1, 0, 0, 0], magnitude: 2 });
        const id = s.scene.world.insert(wind);
        const slot = s.scene.resourceSystem.poolSlotOf(FieldBuiltinRecordSchema.name, id)!;
        s.step();
        vi.mocked(s.core.write).mockClear();
        s.scene.world.remove(wind);
        const zeroed = vi
            .mocked(s.core.write)
            .mock.calls.filter(
                ([spec]) => discOf(spec) === `pool:${FieldBuiltinRecordSchema.name}`,
            );
        expect(zeroed).toHaveLength(1);
        const [, data, offset] = zeroed[0]!;
        expect(offset).toBe(slot * FieldBuiltinRecordSchema.stride);
        expect((data as Uint8Array).byteLength).toBe(FieldBuiltinRecordSchema.stride);
        expect([...(data as Uint8Array)].every((b) => b === 0)).toBe(true);
    });

    it('os campos prontos leem o pool pelos campos tipados; as funções têm os pools das suas formas', () => {
        expect(fieldResources.records.resource.type).toEqual({
            schema: FieldBuiltinRecordSchema,
            array: true,
        });
        expect(fieldPoint.scene?.globals.field_builtin_records?.pool).toBe(
            FieldBuiltinRecordSchema,
        );
        const src = composeWgsl(fieldBuiltin).spec.source;
        expect(src).toContain('field_builtin_records: array<FieldBuiltinRecord>');
        expect(fieldBuiltin.source).toContain('let a = r.a;');
        expect(fieldBuiltin.source).not.toContain('bitcast');
    });
});

describe('listas dos estágios como structs gerados (spec 031, R8)', () => {
    it('TransformFnPair { transform, record } no lugar de vec2u', () => {
        expect([...TransformFnPairSchema.fields]).toEqual([
            ['transform', FieldType.u32],
            ['record', FieldType.u32],
        ]);
        expect(transformResources.fnPairs.resource.type).toEqual({
            schema: TransformFnPairSchema,
            array: true,
        });
        const fn = new TransformFunction({
            code: 'fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f { return transform_local(t).world; }',
        });
        const src = composeWgsl(
            bindPoints(transformComposeFn, new Map([[transformPoint, fn.module]])),
        ).spec.source;
        expect(src).toContain('array<TransformFnPair>');
        expect(src).toContain('transform_fn_params(pair.record)');
        expect(src).not.toContain('vec2u');
    });

    it('CameraFnEntry { camera, world, record } no lugar de vec4u', () => {
        expect([...CameraFnEntrySchema.fields]).toEqual([
            ['camera', FieldType.u32],
            ['world', FieldType.u32],
            ['record', FieldType.u32],
        ]);
        expect(cameraResources.fnList.resource.type).toEqual({
            schema: CameraFnEntrySchema,
            array: true,
        });
        const src = composeWgsl(cameraComposeFn).spec.source;
        expect(src).toContain('array<CameraFnEntry>');
        expect(src).toContain('camera_fn_params(e.record)');
        expect(src).not.toMatch(/camera_fn_list: array<vec4u>/);
    });
});
