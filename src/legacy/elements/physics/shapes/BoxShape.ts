import { SDFCollider } from './SDFCollider';
import type { AABB }   from '../../../scene/components/physics/Collider';
import { vec3, mat4 }  from 'gl-matrix';

/**
 * Forma de colisão cúbica. (Camada 3)
 *
 * SDF (Inigo Quilez):
 *   q = |p| - h
 *   d = |max(q, 0)| + min(max(qx, qy, qz), 0)
 *
 * Substitui getAABB herdado da SDFCollider (esférico, conservador demais)
 * por uma AABB justa — centro ± halfExtents * escala por eixo.
 * Sem isso, a broadphase detecta colisões fantasma ~70% antes do contato real.
 */
export class BoxShape extends SDFCollider {
    private readonly hw: number;
    private readonly hh: number;
    private readonly hd: number;

    constructor(
        halfWidth:  number = 0.5,
        halfHeight: number = 0.5,
        halfDepth:  number = 0.5,
    ) {
        const hw = halfWidth, hh = halfHeight, hd = halfDepth;
        super({
            sdf: (p) => {
                const qx = Math.abs(p[0]!) - hw;
                const qy = Math.abs(p[1]!) - hh;
                const qz = Math.abs(p[2]!) - hd;
                return (
                    Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2) +
                    Math.min(Math.max(qx, qy, qz), 0)
                );
            },
            boundingRadius: Math.sqrt(hw ** 2 + hh ** 2 + hd ** 2),
            shape: 'Box',
        });
        this.hw = halfWidth;
        this.hh = halfHeight;
        this.hd = halfDepth;
    }

    public override computeInertiaTensor(mass: number): [number, number, number] {
        return [
            mass * (this.hh ** 2 + this.hd ** 2) / 12,
            mass * (this.hw ** 2 + this.hd ** 2) / 12,
            mass * (this.hw ** 2 + this.hh ** 2) / 12,
        ];
    }

    /** Semi-extensões locais — usadas pelo SATAlgorithm para extrair dimensões do OBB. */
    public override getLocalHalfExtents(): [number, number, number] {
        return [this.hw, this.hh, this.hd];
    }

    public override packDescriptor(): { shapeType: number; half: [number, number, number, number]; bounds: [number, number] } {
        return { shapeType: 1, half: [this.hw, this.hh, this.hd, 0], bounds: [0, 0] };
    }

    /**
     * Os 8 vértices do OBB em espaço de mundo.
     * Implementa Collider.getWorldVertices? — usado pelo PlaneBoxCollision
     * para gerar manifold multi-ponto sem acoplar ao tipo concreto BoxShape.
     */
    public override getWorldVertices(worldMatrix: mat4): vec3[] {
        const verts: vec3[] = [];
        for (const sx of [-1, 1] as const) {
            for (const sy of [-1, 1] as const) {
                for (const sz of [-1, 1] as const) {
                    verts.push(vec3.transformMat4(
                        vec3.create(),
                        vec3.fromValues(sx * this.hw, sy * this.hh, sz * this.hd),
                        worldMatrix,
                    ));
                }
            }
        }
        return verts;
    }

    /**
     * Ponto mais próximo na superfície do OBB ao queryPoint — analítico, sem gradient descent.
     * Para pontos externos: clamp aos half-extents → suporte exato (vértice mais profundo).
     * Para pontos internos: projeta na face mais próxima.
     */
    public override getClosestPoint(worldMatrix: mat4, queryPoint: vec3): vec3 {
        const invWm = mat4.invert(mat4.create(), worldMatrix) ?? mat4.create();
        const local = vec3.transformMat4(vec3.create(), queryPoint, invWm);

        const lx = local[0]!, ly = local[1]!, lz = local[2]!;
        const dx = this.hw - Math.abs(lx);
        const dy = this.hh - Math.abs(ly);
        const dz = this.hd - Math.abs(lz);

        let cx: number, cy: number, cz: number;
        if (dx < 0 || dy < 0 || dz < 0) {
            // Externo: clamp para o ponto mais próximo na superfície do OBB.
            // Para queryPoints muito distantes, resulta no vértice de suporte exato.
            cx = Math.max(-this.hw, Math.min(this.hw, lx));
            cy = Math.max(-this.hh, Math.min(this.hh, ly));
            cz = Math.max(-this.hd, Math.min(this.hd, lz));
        } else {
            // Interno: projeta na face mais próxima
            cx = lx; cy = ly; cz = lz;
            const minD = Math.min(dx, dy, dz);
            if (minD === dx)      cx = (lx >= 0 ? 1 : -1) * this.hw;
            else if (minD === dy) cy = (ly >= 0 ? 1 : -1) * this.hh;
            else                  cz = (lz >= 0 ? 1 : -1) * this.hd;
        }

        return vec3.transformMat4(vec3.create(), vec3.fromValues(cx, cy, cz), worldMatrix);
    }

    /**
     * AABB mínima que contém o OBB rotacionado.
     * Fórmula: half_i = Σ_j |R_ij| * localHalfExtent_j
     * onde R é a matriz de rotação (colunas da worldMatrix, normalizadas).
     * Correto para caixas com qualquer rotação.
     */
    public override getAABB(worldMatrix: mat4): AABB {
        const center = this.getWorldCenter(worldMatrix);
        const halfX = Math.abs(worldMatrix[0]!)  * this.hw + Math.abs(worldMatrix[4]!)  * this.hh + Math.abs(worldMatrix[8]!)  * this.hd;
        const halfY = Math.abs(worldMatrix[1]!)  * this.hw + Math.abs(worldMatrix[5]!)  * this.hh + Math.abs(worldMatrix[9]!)  * this.hd;
        const halfZ = Math.abs(worldMatrix[2]!)  * this.hw + Math.abs(worldMatrix[6]!)  * this.hh + Math.abs(worldMatrix[10]!) * this.hd;
        return {
            min: new Float32Array([center[0]! - halfX, center[1]! - halfY, center[2]! - halfZ]),
            max: new Float32Array([center[0]! + halfX, center[1]! + halfY, center[2]! + halfZ]),
        };
    }
}
