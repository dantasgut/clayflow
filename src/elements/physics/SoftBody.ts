import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import type { Geometry }         from '../../scene/components/Geometry';
import { PhysicsBody }           from '../../scene/components/physics/PhysicsBody';

export interface SoftParticle {
    x: number;  y: number;  z: number;   // current position
    px: number; py: number; pz: number;  // predicted position (working buffer)
    vx: number; vy: number; vz: number;  // velocity
    /**
     * Flag de mobilidade: 0 = fixada (kinematic), 1 = livre.
     * O invMass físico real é derivado em runtime: `0` se fixada,
     * `particles.length / body.get('mass')` se livre.
     * Isso garante que `body.set('mass', x)` seja efetivo a qualquer momento.
     */
    w: number;
}

export interface SoftConstraint {
    i: number;           // index of particle A
    j: number;           // index of particle B
    restLength: number;  // initial distance between A and B
    compliance: number;  // α — 0 = rigid, >0 = soft
}

export interface SoftBodyOptions {
    mass?:       number;
    compliance?: number;   // per-constraint default compliance
    damping?:    number;
    targetGeometry?: Geometry;
    /**
     * Deslocamento inicial aplicado a todas as partículas (e ao rawVertices),
     * posicionando o corpo deformável no espaço do mundo sem manipulação
     * manual de buffers no lado da aplicação.
     */
    offset?: [number, number, number];
    /**
     * Índices das partículas a fixar (w = 0).
     * Partículas fixadas não respondem a forças nem a constraints — servem
     * como âncoras estáticas para pendurar panos, cordas e estruturas.
     */
    pinnedIndices?: readonly number[];
}

/**
 * Corpo deformável — malha de partículas conectadas por constraints de distância.
 *
 * Cada vértice da targetGeometry torna-se uma SoftParticle com posição,
 * velocidade prevista e massa inversa. Cada aresta única da malha torna-se
 * uma SoftConstraint com restLength = distância inicial entre os vértices.
 *
 * O pipeline XPBD SoftBody opera diretamente sobre `particles` e `constraints`,
 * sem passar pelo sistema de RigidBody ou CollisionDispatcher.
 */
export class SoftBody extends PhysicsBody {
    public readonly type        = 'SoftBody';
    public readonly physicType  = 'SoftBody';

    public particles:   SoftParticle[]   = [];
    public constraints: SoftConstraint[] = [];

    private readonly defaultCompliance: number;

    constructor(options: SoftBodyOptions = {}) {
        super();
        this.set('mass',    options.mass    ?? 1.0);
        this.set('damping', options.damping ?? 0.01);
        this.defaultCompliance = options.compliance ?? 0;

        if (options.targetGeometry) {
            this.buildFromGeometry(options.targetGeometry, options.offset);
        }
        for (const idx of options.pinnedIndices ?? []) {
            const p = this.particles[idx];
            if (p) p.w = 0;
        }
    }

    // ── Build particles + constraints from geometry ──────────────────────────

    private buildFromGeometry(
        geometry: Geometry,
        offset?:  [number, number, number],
    ): void {
        const raw = geometry.rawVertices;
        if (!raw) return;

        const stride = 8;
        const count  = Math.floor(raw.length / stride);
        const ox = offset?.[0] ?? 0;
        const oy = offset?.[1] ?? 0;
        const oz = offset?.[2] ?? 0;

        for (let i = 0; i < count; i++) {
            const base = i * stride;
            const x = raw[base]!     + ox;
            const y = raw[base + 1]! + oy;
            const z = raw[base + 2]! + oz;
            this.particles.push({ x, y, z, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0, w: 1 });

            // Mantém rawVertices sincronizado com a posição inicial das partículas
            if (ox !== 0 || oy !== 0 || oz !== 0) {
                raw[base]     = x;
                raw[base + 1] = y;
                raw[base + 2] = z;
            }
        }

        // Sincroniza rawWireframePositions (stride 3)
        if ((ox !== 0 || oy !== 0 || oz !== 0) && geometry.rawWireframePositions) {
            const wf = geometry.rawWireframePositions;
            for (let i = 0; i < count; i++) {
                wf[i * 3]     = this.particles[i]!.x;
                wf[i * 3 + 1] = this.particles[i]!.y;
                wf[i * 3 + 2] = this.particles[i]!.z;
            }
        }

        // Build constraints from index buffer (edges of triangles)
        const indices = geometry.rawIndices;
        if (!indices) return;

        const edgeSet = new Set<string>();
        for (let t = 0; t < indices.length; t += 3) {
            const a = indices[t]!;
            const b = indices[t + 1]!;
            const c = indices[t + 2]!;
            this.addEdge(a, b, edgeSet);
            this.addEdge(b, c, edgeSet);
            this.addEdge(c, a, edgeSet);
        }
    }

    private addEdge(i: number, j: number, seen: Set<string>): void {
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) return;
        seen.add(key);

        const pA = this.particles[i];
        const pB = this.particles[j];
        if (!pA || !pB) return;

        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const dz = pB.z - pA.z;
        const restLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (restLength < 1e-8) return;

        this.constraints.push({ i, j, restLength, compliance: this.defaultCompliance });
    }

    // ── GPU buffers (kept for future GPU pipeline) ────────────────────────────

    protected async doAllocate(resourceManager: ResourceManager): Promise<void> {
        // GPU buffers allocated on demand when GPUSpringMassSolver is used.
        // The CPU XPBD pipeline operates directly on `particles` and `constraints`.
        void resourceManager;
    }

    protected doDispose(_resourceManager: ResourceManager): void {
        this.particles   = [];
        this.constraints = [];
    }
}
