import type { FlowDescriptor } from '../descriptors/FlowDescriptor';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { SceneContribution } from '../shaders/WgslPoint';
import type { ResourceState } from './ResourceState';

/**
 * Resource é o contrato implementado por todo objeto da Camada 3 (Elements)
 * que vira buffer/textura/bindgroup na GPU. Camera, Transform, Material,
 * Geometry, RigidBody, etc. são Resources concretos.
 *
 * Ciclo de vida (gerenciado pelo `ResourceSystem`):
 *   1. **Uninitialized** após construção.
 *   2. **Loading** quando World.insert detecta o resource — ResourceSystem
 *      lê `getDescriptors()` e aloca buffers/bindgroups via core.
 *   3. **Ready** após upload inicial.
 *   4. **Dirty** quando `data` muda — ResourceSystem re-uploada.
 *   5. **Disposed** → **Destroyed** ao remover do World.
 *
 * `data` é o storage runtime — mutável pelo app sem lock; State pattern
 * garante consistência reativa via `resourceDirty` event.
 */
export interface Resource {
    /** Estado atual do lifecycle (gerenciado por ResourceSystem). */
    state: ResourceState;
    /**
     * Dados runtime do resource (e.g. Camera position, Material albedo,
     * RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
     * Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
     * concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
     * schema.
     */
    data: object;

    /**
     * Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
     * que este resource expõe ao `ResourceSystem`. Cada descriptor define
     * `id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
     * (`'pool'` para coalescer N members do mesmo schema em 1 buffer).
     */
    getDescriptors(): readonly GPUDescriptor[];

    /**
     * Pipelines GPU declaradas pelo resource (shader source + entry points
     * + consumes). Útil para Materials que carregam shaders próprios.
     * Vazio para a maioria (Flows criam pipelines diretamente).
     */
    getPipelineDescriptors(): readonly PipelineDescriptor[];

    /**
     * Chave de conteúdo dos descritores `vertex`/`index` (spec 007). Resources com a mesma chave compartilham esses
     * buffers na GPU: a Camada 2 cria e escreve o buffer uma vez por chave e o libera quando o último usuário sai. Sem
     * chave, cada Resource tem os seus.
     */
    readonly contentKey?: string | undefined;

    /**
     * Flows associados ao resource. Opcional — usado por Resources que
     * preferem encapsular sua lógica de execução (e.g. SoftBody declarando
     * seu próprio XPBDFlow). Quando ausente, o app/plugin registra flows
     * separadamente.
     */
    getFlowDescriptors?(): readonly FlowDescriptor[];

    /**
     * Contribuições do Resource para pontos de cena (spec 031, R4): ex. a sombra para `light_visibility`, a água para
     * `light_transmission`. A C2 compõe as contribuições presentes e troca o pronto de cada ponto em todo pipeline que
     * o contém; os estágios não conhecem os contribuintes.
     */
    getSceneContributions?(): readonly SceneContribution[];
}
