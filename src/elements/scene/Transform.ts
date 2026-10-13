import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Valores de construção de um `Transform` (todos opcionais). */
export interface TransformValues {
    /** Posição no mundo `[x, y, z, 1]`. Default `[0, 0, 0, 1]`. */
    readonly position?: readonly number[];
    /** Rotação como quaternion `[x, y, z, w]`. Default identidade `[0, 0, 0, 1]`. */
    readonly rotation?: readonly number[];
    /** Escala por eixo `[sx, sy, sz, 1]`. Default `[1, 1, 1, 1]`; negativa espelha. */
    readonly scale?: readonly number[];
}

let legacyModelWarned = false;

/**
 * Transform 3D — a **intenção** de posicionamento de um objeto: posição, rotação
 * (quaternion) e escala. Mutar `data` depois de inserir reposiciona o objeto no
 * quadro seguinte, sem chamadas manuais.
 *
 * A matriz de mundo não é dado do desenvolvedor: é produzida na GPU pelo
 * `TransformFlow` (fase `transform`) num segundo descritor do mesmo recurso
 * (`WorldTransform`, mesmo slot), e lida pelos estágios de sombra e desenho.
 *
 * Mudança incompatível: o antigo campo `model` foi removido — ver o guia de migração.
 */
export class Transform extends Entity implements Resource {
    /** Intenção do desenvolvedor: posição, rotação e escala (pool `Transform`). */
    static readonly schema = new StructSchema('Transform', {
        position: FieldType.vec4f,
        rotation: FieldType.vec4f,
        scale: FieldType.vec4f,
    });

    /**
     * Produto do estágio de transformação, só na GPU (pool `WorldTransform`):
     * `world = T·R·S` e `normal = R·S⁻¹` (matriz para normais).
     */
    static readonly worldSchema = new StructSchema('WorldTransform', {
        world: FieldType.mat4x4f,
        normal: FieldType.mat3x3f,
    });

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: TransformValues = {}) {
        super();
        if ('model' in values) warnLegacyModel();
        this.data = {
            position: [...(values.position ?? [0, 0, 0, 1])],
            rotation: [...(values.rotation ?? [0, 0, 0, 1])],
            scale: [...(values.scale ?? [1, 1, 1, 1])],
        };
    }

    /**
     * Escala com produto negativo: o objeto é espelhado (inverte a orientação das faces). Lida do dado cru (os estágios a
     * consultam para a chave de grupo, sem criar proxy por entidade).
     */
    get mirrored(): boolean {
        const scale = this.rawData.scale as readonly number[];
        return (scale[0] ?? 1) * (scale[1] ?? 1) * (scale[2] ?? 1) < 0;
    }

    /** Intenção (CPU envia a cada mutação) + matriz de mundo (produzida só pela GPU). */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'transform',
                role: 'storage-ro',
                storage: 'pool',
                schema: Transform.schema,
                upload: 'always',
            },
            {
                id: 'world',
                role: 'storage-rw',
                storage: 'pool',
                schema: Transform.worldSchema,
                upload: 'never',
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /**
     * Rotação (quaternion `[x, y, z, w]`) de um objeto em `from` que olha para `to` com o "para cima" `up` — a
     * convenção da câmera: o objeto olha para −Z local. Vocabulário de autoria: o resultado vai em
     * `Transform.data.rotation`.
     */
    static lookRotation(
        from: readonly number[],
        to: readonly number[],
        up: readonly number[] = [0, 1, 0],
    ): [number, number, number, number] {
        // Eixos locais em mundo: z = de `to` para `from` (o objeto olha para −z), x = up × z, y = z × x.
        let zx = (from[0] ?? 0) - (to[0] ?? 0);
        let zy = (from[1] ?? 0) - (to[1] ?? 0);
        let zz = (from[2] ?? 0) - (to[2] ?? 0);
        const zl = Math.hypot(zx, zy, zz) || 1;
        zx /= zl;
        zy /= zl;
        zz /= zl;
        const ux = up[0] ?? 0;
        const uy = up[1] ?? 1;
        const uz = up[2] ?? 0;
        let xx = uy * zz - uz * zy;
        let xy = uz * zx - ux * zz;
        let xz = ux * zy - uy * zx;
        const xl = Math.hypot(xx, xy, xz) || 1;
        xx /= xl;
        xy /= xl;
        xz /= xl;
        const yx = zy * xz - zz * xy;
        const yy = zz * xx - zx * xz;
        const yz = zx * xy - zy * xx;
        // Quaternion da matriz de rotação de colunas (x, y, z) — método de Shepperd.
        const trace = xx + yy + zz;
        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1);
            return [(yz - zy) * s, (zx - xz) * s, (xy - yx) * s, 0.25 / s];
        }
        if (xx > yy && xx > zz) {
            const s = 2 * Math.sqrt(1 + xx - yy - zz);
            return [0.25 * s, (yx + xy) / s, (zx + xz) / s, (yz - zy) / s];
        }
        if (yy > zz) {
            const s = 2 * Math.sqrt(1 + yy - xx - zz);
            return [(yx + xy) / s, 0.25 * s, (zy + yz) / s, (zx - xz) / s];
        }
        const s = 2 * Math.sqrt(1 + zz - xx - yy);
        return [(zx + xz) / s, (zy + yz) / s, 0.25 * s, (xy - yx) / s];
    }

    /** Reabilita o aviso de `model` legado (uso em testes). */
    static resetLegacyModelWarning(): void {
        legacyModelWarned = false;
    }
}

function warnLegacyModel(): void {
    if (legacyModelWarned) return;
    legacyModelWarned = true;
    console.warn(
        '[Transform] O campo `model` foi removido e será ignorado: o posicionamento é por '
            + '`position`/`rotation`/`scale`, e a matriz de mundo é produzida na GPU pelo '
            + 'TransformFlow. Veja o guia de migração.',
    );
}
