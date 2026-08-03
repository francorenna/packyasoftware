# Packya Gestion - Registro de Sesiones

Este archivo es la bitacora operativa viva del proyecto.

Objetivo:
- Guardar un historial claro de lo que se hizo en cada sesion.
- Permitir retomar trabajo al dia siguiente sin perder contexto.
- Evitar confusiones con handoff antiguos.

Regla de uso (siempre):
1. Agregar una nueva entrada arriba de todo (mas reciente primero).
2. Incluir fecha, version, cambios, validaciones y pendientes.
3. Registrar ruta exacta del instalador generado cuando aplique.
4. No borrar historial anterior; solo corregir si hay error factual.

---

## Sesion - 2026-08-02 (prioridad operativa: pendientes y en proceso al frente)

Objetivo:
- Reforzar que el uso diario de Pedidos priorice creacion, pendientes y en proceso por sobre entregados.

Cambios aplicados:
1. `src/components/orders/OrdersList.jsx`
- Se reforzo la narrativa de la seccion `Produccion` como prioridad diaria.
- En `Modo foco` se separaron metricas operativas clave:
  - `Pendientes`
  - `En proceso`
  - `Atrasados (+2 dias)`
  - `Listos para salida`
  - `Entregados hoy` (secundario)
  - `Pedido mas antiguo` (dias en cola)
- En filas de produccion (`Pendiente` / `En Proceso`) se agrego badge de antiguedad por dias para identificar rapido que debe salir primero.
- Se agrego resaltado lateral por antiguedad en produccion (warning/critical).
2. `src/index.css`
- Estilos nuevos para tarjetas de foco primarias/secundarias/alerta.
- Estilos nuevos para badge de antiguedad en produccion y acento de filas atrasadas.

Validacion:
- `get_errors` sin errores en:
  - `src/components/orders/OrdersList.jsx`
  - `src/index.css`
- `npm.cmd run build` OK.

---

## Sesion - 2026-08-02 (listos mas visible + filtros operativos por salida)

Objetivo:
- Hacer que la seccion `Listos para entregar` sea claramente mas visible y agil para el trabajo diario.

Cambios aplicados:
1. `src/components/orders/OrdersList.jsx`
- Se agregaron señales operativas de urgencia para pedidos en estado `Listo`:
  - `Salida vencida`
  - `Salida hoy`
  - `Salida mañana`
  - `Salida proxima`
  - `Sin fecha de salida`
- Se incorporo chip visual por fila para mostrar prioridad de entrega.
- Se agrego acento lateral de color por fila segun urgencia para escaneo rapido.
2. `src/index.css`
- Se incorporaron estilos para la nueva franja de filtros de `Listos`.
- Se incorporaron estilos para botones activos/urgentes de filtros.
- Se incorporaron estilos de chips de urgencia y resaltado de filas.

Validacion:
- `get_errors` sin errores en:
  - `src/components/orders/OrdersList.jsx`
  - `src/index.css`
- `npm.cmd run build` OK.
- `npm.cmd run build:app` OK.
- Artefactos actualizados:
  - `release/Packya Gestión Setup 3.0.0.exe` (timestamp local 02/08/2026 21:58)
  - `release/Packya Gestión Setup 3.0.0.exe.blockmap` (timestamp local 02/08/2026 21:58)

Pendiente proximo:
- Validar en uso real con carga de trabajo de pedidos si conviene dejar filtro por defecto en `Vencidos/Hoy` para priorizacion automatica.

---

## Sesion - 2026-08-02 (modo foco pedidos + entregados mas practicos)

Objetivo:
- Mejorar experiencia operativa en Pedidos para hacerlo mas fino, rapido y sin saltos molestos de pantalla.

Cambios aplicados:
1. `src/components/orders/OrdersList.jsx`
- Nuevo `Modo foco` persistente (localStorage) para operar con vista compacta.
- Nueva franja rapida de control (Produccion, Listos, Cobranza, Entregados hoy) con accesos directos.
- `Entregados` ahora se ordena por fecha mas reciente.
- `Entregados` ahora carga en bloques (`Mostrar mas`) para evitar lista eterna.
- Accion rapida `Reabrir` para pedidos entregados (con confirmacion) para corregir errores humanos.
2. `src/index.css`
- Estilos para `Modo foco` y controles de paginado de entregados.

Validacion:
- `get_errors` sin errores en `OrdersList.jsx` e `index.css`.
- `npm.cmd run build` OK.
- `npm.cmd run build:app` OK.
- Artefactos actualizados:
  - `release/Packya Gestión Setup 3.0.0.exe` (mtime 2026-08-03T00:48:40.305Z)
  - `release/win-unpacked/Packya Gestión.exe` (timestamp local 02/08/2026 21:48)

---

## Sesion - 2026-08-02 (diagnostico completo + mejoras operativas pedidos)

Objetivo:
- Ejecutar validacion punta a punta y corregir fricciones de uso en Pedidos.

Cambios aplicados:
1. `src/components/orders/OrdersList.jsx`
- Se elimino el auto-scroll automatico a cobranzas criticas que hacia bajar la pantalla al entrar a Pedidos.
- Se ordena `Entregados` por fecha de entrega mas reciente primero.
- Se agrego paginado visual en `Entregados` (`Mostrar mas`) para evitar lista eterna.
- Se agrego accion rapida `Reabrir` en pedidos entregados (con confirmacion) para resolver errores humanos sin friccion.
2. `src/index.css`
- Estilos para bloque de carga incremental en `Entregados`.

Validacion ejecutada:
- `get_errors` global: sin errores.
- `npm.cmd run build`: OK.
- `npm.cmd run build:app`: OK.
- Artefactos actualizados:
  - `release/Packya Gestión Setup 3.0.0.exe` (timestamp 02/08/2026 21:38)
  - `release/win-unpacked/Packya Gestión.exe` (timestamp 02/08/2026 21:38)

Riesgos detectados (no bloqueantes):
- Bundle grande en frontend (warning Vite por chunks > 500 kB).
- Falta `author` y `description` en `package.json` (warning de electron-builder).

---

## Sesion - 2026-08-02 (panel diario inteligente + bienvenida premium)

Objetivo:
- Seguir vinculando operaciones sin bloquear flujo: que Panel Diario ayude a imputar cobros en pedidos y sumar señales visuales utiles para operar mas rapido.

Cambios aplicados:
1. `src/App.jsx`
- Se agrego `applyDailyPanelIncomeToOrderPayment` para imputar cobros del panel al pedido real.
- La imputacion usa `sourceType: daily-panel` para evitar bucles de sincronizacion.
- Se pasa callback a Panel Diario: `onApplyLinkedIncomeToOrder`.
2. `src/pages/DailyPanelPage.jsx`
- Nueva deteccion de cobros vinculados pendientes (`pendingLinkedIncomeMovements`).
- Nuevo flujo para aplicar cobros a deuda de pedidos con resumen final y observaciones.
- Al cerrar dia, si hay cobros pendientes vinculados, el sistema pregunta si se quieren aplicar antes del cierre (no bloquea, propone).
- Nueva tarjeta visual de `Distribución mensual por fondo` (ingresos/egresos) para lectura operativa rápida.
3. `src/layout/AppLayout.jsx`
- Se agrego splash de bienvenida de 5 segundos al abrir la app (`Bienvenido`) con isologo sobre esfera negra para presencia premium.
4. `src/index.css`
- Estilos del splash de bienvenida.
- Estilos para aviso de cobros pendientes y gráfico de distribución mensual.
5. `src/state/useOrdersState.js`
- Refuerzo de seguridad: validacion de deuda pendiente tambien dentro del commit de `registerPayment` para evitar sobreimputaciones en llamadas rapidas consecutivas.

Validacion:
- `get_errors` sin errores en:
  - `src/App.jsx`
  - `src/pages/DailyPanelPage.jsx`
  - `src/layout/AppLayout.jsx`
  - `src/index.css`
  - `src/state/useOrdersState.js`
- `npm.cmd run build` exitoso (Vite build OK).

Pendiente proximo:
- Completar un paso de `asistente de dudas` al editar movimientos (sugerencias contextuales por monto, cliente y deuda) para que el sistema pregunte cuando detecte ambigüedad.

---

## Sesion - 2026-08-02 (vinculacion operativa pedidos <-> panel diario)

Objetivo:
- Empezar a unir cobros de pedidos con el Panel Diario sin romper los flujos existentes.

Cambios aplicados:
1. `src/state/useOrdersState.js`
- Los pagos guardados ahora preservan metadatos de sincronizacion (`sourceType`, `sourceMovementId`, `linkedDailyPanelDateKey`).
- `registerPayment` y `registerClientPayment` emiten un callback opcional cuando se registra un cobro.
- Los pagos distribuidos de cliente usan un ID estable para poder deduplicarlos y enlazarlos con el panel.
2. `src/App.jsx`
- Se agrego un sincronizador que vuelca cada cobro de pedido al Panel Diario como ingreso ligado al pedido.
- El movimiento diario incluye `linkedOrderPaymentId` para evitar duplicados al reinyectar el mismo pago.
3. `src/state/useDailyPanelState.js`
- La normalizacion de movimientos ahora conserva `linkedOrderPaymentId` y `sourceType`.

Validacion:
- `get_errors` sobre `src/state/useOrdersState.js`, `src/App.jsx` y `src/state/useDailyPanelState.js`: sin errores.

Pendiente:
- Aun falta reflejar, del lado del Panel Diario, el alta manual de un ingreso vinculado hacia el estado del pedido cuando corresponda.

---

## Sesion - 2026-08-02 (unificacion estilo PDF en todo el sistema)

Objetivo:
- Extender el estilo de Orden de Trabajo al resto de PDFs del sistema (listas y reportes), respetando estructura especifica de cada documento.

Cambios aplicados:
1. `src/utils/reportsPdf.js`
- Se conecto el sistema corporativo compartido (`drawCorporateHeader` + `applyCorporateFooterToDocument`).
- Todos los reportes pasan a cerrar con footer corporativo unificado.
- Se centralizo guardado final en helper (`finalizeCorporatePdf`) para consistencia.
2. `src/utils/pdf.js`
- `generateClientStatementPDF` ahora aplica footer corporativo.
- `createPurchasePlanDoc` migro a header corporativo + footer corporativo.
- `generateManualPurchaseListPDF` migro a header corporativo + footer corporativo.

Alcance logrado:
- Orden de Trabajo (ya refinada), Presupuesto, Lista de Compra, Plan de Compra, Estado de Cuenta, Reportes de costos/deudas/stock/egresos/produccion e Informe mensual quedan alineados en identidad visual base.

Validacion:
- `get_errors` sobre `src/utils/reportsPdf.js` y `src/utils/pdf.js`: sin errores.

---

## Sesion - 2026-08-02 (refinamiento editorial final - jerarquia y consistencia)

Objetivo:
- Aplicar ajustes finales de direccion de arte sin cambios de arquitectura/layout/paginacion.

Cambios aplicados:
1. `Informacion de Pago`:
- Alias reforzado como dato principal en ambas cuentas.
- Distintivo visual `Cuenta recomendada` agregado en Cuenta Principal.
2. `Badge de estado`:
- simplificado a bloque cromatico + texto (sin icono), con color como identificador principal.
3. Subtitulo del documento:
- actualizado a `Documento interno de producción`.
4. Tabla de productos:
- ajuste leve de altura/respiracion de filas para mejorar lectura en escenarios largos, compensado para preservar paginacion.
5. Consistencia tipografica y espaciados:
- unificacion fina de pesos y separaciones en labels/valores para lectura editorial mas clara.

Validacion:
- Renderer sin errores.
- QA validado en salida alternativa por bloqueo de archivo abierto (`EBUSY`):
  - `release/qa-order-docs-polish-final-preview/qa-order-docs-report.json`
  - 1 producto -> 1 pagina
  - 35 productos -> 4 paginas

Nota operativa:
- Para publicar esta iteracion en `release/qa-order-docs-editorial-final`, cerrar el PDF abierto en Acrobat y ejecutar sincronizacion final de archivos.

---

## Sesion - 2026-08-02 (microfix extra - subir bloque titular/cuit)

Objetivo:
- Subir aun mas el bloque derecho de `Informacion de Pago` para evitar superposicion con la linea inferior y mejorar centrado vertical.

Cambios:
1. Se desplazaron hacia arriba `Titular`, nombre y `CUIT` en ambas tarjetas.
2. Se mantuvo incremento tipografico e interlineado para lectura mas clara.

Validacion:
- QA regenerado sin errores.
- 1 producto -> 1 pagina.
- 35 productos -> 4 paginas.

Publicacion:
- baseline actualizada en `release/qa-order-docs-editorial-final`.

---

## Sesion - 2026-08-02 (microfix final - interlineado y centrado titular)

Objetivo:
- Subir un poco mas el bloque `Titular/CUIT` en ambas tarjetas de pago y aumentar legibilidad.

Cambios:
1. Se ajusto verticalmente el bloque derecho para que quede mas centrado dentro de cada card.
2. Se incrementaron tamaños tipograficos en `Titular`, `CUIT` y sus valores.
3. Se amplio interlineado entre label y valor para evitar saturacion visual.

Validacion:
- QA regenerado sin errores.
- 1 producto -> 1 pagina.
- 35 productos -> 4 paginas.

Publicacion:
- `release/qa-order-docs-editorial-final` actualizado con esta iteracion.

---

## Sesion - 2026-08-02 (microfix tipografico - titular centrado en pago)

Objetivo de la sesion:
- Corregir alineacion vertical de `Titular` en ambas cuentas y reforzar legibilidad sin tocar estructura.

Ajustes aplicados:
1. `Titular` y `CUIT` del bloque derecho en ambas tarjetas:
- se subieron verticalmente para centrar mejor dentro del card,
- se aumentaron tamaños para mejorar lectura,
- se corrigio riesgo de quedar visualmente fuera del recuadro.
2. Se mantuvo alias como dato dominante y se sostuvieron los estilos de cuenta principal/alternativa.

Validacion:
- QA regenerado sin errores.
- `1 producto -> 1 pagina`.
- `35 productos -> 4 paginas`.

Publicacion:
- baseline sincronizada en `release/qa-order-docs-editorial-final`.

---

## Sesion - 2026-08-02 (microajuste final - pago, badge y cabecera productos)

Objetivo de la sesion:
- Aplicar ajustes visuales puntuales de direccion de arte sin tocar arquitectura, layout ni paginacion.

Ajustes aplicados:
1. `Informacion de Pago`:
- mayor jerarquia tipografica para `CUENTA PRINCIPAL` y `CUENTA ALTERNATIVA`,
- Alias reforzado como dato dominante,
- ambos recuadros con separacion visual clara,
- correccion de posiciones para evitar desborde de `Titular/CUIT` fuera del card.
2. `Productos`:
- el texto `Producto` en cabecera se desplazó hacia adentro para alejarlo del borde negro.
3. `Badge de estado`:
- se reemplazo el tono marron por paleta simple (verde/azul/amarillo segun estado),
- mayor padding y presencia visual.
4. `Watermark`:
- se mantiene con `watermark.svg` como sello de agua de fondo, centrado y de baja opacidad.

Validacion:
- QA regenerado en `release/qa-order-docs-polish-final`.
- Resultado: `1 producto -> 1 pagina` y `35 productos -> 4 paginas`, sin issues.

Publicacion:
- baseline sincronizada en `release/qa-order-docs-editorial-final`.

---

## Sesion - 2026-08-02 (direccion de arte final - jerarquia visual premium)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Refinar exclusivamente direccion de arte para reforzar percepcion profesional/premium sin cambios de arquitectura ni layout macro.

Cambios aplicados:
1. Badge de estado con mas padding, mejor centrado icono-texto y mayor presencia visual.
2. Mensaje de seña convertido en aviso institucional (micro-encabezado + cuerpo) con tono corporativo y sutil.
3. Bloque `Informacion de Pago` reforzado en jerarquia interna:
- Alias convertido en foco principal.
- Cuenta principal con mayor protagonismo visual.
- Titular y CUIT quedan en capa secundaria.
4. Watermark mantenido con `watermark.svg`, centrado, opacidad baja y sin intervenir el layout.
5. Cliente se mantiene limitado a dos lineas con elipsis para evitar quiebres de diseño.

Archivos actualizados:
- `src/utils/orderDocumentRefinedShared.js`

Validacion ejecutada:
1. `get_errors` sobre renderer -> sin errores.
2. QA completo (`node scripts/generate-order-qa-pdfs-polish-final.mjs`) -> sin issues estructurales.
3. Publicacion de artefactos en:
- `release/qa-order-docs-editorial-final/ORDER_QA_01.pdf`
- `release/qa-order-docs-editorial-final/ORDER_QA_35.pdf`
- `release/qa-order-docs-editorial-final/qa-order-docs-report.json`

Resultado validado:
- 1 producto -> 1 pagina.
- 35 productos -> 4 paginas.

---

## Sesion - 2026-08-02 (direccion de arte final - orden de trabajo)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Ejecutar refinamiento final de direccion de arte sin tocar header, footer, cards, tabla, layout general ni branding.

Cambios aplicados:
1. Titulo `ORDEN DE TRABAJO` movido al eje izquierdo para equilibrar visualmente con el logo.
2. Bloque de estado simplificado: se elimino el label y queda solo el badge corporativo.
3. Cliente: nombre limitado a maximo 2 lineas con elipsis para evitar quiebres de layout.
4. Encabezado de tabla: aumento sutil de padding vertical y mejor respiracion visual.
5. Columna `Total` corrida levemente hacia adentro para alejarla del borde del bloque negro.
6. Resumen economico: mayor protagonismo de `TOTAL A PAGAR` (escala y jerarquia visual).
7. Informacion de Pago: jerarquia interna redirigida para priorizar Alias por encima de Titular y CUIT.
8. Watermark: se reemplazo por `watermark.svg` centrado, atras del contenido y opacidad aproximada del 3%.
9. Observaciones: no genera pagina adicional cuando el bloque esta vacio y no entra en la pagina actual.
10. Correccion puntual de cierre para escenarios extensos: se preserva separacion editorial del bloque final y baseline de paginado pesado.

Archivos actualizados:
- `src/utils/orderDocumentRefinedShared.js`
- `src/utils/orderDocumentRefinedBrowser.js`
- `scripts/generate-order-qa-pdfs-polish-final.mjs`

Validacion ejecutada:
1. `get_errors` sobre archivos editados -> sin errores.
2. QA completo (`node scripts/generate-order-qa-pdfs-polish-final.mjs`) -> sin issues estructurales.
3. Publicacion en baseline final:
- `release/qa-order-docs-editorial-final/ORDER_QA_01.pdf`
- `release/qa-order-docs-editorial-final/ORDER_QA_35.pdf`
- `release/qa-order-docs-editorial-final/qa-order-docs-report.json`

Resultado validado:
- 1 producto -> 1 pagina.
- 35 productos -> 4 paginas.

---

## Sesion - 2026-08-02 (ultimo pulido editorial Orden de Trabajo)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Aplicar el ultimo pulido editorial de la Orden de Trabajo priorizando claridad, jerarquia y percepcion premium, sin tocar header, footer, layout macro ni estructura.

Cambios aplicados:
1. Se ajusto copy editorial en `src/utils/orderDocumentRefinedShared.js` sin cambios estructurales:
- subtitulo institucional bajo el titulo principal,
- etiqueta de estado (`Estado actual`),
- etiqueta de metadato (`Emision`),
- etiqueta financiera (`Total abonado`),
- mensaje institucional de seña mas directo,
- titulo de cierre (`Observaciones y notas`).

Validaciones ejecutadas:
1. `get_errors` sobre renderer -> sin errores.
2. QA completo con `node scripts/generate-order-qa-pdfs-polish-final.mjs` -> sin issues estructurales.
3. Publicacion de artefactos en `release/qa-order-docs-editorial-final` y normalizacion del reporte.

Resultado validado:
- `release/qa-order-docs-editorial-final/ORDER_QA_01.pdf` -> 1 pagina.
- `release/qa-order-docs-editorial-final/ORDER_QA_35.pdf` -> 4 paginas.
- `release/qa-order-docs-editorial-final/qa-order-docs-report.json` -> sin issues.

Conclusion tecnica:
- El documento gana claridad editorial y lectura premium sin alterar la arquitectura visual aprobada ni el comportamiento de paginado objetivo.

---

## Sesion - 2026-08-02 (cierre de jornada y punto exacto de reanudacion)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Estado exacto al cierre:
- La Orden de Trabajo ya tiene:
  - identidad visual corporativa aprobada,
  - Header y Footer aprobados,
  - estructura general aprobada,
  - motor de composicion optimizado,
  - contenido mas autoexplicativo para cliente,
  - tipografias Montserrat + Inter embebidas,
  - iconografia Tabler discreta integrada.

Baseline recomendada para retomar:
1. `release/qa-order-docs-editorial-final/ORDER_QA_01.pdf`
2. `release/qa-order-docs-editorial-final/ORDER_QA_35.pdf`

Validacion vigente considerada buena al cierre:
- `release/qa-order-docs-editorial-final/qa-order-docs-report.json`
- Resultado:
  - 1 producto -> 1 pagina
  - 35 productos -> 4 paginas
  - sin issues estructurales

Lo mas importante que NO hay que tocar manana salvo instruccion explicita:
1. Header.
2. Footer.
3. Layout macro.
4. Estructura general del documento.

Pendientes finos para manana:
1. Ajustar, si hace falta, claridad final del bloque `Informacion de Pago`.
2. Ajustar, si hace falta, respiracion y jerarquia de `Cliente` y `Pedido`.
3. Ajustar, si hace falta, protagonismo de `TOTAL A PAGAR`.
4. Ajustar, si hace falta, ritmo visual de filas de productos.
5. Elegir explicitamente la carpeta/final candidate definitiva entre:
- `release/qa-order-docs-editorial-final`
- `release/qa-order-docs-readability-v2`

Instruccion de reanudacion recomendada para el usuario:
- "Continuemos desde el cierre de 2026-08-02 en Packya. Tomá como baseline `release/qa-order-docs-editorial-final/ORDER_QA_01.pdf` y `release/qa-order-docs-editorial-final/ORDER_QA_35.pdf`. No toques header, footer, layout ni estructura. Quiero el último pulido editorial de la Orden de Trabajo, priorizando claridad, jerarquía y percepción premium, manteniendo `1 producto -> 1 página` y `35 productos -> 4 páginas`."

Observacion de cierre:
- El trabajo pendiente ya no es estructural ni tecnico de base; es pulido fino editorial.

---

## Sesion - 2026-08-02 (refinamiento editorial final)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Refinar exclusivamente jerarquias, espaciados, contrastes y tipografia para reforzar percepcion de empresa seria, organizada y moderna, sin cambiar estructura ni distribucion del documento.

Cambios aplicados:
1. Se ajusto la jerarquia tipografica en `src/utils/orderDocumentRefinedShared.js`:
- titulo principal con mayor peso,
- subtitulo y labels secundarios mas discretos,
- titles de bloque levemente mas editoriales.
2. Se refinaron contrastes y ritmo visual:
- badge de estado con paleta mas sobria segun tono,
- linea superior mas suave,
- cabecera de tabla levemente mas compacta,
- texto de filas y metadatos con menor ruido visual.
3. Se afino el bloque economico y de pago para lectura mas corporativa:
- `Saldo pendiente` y `TOTAL A PAGAR` como labels mas claros,
- detalles de cuentas mas sobrios,
- aviso institucional con presencia elegante y no invasiva.
4. Se mantuvo la compacidad del motor lograda en la etapa previa.

Validaciones ejecutadas:
- `get_errors` en renderer -> sin errores.
- QA focalizado: `release/qa-order-docs-editorial-final/qa-order-docs-report.json`.

Resultado validado:
- 1 producto -> 1 pagina.
- 35 productos -> 4 paginas.
- Sin issues estructurales.

Conclusion tecnica:
- El documento conserva eficiencia de composicion y mejora la percepcion editorial/corporativa sin agregar elementos ni alterar layout aprobado.

---

## Sesion - 2026-08-02 (refinamiento final de lectura para cliente)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Mejorar exclusivamente claridad de lectura y comprension del documento aprobado, sin tocar layout, distribucion, header ni footer.

Cambios aplicados:
1. Se redisenio el bloque de pago en `src/utils/orderDocumentRefinedShared.js` para mostrar con claridad en ambas cuentas:
- CUENTA PRINCIPAL / CUENTA ALTERNATIVA
- Alias
- Titular
- CUIT
2. Se agrego aviso institucional inmediatamente encima del bloque de pago:
- "La producción comenzará una vez confirmada la seña correspondiente."
3. Se renombraron labels clave:
- `Forma de pago` -> `Información de Pago`
- `Pendiente` -> `Saldo pendiente`
- `Total` -> `TOTAL A PAGAR`
4. Se agrego logica para mostrar automaticamente datos opcionales del cliente cuando existan:
- Empresa
- CUIT
- Responsable
5. Se consolidaron tres lineas suaves dentro de Observaciones para escritura manual.
6. Se mantuvo color automatico del badge de estado segun tono del pedido.
7. Se aplico micro-compactacion del contenido del cierre para preservar eficiencia del layout con el nuevo contenido textual.

Validaciones ejecutadas:
- `get_errors` en renderer -> sin errores.
- QA focalizado: `release/qa-order-docs-readability-v2/qa-order-docs-report.json`.

Resultado validado:
- 1 producto -> 1 pagina.
- 35 productos -> 4 paginas.
- Sin issues estructurales.

Conclusion tecnica:
- El documento queda mas autoexplicativo para envio directo a cliente sin perder el rendimiento de composicion recuperado en la fase previa.

---

## Sesion - 2026-08-02 (optimizacion final del motor de composicion)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Mantener la identidad visual aprobada y mejorar exclusivamente la eficiencia del layout para evitar saltos de pagina innecesarios.

Cambios aplicados:
1. Se corrigio el algoritmo de salto de pagina en `src/utils/orderDocumentRefinedShared.js`:
- las filas de productos ya no reservan por adelantado todo el cierre del documento,
- `Resumen economico`, `Forma de pago` y `Observaciones` ahora calculan espacio y page break por separado,
- el motor solo crea nueva pagina cuando el bloque puntual ya no entra.
2. El watermark quedo como capa visual de fondo sin participar del calculo de layout.
3. Se redujo levemente la altura de la cabecera de la tabla de productos.
4. Se mantuvo `Forma de pago` a ancho completo y `Footer` anclado al borde inferior.
5. Si `Observaciones` esta vacio, el bloque muestra lineas para escritura manual y no imprime texto placeholder.
6. Se aplico compactacion milimetrica de espaciados internos para recuperar espacio util sin cambiar el diseno aprobado.

Validaciones ejecutadas:
- `get_errors` en renderer -> sin errores.
- QA corto: `release/qa-order-docs-layoutfix-v2/qa-order-docs-report.json`.
- QA escenario pesado: `release/qa-order-docs-layoutfix-v2-35/qa-order-docs-report.json`.

Resultado validado:
- 1 producto -> 1 pagina.
- 5 productos -> 2 paginas.
- 10 productos -> 2 paginas.
- 20 productos -> 3 paginas.
- 35 productos -> 4 paginas.
- Sin issues estructurales.

Conclusion tecnica:
- El motor vuelve a priorizar aprovechamiento del espacio antes del salto de pagina.
- La identidad visual aprobada se conserva y el rendimiento de composicion mejora de forma significativa.

---

## Sesion - 2026-08-02 (fase final de refinamiento visual corporativo)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Refinar exclusivamente la capa visual del PDF aprobado para que se perciba como documento corporativo premium de PACKYA, sin tocar header/footer ni cambiar la estructura general.

Cambios aplicados:
1. Se fortalecio el bloque superior en `src/utils/orderDocumentRefinedShared.js`:
- `ORDEN DE TRABAJO` pasa a ser el elemento dominante,
- el estado se convierte en badge corporativo grande con fondo, padding, radio e icono.
2. Se transformaron `Cliente` y `Pedido` en fichas premium:
- tarjetas blancas con borde sutil,
- uso de iconografia Tabler discreta,
- jerarquia tipografica Montserrat + Inter.
3. La tabla de productos paso a foco visual central:
- titulo con icono,
- cabecera negra con texto blanco,
- filas mas limpias y sin lineado pesado.
4. Se reconstruyo el cierre visual:
- `Resumen economico` como tarjeta nativa con Total dominante,
- `Forma de pago` como dos tarjetas nativas de ancho completo (principal y alternativa),
- `Observaciones` como bloque final dedicado.
5. Se agrego watermark centrado de baja intensidad para sello de marca.
6. Se registraron y usaron obligatoriamente fuentes Montserrat + Inter embebidas en runtime y QA.
7. Se pasaron iconos SVG del sistema PACKYA al renderer refinado en browser y QA.

Archivos actualizados:
- `src/utils/orderDocumentRefinedShared.js`
- `src/utils/orderDocumentRefinedBrowser.js`
- `scripts/generate-order-qa-pdfs.mjs`
- `src/assets/componentesgraficos/Font/Inter-Regular.ttf`

Validaciones ejecutadas:
- `get_errors` en los tres archivos modificados -> sin errores.
- QA alternativo parcial en `release/qa-order-docs-polish-final2` -> genero 1, 5, 10 y 20 productos.
- QA aislado escenario pesado en `release/qa-order-docs-polish-35/qa-order-docs-report.json` -> sin issues estructurales.

Resultado validado:
- Escenario 35 productos: 10 paginas, sin issues estructurales.

Observacion:
- La fase final cumplio el objetivo de elevar jerarquia, presencia de marca y calidad editorial, pero incremento sensiblemente el paginado en escenarios largos.

---

## Sesion - 2026-08-02 (payment card ancho hoja + sello de marca)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Corregir la percepcion del bloque de forma de pago para evitar columna angosta y llevar el Payment Card a una presencia casi full-width al final del documento.

Cambios aplicados:
1. Se redisenio el bloque inferior en `src/utils/orderDocumentRefinedShared.js`:
- `Forma de pago` pasa a banda horizontal de gran ancho,
- `payment-card.svg` se renderiza casi a todo el ancho util,
- detalle de cuentas en dos columnas compactas,
- sello visual de marca `PACKYA` en baja intensidad al cierre.
2. Se mantuvo estilo minimalista con acentos institucionales y sin rellenos pesados.
3. Se ajustaron alturas del bloque final para controlar paginado tras ampliar el card.

Validaciones ejecutadas:
- `get_errors` en renderer -> sin errores.
- QA alternativo en carpeta nueva por archivos bloqueados:
  - `release/qa-order-docs-polish-v3/qa-order-docs-report.json`
- Sin issues estructurales en escenarios 1,5,10,20,35.

Resultado de paginado (v3):
- 1 producto -> 1 pagina.
- 5 productos -> 2 paginas.
- 10 productos -> 3 paginas.
- 20 productos -> 4 paginas.
- 35 productos -> 6 paginas.

Observacion:
- La nueva presencia visual del cierre incrementa consumo vertical y prioriza impacto de marca sobre compactacion.

---

## Sesion - 2026-08-02 (personalidad de marca PACKYA en renderer refinado)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Mantener minimalismo y legibilidad, pero elevar percepcion de calidad con identidad de marca PACKYA: tipografia correcta, jerarquia mas fuerte y recupero del Payment Card corporativo como sello visual.

Cambios aplicados:
1. Se incorporo Inter real al kit de fuentes:
- `src/assets/componentesgraficos/Font/Inter-Regular.ttf`.
2. Se actualizo `src/utils/orderDocumentRefinedBrowser.js` para embeder en PDF:
- Montserrat (normal/semibold/bold) + Inter (normal),
- y para inyectar `components/payment-card.svg` dentro del renderer refinado.
3. Se actualizo `scripts/generate-order-qa-pdfs.mjs` para QA fiel al runtime:
- embed de Inter,
- carga de `payment-card.svg` como asset disponible.
4. Se ajusto `src/utils/orderDocumentRefinedShared.js`:
- mayor protagonismo de titulo y estado,
- texto de lectura en Inter,
- recupero del Payment Card corporativo en bloque de pago,
- color institucional usado como acento (sin rellenos pesados) y composicion editorial limpia.

Validaciones ejecutadas:
- `get_errors` en archivos editados -> sin errores.
- QA alternativo en `release/qa-order-docs-polish` -> sin issues estructurales.
- Reporte: `release/qa-order-docs-polish/qa-order-docs-report.json`.

Resultado de paginado (qa-order-docs-polish):
- 1 producto -> 1 pagina.
- 5 productos -> 2 paginas.
- 10 productos -> 2 paginas.
- 20 productos -> 3 paginas.
- 35 productos -> 5 paginas.

Observacion:
- Se priorizo percepcion premium y coherencia de marca por sobre compactacion extrema del flujo.

---

## Sesion - 2026-08-01 (direccion editorial premium, sin agregar componentes)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Reorientar la composicion para lectura editorial corporativa (jerarquia y flujo visual), evitando look de formulario y sin introducir nuevos componentes, efectos ni colores.

Cambios aplicados:
1. Se ajusto `src/utils/orderDocumentRefinedShared.js` para priorizar la lectura vertical:
- Titulo principal con mayor protagonismo.
- Estado del pedido subido al bloque superior como prioridad visual inmediata.
- Bloque de cliente y bloque de pedido convertidos a composicion editorial sin cajas grandes.
2. Se simplifico la seccion de productos:
- Header de columnas minimalista (sin banda oscura),
- separadores finos,
- mas espacio en blanco entre filas.
3. Se simplificaron los bloques inferiores:
- `Resumen economico` y `Forma de pago` con titulos fuertes y lineas editoriales,
- remocion de tarjetas grises internas pesadas,
- misma informacion funcional y mismo branding.

Validaciones ejecutadas:
- `get_errors` en `src/utils/orderDocumentRefinedShared.js` -> sin errores.
- QA alternativo en `release/qa-order-docs-polish` -> sin issues estructurales.
- Reporte: `release/qa-order-docs-polish/qa-order-docs-report.json`.

Resultado de paginado (qa-order-docs-polish):
- 1 producto -> 1 pagina.
- 5 productos -> 2 paginas.
- 10 productos -> 2 paginas.
- 20 productos -> 3 paginas.
- 35 productos -> 5 paginas.

Observacion:
- La direccion editorial actual privilegia aire y legibilidad sobre compactacion maxima.

---

## Sesion - 2026-08-02 (polish premium renderer refinado, sin tocar header/footer)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Elevar calidad visual del PDF de Orden de Trabajo en la linea minimalista aprobada (estetica tipo Notion/Stripe/Linear/Vercel), preservando branding, header/footer, paleta, tipografia y direccion general.

Cambios aplicados:
1. Se actualizo `src/utils/orderDocumentRefinedShared.js` para una composicion mas premium sin volver al diseno anterior:
- sistema de tarjetas con borde suave (`#EAEAEA`), relleno limpio y radios mas refinados,
- jerarquia tipografica mas marcada en titulo y subtitulos,
- `overview` dividido en 2 cards: cliente y metadata de pedido (incluye estado y prioridad),
- header de tabla de productos oscuro con labels en blanco y separadores mas sutiles,
- bloque financiero con total destacado y estructura mas ejecutiva,
- bloque de pagos corporativo con dos sub-cards de cuentas y pie de contacto.
2. Se mantuvo intacto el uso de assets SVG de `Header.svg` y `Footer.svg`.
3. No se tocaron logos, paleta corporativa base ni contrato de datos operativo.

Validaciones ejecutadas:
- `get_errors` sobre `src/utils/orderDocumentRefinedShared.js` -> sin errores.
- `npm run qa:order-docs` en carpeta principal -> bloqueado por lock de archivo (`EBUSY` en `release/qa-order-docs/ORDER_QA_01.pdf`).
- Se ejecuto QA alternativo en `release/qa-order-docs-polish` para validar sin pisar el archivo bloqueado.
- Reporte generado: `release/qa-order-docs-polish/qa-order-docs-report.json`.

Resultado validado (qa-order-docs-polish):
- 1 producto -> 1 pagina.
- 5 productos -> 1 pagina.
- 10 productos -> 2 paginas.
- 20 productos -> 3 paginas.
- 35 productos -> 5 paginas.
- Sin issues estructurales en los cinco escenarios.

Observacion:
- El incremento visual premium aumenta altura util de bloques finales y en 35 productos empuja a 5 paginas (antes 4 en renderer refinado previo).

Pendiente inmediato:
1. Si se requiere sostener 35 en 4 paginas, ajustar micro-espaciados del bloque inferior manteniendo esta linea visual.
2. Re-ejecutar QA oficial en `release/qa-order-docs` cuando se libere el lock del PDF abierto.

---

## Sesion - 2026-08-01 (fase 1 corregir renderer sin tocar layout ni SVG)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Corregir el renderer para que respete `viewBox` y `preserveAspectRatio`, sin modificar SVG, layout ni tamaños de componentes.

Cambios aplicados:
1. Se creo `src/utils/svgAspectPlacement.js` para calcular colocacion de SVG dentro de su caja respetando:
- `viewBox`
- `preserveAspectRatio`
- alineacion interna del SVG
2. Se corrigio `src/utils/orderDocumentKitBrowser.js` para:
- rasterizar al tamaño real de render,
- insertar el asset en PDF sin deformarlo,
- dejar espacios sobrantes si la relacion de aspecto no coincide con la caja del layout.
3. Se corrigio `scripts/generate-order-qa-pdfs.mjs` con la misma logica de renderer para que QA mida el comportamiento real del sistema.
4. Se restauro `src/utils/orderDocumentKitEngine.js` para usar nuevamente:
- alturas reales declaradas en `layout.json`,
- `gapBetweenComponents` original,
- `minSpaceForFooter` original,
- sin compactado artificial ni reescalado de componentes.

Validacion ejecutada:
- `cmd.exe /c npm.cmd run qa:order-docs`.
- Reporte leido desde `release/qa-order-docs/qa-order-docs-report.json`.

Resultado validado:
- El renderer ya no deforma SVG para hacerlos entrar en la caja.
- El sistema vuelve a respetar layout y tamaños declarados.
- Con layout original:
  - 1 producto -> 2 paginas.
  - 5 productos -> 3 paginas.
  - 10 productos -> 3 paginas.
- No se detectaron issues estructurales en QA.

Conclusion tecnica:
- El defecto de deformacion quedo corregido en el renderer.
- El espacio insuficiente restante no es un problema del renderer sino del layout/sizing original del kit cuando se usa sin compactacion.

Pendiente natural:
1. Si direccion lo aprueba, abrir Fase 2 para revisar layout o tamano de componentes.
2. No tocar SVG hasta que esa decision este formalmente aprobada.

---

## Sesion - 2026-08-01 (optimizacion del algoritmo de composicion documental)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Optimizar el motor de layout del nuevo Kit Documental para aprovechar mejor el espacio vertical antes de tocar cualquier SVG.

Cambios aplicados:
1. Se compacto el layout engine en `src/utils/orderDocumentKitEngine.js` sin modificar assets SVG:
- alturas renderizadas mas bajas por componente,
- gaps verticales mas cortos,
- footer reserve reducido a valor realista,
- preservacion de `Totals + Payment` como bloque unido.
2. Se agregaron metricas de flow al debug del engine para medir el punto exacto del page break.
3. Se saneo la telemetria QA de bloques singleton por pagina (`header`, `document-info`, `client`, `totals`, `payment`, `footer`) para que la validacion refleje la composicion real.

Resultado validado:
- `ORDER_QA_01.pdf` ahora entra en 1 sola hoja A4.
- `ORDER_QA_05.pdf` ahora entra en 1 sola hoja A4.
- `ORDER_QA_10.pdf` queda en 2 hojas.
- `ORDER_QA_20.pdf` queda en 2 hojas.
- `ORDER_QA_35.pdf` queda en 3 hojas.

Validacion ejecutada:
- `npm.cmd run qa:order-docs` -> OK.
- Reporte persistido actualizado: `release/qa-order-docs/qa-order-docs-report.json`.
- Sin issues estructurales en los cinco escenarios.

Observacion:
- No se modifico ningun SVG.
- El problema confirmado estaba en el algoritmo de composicion, no en el diseno del kit.

---

## Sesion - 2026-08-01 (primer motor documental funcional con kit PACKYA)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Implementar el primer motor documental funcional de Orden de Trabajo usando el Kit Documental ya alineado al modelo real.

Cambios aplicados:
1. Se creo `src/utils/orderDocumentKitEngine.js` como compositor por bloques del documento:
- Header
- Document Info
- Client Card
- Products Header
- Product Row repetible
- Totals Card
- Payment Card
- Footer
2. Se creo `src/utils/orderDocumentKitBrowser.js` para adaptar el kit SVG al runtime browser mediante rasterizacion previa a `jsPDF.addImage`, sin tocar assets ni logica de negocio.
3. Se conecto `generateOrderPDF` en `src/utils/pdf.js` al nuevo motor documental, preservando el flujo funcional existente de generacion y descarga.
4. Se actualizo `scripts/generate-order-qa-pdfs.mjs` para validar escenarios de 1, 5, 10, 20 y 35 productos y persistir reporte estructural en `release/qa-order-docs/qa-order-docs-report.json`.
5. Se agrego la dependencia de soporte `@resvg/resvg-js` para rasterizacion de SVG en validacion QA Node.

Validaciones ejecutadas:
- `npm.cmd install @resvg/resvg-js --save-dev` -> OK.
- `npm.cmd run qa:order-docs` -> genera PDFs de 1, 5, 10, 20 y 35 productos.
- Reporte generado en `release/qa-order-docs/qa-order-docs-report.json`.
- Resultado del reporte:
  - 1 producto -> 2 paginas -> sin issues.
  - 5 productos -> 3 paginas -> sin issues.
  - 10 productos -> 3 paginas -> sin issues.
  - 20 productos -> 4 paginas -> sin issues.
  - 35 productos -> 6 paginas -> sin issues.

Archivos relevantes:
- src/utils/orderDocumentKitEngine.js
- src/utils/orderDocumentKitBrowser.js
- src/utils/pdf.js
- scripts/generate-order-qa-pdfs.mjs
- release/qa-order-docs/ORDER_QA_01.pdf
- release/qa-order-docs/ORDER_QA_05.pdf
- release/qa-order-docs/ORDER_QA_10.pdf
- release/qa-order-docs/ORDER_QA_20.pdf
- release/qa-order-docs/ORDER_QA_35.pdf
- release/qa-order-docs/qa-order-docs-report.json

Observacion abierta:
- Las dependencias externas remanentes del kit (referencias SVG/fuente Inter no embebida) quedan registradas como deuda tecnica de baja prioridad para fase posterior, sin bloquear este motor funcional.

Pendiente inmediato:
1. Si direccion lo aprueba, iniciar la siguiente migracion documental reutilizando el mismo motor (Presupuesto o Remito).
2. Recién despues abordar saneamiento de assets y optimizacion del kit.

---

## Sesion - 2026-08-01 (alineacion del kit documental al sistema real)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Convertir `src/assets/componentesgraficos` en un paquete mas autoconsistente y portable, alineado al modelo real de PACKYA sin tocar logica de negocio.

Cambios aplicados:
1. Se corrigio `src/assets/componentesgraficos/components.json` para usar claves reales documentadas del sistema:
- `order.id` en lugar de `order.number`
- `client.name` / `order.clientName` / `order.client` como fuentes reales de cliente
- `item.productName`, `item.quantity`, `item.unitPrice`, `item.isClientMaterial`, `item.itemCompleted`
- `order.shippingCost` en lugar de `order.shipping`
2. Se declararon como `null` los campos visuales del kit que hoy no tienen backing real persistido/documentado (`company`, `taxId`, `description`, `size`, `badge`, `subtotal` persistido).
3. Se agrego contrato para `payment-card` usando pagos reales del pedido y referencias a constantes corporativas (`TRANSFER_ACCOUNTS`, `PACKYA_PHONE_NUMBER`, `PACKYA_WEBSITE_URL`).
4. Se ajusto `src/assets/componentesgraficos/layout.json` para alinear margenes con el SSOT de marca y para apuntar `products-header` al archivo existente `components/products-table.svg`.
5. Se reescribio `src/assets/componentesgraficos/README.md` para dejar explicitado que el kit se adapta al sistema existente y que los calculos derivados deben resolverlos los renderers.

Validaciones ejecutadas:
- Parse JSON de `components.json` y `layout.json` -> OK.
- Verificacion de referencia interna de `products-table.svg` -> OK.
- `get_errors` sobre archivos del kit modificados -> OK.

Observacion abierta:
- Siguen existiendo dependencias materiales no resueltas dentro de algunos SVG/fuentes del kit original (por ejemplo referencias externas y ausencia local de Inter), pero no se modificaron porque la instruccion operativa fue no tocar SVG ni alterar identidad visual.

Pendiente inmediato:
1. Si se autoriza intervenir assets, cerrar dependencias externas del kit para dejarlo completamente autocontenido a nivel binario.
2. Iniciar implementacion del motor documental usando este contrato ya alineado.

---

## Sesion - 2026-08-01 (precheck kit documental antes de implementar motor)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Objetivo de la sesion:
- Auditar la nueva carpeta `src/assets/componentesgraficos` y validar si el kit esta completo antes de escribir codigo del nuevo motor documental.

Resultado:
- Implementacion detenida por carencias criticas en el kit y contratos SSOT incompletos/contradictorios.

Informe generado:
- KIT_DOCUMENTAL_PRECHECK_REPORT.md

Bloqueos principales detectados:
1. `layout.json` referencia `components/products-header.svg`, pero el archivo no existe.
2. SVG con referencias PNG externas no resueltas (`Header.png` y `../Marca Vector/Icono REDES 2.png`).
3. `components.json` no coincide con el modelo real de datos de pedidos/clientes/items.
4. No existe contrato de datos para `payment-card` en `components.json`.
5. No existe especificacion de anclajes de texto por campo para inyeccion dinamica sin inventar coordenadas.
6. Conflicto de margenes entre Brand System y `layout.json`.
7. Tokens declaran Inter pero no existe recurso tipografico Inter en el kit.

Validaciones ejecutadas:
- Relevamiento completo de SSOT: `PACKYA_SYSTEM_DOCUMENTATION.md`, `PACKYA_BRAND_SYSTEM.md`, `PACKYA_DOCUMENT_ARCHITECTURE.md`, `README.md`.
- Relevamiento de kit: `layout.json`, `components.json`, `tokens.json`, SVG, badges y fuentes.
- Confirmacion de faltantes por busqueda de archivos y referencias.

Pendiente inmediato:
1. Cerrar definiciones SSOT listadas en `KIT_DOCUMENTAL_PRECHECK_REPORT.md`.
2. Recien despues de eso iniciar implementacion del motor documental por bloques.

---

## Sesion - 2026-08-01 (documentacion integral del sistema)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se creo `PACKYA_SYSTEM_DOCUMENTATION.md` en raiz con relevamiento tecnico completo del estado actual del sistema.
2. El documento se redacto sin modificar codigo de negocio y usando solo campos/flujo existentes en el repositorio.
3. Se incluyo inventario total de documentos PDF activos (operativos y reportes), con origen de datos por documento.
4. Se incluyo modelo de datos real por dominio (pedidos, clientes, productos, compras, proveedores, presupuestos, egresos, listas manuales, planes y panel diario).
5. Se documento flujo operativo extremo a extremo y reglas automaticas/manuales.
6. Se agrego matriz `Campo | Documento | Origen del dato`.
7. Se listaron datos existentes que hoy no se imprimen y riesgos de consistencia operativa.
8. Se agrego mapa general del sistema para lectura ejecutiva.

Archivos involucrados:
- PACKYA_SYSTEM_DOCUMENTATION.md
- SESSION_LOG.md

Validaciones ejecutadas:
- Relevamiento cruzado de fuentes en `src/state/*.js`, `src/pages/*.jsx`, `src/utils/pdf.js` y `src/utils/reportsPdf.js`.
- No se aplicaron cambios funcionales ni estructurales en el codigo de la app.

Pendiente inmediato:
1. Revisar con direccion si desean agregar anexos por documento (ej. remito/comprobante de retiro cuando se implementen).
2. Definir si la matriz Campo-Documento-Origen debe versionarse por release en un historial separado.

---

## Sesion - 2026-08-01 (PACKYA Icon System con Tabler SVG)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se instalo `@tabler/icons` como fuente oficial de iconografia.
2. Se creo `src/assets/icons/` y se cargaron 30 iconos SVG oficiales de Tabler (outline), sin modificaciones manuales.
3. Se valido por script que todos los SVG del set mantienen `viewBox="0 0 24 24"` y `stroke-width="2"`.
4. Se creo helper reutilizable `src/utils/packyaIconSystem.js` para:
- obtener SVG raw,
- obtener Data URL SVG,
- renderizar iconos en documentos PDF via `doc.svg(...)` cuando este disponible.
5. Se creo `PACKYA_ICON_SYSTEM.md` como manual oficial de nombre/uso de iconos para Ordenes, Presupuestos, Remitos, Etiquetas, Facturas, Dashboard y documentos futuros.

Archivos involucrados:
- package.json
- src/assets/icons/*.svg
- src/utils/packyaIconSystem.js
- PACKYA_ICON_SYSTEM.md

Validaciones ejecutadas:
- chequeo automatizado de `24x24` y `stroke=2` -> OK.
- get_errors sobre archivos nuevos/actualizados -> OK.

Pendiente inmediato:
1. Migrar iconos ad-hoc existentes en componentes/PDFs al helper `packyaIconSystem`.
2. Estandarizar el uso de claves canonicas en los documentos de Fase 2.

## Sesion - 2026-08-01 (QA final Fase 1 + Golden PDF)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se ajusto el footer corporativo para respetar exactamente el SSOT documental:
- PACKYA logo
- WhatsApp
- Instagram
- Web
- Pagina X de Y
2. Se elimino cualquier elemento de footer que no pertenezca al PACKYA_BRAND_SYSTEM.md.
3. Se agrego un runner de QA documental automatizado para escenarios de 1, 10, 20 y 35 productos.
4. Se incorporo la referencia oficial Golden PDF:
- release/qa-order-docs/GOLDEN_ORDER.pdf
5. Se agrego comparacion visual automatizada basada en hashes de render de pagina para detectar diferencias inesperadas contra el Golden PDF.

Archivos involucrados:
- PACKYA_BRAND_SYSTEM.md
- src/utils/corporatePdfSystem.js
- scripts/generate-order-qa-pdfs.mjs
- package.json
- release/qa-order-docs/GOLDEN_ORDER.pdf
- release/qa-order-docs/ORDER_QA_01.pdf
- release/qa-order-docs/ORDER_QA_10.pdf
- release/qa-order-docs/ORDER_QA_20.pdf
- release/qa-order-docs/ORDER_QA_35.pdf

Validaciones ejecutadas:
- npm.cmd run qa:order-docs -> OK.
- get_errors sobre corporatePdfSystem, PACKYA_BRAND_SYSTEM, pdf renderer y QA runner -> OK.

Pendiente inmediato:
1. Usar GOLDEN_ORDER.pdf como baseline oficial cada vez que se toque el motor PDF.
2. Si hay cambio importante en layout, generar nueva version de Golden y volver a comparar antes de aprobar.

## Sesion - 2026-08-01 (Fase 1 Orden de Trabajo: refactor y validacion)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se corrigio el renderer de Orden de Trabajo para que procese todos los items y no recorte el detalle a los primeros 10.
2. Se agrego una preparacion canonica de filas paginadas para Orden de Trabajo.
3. Se normalizo el badge de estado a los estados oficiales del manual:
- En Diseño
- Aprobado
- En Producción
- Listo para Entrega
- Entregado
4. Se alineo el footer compartido al SSOT documental:
- WhatsApp
- Instagram
- Web
- Pagina X de Y
5. Se ajusto el bloque de transferencias de la orden para mostrar las cuentas de Mercado Pago con alias y titular correctos.

Archivos involucrados:
- src/utils/pdf.js
- src/utils/orderDocumentHelpers.js
- src/utils/corporatePdfSystem.js
- src/utils/orderDocumentHelpers.test.mjs

Validaciones ejecutadas:
- node --test src/utils/orderDocumentHelpers.test.mjs src/utils/corporatePdfLayout.test.mjs -> OK.
- get_errors sobre archivos tocados -> OK.

Pendiente inmediato:
1. Generar visualmente una orden real con 1 item, 10 items y 20+ items para revisar el salto de pagina y la continuidad del footer.
2. Si la vista real coincide con el SSOT, avanzar a Presupuesto como segunda pieza del sistema documental.

## Sesion - 2026-07-29 (cierre diario consolidado para continuidad exacta)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Estado cerrado del dia:
1. Se aprobo el manual de identidad documental y quedo formalizado como SSOT.
2. Se definio la arquitectura tecnica completa antes del refactor de codigo.
3. Quedo fijado el orden de implementacion:
- 1) Orden de Trabajo (documento modelo),
- 2) Presupuesto,
- 3) Remito.

Artefactos de referencia obligatoria para manana:
- PACKYA_BRAND_SYSTEM.md
- PACKYA_DOCUMENT_ARCHITECTURE.md
- SESSION_HANDOFF.txt

Regla operativa vigente:
- Todo cambio visual del sistema documental debe salir del SSOT y propagarse por componentes reutilizables.
- No se permite estilo local fuera del manual de marca documental.

Pendiente inmediato para la proxima sesion:
1. Iniciar Fase 1: refactor completo de Orden de Trabajo por componentes canonicos.
2. Validar en 1 item, 10 items y 20+ items con salto de pagina automatico.
3. Confirmar cumplimiento estricto de header, footer, tabla, estados y bloque de pagos segun manual.

---

## Sesion - 2026-07-29 (aprobacion SSOT + arquitectura tecnica pre-refactor)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se formalizo PACKYA_BRAND_SYSTEM.md como Single Source of Truth (SSOT) para toda la identidad visual documental.
2. Se creo PACKYA_DOCUMENT_ARCHITECTURE.md con la especificacion tecnica previa al refactor, incluyendo:
- arbol completo de componentes reutilizables,
- flujo de renderizado de datos a PDF final,
- contratos de datos por componente (required/optional/fallback),
- sistema de estilos centralizado por tokens,
- estrategia de escalabilidad para nuevos documentos sin duplicacion.

Archivos involucrados:
- PACKYA_BRAND_SYSTEM.md
- PACKYA_DOCUMENT_ARCHITECTURE.md

Validaciones ejecutadas:
- Actualizacion de SSOT en manual de marca -> OK.
- Generacion de arquitectura tecnica previa al codigo -> OK.

Pendiente inmediato:
1. Validacion final de la arquitectura por parte del usuario.
2. Iniciar Fase 1: refactor completo de Orden de Trabajo con componentes canonicos.

---

## Sesion - 2026-07-29 (manual de identidad documental corporativo)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se consolido el sistema de identidad documental en un unico manual maestro.
2. Se creo PACKYA_BRAND_SYSTEM.md con:
- tipografias oficiales (Montserrat + Inter),
- paleta oficial y auxiliares,
- reglas de grilla, margenes y espaciado,
- componentes reutilizables canonicos,
- estados visuales de orden con color + icono + texto,
- reglas de tabla dinamica con paginacion,
- blueprint de composicion para Presupuesto, Orden, Remito, Comprobante de Pago, Comprobante de Retiro y Etiquetas.

Archivo involucrado:
- PACKYA_BRAND_SYSTEM.md

Validaciones ejecutadas:
- Creacion del archivo maestro en raiz del workspace -> OK.

Pendiente inmediato:
1. Aprobar este manual como contrato visual definitivo.
2. Migrar el motor PDF por componentes reutilizables respetando este standard.

---

## Sesion - 2026-07-29 (sistema corporativo de PDFs activado)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Se incorporo un sistema corporativo compartido para documentos PDF de PACKYA.
2. El encabezado, pie de pagina, paleta de marca y numeracion de paginas quedaron centralizados en src/utils/corporatePdfSystem.js.
3. La generacion de ordenes y presupuestos ahora reutiliza este motor visual para mantener identidad consistente.
4. Se ajusto la orden de trabajo para que el encabezado y el pie se reproduzcan correctamente en todas las paginas del documento.
5. Se agrego soporte de paginacion para tablas largas de productos mediante src/utils/corporatePdfLayout.js.

Archivos involucrados:
- src/utils/pdf.js
- src/utils/corporatePdfSystem.js
- src/utils/corporatePdfLayout.js

Validaciones ejecutadas:
- get_errors sobre src/utils/pdf.js, src/utils/corporatePdfSystem.js y src/utils/corporatePdfLayout.js -> OK.

Pendiente inmediato:
1. Probar visualmente una orden real con productos largos para pulir espaciado y saltos de pagina.
2. Extender el mismo sistema a remitos, comprobantes y notas de credito.

---

## Sesion - 2026-07-28 (hotfix orden de trabajo 1 pagina)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Orden de trabajo PDF recompactada:
- Se simplifico el encabezado a fondo blanco con logo centrado y una linea decorativa CMYK.
- Se achico el bloque de datos inicial para liberar altura y evitar solapes.
- Se simplifico la composicion general para priorizar una sola pagina con aire visual.
- Archivo: src/utils/pdf.js

Validaciones ejecutadas:
- get_errors sobre src/utils/pdf.js -> OK.

Pendiente inmediato:
1. Reimprimir una orden real y confirmar que entra limpia en una sola pagina sin montes de texto.

---

## Sesion - 2026-07-28 (hotfix transferencia PDF)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Orden de trabajo PDF - transferencia bancaria simplificada:
- Se rehizo la seccion de transferencia para evitar montes de texto.
- Se paso a dos tarjetas compactas de cuenta con menos texto por bloque.
- Se simplifico el mensaje de ayuda y se mantuvo un footer unico de contacto/web.
- Archivo: src/utils/pdf.js

Validaciones ejecutadas:
- Lint puntual sobre src/utils/pdf.js -> OK.

Pendiente inmediato:
1. Volver a generar una orden real y confirmar visualmente que la transferencia ahora entra limpia en una sola pagina.

---

## Sesion - 2026-07-28 (hotfix PDF orden de trabajo)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Hotfix de la orden de trabajo PDF:
- Se reconstruyo el encabezado para evitar que el titulo, los chips y la marca se monten entre si.
- Se ajusto la tarjeta del logo para respetar mejor la proporción del SVG nuevo.
- Se aumento el alto util del encabezado y se movio el bloque informativo a una sola linea clara.
- Archivo: src/utils/pdf.js

Validaciones ejecutadas:
- Lint puntual sobre src/utils/pdf.js -> OK.

Pendiente inmediato:
1. Probar nuevamente la impresion de una orden real y revisar si el logo entra completo sin cortes.
2. Si queres, en el siguiente paso puedo simplificar todavia mas el encabezado para dejar solo logo + titulo + un chip por linea.

---

## Sesion - 2026-07-28 (branding total 3.0.0)

Version operativa:
- app/package: 3.0.0
- app config: 3.0.0

Cambios aplicados:
1. Reemplazo global de marca:
- Se reemplazo el logo viejo por el nuevo logo2.svg en Sidebar, Login, ordenes de trabajo y reportes PDF.
- Se centralizo la carga del logo en src/utils/brandLogo.js para reutilizar la misma fuente visual en toda la app.
- Se agrego src/assets/logo2.svg como asset de marca interno para Vite y PDF.

2. Orden de trabajo y PDFs:
- La orden de trabajo quedo con encabezado renovado usando el logo nuevo.
- Se ajustaron los PDFs de reportes para usar la nueva marca.

3. Versionado mayor:
- package.json version -> 3.0.0
- package.json buildVersion -> 3.0.0.0
- src/config/app.js version -> 3.0.0

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados/actualizados:
- release/Packya Gestion Setup 3.0.0.exe
- release/Packya Gestion Setup 3.0.0.__uninstaller.exe
- release/packya-gestion-interna-3.0.0-x64.nsis.7z
- release/latest.yml (version 3.0.0)

Pendiente inmediato:
1. Probar el instalador 3.0.0 en Windows y validar visualmente Sidebar, Login, Ordenes de trabajo y PDFs.
2. Si el icono de Windows necesita también la nueva marca horizontal, convertir logo2.svg a .ico en una siguiente pasada.

---

## Sesion - 2026-07-28 (rediseño inicial orden de trabajo + base de marca)

Version operativa:
- app/package: 2.2.3
- app config: 2.2.3

Diagnostico y contexto actualizado:
1. Cambios locales detectados al inicio de la sesion:
- SESSION_LOG.md
- package.json
- src/App.jsx
- src/config/app.js
- src/index.css
- src/pages/DailyPanelPage.jsx
- src/pages/ManualPurchaseListsPage.jsx
- src/pages/OrdersPage.jsx
- src/state/useDailyPanelState.js
- src/utils/reportsPdf.js

2. Puntos de marca revisados:
- El logo actual se reutiliza desde src/assets/logo.png en Sidebar, Login y PDF.
- El icono de Electron sale desde public/logo.ico.
- Tambien existen public/logo.png y src/assets/logo-packya.png como activos relacionados.
- La ventana principal de Electron ya quedó apuntando al logo.ico disponible en dev y en build.

Cambios aplicados:
1. Orden de trabajo PDF renovada:
- Se redisenio el encabezado con fondo oscuro, franja de acento y logo en caja blanca para mejor impacto visual.
- Se agregaron chips de informacion para pedido, estado y fecha de emision.
- Se ajusto el nombre de salida del archivo a Orden_Trabajo_*.pdf.
- Se incorporo el nuevo logo2.svg como marca principal de la orden de trabajo.
- Archivo: src/utils/pdf.js

2. Asset de marca nuevo:
- Se agrego src/assets/logo2.svg para usar el logo horizontal en el PDF y futuras piezas de marca.

3. Pantalla de Pedidos con imagen mas moderna:
- Se agrego una franja hero de marca con mensaje de renovacion visual.
- Se reforzo el copy de la pagina para comunicar mejor el nuevo formato al cliente.
- Se modernizaron las tarjetas del resumen de produccion.
- Archivos: src/pages/OrdersPage.jsx, src/index.css

Validaciones ejecutadas:
- npm.cmd run lint -- src/utils/pdf.js src/pages/OrdersPage.jsx src/index.css -> OK.
- npm.cmd run lint -- src/utils/pdf.js -> OK.

Pendiente inmediato:
1. Recibir los nuevos assets de marca en fondo claro/oscuro y el .ico final para reemplazar logo e icono en toda la app.
2. Si el cliente quiere que la orden de trabajo use una variante distinta del logo según fondo, dejar definidos los nombres exactos de los archivos para centralizar el cambio.

---

## Sesion - 2026-07-02 (definitivo 2.2.1 - validacion operativa ingresos/egresos)

## Sesion - 2026-07-08 (hotfix 2.2.3 - bucle popup Local/Nube + validacion cloud panel diario)

Version operativa:
- app/package: 2.2.3
- app config: 2.2.3

Cambios aplicados:
1. Fix critico de bucle en popup de diferencias Local/Nube:
- Se estabilizo la firma de diferencias para evitar re-disparo por timestamps variables.
- Se agrego ventana de snooze temporal tras accion del usuario para evitar encadenamiento de confirm dialogs.
- Archivo: src/App.jsx

2. Validacion cloud del Panel Diario:
- Confirmado en codigo: daily_panel_entries esta en allowlist de escritura y con hook de sincronizacion activo.
- Confirmado en Supabase con prueba real dirigida: lectura/escritura OK para entity daily_panel_entries.

3. Versionado y release:
- package.json version -> 2.2.3
- package.json buildVersion -> 2.2.3.0
- src/config/app.js version -> 2.2.3

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados/actualizados:
- release/Packya Gestión Setup 2.2.3.exe
- release/Packya Gestión Setup 2.2.3.exe.blockmap
- release/latest.yml (version 2.2.3)

Pendiente inmediato sugerido:
1. Instalar 2.2.3 y verificar que el popup de diferencias no quede en bucle al aceptar.
2. Probar flujo de Panel Diario con cambios en proveedores/ingresos, cerrar dia y corroborar consistencia en otro equipo (Local/Nube).

---

Version operativa:
- app/package: 2.2.1
- app config: 2.2.1

Cambios aplicados:
1. Panel Diario - calidad de datos obligatoria para informe mensual:
- Ingresos: si no se vinculan a pedido/cliente, ahora exige "Motivo sin vincular" para permitir cierre del día.
- Egresos de compra/proveedor: ahora exige proveedor informado para permitir cierre del día.

2. Proveedores desde Panel Diario:
- Se agregó campo "Proveedor" en egresos.
- Se agregó alta rápida "Guardar proveedor en base" sin salir del panel.
- Se integró el catálogo de proveedores en el flujo del movimiento diario.

3. Trazabilidad reforzada:
- Los movimientos sugeridos desde compras ya guardan proveedor en el registro del panel diario.
- Se mantiene consistencia para alimentar mejor el Informe Mensual Ejecutivo (secciones de trazabilidad y análisis CFO).

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados/actualizados:
- release/Packya Gestión Setup 2.2.1.exe
- release/Packya Gestión Setup 2.2.1.exe.blockmap
- release/latest.yml (version 2.2.1, size 102244438, hash actualizado)

---

## Sesion - 2026-07-02 (evolucion CFO informe ejecutivo 2.2.1)

Version operativa:
- app/package: 2.2.1
- app config: 2.2.1

Cambios aplicados:
1. Informe Mensual Ejecutivo orientado a decisiones (no solo descriptivo):
- Nueva seccion "Impacto de la Caja" con recorrido completo del efectivo: caja inicial, ingresos, egresos operativos, stock, retiros y caja final.
- Nuevo indicador "Caja potencial" para mostrar caja final sin retiros de socios.
- Nueva seccion "Impacto de los retiros de socios" (cuando existen) con monto y porcentajes sobre egresos/facturacion.
- Nueva explicacion automatica de "Rentabilidad vs Liquidez" para separar resultado contable de disponibilidad de caja.

2. Egresos, contexto y visualizacion:
- Nuevo grafico de composicion de egresos (stock, operativos, retiros, impuestos, inversiones).
- Se reforzo contexto en cada rubro (porcentaje sobre egresos y sobre facturacion).

3. Score y analitica inteligente:
- Packya Score ahora incluye desglose por factores (+/- puntos) para explicar el numero final.
- Nuevo bloque de "Analisis inteligente del periodo" con lectura contextual (stock/inversion/retiros/liquidez).

4. Reglas de calidad financiera solicitadas:
- Punto de equilibrio ahora es condicional: solo se muestra con costos fijos + margen de contribucion; si no hay datos, se oculta con mensaje explicito.
- Cobertura de stock ahora es condicional: si no hay base suficiente, muestra "Cobertura no disponible".

5. Nuevos KPIs para socios:
- "Dinero reinvertido en la empresa" (stock/facturacion).
- "Salida real de dinero" separada en funcionamiento, crecimiento y decisiones personales.
- Nueva pagina final "Informe para los socios" en lenguaje no tecnico, estilo gerente financiero.

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados/actualizados:
- release/Packya Gestión Setup 2.2.1.exe
- release/Packya Gestión Setup 2.2.1.exe.blockmap
- release/latest.yml (version 2.2.1, size 102241904, hash actualizado)

Pendiente inmediato sugerido:
1. Definir valores reales para costos fijos y margen de contribucion (ENV) para habilitar break-even riguroso.
2. Evaluar regla operativa para exigir proveedor en egresos de compra y cliente/pedido en ingresos para maximizar precision del informe.

---

## Sesion - 2026-07-02 (ajuste lectura PDF + trazabilidad 2.2.1)

Version operativa:
- app/package: 2.2.1
- app config: 2.2.1

Cambios aplicados:
1. Correccion de legibilidad del Informe Mensual Ejecutivo (PDF):
- Se corrigio el motor de tablas para que filas y encabezados ajusten multilinea sin montarse.
- Se corrigio ajuste de titulos y subtitulos para evitar cortes en anchos largos.
- Se corrigio ajuste de bullets (alertas/recomendaciones) para que no se salgan del cuadro de lectura.
- Se ajustaron anchos de columnas que excedian el ancho util de hoja (especialmente "Detalle diario del mes").
- Se reforzo paginado preventivo para evitar cortes de filas al final de pagina.

2. Mayor detalle de ingresos/egresos para precision BI:
- Ingresos: nuevo bloque de trazabilidad (vinculados a cliente/pedido vs sin vincular, monto y cantidad).
- Ingresos: top conceptos sin vinculo para limpieza operativa.
- Egresos: nuevo bloque de trazabilidad con proveedor identificado vs sin proveedor.
- Egresos: top proveedores y lista de conceptos sin proveedor para completar datos.

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados/actualizados:
- release/Packya Gestión Setup 2.2.1.exe
- release/Packya Gestión Setup 2.2.1.exe.blockmap
- release/latest.yml (version 2.2.1, size 102240856, hash actualizado)

Pendiente inmediato sugerido:
1. Revisar con datos reales que los bloques "sin vincular" queden en cero o claramente justificados.
2. Definir politica operativa: si todo egreso de compra debe exigir proveedor obligatorio al registrar.

---

## Sesion - 2026-07-02 (upgrade informe ejecutivo 2.2.1)

Version operativa:
- app/package: 2.2.1
- app config: 2.2.1

Cambios aplicados:
1. Informe Mensual Ejecutivo - analitica de direccion completada en Panel Diario:
- Comparacion contra mes anterior: facturacion, egresos, resultado, produccion y pedidos.
- KPIs ejecutivos: ticket promedio, facturacion por dia trabajado, produccion promedio, margen neto.
- Produccion: total, promedio, dia pico, dia bajo, evolucion semanal, horas y uso de capacidad (si hay dato).
- Clientes: unicos, nuevos, recurrentes, top 10, share top 5, aumentaron, dejaron de comprar e inactivos.
- Finanzas: clasificacion de egresos por tipo (operativo, stock, inversion, retiros, impuestos).
- Stock inteligente: deteccion de compras especiales y cobertura estimada.
- Caja y flujo: max/min/promedio, dias bajo minimo y saldo acumulado diario.
- Alertas y recomendaciones automaticas, Packya Score, break-even, historico 12 meses y "dato del mes".

2. Informe Mensual Ejecutivo - PDF ampliado (multi-seccion):
- Seccion "El dato del mes" al inicio.
- Tabla de comparacion mensual para lectura en 2 minutos.
- Bloques de KPIs de direccion, produccion/capacidad, clientes, finanzas por tipo, stock/break-even, caja/flujo, alertas y recomendaciones.
- Historico de 12 meses integrado en el mismo reporte.
- Se mantuvieron tablas operativas (top egresos y detalle diario) para auditoria de soporte.

3. Ajuste tecnico de calidad:
- Corregida advertencia de inmutabilidad en calculo de flujo acumulado mensual.

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados/actualizados:
- release/Packya Gestión Setup 2.2.1.exe
- release/Packya Gestión Setup 2.2.1.exe.blockmap
- release/latest.yml (version 2.2.1, hash y size actualizados)

Pendiente inmediato sugerido:
1. Validar con datos reales de un mes completo la legibilidad del PDF ejecutivo en reunion de direccion (tiempo objetivo: <2 minutos).
2. Confirmar con gerencia si el orden de secciones del reporte coincide con su rutina de lectura (comercial -> finanzas -> operacion).

---

## Sesion - 2026-07-02 (release 2.2.1)

Version operativa:
- app/package: 2.2.1
- app config: 2.2.1

Cambios aplicados:
1. Versionado a 2.2.1:
- package.json version: 2.2.1
- package.json buildVersion: 2.2.1.0
- src/config/app.js version: 2.2.1

2. Instalador Windows generado para pruebas:
- Build NSIS completado para validar fixes de "Ver necesidades" y lista de compra.
- latest.yml actualizado a 2.2.1.

3. Panel Diario - mejoras de vinculacion y rotulado en movimientos:
- Ingresos: cuando se marca "Vinculado a pedido", aparece buscador de cliente/pedido para vincular rapido.
- Ingresos: se muestra deuda actual del cliente vinculado para contexto de cobranza.
- Ingresos y egresos: cada movimiento ahora muestra un titulo destacado para identificar rapido de que se trata el monto.
- Egresos: el rotulo queda visible por concepto/categoria para lectura operativa mas clara.
- Ajuste visual operativo: se priorizo el nombre del cliente por encima del numero de pedido (que sigue visible como identificador unico secundario).

Validaciones ejecutadas:
- npm.cmd run lint -> OK.
- npm.cmd run build:app -> OK.

Artefactos generados:
- release/Packya Gestión Setup 2.2.1.exe
- release/Packya Gestión Setup 2.2.1.exe.blockmap
- release/latest.yml (version 2.2.1)

Pendiente inmediato:
1. Instalar 2.2.1 y probar flujo completo: Pedidos -> Ver necesidades -> Crear/editar lista -> asignar proveedor -> Convertir en compra.
2. Probar Panel Diario: crear ingreso vinculado a pedido con buscador y verificar que el titulo + deuda del cliente se vea correctamente al compactar/cerrar.

Rebuild de instalador en la misma version (2.2.1) para retesteo:
- release/Packya Gestión Setup 2.2.1.exe regenerado luego de ajustes visuales cliente-first en Panel Diario.
- release/latest.yml regenerado y consistente con hash/tamano del setup actual.

---

## Sesion - 2026-07-02

Version operativa:
- app/package: 2.2.0
- app config: 2.2.0

Cambios aplicados:
1. Pedidos -> Ver necesidades -> Lista de compra (estabilidad UX):
- Se evito cierre accidental del modal durante edicion de la lista borrador.
- Si hay borrador en curso y se intenta cerrar, ahora pide confirmacion antes de descartar.
- Se mejoro manejo de error al guardar lista desde necesidades: ahora muestra alerta clara en vez de fallo silencioso.

2. Listas de compra (flujo guardar/convertir):
- Se elimino cierre silencioso del modal cuando guardar falla (crear/editar).
- Ahora se valida el resultado real de guardado y, si falla, el modal queda abierto mostrando error.
- Se agrego mensaje visible de accion para conversion a compra (ok/error) en la vista principal.
- Si al convertir faltan proveedor o productos vinculados, se abre automaticamente la edicion de la lista para corregir.

Validaciones ejecutadas:
- get_errors sobre archivos modificados -> sin errores.
- npm.cmd run lint -> OK.

Archivos clave tocados en esta sesion:
- src/pages/OrdersPage.jsx
- src/pages/ManualPurchaseListsPage.jsx
- SESSION_LOG.md

Pendiente inmediato sugerido:
1. Probar en operacion real un caso de necesidad con lista grande y convertir a compra con proveedor asignado para confirmar flujo extremo a extremo.

---

## Sesion - 2026-05-31 (release 2.2.0)

Version operativa:

Cambios aplicados:
1. Versionado a 2.2.0:

2. Instalador Windows generado:

Validaciones ejecutadas:
- release/Packya Gestión Setup 2.2.0.exe.blockmap
- release/latest.yml (version 2.2.0)
1. Instalar 2.2.0 y validar flujo completo del panel diario (contador automatico de pedidos Listo/cajas impresas).


Version operativa:
- app/package: 2.1.9
- app config: 2.1.9
3. Generar "Imprimir informe mensual" en un mes con datos reales y validar lectura ejecutiva con gerencia (clientes top, responsables, fondos y alertas).

4. Panel Diario - salto de informe mensual ejecutivo en PDF:
- Se reemplazo el flujo de "Imprimir informe mensual" por generacion de PDF analitico.
- El PDF ahora incluye:
  - KPIs ejecutivos del mes (ingresos, egresos, neto, apertura/cierre, dias cerrados/diferencias).
  - Senales clave/riesgos operativos detectados automaticamente.
  - Curva semanal de caja neta (grafico visual).
  - Top clientes por aportes/cobros.
  - Distribucion por fondo/cuenta (donde entra y sale la plata).
  - Responsables de egresos (Franco/Damian) y categorias de gasto.
  - Top egresos para control de fuga.
  - Dias de mayor actividad operativa.
  - Detalle diario completo del mes.

5. Panel Diario - refuerzo visual cliente/monto:
- Se resalto el nombre del cliente en ingresos vinculados (estilo destacado).
- Se reforzo visual del monto en cada movimiento para lectura inmediata.
- Se mantuvo el pedido como identificador unico secundario visible.

6. Rebuild final 2.2.1 para pruebas de informe mensual ejecutivo:
- release/Packya Gestión Setup 2.2.1.exe regenerado con los cambios de PDF mensual + UI cliente/monto.
- release/latest.yml actualizado y consistente con hash/tamano del setup final.

Cambios aplicados:
1. Orden de Pedido PDF - limpieza visual sin QR:
- Se eliminaron los QR de la seccion de transferencia.
- Se mantuvo un bloque textual claro con datos de transferencia.
- Se agrego contacto y web en formato informativo en texto.
- Se redujo espacio reservado inferior para favorecer una sola pagina.

2. Presupuesto PDF - consistencia sin QR:
- Se removio el bloque QR de transferencia para alinear criterio visual.
- Se reemplazo por bloque textual con alias, contacto y web.

3. Panel Diario - contador automatico por estado Listo:
- Se agrego readyAt en pedidos para registrar cuando un pedido pasa a estado Listo.
- El panel diario ahora calcula automaticamente pedidos listos y cajas impresas del dia (Listo + Entregado) usando readyAt.
- Se agregaron columnas en el informe mensual diario: "Pedidos listos" y "Cajas impresas (listo)".
- Se mantuvo tambien el campo manual de cajas impresas para carga administrativa si hace falta.

Validaciones ejecutadas:
- eslint sobre src/utils/pdf.js -> sin errores.
- npm.cmd run lint -> OK.

Archivos clave tocados en esta sesion:
- src/utils/pdf.js
- src/pages/DailyPanelPage.jsx
- src/state/useOrdersState.js
- src/utils/cloudSync.js
- SESSION_LOG.md

Pendientes sugeridos para proxima sesion:
1. Validar en casos reales de pedidos largos que el PDF siga quedando en 1 pagina.
2. Confirmar si en Presupuesto tambien quieren mostrar titulares y CUIL completos como en Orden.

---

## Sesion - 2026-05-28

Version operativa:
- app/package: 2.1.9
- app config: 2.1.9

Cambios aplicados:
1. Correccion urgente de PDF de orden de trabajo:
- Se elimino completamente el QR de cobro de Mercado Pago.
- Se agrego bloque destacado de Transferencia bancaria sin costos adicionales.
- Se incluyeron cuentas:
  - Alias packya (Franco Renna)
  - Alias packya2 (Damian Vanin)
- Se agrego mensaje de envio de comprobante para imputacion.

2. Mejora de PDF para conversion operativa:
- Se compacto el layout de la orden para priorizar 1 pagina.
- Se ajustaron alturas, tipografia y espacios en cabecera, detalle y resumen.
- Se aplico logica de compactacion de items cuando el documento se desborda.

3. QR y presencia comercial:
- QR de contacto: https://wa.me/5492614177745
- QR de perfil Google: https://share.google/dOPh73HBCfmacJzL3
- Sitio visible en bloque de transferencia: https://www.packya.com.ar

4. Higiene tecnica:
- Lint corregido en useAuthState y DailyPanelPage.
- Sin errores de lint al cierre.

5. Versionado:
- package.json version: 2.1.9
- package.json buildVersion: 2.1.9.0
- src/config/app.js version: 2.1.9

Validaciones ejecutadas:
- npm.cmd run lint -> OK
- npm.cmd run build -> OK
- npm.cmd run build:app:prod -> OK

Artefactos generados:
- release_prod/Packya Gestion PROD Setup 2.1.9.exe
- release_prod/Packya Gestion PROD Setup 2.1.9.exe.blockmap
- release_prod/latest.yml (version 2.1.9)

Archivos clave tocados en esta sesion:
- src/utils/pdf.js
- src/hooks/useAuthState.js
- src/pages/DailyPanelPage.jsx
- src/config/app.js
- package.json

Pendientes sugeridos para proxima sesion:
1. Probar ordenes con distintos volumenes de items para validar legibilidad en 1 pagina.
2. Verificar en campo que clientes usen transferencia y no intenten cobro por QR comercial.
3. Evaluar version estricta de 1 pagina con limite fijo de items visibles.
4. Si se confirma estable, generar build TEST 2.1.9 para QA paralelo.

Como retomar rapido manana:
1. Leer este archivo primero (entrada mas reciente).
2. Verificar version activa en package.json y src/config/app.js.
3. Validar instalador vigente en release_prod y latest.yml.
4. Ejecutar smoke rapido: lint + build + exportar una orden PDF de prueba.
