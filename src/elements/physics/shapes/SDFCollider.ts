import { Collider, type AABB } from '../../../scene/components/physics/Collider';
import { vec3, mat4 } from 'gl-matrix';

/** Signed Distance Function em espaço local: retorna distância negativa se dentro da forma. */
export type SDF = (localPoint: vec3) => number;

export interface SDFColliderOptions {
    /**
     * Função de distância com sinal em espaço local.
     * Negativo = interior, zero = superfície, positivo = exterior.
     * @example (p) => vec3.length(p) - 0.5  // esfera de raio 0.5
     * @example (p) => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) - 0.5  // cubo
     * @example (p) => { const q = Math.sqrt(p[0]**2+p[2]**2)-R; return Math.sqrt(q**2+p[1]**2)-r; }  // toro
     */
    sdf: SDF;
    /**
     * Raio de esfera circunscrita em espaço local.
     * Usado pelo broadphase e como limite de marching.
     */
    boundingRadius: number;
    /** Rótulo da forma — registre um NarrowphaseTest customizado para otimizações. */
    shape?: string;
    /** Centro em espaço local (default: origem). */
    center?: [number, number, number];
}

/**
 * Collider definido por Signed Distance Function (SDF) arbitrária.
 *
 * Permite descrever qualquer forma — esfera, toro, superfície de Riemann,
 * formas de geometria diferencial — sem subclasses, apenas com uma fórmula.
 *
 * As primitivas geométricas (getClosestPoint, getBoundingRadius, getAABB)
 * são derivadas numericamente do SDF via diferenças finitas e gradient descent.
 *
 * @example
 * // Toro
 * mesh.add(new SDFCollider({
 *     sdf: (p) => { const q = Math.sqrt(p[0]**2+p[2]**2) - 1.0; return Math.sqrt(q**2+p[1]**2) - 0.3; },
 *     boundingRadius: 1.3,
 *     shape: 'Torus',
 * }));
 *
 * // Superfície implícita customizada
 * mesh.add(new SDFCollider({
 *     sdf: (p) => p[0]**2 + p[1]**2 - p[2]**2 - 1, // hiperboloide
 *     boundingRadius: 2.0,
 * }));
 */
export class SDFCollider extends Collider {
    public readonly colliderShape: string;

    private readonly sdfFn: SDF;
    protected readonly boundingRadiusVal: number;
    private readonly localCenter: vec3;

    // Reutilizados para evitar GC no gradient descent
    private static readonly eps = 1e-4;

    constructor(options: SDFColliderOptions) {
        super();
        this.sdfFn            = options.sdf;
        this.boundingRadiusVal = options.boundingRadius;
        this.localCenter      = options.center
            ? vec3.fromValues(...options.center)
            : vec3.create();
        this.colliderShape    = options.shape ?? 'SDF';
    }

    public computeInertiaTensor(mass: number): [number, number, number] {
        const I = 0.4 * mass * this.boundingRadiusVal ** 2;
        return [I, I, I];
    }

    /**
     * Fallback para formas SDF arbitrárias — descreve uma esfera circunscrita (shapeType=0).
     * Formas concretas (SphereShape, BoxShape, PlaneShape) sobrescrevem com descritores exatos.
     */
    public packDescriptor(): { shapeType: number; half: [number, number, number, number] } {
        return { shapeType: 0, half: [this.boundingRadiusVal, 0, 0, 0] };
    }

    /** SDF em espaço local — disponível para testes narrowphase customizados. */
    public sdf(localPoint: vec3): number {
        return this.sdfFn(localPoint);
    }

    public getWorldCenter(worldMatrix: mat4): vec3 {
        return vec3.transformMat4(vec3.create(), this.localCenter, worldMatrix);
    }

    public getBoundingRadius(worldMatrix: mat4): number {
        return this.boundingRadiusVal * this.maxScale(worldMatrix);
    }

    /**
     * Ponto mais próximo na superfície via gradient descent no SDF.
     * Projeta o queryPoint (mundo) para a superfície da forma.
     */
    public getClosestPoint(worldMatrix: mat4, queryPoint: vec3): vec3 {
        const invWm = mat4.invert(mat4.create(), worldMatrix) ?? mat4.create();
        const local = vec3.transformMat4(vec3.create(), queryPoint, invWm);

        // Gradient descent: mover o ponto na direção do gradiente até d ≈ 0
        const p = vec3.clone(local);
        for (let i = 0; i < 16; i++) {
            const d = this.sdfFn(p);
            if (Math.abs(d) < 1e-5) break;
            const grad = this.gradient(p);
            vec3.scaleAndAdd(p, p, grad, -d);
        }

        return vec3.transformMat4(vec3.create(), p, worldMatrix);
    }

    /** AABB conservador derivado da esfera circunscrita. */
    public getAABB(worldMatrix: mat4): AABB {
        const center = this.getWorldCenter(worldMatrix);
        const r      = this.getBoundingRadius(worldMatrix);
        return {
            min: new Float32Array([center[0]! - r, center[1]! - r, center[2]! - r]),
            max: new Float32Array([center[0]! + r, center[1]! + r, center[2]! + r]),
        };
    }

    // ------------------------------------------------------------------
    // Privado
    // ------------------------------------------------------------------

    /** Gradiente do SDF por diferenças finitas centrais. */
    private gradient(p: vec3): vec3 {
        const e = SDFCollider.eps;
        const dx = this.sdfFn(vec3.fromValues(p[0]! + e, p[1]!, p[2]!)) - this.sdfFn(vec3.fromValues(p[0]! - e, p[1]!, p[2]!));
        const dy = this.sdfFn(vec3.fromValues(p[0]!, p[1]! + e, p[2]!)) - this.sdfFn(vec3.fromValues(p[0]!, p[1]! - e, p[2]!));
        const dz = this.sdfFn(vec3.fromValues(p[0]!, p[1]!, p[2]! + e)) - this.sdfFn(vec3.fromValues(p[0]!, p[1]!, p[2]! - e));
        const g  = vec3.fromValues(dx / (2 * e), dy / (2 * e), dz / (2 * e));
        return vec3.normalize(g, g);
    }

    private maxScale(m: mat4): number {
        const sx = Math.sqrt(m[0]! ** 2 + m[1]! ** 2 + m[2]!  ** 2);
        const sy = Math.sqrt(m[4]! ** 2 + m[5]! ** 2 + m[6]!  ** 2);
        const sz = Math.sqrt(m[8]! ** 2 + m[9]! ** 2 + m[10]! ** 2);
        return Math.max(sx, sy, sz);
    }
}
