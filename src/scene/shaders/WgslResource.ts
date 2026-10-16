import type { StructSchema } from '../descriptors/StructSchema';
import type { WgslModule } from './WgslModule';
import { wgslModule } from './WgslModule';

/**
 * Frequência com que a fonte de um recurso muda durante a gravação de um quadro (spec 031, R2) — decide o grupo:
 * `frame` (igual para todos os pipelines e passes do quadro: câmeras, luzes, tempo), `stage` (igual para os pipelines
 * de um estágio: matrizes de mundo, registros de desenho), `batch` (muda entre grupos de desenho: pool de material,
 * registros de função) e `draw` (do pipeline ou da chamada: vértices, parâmetros por despacho). O grupo de um recurso
 * é o posto da sua frequência entre as presentes no shader.
 */
export type BindingFrequency = 'frame' | 'stage' | 'batch' | 'draw';

/** Ordem das frequências (posto → grupo). */
export const BINDING_FREQUENCIES: readonly BindingFrequency[] = ['frame', 'stage', 'batch', 'draw'];

/** Dimensão de textura WGSL. */
export type WgslTextureDimension = '1d' | '2d' | '2d_array' | '3d' | 'cube' | 'cube_array';

/** Como o recurso é ligado (address space, textura, amostrador). */
export type WgslBindingKind =
    | {
          /** Buffer de storage com o acesso dado. */
          readonly storage: 'read' | 'read_write';
      }
    | {
          /** Buffer uniform. */
          readonly uniform: true;
      }
    | {
          /** Textura amostrada. */
          readonly texture: {
              /** Tipo da amostra (`depth` = `texture_depth_*`). */
              readonly sample: 'f32' | 'i32' | 'u32' | 'depth';
              /** Dimensão (padrão `2d`). */
              readonly dimension?: WgslTextureDimension;
              /** Multiamostrada. */
              readonly multisampled?: boolean;
          };
      }
    | {
          /** Textura de storage. */
          readonly storageTexture: {
              /** Formato. */
              readonly format: GPUTextureFormat;
              /** Acesso. */
              readonly access: 'read' | 'write' | 'read_write';
              /** Dimensão (padrão `2d`). */
              readonly dimension?: WgslTextureDimension;
          };
      }
    | {
          /** Amostrador. */
          readonly sampler: 'filtering' | 'comparison';
      };

/** Tipo do dado de um buffer: struct gerado de schema (opcionalmente em `array`) ou tipo WGSL. */
export type WgslResourceType =
    | {
          /** Schema do struct. */
          readonly schema: StructSchema;
          /** `array<Struct>` (runtime-sized). */
          readonly array?: boolean;
      }
    | {
          /** Tipo WGSL (ex.: `u32`, `vec4f`, `atomic<u32>`). */
          readonly wgsl: string;
          /** `array<T>` (runtime-sized). */
          readonly array?: boolean;
      };

/**
 * Quem fornece o dado: o pool da C2 de chave `pool` (o nome do schema, ou `schema:algoritmo`), um resolver nomeado
 * da cena (`consumer`: tempo, alvos, bitset vivo `<pool>.live`), um ponto de cena (`scene`, registros das funções da
 * cena), um slot do Flow (`slot`: o que o slot resolveu, ex. o pool de corpos do `bodyType` do registro) ou o próprio
 * estágio (`'private'`, ligado pelo objeto do recurso).
 */
export type ResourceProvider =
    | {
          /** Chave do pool. */
          readonly pool: string;
      }
    | {
          /** Nome do resolver. */
          readonly consumer: string;
      }
    | {
          /** Nome do ponto de cena. */
          readonly scene: string;
      }
    | {
          /**
           * Slot do Flow que liga o recurso (spec 031): um pool (`buffer`, ou o bitset `live`), os registros ou a lista
           * de instâncias de um conjunto de entidades (`records`, `instances`), uma textura (`view`) ou o descritor
           * `descriptor` de um singleton. Slot opcional ausente: o pipeline espera.
           */
          readonly slot: string;
          /** Parte do slot (padrão: o buffer do pool, ou a view da textura). */
          readonly part?: 'live' | 'records' | 'instances';
          /** Descritor do Resource de um slot `singleton`. */
          readonly descriptor?: string;
      }
    | 'private';

/** Declaração de um recurso (o que `wgslResource` guarda). */
export interface WgslResourceDeclaration {
    /** Ligação. */
    readonly binding: WgslBindingKind;
    /** Tipo do dado (buffers). */
    readonly type?: WgslResourceType;
    /** Frequência (grupo). */
    readonly frequency: BindingFrequency;
    /** Fornecedor. */
    readonly provider: ResourceProvider;
}

/** Recurso de shader: um módulo WGSL sem fonte de função que declara uma variável ligada pelo motor. */
export interface WgslResource extends WgslModule {
    /** A declaração. */
    readonly resource: WgslResourceDeclaration;
}

/** Opções de `wgslResource`. */
export interface WgslResourceOptions extends WgslResourceDeclaration {
    /** Nome da variável WGSL (e do módulo). */
    readonly name: string;
}

/** Nomes de todos os recursos declarados (para acusar o uso de um recurso que o módulo não requer). */
const declaredNames = new Set<string>();

/** Nomes de variável de todos os recursos já declarados no processo. */
export function declaredResourceNames(): ReadonlySet<string> {
    return declaredNames;
}

/** O módulo é um recurso? */
export function isWgslResource(m: WgslModule): m is WgslResource {
    return (m as Partial<WgslResource>).resource !== undefined;
}

/**
 * Declara um recurso de shader (spec 031, R1): a variável `name` com a ligação, o tipo, a frequência e o fornecedor.
 * Quem usa o recurso o põe em `requires`; a montagem (`composeWgsl`) emite a linha `@group(g) @binding(b) var…` com os
 * números atribuídos pelo motor. Declarado uma vez e compartilhado por referência: duas declarações diferentes com o
 * mesmo nome no mesmo shader são `symbol-conflict`.
 */
export function wgslResource(options: WgslResourceOptions): WgslResource {
    const structs =
        options.type !== undefined && 'schema' in options.type ? [options.type.schema] : [];
    const base = wgslModule({ name: options.name, source: '', structs });
    const declaration: WgslResourceDeclaration = Object.freeze({
        binding: options.binding,
        ...(options.type !== undefined ? { type: options.type } : {}),
        frequency: options.frequency,
        provider: options.provider,
    });
    if (bufferKind(declaration.binding) && declaration.type === undefined) {
        throw new TypeError(`wgslResource('${options.name}'): buffer sem tipo`);
    }
    declaredNames.add(options.name);
    return Object.freeze({
        ...base,
        symbols: Object.freeze([{ name: options.name, kind: 'var' as const }]),
        resource: declaration,
    });
}

function bufferKind(b: WgslBindingKind): boolean {
    return 'storage' in b || 'uniform' in b;
}

/** Texto WGSL do tipo da variável. */
export function resourceTypeText(r: WgslResourceDeclaration): string {
    const b = r.binding;
    if ('sampler' in b) return b.sampler === 'comparison' ? 'sampler_comparison' : 'sampler';
    if ('texture' in b) {
        const dim = b.texture.dimension ?? '2d';
        if (b.texture.sample === 'depth') {
            return b.texture.multisampled === true
                ? `texture_depth_multisampled_${dim}`
                : `texture_depth_${dim}`;
        }
        return b.texture.multisampled === true
            ? `texture_multisampled_${dim}<${b.texture.sample}>`
            : `texture_${dim}<${b.texture.sample}>`;
    }
    if ('storageTexture' in b) {
        const dim = b.storageTexture.dimension ?? '2d';
        return `texture_storage_${dim}<${b.storageTexture.format}, ${b.storageTexture.access}>`;
    }
    const t = r.type!;
    const inner = 'schema' in t ? t.schema.wgslName : t.wgsl;
    return t.array === true ? `array<${inner}>` : inner;
}

/** A linha WGSL do recurso com os números atribuídos. */
export function resourceDeclarationLine(
    name: string,
    r: WgslResourceDeclaration,
    group: number,
    binding: number,
): string {
    const b = r.binding;
    const space = 'storage' in b ? `<storage, ${b.storage}>` : 'uniform' in b ? '<uniform>' : '';
    return `@group(${group}) @binding(${binding}) var${space} ${name}: ${resourceTypeText(r)};`;
}
