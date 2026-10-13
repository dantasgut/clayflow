import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import type { EventBus } from '../events/EventBus';

/**
 * Tolerância relativa ao dividir o acumulador por `fixedDt`: somas de quadros em ponto flutuante (ex.: 2 × 1/60)
 * ficam um ulp abaixo do múltiplo exato e perderiam um passo.
 */
const STEP_EPSILON = 1e-9;

function requireNonNegative(name: string, value: number): number {
    if (!(value >= 0) || !Number.isFinite(value)) {
        throw new RangeError(`Time.${name} deve ser ≥ 0 e finito (recebido ${value}).`);
    }
    return value;
}

function requirePositive(name: string, value: number): number {
    if (!(value > 0) || !Number.isFinite(value)) {
        throw new RangeError(`Time.${name} deve ser > 0 e finito (recebido ${value}).`);
    }
    return value;
}

/** Dado de um `Time` (layout de `Time.schema`). */
export interface TimeData {
    dt: number;
    elapsed: number;
    stepDt: number;
    steps: number;
}

/**
 * Relógio da cena (C2): um por World, criado por `createScene` e inserido no World. É a única fonte de tempo dos
 * estágios — os Flows de física leem `steps`/`stepDt` daqui (consulta pelo schema `Time`), nunca da aplicação.
 *
 * `advance(realDt)` é o único ponto que move o relógio:
 * - `realDt` é limitado a `maxFrameDt`; `dt = realDt × scale`; `elapsed += dt`; `frame += 1`.
 * - Física com passo fixo (`fixedDt`): `accumulator += dt × physicsScale`; o quadro executa
 *   `steps = min(⌊accumulator / fixedDt⌋, maxStepsPerFrame)` passos de `fixedDt`; o excedente acima de um passo
 *   que o teto cortou é descartado (`droppedTime`, evento `timeDropped`) — sem espiral de passos.
 * - Passo variável (`fixedDt = undefined`): 1 passo de `dt × physicsScale` (0 passos se nulo).
 *
 * Mudanças de `scale`/`physicsScale`/`fixedDt` valem a partir do próximo `advance`. O uniform de GPU `Time`
 * (`dt, elapsed, stepDt, steps`) acompanha cada avanço.
 */
export class Time extends Entity<TimeData> implements Resource {
    /** Schema do uniform de GPU: `dt`, `elapsed`, `stepDt` (f32) e `steps` (u32). */
    static readonly schema = new StructSchema('Time', {
        dt: FieldType.f32,
        elapsed: FieldType.f32,
        stepDt: FieldType.f32,
        steps: FieldType.u32,
    });

    state: ResourceState = ResourceState.Uninitialized;

    /** Estado do relógio (exposto pelos getters/setters abaixo). */
    private readonly clock = {
        realDt: 0,
        dt: 0,
        elapsed: 0,
        frame: 0,
        scale: 1,
        physicsScale: 1,
        fixedDt: (1 / 60) as number | undefined,
        maxStepsPerFrame: 4,
        maxFrameDt: 0.25,
        accumulator: 0,
        steps: 0,
        stepDt: 0,
        droppedTime: 0,
    };
    private scaleBeforePause = 1;
    private physicsScaleBeforePause = 1;

    /** @param events Barramento onde `timeDropped` é emitido (o da cena). Opcional em testes. */
    constructor(private readonly events?: EventBus) {
        super();
        this.data = { dt: 0, elapsed: 0, stepDt: 0, steps: 0 };
    }

    /** Duração real do último quadro (s), já limitada a `maxFrameDt`. */
    get realDt(): number {
        return this.clock.realDt;
    }
    /** Duração efetiva do último quadro (s): `realDt × scale`. */
    get dt(): number {
        return this.clock.dt;
    }
    /** Soma dos `dt` efetivos (s). */
    get elapsed(): number {
        return this.clock.elapsed;
    }
    /** Quadros avançados. */
    get frame(): number {
        return this.clock.frame;
    }
    /** Passos de física do quadro corrente. */
    get steps(): number {
        return this.clock.steps;
    }
    /** Duração de cada passo de física do quadro corrente (s). */
    get stepDt(): number {
        return this.clock.stepDt;
    }
    /** Tempo de física descartado pelo teto de passos, acumulado (s). */
    get droppedTime(): number {
        return this.clock.droppedTime;
    }
    /** Resto de tempo de física para o próximo quadro (s); em `[0, fixedDt)` após `advance`. */
    get accumulator(): number {
        return this.clock.accumulator;
    }

    /** Velocidade global (≥ 0). 0 pausa tudo que depende de `dt`. */
    get scale(): number {
        return this.clock.scale;
    }
    /** Define a velocidade global (≥ 0); vale a partir do próximo `advance`. @throws RangeError se negativa ou não finita. */
    set scale(value: number) {
        this.clock.scale = requireNonNegative('scale', value);
    }

    /** Multiplicador só da física (≥ 0), aplicado sobre `scale`. */
    get physicsScale(): number {
        return this.clock.physicsScale;
    }
    /** Define o multiplicador da física (≥ 0). @throws RangeError se negativo ou não finito. */
    set physicsScale(value: number) {
        this.clock.physicsScale = requireNonNegative('physicsScale', value);
    }

    /** Passo fixo da física (s, > 0). `undefined` = passo variável. Default 1/60. */
    get fixedDt(): number | undefined {
        return this.clock.fixedDt;
    }
    /** Define o passo fixo (s, > 0) ou `undefined` (passo variável, zera o acumulador). @throws RangeError se ≤ 0. */
    set fixedDt(value: number | undefined) {
        this.clock.fixedDt = value === undefined ? undefined : requirePositive('fixedDt', value);
        if (value === undefined) this.clock.accumulator = 0;
    }

    /** Teto de passos de física por quadro (inteiro ≥ 1). Default 4. */
    get maxStepsPerFrame(): number {
        return this.clock.maxStepsPerFrame;
    }
    /** Define o teto de passos por quadro (inteiro ≥ 1). @throws RangeError se inválido. */
    set maxStepsPerFrame(value: number) {
        if (!Number.isInteger(value) || value < 1) {
            throw new RangeError(`Time.maxStepsPerFrame deve ser inteiro ≥ 1 (recebido ${value}).`);
        }
        this.clock.maxStepsPerFrame = value;
    }

    /** Teto da duração real de um quadro (s, > 0). Default 0,25. */
    get maxFrameDt(): number {
        return this.clock.maxFrameDt;
    }
    /** Define o teto da duração real do quadro (s, > 0). @throws RangeError se ≤ 0. */
    set maxFrameDt(value: number) {
        this.clock.maxFrameDt = requirePositive('maxFrameDt', value);
    }

    /** Avança o relógio um quadro de duração real `realDt` (s, ≥ 0). Ver a regra na documentação da classe. */
    advance(realDt: number): void {
        requireNonNegative('advance(realDt)', realDt);
        this.clock.realDt = Math.min(realDt, this.clock.maxFrameDt);
        this.clock.dt = this.clock.realDt * this.clock.scale;
        this.clock.elapsed += this.clock.dt;
        this.clock.frame += 1;
        const physicsDt = this.clock.dt * this.clock.physicsScale;
        const fixed = this.clock.fixedDt;
        if (fixed === undefined) {
            this.clock.steps = physicsDt > 0 ? 1 : 0;
            this.clock.stepDt = physicsDt;
        } else {
            this.clock.accumulator += physicsDt;
            const due = Math.floor(this.clock.accumulator / fixed + STEP_EPSILON);
            this.clock.steps = Math.min(due, this.clock.maxStepsPerFrame);
            this.clock.stepDt = fixed;
            this.clock.accumulator = Math.max(0, this.clock.accumulator - this.clock.steps * fixed);
            if (due > this.clock.steps) {
                const remainder = Math.max(0, this.clock.accumulator % fixed);
                const dropped = this.clock.accumulator - remainder;
                this.clock.accumulator = remainder;
                this.clock.droppedTime += dropped;
                this.events?.emit('timeDropped', { dropped });
            }
        }
        const data = this.data;
        data.dt = this.clock.dt;
        data.elapsed = this.clock.elapsed;
        data.stepDt = this.clock.stepDt;
        data.steps = this.clock.steps;
    }

    /** Pausa tudo (`scale = 0`), guardando a escala para `resume`. */
    pause(): void {
        if (this.clock.scale === 0) return;
        this.scaleBeforePause = this.clock.scale;
        this.clock.scale = 0;
    }

    /** Restaura a escala anterior a `pause`. */
    resume(): void {
        if (this.clock.scale !== 0) return;
        this.clock.scale = this.scaleBeforePause;
    }

    /** Pausa só a física (`physicsScale = 0`); o desenho continua. */
    pausePhysics(): void {
        if (this.clock.physicsScale === 0) return;
        this.physicsScaleBeforePause = this.clock.physicsScale;
        this.clock.physicsScale = 0;
    }

    /** Restaura a escala da física anterior a `pausePhysics`. */
    resumePhysics(): void {
        if (this.clock.physicsScale !== 0) return;
        this.clock.physicsScale = this.physicsScaleBeforePause;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'time', role: 'uniform', schema: Time.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
