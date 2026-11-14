import type { Resource } from '../../scene/contracts/Resource';
import { MaterialFunction } from '../extension/MaterialFunction';
import { Material } from '../material/Material';
import { FluidBody } from '../physics/bodies/FluidBody';

/**
 * A entidade (os Resources dela) é um corpo de fluido com superfície — entra no campo dos fluidos, não nas esferas da
 * estrutura de raios: um `FluidBody` com a função `material` (a aparência pelo grafo, spec 034 T065d) e sem material de
 * desenho (o `PointSpriteMaterial` o desenha como partículas).
 */
export function isFieldBody(resources: readonly Resource[]): boolean {
    return (
        resources.some((r) => r instanceof FluidBody)
        && resources.some((r) => r instanceof MaterialFunction)
        && !resources.some((r) => r instanceof Material)
    );
}
