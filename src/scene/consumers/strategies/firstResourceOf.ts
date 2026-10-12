import type { Resource } from '../../contracts/Resource';
import type { Schema } from '../../descriptors/Schema';
import type { World } from '../../world/World';

/**
 * Primeiro recurso (ordem de inserção das entidades) que tem um descritor com `schema`, declara o descritor `descId`
 * (de qualquer papel — buffer, textura, sampler) e passa em `select`. Reconhece pelo schema dos descritores — dado
 * explícito, que sobrevive à minificação.
 */
export function firstResourceOf(
    world: World,
    schema: Schema,
    descId: string,
    select?: (resource: Resource) => boolean,
): Resource | undefined {
    for (const id of world.queryBySchemaName(schema.name)) {
        for (const r of world.resourcesOf(id)) {
            const descs = r.getDescriptors();
            if (!descs.some((d) => d.schema === schema) || !descs.some((d) => d.id === descId))
                continue;
            if (select === undefined || select(r)) return r;
        }
    }
    return undefined;
}
