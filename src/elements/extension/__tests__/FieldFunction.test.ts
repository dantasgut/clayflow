/**
 * Spec 009 (US2): campos — o registro dos campos prontos (`FieldBuiltinRecord`, derivado do `data`; spec 031) e os
 * pontos de cena (funções `field` compostas em todo shader que contém o ponto, cada uma com o pool da sua forma, e os
 * globais dos campos prontos ligados pela C2).
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
import { fieldPoint, FieldBuiltinRecordSchema } from '../../physics/shaders/fields';
import { xpbdPredict } from '../../physics/shaders/xpbd';
import { FieldFunction } from '../FieldFunction';

const record = (data: object) => data as { kind: number; a: number[]; b: number[]; s: number[] };

const RING = `
fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    let d = vec3f(x.x, 0.0, x.z);
    let r = max(length(d), 1e-4);
    return -d / r * (r - data.radius) * data.k;
}`;

describe('campos prontos no registro FieldBuiltinRecord (spec 009, 031)', () => {
    it('vento: direção normalizada × intensidade e turbulência; mudar o data muda o registro', () => {
        const wind = new WindField({ direction: [2, 0, 0, 0], magnitude: 3, turbulence: 0.5 });
        const r = record(wind.data);
        expect(r.kind).toBe(FieldKind.wind);
        expect(r.a).toEqual([3, 0, 0, 0]);
        expect(r.s[0]).toBe(0.5);
        wind.data.magnitude = 1;
        expect(record(wind.data).a).toEqual([1, 0, 0, 0]);
        expect(wind.getDescriptors()).toEqual([
            {
                id: 'record',
                role: 'storage-ro',
                storage: 'pool',
                schema: FieldBuiltinRecordSchema,
                clearOnRelease: true,
            },
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
        expect(vortex.a).toEqual([0, 1, 0, 0]);
        expect(vortex.b).toEqual([1, 0, 0, 1]);
        expect(vortex.s.slice(0, 2)).toEqual([4, 0.5]);
        const drag = record(new DragField({ linearCoeff: 0.25, quadraticCoeff: 0.5 }).data);
        expect([drag.kind, ...drag.s.slice(0, 2)]).toEqual([FieldKind.drag, 0.25, 0.5]);
        const buoy = record(
            new BuoyancyField({ fluidDensity: 1000, fluidLevel: 0.5, gravity: 9.5 }).data,
        );
        expect([buoy.kind, ...buoy.s.slice(0, 3)]).toEqual([FieldKind.buoyancy, 1000, 0.5, 9.5]);
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
        expect(record(point.data).s[0]).toBeCloseTo(66.74, 2);
    });
});

describe('pontos de cena (spec 009)', () => {
    const setup = () => {
        const core = {
            create: vi.fn(<S>(spec: S) => spec),
            destroy: vi.fn(),
            capabilities: () => ({ limits: { maxStorageBuffersPerShaderStage: 31 }, features: [] }),
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
        expect(src).toContain(`${fn.functionName}(x, v, time, body, ${fn.loaderName}(3u))`);
        // O registro tipado da forma, no pool dela, lido pelo carregador da função.
        expect(src).toContain(`return field_records_${fn.record.name.split(':')[1]}[slot];`);
        expect(fn.module.source).not.toContain('bitcast');
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
        expect(points.poolWritten(fn.record)).toBe(false);
        fn.setCode(RING.replace('data.k', '(data.k * 2.0)'));
        expect(points.poolWritten(fn.record)).toBe(true);
        setSlot(5);
        expect(points.poolWritten(fn.record)).toBe(true);
        expect(points.poolWritten(FieldBuiltinRecordSchema)).toBe(false);
        expect(composeWgsl(points.bind(xpbdPredict, vi.fn()).shader).spec.source).toContain(
            `${fn.loaderName}(5u)`,
        );
    });

    it('global: o pool dos campos prontos ou um substituto zerado (sem bitset de vivos)', () => {
        const { points } = setup();
        const records = points.globalSource(xpbdPredict, 'field_builtin_records');
        expect(records?.kind).toBe('buffer');
        expect(points.globalSource(xpbdPredict, 'particles')).toBeUndefined();
        expect(Object.keys(fieldPoint.scene?.globals ?? {})).toEqual(['field_builtin_records']);
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
