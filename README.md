# dsh-plugin-startup-auditor — Startup Auditor

Mide el uso de disco por carpeta y archivo en una ruta local, mostrando los mayores consumidores con profundidad y top configurables.

## Herramientas

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `audit` | Auditar inicio |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-startup-auditor` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-startup-auditor
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_DISK_MAP_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\startup-auditor\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
