# Contrato — Física rígida na GPU (C3)

## Publicação da pose (R7)

`LCPFlow` declara `poses = slot.entities({ all: [RigidBody, Transform], record: poseRecord, owns: [[Transform,
'transform']] })`. Kernel `rb_publish_pose` (fim do passo, um thread por registro):
`transforms[r.transformSlot].position/rotation = bodies[r.bodySlot].position/rotation`. Fase `physics` (antes de
`transform`). Saem: staging, `requestReadback`, `startReadback`, `applyTransformsFromReadback`.

## Broadphase (R9)

Por passo:

1. `rb_collider_proxies`: proxies de todos os pools de forma (esfera envolvente na pose predita + margem do passo);
   grandes (raio > célula/2) e planos → lista "sempre".
2. Grade hash: contagem por célula, `PrefixSum`, scatter (kernels da busca de vizinhança, variante hash).
3. `rb_candidate_pairs`: um thread por corpo, 27 células + lista "sempre"; pares com sobreposição → listas por forma;
   contadores → argumentos indiretos.

Por substep: `rb_narrowphase_{plane,box,sphere,mesh}_main` lendo `pairs[i]` (`workgroupsIndirect`). Solve inalterado.

Capacidade `N × maxPairsPerBody` (padrão 64); excedente contado; diagnóstico amostrado (≤ 1 leitura a cada 60 passos,
sem bloquear) com aviso único.

## Garantias (testadas)

- Conjunto de contatos por substep igual ao da narrowphase exaustiva (cenas de 1k e 10k corpos, ordenado por par e
  feature).
- Trajetórias das sete cenas bit a bit a 30/60/144 Hz.
- 0 leituras de pose por quadro; pose do quadro desenhada no mesmo quadro.
