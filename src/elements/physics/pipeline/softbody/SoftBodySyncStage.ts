import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';
import type { Geometry }            from '../../../../scene/components/Geometry';

/**
 * Estágio 5 do pipeline XPBD SoftBody — Sincronização com a Geometry.
 *
 * Copia as posições atualizadas das partículas de volta para o buffer de
 * vértices da Geometry (rawVertices), permitindo que o renderer reflita
 * a deformação no próximo frame.
 *
 * Stride assumido: 8 floats por vértice (x, y, z, nx, ny, nz, u, v).
 * Normais não são recalculadas aqui — extensão futura.
 */
export class SoftBodySyncStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, _dt: number): void {
        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            const sb  = body as unknown as SoftBody;
            const geo = entity.getComponent<Geometry>('Geometry');
            if (!geo?.rawVertices) continue;
            if (geo.isGpuManaged) continue; // compute shader é o dono do vertexBufferId — skip CPU sync

            const raw    = geo.rawVertices;
            const stride = 8;

            for (let i = 0; i < sb.particles.length; i++) {
                const p    = sb.particles[i]!;
                const base = i * stride;
                if (base + 2 >= raw.length) break;
                raw[base]     = p.x;
                raw[base + 1] = p.y;
                raw[base + 2] = p.z;
            }

            // Sincroniza posições wireframe (stride 3: x, y, z)
            if (geo.rawWireframePositions) {
                const wf = geo.rawWireframePositions;
                for (let i = 0; i < sb.particles.length; i++) {
                    const p    = sb.particles[i]!;
                    const base = i * 3;
                    if (base + 2 >= wf.length) break;
                    wf[base]     = p.x;
                    wf[base + 1] = p.y;
                    wf[base + 2] = p.z;
                }
            }

            // Notifica o renderer que os buffers foram modificados
            geo.markDirty();
        }
    }
}
