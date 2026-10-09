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
export class Time extends Entity implements Resource {
    /** Schema do uniform de GPU: `dt`, `elapsed`, `stepDt` (f32) e `steps` (u32). */
    static readonly schema = new StructSchema('Time', {
        dt: FieldType.f32,
        elapsed: FieldType.f32,
        stepDt: FieldType.f32,
        steps: FieldType.u32,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown>;

    private _realDt = 0;
    private _dt = 0;
    private _elapsed = 0;
    private _frame = 0;
    private _scale = 1;
    private _physicsScale = 1;
    private _fixedDt: number | undefined = 1 / 60;
    private _maxStepsPerFrame = 4;
    private _maxFrameDt = 0.25;
    private _accumulator = 0;
    private _steps = 0;
    private _stepDt = 0;
    private _droppedTime = 0;
    private scaleBeforePause = 1;
    private physicsScaleBeforePause = 1;

    /** @param events Barramento onde `timeDropped` é emitido (o da cena). Opcional em testes. */
    constructor(private readonly events?: EventBus) {
        super();
        this.data = Time.schema.applyDefaults({ dt: 0, elapsed: 0, stepDt: 0, steps: 0 });
    }

    /** Duração real do último quadro (s), já limitada a `maxFrameDt`. */
    get realDt(): number {
        return this._realDt;
    }
    /** Duração efetiva do último quadro (s): `realDt × scale`. */
    get dt(): number {
        return this._dt;
    }
    /** Soma dos `dt` efetivos (s). */
    get elapsed(): number {
        return this._elapsed;
    }
    /** Quadros avançados. */
    get frame(): number {
        return this._frame;
    }
    /** Passos de física do quadro corrente. */
    get steps(): number {
        return this._steps;
    }
    /** Duração de cada passo de física do quadro corrente (s). */
    get stepDt(): number {
        return this._stepDt;
    }
    /** Tempo de física descartado pelo teto de passos, acumulado (s). */
    get droppedTime(): number {
        return this._droppedTime;
    }
    /** Resto de tempo de física para o próximo quadro (s); em `[0, fixedDt)` após `advance`. */
    get accumulator(): number {
        return this._accumulator;
    }

    /** Velocidade global (≥ 0). 0 pausa tudo que depende de `dt`. */
    get scale(): number {
        return this._scale;
    }
    set scale(value: number) {
        this._scale = requireNonNegative('scale', value);
    }

    /** Multiplicador só da física (≥ 0), aplicado sobre `scale`. */
    get physicsScale(): number {
        return this._physicsScale;
    }
    set physicsScale(value: number) {
        this._physicsScale = requireNonNegative('physicsScale', value);
    }

    /** Passo fixo da física (s, > 0). `undefined` = passo variável. Default 1/60. */
    get fixedDt(): number | undefined {
        return this._fixedDt;
    }
    set fixedDt(value: number | undefined) {
        this._fixedDt = value === undefined ? undefined : requirePositive('fixedDt', value);
        if (value === undefined) this._accumulator = 0;
    }

    /** Teto de passos de física por quadro (inteiro ≥ 1). Default 4. */
    get maxStepsPerFrame(): number {
        return this._maxStepsPerFrame;
    }
    set maxStepsPerFrame(value: number) {
        if (!Number.isInteger(value) || value < 1) {
            throw new RangeError(`Time.maxStepsPerFrame deve ser inteiro ≥ 1 (recebido ${value}).`);
        }
        this._maxStepsPerFrame = value;
    }

    /** Teto da duração real de um quadro (s, > 0). Default 0,25. */
    get maxFrameDt(): number {
        return this._maxFrameDt;
    }
    set maxFrameDt(value: number) {
        this._maxFrameDt = requirePositive('maxFrameDt', value);
    }

    /** Avança o relógio um quadro de duração real `realDt` (s, ≥ 0). Ver a regra na documentação da classe. */
    advance(realDt: number): void {
        requireNonNegative('advance(realDt)', realDt);
        this._realDt = Math.min(realDt, this._maxFrameDt);
        this._dt = this._realDt * this._scale;
        this._elapsed += this._dt;
        this._frame += 1;
        const physicsDt = this._dt * this._physicsScale;
        const fixed = this._fixedDt;
        if (fixed === undefined) {
            this._steps = physicsDt > 0 ? 1 : 0;
            this._stepDt = physicsDt;
        } else {
            this._accumulator += physicsDt;
            const due = Math.floor(this._accumulator / fixed + STEP_EPSILON);
            this._steps = Math.min(due, this._maxStepsPerFrame);
            this._stepDt = fixed;
            this._accumulator = Math.max(0, this._accumulator - this._steps * fixed);
            if (due > this._steps) {
                const remainder = Math.max(0, this._accumulator % fixed);
                const dropped = this._accumulator - remainder;
                this._accumulator = remainder;
                this._droppedTime += dropped;
                this.events?.emit('timeDropped', { dropped });
            }
        }
        const data = this.data;
        data['dt'] = this._dt;
        data['elapsed'] = this._elapsed;
        data['stepDt'] = this._stepDt;
        data['steps'] = this._steps;
    }

    /** Pausa tudo (`scale = 0`), guardando a escala para `resume`. */
    pause(): void {
        if (this._scale === 0) return;
        this.scaleBeforePause = this._scale;
        this._scale = 0;
    }

    /** Restaura a escala anterior a `pause`. */
    resume(): void {
        if (this._scale !== 0) return;
        this._scale = this.scaleBeforePause;
    }

    /** Pausa só a física (`physicsScale = 0`); o desenho continua. */
    pausePhysics(): void {
        if (this._physicsScale === 0) return;
        this.physicsScaleBeforePause = this._physicsScale;
        this._physicsScale = 0;
    }

    /** Restaura a escala da física anterior a `pausePhysics`. */
    resumePhysics(): void {
        if (this._physicsScale !== 0) return;
        this._physicsScale = this.physicsScaleBeforePause;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'time', role: 'uniform', schema: Time.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
