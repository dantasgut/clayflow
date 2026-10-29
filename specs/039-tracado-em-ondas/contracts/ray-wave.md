# Contrato — a onda de raios e o material nos acertos

## Para quem traça (consumidores: GI, cáusticas, refração)

Cada rodada de um consumidor é codificada pela CPU, num número fixo de rodadas (R6):

```text
avanço+traçado(consumidor)   → grava RayHitRecord e conta por classe        [indireto pelos vivos]
separação (RayWave)          → offsets, order, args por classe              [1 grupo + espalhamento]
material(classe k), k = 0..M → grava RayHitSurface no índice do registro    [indireto por classe]
```

A continuação da rodada r roda no avanço da rodada r + 1, ou no kernel final do consumidor.

**Regras (WGSL):**

- Os kernels de avanço, de traçado e de continuação NÃO PODEM chamar função de material. O teste de composição falha se o código gerado contiver `material_fn_`.
- O registro i e a superfície i são do mesmo acerto. O consumidor lê a superfície por `closure_unpack(ray_wave_surfaces[i])`.
- Todo laço tem teto total: o da BVH, o de luzes e o dos acertos enumerados da câmera.
- O número de rodadas é o orçamento atual do consumidor (R6). O que resta vivo depois da última rodada conta como truncado, como hoje no limite de interfaces.

## Kernel de material (gerado, um por classe)

```wgsl
@compute @workgroup_size(WORKGROUP_SIZE)
fn hit_shade_<hash>_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    // k = índice linear; fora da faixa da classe: retorna
    // r = ray_wave_hits[ray_wave_order[ray_wave_offsets[CLASS] + k]]
    // s = SurfaceSample do registro (uv density pela geometria da estrutura de raios)
    // c = material_fn_<hash>(s, m, material_fn_params_<hash>(r.slot))   — ou closure_from_params(...)
    // ray_wave_surfaces[índice] = closure_pack(closure_sanitize(c))
}
```

- **Sem laço.** Cada kernel contém exatamente uma função de material.
- **Fixos:** as constantes de malha (classe 0; a classe é uniforme, para servir de substituto de uma classe ainda não pronta) e os volumes (classe N + 1).

## Para o Flow que publica (RayHitShadingFlow)

- **Escuta:** `RayScene.materialRevision`.
- **Declara:** um pipeline por módulo `composite`, assíncrono.
- **Publica:** em `RayHitShading.kernels`, por classe, o pipeline e se está pronto. Emite `rayHitShadingChanged`.
- **Classe não pronta:** o consumidor despacha o fallback (as constantes) sobre a faixa dela.

## Remoções

O seguinte sai do motor no fim da spec (FR-007):

- `composeHitMaterial`;
- `rayHitMaterialPoint`;
- `ray_hit_material_ready.wgsl`;
- `ray_hit_closure`, `refraction_hit_closure` e `ray_volume_closure`;
- os testes que conferiam o `switch`.
