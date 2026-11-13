# Modelo curto de handoff (comentar na Issue da tarefa)

```yaml
agent: CODEX | CLAUDE
session_alias: CODEX | CLAUDE-A | CLAUDE-B | CLAUDE-C
task: ISSUE-ID
status: claimed | in_progress | blocked | review | done
branch: BRANCH
commit: SHA
scope: [modulos_ou_arquivos]
changed_files: []
tests: [comando_e_resultado_verificado]
blockers: []
next_action: acao_concreta
updated_utc: YYYY-MM-DDTHH:mm:ssZ
```

Os aliases sao apenas identificadores operacionais, sem emails ou credenciais. Nao copie chats nem segredos. Ao retomar, confira estado Git e Issue novamente.
