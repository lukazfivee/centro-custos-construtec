# Publicação preservando a Central

Esta camada acrescenta somente as rotas Chamados. O módulo compilado que já estava em produção é enviado sem alteração como `preserved-production.mjs`; sua classe `CentroCustosApi` e seus handlers continuam ativos.

A fonte local da Central não representa integralmente a imagem em produção. Por isso esta entrega não reconstrói nem substitui o container. A origem do módulo, seu SHA-256, o ID da versão e o digest da imagem são registrados junto da publicação.

Execute `build.cjs` com `--production-bundle`, `--expected-sha256` e `--outdir`. O comando verifica o hash antes de copiar o módulo e compila somente a integração. `CONSTRUTEC_ESBUILD_MODULES` pode apontar para uma instalação existente do esbuild.

A publicação envia os dois módulos pela API Workers, mantém os secrets existentes e os bindings da Central, e acrescenta apenas a configuração Chamados. Não executa operações de build ou atualização do Cloudflare Containers. O arquivo original e a configuração anterior permanecem no backup local para reversão.

Não use o Wrangler de uma cópia desatualizada da Central para publicar o container financeiro.
