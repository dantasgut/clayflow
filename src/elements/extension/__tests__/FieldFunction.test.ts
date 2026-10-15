/**
 * Spec 009 (US2): campos — o registro comum dos campos prontos (derivado do `data`) e os pontos de cena (funções
 * `field` compostas em todo shader que contém o ponto, com os globais ligados pela C2).
 */
import { describe, expect, it, vi } from 'vitest';
import type { EngineCore } from '../../../scene/contracts/gpu';
import type { PoolDirectory } from '../../../scene/contracts/PoolDirectory';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { ScenePoints } from '../../../scene/systems/flowBinding/ScenePoints';
import type { World } from '../../../scene/world/World';
import { BuoyancyField } from '../../physics/forcefields/BuoyancyField';
import { DragField } from '../../physics/forcefields/DragField';
import { FieldKind } from '../../physics/forcefields/ForceField';
import { GravityField } from '../../physics/forcefields/GravityField';
import { VortexField } from '../../physics/forcefields/VortexField';
import { WindField } from '../../physics/forcefields/WindField';
import { fieldPoint, FieldFnRecordSchema } from '../../physics/shaders/fields';
import { xpbdPredict } from '../../physics/shaders/xpbd';
import { FieldFunction } from '../FieldFunction';

const f32 = (bitsValue: number): number => {
    const v = new DataView(new ArrayBuffer(4));
    v.setUint32(0, bitsValue, true);
    return v.getFloat32(0, true);
};
const vec = (bitsList: readonly number[]): number[] => bitsList.map(f32);
const record = (data: object) =>
    data as { kind: number; v0: number[]; v1: number[]; v2: number[]; revision: number };

const RING = `
fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    let d = vec3f(x.x, 0.0, x.z);
    let r = max(length(d), 1e-4);
    return -d / r * (r - data.radius) * data.k;
}`;

describe('campos prontos no registro comum (spec 009)', () => {
    it('vento: direção normalizada × intensidade e turbulência; mudar o data muda o registro', () => {
        const wind = new WindField({ direction: [2, 0, 0, 0], magnitude: 3, turbulence: 0.5 });
        const r = record(wind.data);
        expect(r.kind).toBe(FieldKind.wind);
        expect(vec(r.v0)).toEqual([3, 0, 0, 0]);
        expect(vec(r.v2)[0]).toBe(0.5);
        wind.data.magnitude = 1;
        expect(vec(record(wind.data).v0)).toEqual([1, 0, 0, 0]);
        expect(wind.getDescriptors()).toEqual([
            { id: 'record', role: 'storage-ro', storage: 'pool', schema: FieldFnRecordSchema },
        ]);
    });

    it('vórtice, arrasto e empuxo: tipo e valores', () => {
        const vortex = record(
            new VortexField({
                axis: [0, 2, 0, 0],
                center: [1, 0, 0, 1],
                magnitude: 4,
                falloff: 0.5,
            }).data,
        );
        expect(vortex.kind).toBe(FieldKind.vortex);
        expect(vec(vortex.v0)).toEqual([0, 1, 0, 0]);
        expect(vec(vortex.v1)).toEqual([1, 0, 0, 1]);
        expect(vec(vortex.v2).slice(0, 2)).toEqual([4, 0.5]);
        const drag = record(new DragField({ linearCoeff: 0.25, quadraticCoeff: 0.5 }).data);
        expect([drag.kind, ...vec(drag.v2).slice(0, 2)]).toEqual([FieldKind.drag, 0.25, 0.5]);
        const buoy = record(
            new BuoyancyField({ fluidDensity: 1000, fluidLevel: 0.5, gravity: 9.5 }).data,
        );
        expect([buoy.kind, ...vec(buoy.v2).slice(0, 3)]).toEqual([
            FieldKind.buoyancy,
            1000,
            0.5,
            9.5,
        ]);
    });

    it('gravidade: uniforme fica fora do laço (tipo 0); fonte pontual zera a uniforme e entra no laço', () => {
        const uniform = new GravityField();
        expect(record(uniform.data).kind).toBe(FieldKind.none);
        expect(uniform.uniformAcceleration()).toEqual([0, -9.81, 0, 0]);
        const point = new GravityField({
            sourceMode: 1,
            sourcePosition: [0, 5, 0, 1],
            sourceMass: 1e12,
            gravitationalConstant: 6.674e-11,
        });
        expect(record(point.data).kind).toBe(FieldKind.gravityPoint);
        expect(point.uniformAcceleration()).toEqual([0, 0, 0, 0]);
        expect(vec(record(point.data).v2)[0]).toBeCloseTo(66.74, 2);
    });
});

describe('pontos de cena (spec 009)', () => {
    const setup = () => {
        const core = {
            create: vi.fn(<S>(spec: S) => spec),
            destroy: vi.fn(),
        } as unknown as EngineCore;
        const world = { entityIdOfResource: () => 7 } as unknown as World;
        let slot = 3;
        const pools = {
            poolSlotOf: () => slot,
            poolBufferSpec: () => undefined,
            poolLiveBuffer: () => undefined,
        } as unknown as PoolDirectory;
        return {
            points: new ScenePoints(core, world, pools),
            setSlot: (s: number) => {
                slot = s;
            },
        };
    };
    const ring = () =>
        new FieldFunction({
            code: RING,
            params: { radius: 'f32', k: 'f32' },
            values: { radius: 1, k: 2 },
        });

    it('sem função, o shader fica como está; com função, a composição entra em todo kernel do ponto', () => {
        const { points } = setup();
        const rejected = vi.fn();
        expect(points.bind(xpbdPredict, rejected).shader).toBe(xpbdPredict);
        const fn = ring();
        expect(points.resourcesChanged([fn], [])).toBe(true);
        expect(points.version).toBe(1);
        const bound = points.bind(xpbdPredict, rejected);
        expect(bound.shader).not.toBe(xpbdPredict);
        expect(bound.extensions).toEqual([fn]);
        const src = composeWgsl(bound.shader).spec.source;
        expect(src).toContain(
            `${fn.functionName}(x, v, time, body, ${fn.loaderName}(field_records[3u]))`,
        );
        expect(rejected).not.toHaveBeenCalled();
    });

    it('duas funções somam no mesmo shader (nomes com o hash); saída de uma recompõe', () => {
        const { points } = setup();
        const a = ring();
        const b = new FieldFunction({
            code: 'fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f { return vec3f(0.0, 1.0, 0.0); }',
        });
        points.resourcesChanged([a, b], []);
        const src = composeWgsl(points.bind(xpbdPredict, vi.fn()).shader).spec.source;
        expect(src).toContain(a.functionName);
        expect(src).toContain(b.functionName);
        points.resourcesChanged([], [b]);
        const after = composeWgsl(points.bind(xpbdPredict, vi.fn()).shader).spec.source;
        expect(after).not.toContain(b.functionName);
    });

    it('revisão do código ou slot do registro mudou: recompõe no poolWritten do registro', () => {
        const { points, setSlot } = setup();
        const fn = ring();
        points.resourcesChanged([fn], []);
        expect(points.poolWritten(FieldFnRecordSchema.name)).toBe(false);
        fn.setCode(RING.replace('data.k', '(data.k * 2.0)'));
        expect(points.poolWritten(FieldFnRecordSchema.name)).toBe(true);
        setSlot(5);
        expect(points.poolWritten(FieldFnRecordSchema.name)).toBe(true);
        expect(points.poolWritten('Outro')).toBe(false);
        expect(composeWgsl(points.bind(xpbdPredict, vi.fn()).shader).spec.source).toContain(
            'field_records[5u]',
        );
    });

    it('globais: o pool ou um substituto zerado; registros e bitset de vivos', () => {
        const { points } = setup();
        const records = points.globalSource(xpbdPredict, 'field_records');
        const live = points.globalSource(xpbdPredict, 'field_live');
        expect(records?.kind).toBe('buffer');
        expect(live?.kind).toBe('buffer');
        expect(points.globalSource(xpbdPredict, 'particles')).toBeUndefined();
        expect(fieldPoint.scene?.globals.field_live?.part).toBe('live');
    });

    it('validação na criação pela composição: assinatura errada e chamada sem definição', () => {
        expect(
            () => new FieldFunction({ code: 'fn field_fn(x: vec3f) -> vec3f { return x; }' }),
        ).toThrow(/ponto 'field'/);
        expect(
            () =>
                new FieldFunction({
                    code: 'fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f { return nada(x); }',
                }),
        ).toThrow(/nada/);
    });
});
