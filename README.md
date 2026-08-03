# Packya Gestión Interna

Sistema administrativo interno para Packya.

## Módulos

- Dashboard
- Pedidos
- Clientes
- Productos
- Compras
- Stock

## Desarrollo local

1. Instalar dependencias:

```bash
npm install
```

2. Ejecutar en modo desarrollo:

```bash
npm run dev
```

3. Generar build de producción:

```bash
npm run build
```

4. Previsualizar build:

```bash
npm run preview
```

## Notas

- El branding visual usa el logo oficial en `public/logo-packya.png`.
- La arquitectura funcional se mantiene desacoplada por módulos de estado.

## Cloud Sync (etapa 1 hardening)

- Estrategia actual: local-first con cola de sincronizacion a nube.
- Entidades habilitadas para escritura cloud (estado actual): `orders`, `clients`, `quotes`, `purchases`, `manual_purchase_lists`, `products`, `suppliers`, `expenses`, `daily_panel_entries`.
- `DELETE` cloud para cliente: bloqueado por RLS.

## Protocolo de incidentes cloud

Estados operativos:

- `OK`: sin pendientes y ultimo sync correcto.
- `Sincronizando...`: cola en proceso.
- `Pendiente`: hay cambios en cola sin procesar.
- `Reintentando...`: hubo fallo y se esta reintentando.
- `Error requiere atencion`: hay error persistente.

Flujo de respuesta sugerido:

1. Abrir Base de Datos y revisar `Sync Health` (pendientes, ultimo intento, ultimo OK, error).
2. Ejecutar `Reintentar cola` una vez.
3. Ejecutar `Probar conexion nube`.
4. Verificar conectividad del equipo (internet estable).
5. Si persiste el error: conservar trabajo local, no reinstalar, escalar con detalle de `lastError` y entidad fallida.

## Smoke test de recuperacion (obligatorio para cierre 2.1.5)

1. Con app online, crear/editar al menos 1 pedido.
2. Desconectar internet.
3. Crear/editar otro pedido y confirmar que aumenta la cola pendiente.
4. Reconectar internet.
5. Ejecutar `Reintentar ahora` o `Reintentar cola`.
6. Validar que:
- la cola vuelve a 0,
- `Ultimo OK` se actualiza,
- no queda `lastError` persistente.
7. Verificar desde segundo dispositivo PROD que el pedido sincronizado aparece correctamente.

## Aplicacion manual de RLS (cierre Sprint A)

Si no hay CLI de Supabase enlazada en esta maquina, aplicar por SQL Editor:

1. Abrir Supabase Dashboard del proyecto PROD.
2. Ir a SQL Editor.
3. Ejecutar completo el script de [supabase/002_cloud_snapshots_rls_stage1.sql](supabase/002_cloud_snapshots_rls_stage1.sql).
4. Ejecutar esta verificacion:

```sql
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
	and tablename = 'cloud_snapshots'
order by policyname;
```

Resultado esperado:

- `cloud_snapshots_read_all` para `select`.
- `cloud_snapshots_insert_allowlist` para `insert` con allowlist de entidades operativas.
- `cloud_snapshots_update_allowlist` para `update` con allowlist de entidades operativas.
- Sin policy de `delete` para `anon/authenticated`.
