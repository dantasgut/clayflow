import type { Collider }              from '../../../scene/components/physics/Collider';
import type { CollisionAlgorithm }    from '../../../scene/systems/collision/CollisionAlgorithm';
import type { CollisionManifold }     from '../../../scene/systems/collision/CollisionManifold';
import type { NarrowphaseConfig }     from '../../../scene/systems/collision/NarrowphaseConfig';
import type { mat4 }                  from 'gl-matrix';
import { CollisionAlgorithmType }     from '../../../scene/systems/collision/CollisionAlgorithmType';
import { SATAlgorithm }               from './SATAlgorithm';
import { SphereSphereCollision }      from './SphereSphereCollision';
import { BoxSphereCollision }         from './BoxSphereCollision';
import { PlaneBoxCollision }          from './PlaneBoxCollision';
import { PlaneSphereCollision }       from './PlaneSphereCollision';
import { SDFCollision }               from './SDFCollision';

/**
 * Dispatcher de algoritmos de colisão narrowphase — Registry + Strategy (GoF).
 *
 * Dois níveis de lookup por par de formas:
 *
 *   1. `directRegistry`  — instâncias registradas diretamente via `register()`.
 *      Usada para algoritmos customizados (ex: formas próprias do usuário).
 *
 *   2. `typeRegistry`    — instâncias por CollisionAlgorithmType.
 *      O `shapeMatrix` mapeia par de formas → tipo, permitindo configuração
 *      declarativa via NarrowphaseConfig sem instanciar algoritmos manualmente.
 *
 *   3. Fallback SDFCollision quando ambos os colliders têm sdf().
 *
 * A ordem canônica (alfabética por colliderShape) é garantida internamente antes
 * de invocar o algoritmo — os algoritmos sempre recebem os argumentos na mesma
 * ordem com que foram registrados.
 *
 * @example
 * // Configuração via enum (recomendado):
 * const world = new PhysicsWorld({
 *   narrowphase: { boxBox: CollisionAlgorithmType.SAT },
 * });
 *
 * // Registro direto de algoritmo customizado:
 * world.dispatcher.register('Capsule', 'Box', new CapsuleBoxCollision());
 *
 * // Substituição de instância por tipo:
 * world.dispatcher.registerAlgorithmType(CollisionAlgorithmType.SAT, myCustomSAT);
 */
export class CollisionDispatcher {
    /** Instâncias diretamente registradas por par de formas (máxima prioridade). */
    private readonly directRegistry: Map<string, CollisionAlgorithm> = new Map();
    /** Instâncias por tipo de algoritmo. */
    private readonly typeRegistry:   Map<CollisionAlgorithmType, CollisionAlgorithm>;
    /** Mapeamento par de formas → tipo de algoritmo. */
    private readonly shapeMatrix:    Map<string, CollisionAlgorithmType> = new Map();

    private readonly sdfFallback = new SDFCollision();

    constructor(config?: NarrowphaseConfig) {
        // Instâncias default por tipo
        this.typeRegistry = new Map([
            [CollisionAlgorithmType.SAT,             new SATAlgorithm()],
            [CollisionAlgorithmType.SPHERE_ANALYTIC, new SphereSphereCollision()],
            [CollisionAlgorithmType.PLANE_ANALYTIC,  new PlaneBoxCollision()],  // shared; dispatch order handled below
            [CollisionAlgorithmType.SDF_GRADIENT,    new SDFCollision()],
        ]);

        // Default: pares de formas → tipo
        this.shapeMatrix.set('Box:Box',       CollisionAlgorithmType.SAT);
        this.shapeMatrix.set('Box:Sphere',    CollisionAlgorithmType.SAT);
        this.shapeMatrix.set('Sphere:Sphere', CollisionAlgorithmType.SPHERE_ANALYTIC);
        this.shapeMatrix.set('Box:Plane',     CollisionAlgorithmType.PLANE_ANALYTIC);
        this.shapeMatrix.set('Plane:Sphere',  CollisionAlgorithmType.PLANE_ANALYTIC);

        // Algoritmos que precisam de instância própria (não compartilham com typeRegistry)
        this.directRegistry.set('Box:Sphere',   new BoxSphereCollision());
        this.directRegistry.set('Box:Plane',    new PlaneBoxCollision());
        this.directRegistry.set('Plane:Sphere', new PlaneSphereCollision());

        // Aplica overrides do NarrowphaseConfig
        if (config) {
            if (config.boxBox    != null) this.shapeMatrix.set('Box:Box',       config.boxBox);
            if (config.sphereSphere != null) this.shapeMatrix.set('Sphere:Sphere', config.sphereSphere);
            if (config.boxSphere != null) {
                this.shapeMatrix.set('Box:Sphere', config.boxSphere);
                this.directRegistry.delete('Box:Sphere');   // remove override direto para usar tipo
            }
            if (config.overrides) {
                for (const [pair, type] of Object.entries(config.overrides)) {
                    this.shapeMatrix.set(pair, type);
                    this.directRegistry.delete(pair);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    /**
     * Registra instância de algoritmo diretamente para um par de formas.
     * Tem prioridade sobre qualquer configuração de tipo.
     */
    public register(shapeA: string, shapeB: string, algorithm: CollisionAlgorithm): void {
        this.directRegistry.set(this.key(shapeA, shapeB), algorithm);
    }

    /**
     * Substitui (ou adiciona) a instância de algoritmo para um tipo.
     * Útil para injetar implementações customizadas (ex: SAT com extensões).
     */
    public registerAlgorithmType(type: CollisionAlgorithmType, algorithm: CollisionAlgorithm): void {
        this.typeRegistry.set(type, algorithm);
    }

    /**
     * Configura qual tipo de algoritmo usar para um par de formas.
     * Sobrescreve o default do construtor sem precisar de uma instância concreta.
     */
    public setShapeAlgorithmType(shapeA: string, shapeB: string, type: CollisionAlgorithmType): void {
        const k = this.key(shapeA, shapeB);
        this.shapeMatrix.set(k, type);
        this.directRegistry.delete(k);   // remove override direto para usar tipo
    }

    public dispatch(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null {
        const k         = this.key(a.colliderShape, b.colliderShape);
        const canonical = a.colliderShape <= b.colliderShape;

        // Prioridade 1: instância direta
        const direct = this.directRegistry.get(k);
        if (direct) {
            return canonical
                ? direct.detect(a, aWorldMatrix, b, bWorldMatrix)
                : direct.detect(b, bWorldMatrix, a, aWorldMatrix);
        }

        // Prioridade 2: tipo de algoritmo
        const type      = this.shapeMatrix.get(k);
        const algorithm = type != null ? this.typeRegistry.get(type) : null;
        if (algorithm) {
            return canonical
                ? algorithm.detect(a, aWorldMatrix, b, bWorldMatrix)
                : algorithm.detect(b, bWorldMatrix, a, aWorldMatrix);
        }

        // Fallback: SDF genérico
        if (a.sdf && b.sdf) {
            return canonical
                ? this.sdfFallback.detect(a, aWorldMatrix, b, bWorldMatrix)
                : this.sdfFallback.detect(b, bWorldMatrix, a, aWorldMatrix);
        }

        return null;
    }

    private key(shapeA: string, shapeB: string): string {
        return shapeA <= shapeB ? `${shapeA}:${shapeB}` : `${shapeB}:${shapeA}`;
    }
}
