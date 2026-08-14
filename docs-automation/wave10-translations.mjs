/**
 * Wave 10 documentation translations — orders modals, inventory & HR chapters, admin form fields.
 * Consumed by generate-wave10-locales.mjs
 * @type {Record<string, Record<string, { title?: string, intro?: string, sections: Record<string, { title: string, intro?: string, steps: string[], caption: string, fields?: { name: string, effect: string }[] }> }>>}
 */
export const WAVE10_T = {
  es: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Pestaña Conciliación",
          steps: [
            "Abra Inventario y la pestaña Conciliación de cocina.",
            "Seleccione ubicación de inventario y fecha operativa.",
            "Haga clic en Generar para crear líneas de uso teórico.",
            "Ingrese cantidades reales en la cuadrícula o importe CSV.",
            "Guarde borrador, revise variaciones y Verifique (PIN de gerente si aplica)."
          ],
          caption: "Barra de herramientas, cuadrícula y panel de variaciones.",
          intro: "Genere una cuadrícula desde ventas POS y recetas, luego ingrese o importe conteos reales.",
          fields: [
            {
              name: "Ubicación",
              effect: "Cocina o almacén cuyo stock se concilia."
            },
            {
              name: "Fecha operativa",
              effect: "Día comercial al que aplican uso teórico y conteos."
            },
            {
              name: "Generar",
              effect: "Crea o actualiza líneas desde ventas y recetas."
            },
            {
              name: "Cantidad real",
              effect: "Conteo físico por ítem; determina la variación."
            },
            {
              name: "Verificar",
              effect: "Bloquea la conciliación tras aprobación gerencial."
            }
          ]
        },
        "reconciliation-form": {
          title: "Entrada manual de conteos",
          steps: [
            "Haga clic en una celda de la columna Real para escribir un conteo.",
            "Use Guardar borrador para persistir sin verificar.",
            "Abra importación CSV para cargar conteos masivamente.",
            "Revise el panel de variaciones antes de verificar."
          ],
          caption: "Cuadrícula con edición de cantidad real.",
          intro: "Edición en cuadrícula e importación CSV comparten la misma estructura de líneas.",
          fields: [
            {
              name: "Ítem",
              effect: "Artículo de inventario en la línea."
            },
            {
              name: "Teórico",
              effect: "Uso calculado por el sistema desde recetas y ventas."
            },
            {
              name: "Real",
              effect: "Cantidad contada o de uso que usted ingresa."
            },
            {
              name: "Variación",
              effect: "Diferencia entre real y teórico; destaca merma o errores."
            },
            {
              name: "Notas",
              effect: "Explicación opcional guardada en la línea."
            }
          ]
        }
      },
      title: "Conciliación de cocina",
      intro: "Compare el uso teórico de cocina (ventas y recetas) con conteos físicos por ubicación y fecha operativa. Borradores, verificación y bloqueo para precisión de inventario."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Lista de recetas",
          steps: [
            "Abra Inventario → Recetas.",
            "Explore recetas activas con tamaño de lote e ítems de salida.",
            "Agregue o edite recetas para preparación y costeo."
          ],
          caption: "Pestaña de mantenimiento de recetas."
        },
        "recipe-form": {
          title: "Formulario de receta",
          steps: [
            "Haga clic en Agregar receta o edite una fila.",
            "Ingrese nombre, código y cantidad base del lote.",
            "Agregue líneas de insumo con ítem y cantidad.",
            "Agregue líneas de salida con % rendimiento, disposición y bandera principal.",
            "Guarde para usar la receta en lotes de producción."
          ],
          caption: "Formulario de receta con insumos y salidas.",
          intro: "Define insumos, rendimientos de salida y asignación de costo entre salidas.",
          fields: [
            {
              name: "Nombre",
              effect: "Nombre mostrado en producción e informes."
            },
            {
              name: "Código",
              effect: "Código corto opcional para cocina."
            },
            {
              name: "Cant. base del lote",
              effect: "Tamaño estándar para escalar ingredientes."
            },
            {
              name: "Asignación de costo",
              effect: "Método para repartir costo de insumos entre salidas."
            },
            {
              name: "Ítems de insumo",
              effect: "Artículos y cantidades consumidas por lote."
            },
            {
              name: "Ítems de salida",
              effect: "Productos con % rendimiento y salida principal."
            },
            {
              name: "Está activa",
              effect: "Recetas inactivas no aparecen en nuevos lotes."
            }
          ]
        },
        production: {
          title: "Ejecuciones de producción",
          steps: [
            "Abra la pestaña Producción.",
            "Inicie un lote nuevo desde una receta activa.",
            "Previsualice ingredientes escalados y complete para registrar movimientos."
          ],
          caption: "Pestaña Producción con lista de lotes."
        },
        "production-form": {
          title: "Formulario de lote de producción",
          steps: [
            "Haga clic en Nueva producción.",
            "Seleccione receta, ubicación y cantidad producida.",
            "Revise la vista previa de insumos y salidas escalados.",
            "Opcionalmente actualice costo de ítem desde el lote.",
            "Complete para registrar el lote y escribir historial."
          ],
          caption: "Formulario de lote con vista previa.",
          intro: "Al completar un lote se deducen insumos y se agregan salidas en la ubicación elegida.",
          fields: [
            {
              name: "Receta",
              effect: "Define ingredientes y salidas del lote."
            },
            {
              name: "Ubicación",
              effect: "Almacén donde se consume y produce stock."
            },
            {
              name: "Cant. producida",
              effect: "Escala la receta desde el tamaño base."
            },
            {
              name: "Número de lote",
              effect: "Referencia opcional en etiquetas o historial."
            },
            {
              name: "Actualizar costo de ítem",
              effect: "Recalcula costo de salida desde totales del lote."
            },
            {
              name: "Notas",
              effect: "Nota libre en el registro de producción."
            }
          ]
        },
        "production-history": {
          title: "Historial de producción",
          steps: [
            "Abra Historial de producción para auditar lotes completados.",
            "Filtre por fecha, receta o ubicación.",
            "Abra una fila para ver insumos, salidas y quién registró el lote."
          ],
          caption: "Lista de historial de producción."
        }
      },
      title: "Recetas y producción",
      intro: "Defina recetas por lotes, ejecute producción para consumir insumos y crear salidas, y revise el historial."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Menús de buffet",
          steps: [
            "Abra Inventario → Buffet → Menús.",
            "Mantenga plantillas de menú para desayuno, almuerzo o cena.",
            "Cada menú lista recetas con cantidades por comensal."
          ],
          caption: "Lista de menús de buffet."
        },
        "buffet-menu-form": {
          title: "Formulario de menú de buffet",
          steps: [
            "Agregue o edite un menú de buffet.",
            "Defina tipo de sesión y líneas de receta con cantidad por comensal.",
            "Guarde menús activos para abrir sesiones."
          ],
          caption: "Formulario de menú de buffet.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta al iniciar una sesión."
            },
            {
              name: "Código",
              effect: "Abreviatura opcional de cocina."
            },
            {
              name: "Tipo de sesión",
              effect: "Desayuno, almuerzo o cena — filtra sesiones compatibles."
            },
            {
              name: "Líneas de receta",
              effect: "Receta y cantidad esperada por comensal."
            },
            {
              name: "Está activo",
              effect: "Solo menús activos aparecen al configurar sesiones."
            }
          ]
        },
        "buffet-sessions": {
          title: "Sesiones de buffet",
          steps: [
            "Abra Buffet → Sesiones.",
            "Inicie una sesión desde un menú con invitados esperados y precio.",
            "Monitoree producción vs. pronóstico durante el servicio.",
            "Cierre la sesión para registrar merma, sobrantes y costo final."
          ],
          caption: "Panel de sesiones de buffet."
        },
        "buffet-session-form": {
          title: "Iniciar sesión de buffet",
          steps: [
            "Haga clic en Nueva sesión.",
            "Elija menú, ubicación, fecha operativa y tipo de sesión.",
            "Ingrese invitados esperados y precio de buffet por comensal.",
            "Guarde para abrir el panel en vivo."
          ],
          caption: "Formulario de nueva sesión de buffet.",
          fields: [
            {
              name: "Menú",
              effect: "Carga líneas de receta y pronósticos por comensal."
            },
            {
              name: "Ubicación",
              effect: "Almacén que recibe movimientos de inventario."
            },
            {
              name: "Fecha operativa",
              effect: "Día comercial atribuido a la sesión."
            },
            {
              name: "Tipo de sesión",
              effect: "Debe coincidir con el período del menú."
            },
            {
              name: "Invitados esperados",
              effect: "Impulsa pronósticos iniciales por receta."
            },
            {
              name: "Precio buffet",
              effect: "Ingreso por comensal en informes de sesión."
            }
          ]
        }
      },
      title: "Menús y sesiones de buffet",
      intro: "Planifique recetas por comensal y ejecute sesiones con pronóstico, seguimiento de invitados y cierre con merma y costo."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Lista de centros de costo",
          steps: [
            "Abra RR. HH. → Centros de costo.",
            "Revise códigos usados en empleados, puestos y horarios.",
            "Agregue o edite centros antes de asignarlos en empleados."
          ],
          caption: "Pestaña Centros de costo."
        },
        "cost-center-form": {
          title: "Formulario de centro de costo",
          steps: [
            "Haga clic en Agregar o edite una fila.",
            "Ingrese código, nombre y descripción opcional.",
            "Desactive para retirar un centro sin borrar historial.",
            "Guarde — el centro aparece en formularios de empleados y horarios."
          ],
          caption: "Modal crear/editar centro de costo.",
          fields: [
            {
              name: "Código",
              effect: "Identificador corto único en exportaciones e integraciones."
            },
            {
              name: "Nombre",
              effect: "Etiqueta legible en listas desplegables."
            },
            {
              name: "Descripción",
              effect: "Notas opcionales para administradores."
            },
            {
              name: "Está activo",
              effect: "Centros inactivos no se seleccionan en registros nuevos."
            }
          ]
        }
      },
      title: "Centros de costo",
      intro: "Los centros de costo etiquetan mano de obra y nómina a locales, departamentos o segmentos contables."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Perfiles de pago",
          steps: [
            "Abra RR. HH. → Pago → Perfiles.",
            "Mantenga tarifa base con fechas efectivas por empleado.",
            "Los perfiles alimentan el cálculo de nómina del período activo."
          ],
          caption: "Lista de perfiles de pago."
        },
        "pay-profile-form": {
          title: "Formulario de perfil de pago",
          steps: [
            "Agregue o edite un perfil para un empleado.",
            "Elija tipo de pago y tarifa base con fechas efectivas.",
            "Guarde — la nómina usa el perfil válido en cada fecha trabajada."
          ],
          caption: "Formulario de perfil de pago.",
          fields: [
            {
              name: "Empleado",
              effect: "Personal que recibe esta compensación base."
            },
            {
              name: "Tipo de pago",
              effect: "Por hora, salario, contrato, comisión o mixto — impulsa cálculo de nómina."
            },
            {
              name: "Tarifa base",
              effect: "Tarifa principal o monto salarial en la moneda elegida."
            },
            {
              name: "Moneda",
              effect: "Moneda ISO de la tarifa."
            },
            {
              name: "Vigente desde",
              effect: "Primer día en que aplica este perfil."
            },
            {
              name: "Vigente hasta",
              effect: "Fin opcional cuando un perfil más nuevo lo reemplaza."
            }
          ]
        },
        "pay-rules": {
          title: "Reglas de pago",
          steps: [
            "Abra Pago → Reglas.",
            "Las reglas se apilan por prioridad: permitir, prevenir, gana el mayor o prioridad.",
            "Aplique a empleados, departamentos, feriados o ventanas horarias."
          ],
          caption: "Lista de reglas de pago laboral."
        },
        "pay-rule-form": {
          title: "Formulario de regla de pago",
          steps: [
            "Agregue o edite una regla con código y nombre.",
            "Defina efectos y si aplican a horas regulares, extra o todas.",
            "Configure filtros de fecha, hora, día de semana y feriado.",
            "Asigne empleados, departamentos, puestos o centros de costo.",
            "Guarde — el motor evalúa reglas al calcular horas fichadas."
          ],
          caption: "Formulario de regla con efectos y filtros.",
          intro: "Cada regla tiene efectos (multiplicador, bono/deducción fijo o porcentual) y filtros de elegibilidad.",
          fields: [
            {
              name: "Código",
              effect: "Identificador único para exportaciones."
            },
            {
              name: "Nombre",
              effect: "Etiqueta descriptiva en listas admin."
            },
            {
              name: "Prioridad",
              effect: "Orden cuando el modo de apilamiento es prioridad."
            },
            {
              name: "Modo de apilamiento",
              effect: "Cómo interactúa con otras reglas coincidentes."
            },
            {
              name: "Efectos",
              effect: "Multiplicadores o ajustes de monto en horas elegibles."
            },
            {
              name: "Filtros empleado / departamento / puesto / centro de costo",
              effect: "Limita a qué personal aplica la regla."
            },
            {
              name: "Ventana de fecha y hora",
              effect: "Rango opcional de fechas y horas diarias."
            },
            {
              name: "Días de semana / meses",
              effect: "Restringe a patrones de calendario seleccionados."
            },
            {
              name: "Feriados",
              effect: "Aplica solo en feriados públicos seleccionados."
            },
            {
              name: "Horas extra (día/semana)",
              effect: "Se activa al superar umbrales diarios o semanales."
            }
          ]
        }
      },
      title: "Perfiles y reglas de pago",
      intro: "Los perfiles guardan tarifas base; las reglas aplican primas, bonos y deducciones según horario o contexto."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Períodos de nómina",
          steps: [
            "Abra RR. HH. → Nómina → Períodos.",
            "Cree períodos según su ciclo de pago (semanal, quincenal, mensual, personalizado).",
            "Bloquee o cierre períodos antes de ejecuciones finales."
          ],
          caption: "Lista de períodos de nómina."
        },
        "payroll-period-form": {
          title: "Formulario de período de nómina",
          steps: [
            "Agregue un período con nombre, tipo y rango de fechas.",
            "Deje estado Abierto mientras recopila tiempo y ajustes.",
            "Cambie a Bloqueado/Cerrado/Pagado según avance el ciclo."
          ],
          caption: "Formulario de período de nómina.",
          fields: [
            {
              name: "Nombre del período",
              effect: "Etiqueta en ejecuciones y exportaciones de nómina."
            },
            {
              name: "Tipo de período",
              effect: "Semanal, quincenal, mensual o cadencia personalizada."
            },
            {
              name: "Fecha inicio",
              effect: "Primer día incluido en el período."
            },
            {
              name: "Fecha fin",
              effect: "Último día incluido en el período."
            },
            {
              name: "Estado",
              effect: "Abierto permite ediciones; bloqueado/cerrado restringe; pagado marca finalización."
            }
          ]
        },
        "payroll-runs": {
          title: "Ejecuciones de nómina",
          steps: [
            "Abra Nómina → Ejecuciones para un período abierto.",
            "Genere una ejecución para previsualizar bruto desde asistencia y reglas.",
            "Revise instantáneas antes de marcar la ejecución completa."
          ],
          caption: "Ejecuciones de nómina de un período."
        },
        "payroll-run-form": {
          title: "Generar ejecución de nómina",
          steps: [
            "Haga clic en Nueva ejecución y seleccione un período abierto.",
            "Confirme el número de ejecución sugerido.",
            "Genere vista previa para calcular líneas desde tiempo, perfiles y reglas."
          ],
          caption: "Formulario de nueva ejecución de nómina.",
          fields: [
            {
              name: "Período de nómina",
              effect: "Rango y estado que gobiernan horas y ajustes incluidos."
            },
            {
              name: "Número de ejecución",
              effect: "Identificador secuencial para múltiples vistas previas en el mismo período."
            }
          ]
        },
        adjustments: {
          title: "Ajustes de nómina",
          steps: [
            "Abra Nómina → Ajustes.",
            "Agregue bonos, penalidades, asignaciones o correcciones por empleado.",
            "Vincule a un período cuando el monto deba aparecer en una ejecución."
          ],
          caption: "Lista de ajustes laborales."
        },
        "adjustment-form": {
          title: "Formulario de ajuste",
          steps: [
            "Elija empleado, tipo, monto y fecha efectiva.",
            "Opcionalmente vincule a un período de nómina.",
            "Guarde — se incluye en la próxima ejecución que cubra esa fecha."
          ],
          caption: "Formulario de ajuste de nómina.",
          fields: [
            {
              name: "Empleado",
              effect: "Personal que recibe el ajuste."
            },
            {
              name: "Período de nómina",
              effect: "Vínculo opcional para incluir en un run específico."
            },
            {
              name: "Tipo",
              effect: "Bono, penalidad, asignación, reembolso, anticipo, préstamo, corrección o deducción."
            },
            {
              name: "Monto",
              effect: "Valor en moneda sumado o restado del bruto."
            },
            {
              name: "Fecha efectiva",
              effect: "Fecha para determinar qué ejecución lo incluye."
            },
            {
              name: "Descripción",
              effect: "Explicación en detalle de nómina y auditoría."
            }
          ]
        }
      },
      title: "Períodos y ejecuciones de nómina",
      intro: "Cierre la mano de obra en períodos, genere ejecuciones con vista previa y registre ajustes."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Lista de documentos",
          steps: [
            "Abra RR. HH. → Documentos.",
            "Filtre por empleado o categoría.",
            "Suba archivos nuevos o actualice metadatos en documentos existentes."
          ],
          caption: "Pestaña documentos del empleado."
        },
        "document-form": {
          title: "Formulario de documento",
          steps: [
            "Haga clic en Agregar documento.",
            "Seleccione empleado, título y categoría.",
            "Adjunte el archivo y establezca vencimiento si aplica.",
            "Guarde — el archivo se almacena y vincula al perfil del empleado."
          ],
          caption: "Formulario de carga de documento.",
          fields: [
            {
              name: "Empleado",
              effect: "Propietario del registro de documento."
            },
            {
              name: "Título",
              effect: "Nombre mostrado en listas y recordatorios."
            },
            {
              name: "Categoría",
              effect: "Contrato, certificado, licencia, ID, médico, advertencia u otro."
            },
            {
              name: "Vence el",
              effect: "Fecha opcional para alertas de renovación."
            },
            {
              name: "Adjuntar archivo",
              effect: "Obligatorio al crear; almacena el binario en la biblioteca."
            }
          ]
        }
      },
      title: "Documentos del empleado",
      intro: "Almacene contratos, identificaciones, licencias y otros archivos con seguimiento de vencimiento."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Lista de desempeño",
          steps: [
            "Abra RR. HH. → Desempeño.",
            "Explore notas por empleado, tipo y severidad.",
            "Agregue entradas tras incidentes o revisiones programadas."
          ],
          caption: "Pestaña notas de desempeño."
        },
        "performance-form": {
          title: "Formulario de nota de desempeño",
          steps: [
            "Elija empleado, tipo, título y texto.",
            "Establezca severidad para incidentes y advertencias.",
            "Active visible al empleado si puede ver la nota en autoservicio.",
            "Guarde para añadir al expediente RR. HH."
          ],
          caption: "Formulario de nota de desempeño.",
          fields: [
            {
              name: "Empleado",
              effect: "Sujeto de la nota."
            },
            {
              name: "Tipo",
              effect: "Advertencia, elogio, revisión o incidente."
            },
            {
              name: "Título",
              effect: "Resumen breve en listas."
            },
            {
              name: "Contenido",
              effect: "Narrativa completa del evento o revisión."
            },
            {
              name: "Severidad",
              effect: "Baja, media, alta o crítica — principalmente advertencias e incidentes."
            },
            {
              name: "Visible al empleado",
              effect: "Si está activo, la nota puede mostrarse al usuario empleado."
            }
          ]
        }
      },
      title: "Notas de desempeño",
      intro: "Registre advertencias, elogios, evaluaciones e incidentes en el expediente del empleado."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Cancelar o anular pedido",
          steps: [
            "Abra ⋯ en una tarjeta En curso y elija Cancelar pedido.",
            "Seleccione un motivo de anulación (obligatorio para informes).",
            "Deje marcado Seleccionar todos los ítems para anulación total, o desmarque y elija líneas para anulación parcial.",
            "Confirme para anular la cuenta y liberar la mesa cuando corresponda."
          ],
          caption: "Modal Cancelar pedido con motivo y selección de ítems.",
          intro: "Anula una cuenta En curso. Anulación total cancela todas las líneas; parcial solo las seleccionadas. Puede requerirse PIN de gerente.",
          fields: [
            {
              name: "Motivo",
              effect: "Motivo de anulación obligatorio registrado en el pedido para auditoría e informes."
            },
            {
              name: "Seleccionar todos los ítems",
              effect: "Marcado anula toda la cuenta; desmarcado permite selección por línea."
            },
            {
              name: "Anulación parcial",
              effect: "Marque líneas para anular solo esas cantidades manteniendo el resto abierto."
            }
          ]
        },
        refund: {
          title: "Reembolsar pedido pagado",
          steps: [
            "Abra un pedido Pagado y elija Reembolso en el menú de acciones.",
            "Seleccione líneas y cantidades a reembolsar.",
            "Elija un motivo de reembolso y confirme.",
            "El sistema registra el reembolso y actualiza totales de pago."
          ],
          caption: "Modal de reembolso con selector de ítems y motivo.",
          intro: "Emite un reembolso sobre una cuenta pagada, opcionalmente por ítems seleccionados.",
          fields: [
            {
              name: "Ítems a reembolsar",
              effect: "Líneas pagadas y cantidades devueltas al cliente."
            },
            {
              name: "Motivo",
              effect: "Documenta el reembolso para revisión gerencial e informes."
            }
          ]
        },
        "split-seats": {
          title: "Dividir por asientos",
          steps: [
            "Desde ⋯ elija Dividir por asientos en un pedido En curso.",
            "Revise cómo se agrupan los ítems por asiento.",
            "Confirme para crear una cuenta hija por asiento con la misma mesa."
          ],
          caption: "Vista previa de división por asientos antes de confirmar.",
          intro: "Divide una cuenta en cuentas separadas según el número de asiento en las líneas."
        },
        "split-items": {
          title: "Dividir por ítems",
          steps: [
            "Desde ⋯ elija Dividir por ítems.",
            "Mueva o asigne cada línea a una columna de cuenta nueva.",
            "Confirme para crear cuentas En curso separadas."
          ],
          caption: "Cuadrícula de asignación por ítems.",
          intro: "Asigna manualmente líneas a nuevas cuentas sin depender del asiento."
        },
        "split-amount": {
          title: "Dividir por importe",
          steps: [
            "Desde ⋯ elija Dividir por importe.",
            "Ingrese número de partes o importes personalizados.",
            "Confirme para generar cuentas hijas con cada porción del total."
          ],
          caption: "Diálogo de división por importe.",
          intro: "Divide el total en partes fijas o iguales para pagos separados."
        },
        merge: {
          title: "Combinar pedidos",
          steps: [
            "En el primer pedido, abra ⋯ y elija Combinar (o marque Seleccionar en la barra).",
            "Repita para cada pedido adicional.",
            "Toque Elegir mesa y seleccione la mesa destino.",
            "Toque Confirmar combinación para unir las líneas en una cuenta."
          ],
          caption: "Barra de combinación con pedidos seleccionados y selector de mesa.",
          intro: "Combina varias cuentas En curso en una mesa. Inicie desde cada tarjeta y finalice en la barra inferior.",
          fields: [
            {
              name: "Casilla seleccionar pedidos",
              effect: "Marca un pedido para incluirlo en la combinación pendiente."
            },
            {
              name: "Elegir mesa",
              effect: "Define la mesa que alojará la cuenta combinada."
            },
            {
              name: "Confirmar combinación",
              effect: "Une todas las cuentas seleccionadas en un pedido En curso en la mesa elegida."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Pérdidas y ganancias",
          steps: [
            "Abra Cuentas y la pestaña Pérdidas y ganancias.",
            "Defina rango de fechas o período según su ciclo de informes.",
            "Expanda grupos de cuentas para revisar totales por categoría.",
            "Exporte o imprima cuando el período esté cerrado."
          ],
          caption: "Pestaña de estado de pérdidas y ganancias.",
          intro: "Estado de resultados del período: ingresos, costo de ventas y gastos operativos."
        },
        "cash-flow": {
          title: "Flujo de caja",
          steps: [
            "Abra la pestaña Flujo de caja en Cuentas.",
            "Use el mismo período que otros estados.",
            "Revise saldo inicial, cambio neto y efectivo final.",
            "Úselo junto al P&G para explicar diferencias de caja vs. devengo."
          ],
          caption: "Pestaña de flujo de caja.",
          intro: "Resume movimientos de efectivo operativos, de inversión y financiación del período."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Formulario de empleado",
          steps: [
            "Desde Empleados haga clic en Agregar o edite una fila.",
            "Complete número, nombre y detalles laborales.",
            "Vincule usuario POS, departamento, puesto, centro de costo y gerente.",
            "Guarde — alimenta asistencia, licencias y nómina."
          ],
          caption: "Modal crear/editar empleado.",
          intro: "Registro RR. HH. central que vincula usuario POS, estructura orgánica y fechas laborales.",
          fields: [
            {
              name: "Número de empleado",
              effect: "Identificador único en horarios y exportaciones."
            },
            {
              name: "Nombre / apellido",
              effect: "Nombre legal o preferido en documentos RR. HH."
            },
            {
              name: "Usuario vinculado",
              effect: "Login POS opcional para fichaje."
            },
            {
              name: "Departamento",
              effect: "Unidad organizacional para informes."
            },
            {
              name: "Puesto",
              effect: "Título usado en horarios y reglas de pago."
            },
            {
              name: "Centro de costo",
              effect: "Asignación predeterminada de costo laboral."
            },
            {
              name: "Gerente",
              effect: "Línea de reporte para aprobaciones."
            },
            {
              name: "Estado laboral",
              effect: "Activo, inactivo, terminado, en licencia o suspendido."
            },
            {
              name: "Tipo de empleo",
              effect: "Por hora, salario, contrato, etc."
            },
            {
              name: "Fecha contratación / terminación",
              effect: "Antigüedad y elegibilidad."
            }
          ]
        },
        "department-form": {
          title: "Formulario de departamento",
          steps: [
            "Desde Departamentos o Agregar inline en empleado.",
            "Ingrese código, nombre y descripción.",
            "Guarde — aparece en empleados y puestos."
          ],
          caption: "Formulario de departamento.",
          fields: [
            {
              name: "Código",
              effect: "Identificador corto para integraciones."
            },
            {
              name: "Nombre",
              effect: "Nombre mostrado en listas."
            },
            {
              name: "Descripción",
              effect: "Notas admin opcionales."
            },
            {
              name: "Está activo",
              effect: "Departamentos inactivos ocultos en nuevas asignaciones."
            }
          ]
        },
        "position-form": {
          title: "Formulario de puesto",
          steps: [
            "Desde Puestos o Agregar inline en empleado.",
            "Defina código, nombre, departamento y centro de costo predeterminado.",
            "Guarde — seleccionable en empleados y horarios."
          ],
          caption: "Formulario de puesto.",
          fields: [
            {
              name: "Código",
              effect: "Código de trabajo para exportaciones de nómina."
            },
            {
              name: "Nombre",
              effect: "Título mostrado en RR. HH. y horarios."
            },
            {
              name: "Departamento",
              effect: "Unidad org predeterminada del rol."
            },
            {
              name: "Centro de costo predeterminado",
              effect: "Prellenado en horarios para este puesto."
            },
            {
              name: "Está activo",
              effect: "Retira títulos que ya no se contratan."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Entrada manual de asistencia",
          steps: [
            "En Asistencia haga clic en Entrada manual.",
            "Seleccione empleado e ingrese fechas/horas de entrada y salida.",
            "Agregue notas y guarde — las horas alimentan nómina e informes."
          ],
          caption: "Modal entrada manual de asistencia.",
          intro: "Corrija fichajes faltantes o complete tiempo cuando los terminales no estuvieron disponibles.",
          fields: [
            {
              name: "Empleado",
              effect: "De quién se crea o corrige el registro."
            },
            {
              name: "Entrada",
              effect: "Inicio del intervalo trabajado."
            },
            {
              name: "Salida",
              effect: "Fin del intervalo; debe ser posterior a la entrada."
            },
            {
              name: "Notas",
              effect: "Motivo de entrada manual en auditoría."
            }
          ]
        },
        "schedule-form": {
          title: "Formulario de horario de trabajo",
          steps: [
            "Abra Programación y agregue un horario.",
            "Defina nombre, inicio y fin del período.",
            "Agregue turnos o genere desde plantillas mientras esté en borrador."
          ],
          caption: "Formulario de horario de trabajo.",
          intro: "Un horario es un rango de fechas con turnos en borrador o publicados.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta del período (p. ej., Semana 12)."
            },
            {
              name: "Inicio del período",
              effect: "Primera fecha/hora cubierta."
            },
            {
              name: "Fin del período",
              effect: "Última fecha/hora cubierta."
            }
          ]
        },
        "shift-form": {
          title: "Formulario de turno programado",
          intro: "Asigna un empleado a un bloque horario dentro de un horario en borrador.",
          steps: [
            "Desde un horario en borrador haga clic en Agregar turno.",
            "Elija horario, empleado y horas inicio/fin.",
            "Opcionalmente aplique plantilla, departamento, puesto y centro de costo.",
            "Guarde — advierte si hay conflictos."
          ],
          caption: "Formulario de turno programado.",
          fields: [
            {
              name: "Horario de trabajo",
              effect: "Horario padre que debe estar en borrador."
            },
            {
              name: "Empleado",
              effect: "Personal asignado al turno."
            },
            {
              name: "Plantilla de turno",
              effect: "Preset opcional de Admin → Usuarios → Turnos."
            },
            {
              name: "Departamento / puesto / centro de costo",
              effect: "Anula etiquetas org para este turno."
            },
            {
              name: "Inicio / fin",
              effect: "Ventana horaria programada."
            }
          ]
        },
        "schedule-template": {
          title: "Formulario de plantilla de horario",
          steps: [
            "Abra Plantillas bajo Programación.",
            "Nombre la plantilla y elija días con horas inicio/fin.",
            "Opcionalmente vincule plantilla de turno y org predeterminada.",
            "Guarde para usar con Generar horario."
          ],
          caption: "Formulario de plantilla de horario.",
          intro: "Patrón semanal reutilizable para generar turnos en masa.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en diálogo generar."
            },
            {
              name: "Días de la semana",
              effect: "Qué días reciben turnos."
            },
            {
              name: "Hora inicio / fin",
              effect: "Ventana diaria en días seleccionados."
            },
            {
              name: "Minutos de descanso",
              effect: "Descanso no pagado restado de horas."
            },
            {
              name: "Plantilla de turno",
              effect: "Vincula definición POS para informes."
            }
          ]
        },
        "schedule-generate": {
          title: "Generar horario desde plantilla",
          steps: [
            "Haga clic en Generar en Programación.",
            "Seleccione horario borrador y plantilla.",
            "Multi-seleccione empleados que recibirán turnos.",
            "Genere — crea turnos omitiendo conflictos si está configurado."
          ],
          caption: "Diálogo generar horario.",
          fields: [
            {
              name: "Horario de trabajo",
              effect: "Horario borrador destino."
            },
            {
              name: "Plantilla",
              effect: "Patrón semanal de días y horas."
            },
            {
              name: "Empleados",
              effect: "Personal que recibe copia de turnos de plantilla."
            }
          ]
        },
        "schedule-swap": {
          title: "Solicitud de intercambio de turno",
          steps: [
            "Haga clic en Solicitar intercambio en Programación.",
            "Seleccione el turno programado y el empleado solicitante.",
            "Opcionalmente nombre un empleado objetivo y turno propuesto.",
            "Envíe — crea intercambio pendiente para aprobación gerencial."
          ],
          caption: "Formulario solicitud de intercambio.",
          fields: [
            {
              name: "Turno programado",
              effect: "Turno que el solicitante quiere ceder o intercambiar."
            },
            {
              name: "Empleado solicitante",
              effect: "Empleado que inicia el intercambio."
            },
            {
              name: "Empleado objetivo",
              effect: "Compañero opcional para tomar o intercambiar."
            },
            {
              name: "Turno propuesto",
              effect: "Contra-turno opcional ofrecido."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Formulario de solicitud de licencia",
          steps: [
            "En Licencias haga clic en Agregar solicitud.",
            "Seleccione empleado, tipo de licencia y rango de fechas.",
            "Ingrese días y motivo si el tipo lo requiere.",
            "Guarde — enruta para aprobación cuando aplique."
          ],
          caption: "Formulario de solicitud de licencia.",
          intro: "Envíe o edite solicitudes de tiempo libre según tipos configurados.",
          fields: [
            {
              name: "Empleado",
              effect: "Personal que solicita tiempo libre."
            },
            {
              name: "Tipo de licencia",
              effect: "Determina pagado/no pagado, aprobación y acumulación."
            },
            {
              name: "Fecha inicio / fin",
              effect: "Fechas inclusivas de ausencia."
            },
            {
              name: "Días",
              effect: "Días laborables consumidos (puede auto-calcularse)."
            },
            {
              name: "Motivo",
              effect: "Nota opcional para aprobadores."
            }
          ]
        },
        "holiday-form": {
          title: "Formulario de feriado público",
          steps: [
            "Abra Feriados bajo Licencias.",
            "Agregue nombre, fecha y código de país.",
            "Marque recurrente para fechas fijas anuales.",
            "Guarde — aparece en filtros de reglas de pago."
          ],
          caption: "Formulario de feriado público.",
          intro: "Los feriados interactúan con reglas de pago y programación.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en calendarios y reglas."
            },
            {
              name: "Fecha",
              effect: "Fecha calendario observada."
            },
            {
              name: "Código de país",
              effect: "Código ISO opcional para locales multi-país."
            },
            {
              name: "Es recurrente",
              effect: "Se repite cada año en mismo mes/día."
            },
            {
              name: "Está activo",
              effect: "Feriados inactivos ignorados por reglas nuevas."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Formulario de plato",
          steps: [
            "Abra Admin → Menús → Platos y agregue o edite.",
            "Defina número, nombre, precio, costo y categorías.",
            "Adjunte grupos de modificadores, receta, cocina y flujo.",
            "Guarde — aparece en menús y POS cuando está activo."
          ],
          caption: "Formulario de mantenimiento de plato.",
          intro: "Los platos son ítems vendibles con precio, categorías, modificadores, recetas y enrutamiento de cocina.",
          fields: [
            {
              name: "Número / nombre",
              effect: "Identificador POS y nombre mostrado."
            },
            {
              name: "Precio / costo",
              effect: "Precio de venta y costo teórico."
            },
            {
              name: "Categorías",
              effect: "Agrupación de menú y objetivo de descuentos."
            },
            {
              name: "Grupos de modificadores",
              effect: "Flujo de personalización con reglas oblig/opcional."
            },
            {
              name: "Líneas de receta",
              effect: "Depleción de inventario al vender."
            },
            {
              name: "Cocina / flujo",
              effect: "Enruta KOT e impresión y etapas de prep."
            }
          ]
        },
        "menu-form": {
          title: "Formulario de menú",
          steps: [
            "Abra pestaña Menús y agregue o edite.",
            "Defina nombre y horarios inicio/fin opcionales.",
            "Active y termina-al-día-siguiente para menús nocturnos.",
            "Asigne categorías en la lista tras guardar."
          ],
          caption: "Formulario de menú con horarios.",
          intro: "Los menús limitan qué categorías aparecen en POS (p. ej., almuerzo vs. cena).",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en conmutador POS."
            },
            {
              name: "Desde / hora fin",
              effect: "Ventana automática de disponibilidad."
            },
            {
              name: "Termina al día siguiente",
              effect: "Servicio pasada medianoche."
            },
            {
              name: "Activo",
              effect: "Menús inactivos ocultos en POS."
            }
          ]
        },
        "category-form": {
          title: "Formulario de categoría",
          steps: [
            "Abra Categorías y agregue o edite.",
            "Defina nombre, prioridad y mostrar-en-menú.",
            "Guarde — asigne platos y vincule a menús."
          ],
          caption: "Formulario de categoría.",
          fields: [
            {
              name: "Nombre",
              effect: "Encabezado de categoría en POS e informes."
            },
            {
              name: "Prioridad",
              effect: "Orden entre categorías hermanas."
            },
            {
              name: "Mostrar en menú",
              effect: "Si está off, oculta en vistas de menú al cliente."
            }
          ]
        },
        "modifier-group-form": {
          title: "Formulario de grupo de modificadores",
          steps: [
            "Abra Grupos de modificadores y agregue o edite.",
            "Defina nombre, prioridad y líneas con precios.",
            "Configure grupos siguientes permitidos por modificador.",
            "Use anulaciones para ocultar o repricing anidados.",
            "Guarde y adjunte el grupo a platos."
          ],
          caption: "Formulario con grupos anidados.",
          intro: "Los grupos definen modificadores, precios y grupos siguientes anidados por elección.",
          fields: [
            {
              name: "Nombre / prioridad",
              effect: "Etiqueta y orden cuando varios grupos en un plato."
            },
            {
              name: "Modificador",
              effect: "Opción seleccionable (a menudo plato como add-on)."
            },
            {
              name: "Precio",
              effect: "Cargo extra al elegir."
            },
            {
              name: "Grupos siguientes permitidos",
              effect: "Grupos que abren tras esta elección."
            },
            {
              name: "Anulaciones grupo siguiente",
              effect: "Por grupo anidado: ocultar o anular precio."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Formulario de piso",
          steps: [
            "Abra Admin → Pisos y agregue o edite.",
            "Defina nombre, prioridad y colores de ficha.",
            "Guarde — aparece en conmutador de plano."
          ],
          caption: "Formulario de piso.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en selector de piso POS."
            },
            {
              name: "Prioridad",
              effect: "Orden en lista de pisos."
            },
            {
              name: "Fondo / color",
              effect: "Estilo predeterminado en plano."
            }
          ]
        },
        "table-form": {
          title: "Formulario de mesa",
          steps: [
            "Seleccione piso y agregue o edite mesa.",
            "Defina número, nombre, colores y piso.",
            "Opcionalmente limite categorías, tipos de pedido y pago.",
            "Active pedir-cubiertos si debe solicitar comensales."
          ],
          caption: "Formulario de mesa.",
          intro: "Las mesas pertenecen a un piso y pueden restringir categorías, tipos de pedido y pago.",
          fields: [
            {
              name: "Nombre / número",
              effect: "Etiqueta en plano y cuentas."
            },
            {
              name: "Piso",
              effect: "Plano padre de la mesa."
            },
            {
              name: "Prioridad",
              effect: "Orden en planos densos."
            },
            {
              name: "Categorías / tipos pedido / tipos pago",
              effect: "Restricciones opcionales."
            },
            {
              name: "Pedir cubiertos",
              effect: "Solicita cantidad de comensales al abrir."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Formulario de regla de descuento",
          steps: [
            "Admin → Promociones → Descuentos → Reglas.",
            "Defina categoría, alcance y modo (manual, automático o ambos).",
            "Configure objetivos según alcance.",
            "Defina valor, apilamiento, impuestos y horarios.",
            "Guarde — caché se actualiza y regla disponible en POS."
          ],
          caption: "Formulario con categoría y objetivos.",
          intro: "Categorías: manager, staff, vip, corporate, happy_hour, category, product, floor, damage_wastage, service_recovery, bulk_order, manual, scheduled, buy_x_get_y. Alcance: item, category, cart, customer, floor.",
          fields: [
            {
              name: "Categoría",
              effect: "Uno de 14 tipos para permisos y analítica."
            },
            {
              name: "Alcance",
              effect: "item, category, cart, customer o floor."
            },
            {
              name: "Modo de aplicación",
              effect: "manual, automatic o both."
            },
            {
              name: "Objetivos",
              effect: "Ítems, categorías, clientes o pisos elegibles."
            },
            {
              name: "Tipo (porcentaje / fijo)",
              effect: "Si min/máx son porcentajes o montos."
            },
            {
              name: "Min / máx tasa",
              effect: "Rango permitido para manual o auto."
            },
            {
              name: "Tope máximo",
              effect: "Límite moneda solo en descuentos porcentuales."
            },
            {
              name: "Prioridad",
              effect: "Orden cuando compiten reglas automáticas."
            },
            {
              name: "Monto mínimo pedido",
              effect: "Subtotal requerido antes de aplicar."
            },
            {
              name: "Modo apilamiento",
              effect: "allow, prevent, highest_wins o priority."
            },
            {
              name: "Tratamiento fiscal",
              effect: "tax_before_discount, tax_after_discount, inclusive o exclusive."
            },
            {
              name: "Horarios",
              effect: "Ventanas día/hora para scheduled y happy_hour."
            },
            {
              name: "Condiciones",
              effect: "Umbrales Buy X Get Y."
            },
            {
              name: "Requiere motivo / aprobación",
              effect: "Motivo o PIN de gerente al aplicar manual."
            }
          ]
        },
        "coupon-form": {
          title: "Formulario de cupón",
          steps: [
            "Abra Promociones → Cupones.",
            "Defina código, tipo/valor de descuento y límites de uso.",
            "Configure días, ventana horaria y rango de fechas.",
            "Guarde — cajeros ingresan el código al pagar."
          ],
          caption: "Formulario de cupón.",
          fields: [
            {
              name: "Código",
              effect: "Cadena que ingresan clientes o personal en checkout."
            },
            {
              name: "Tipo de cupón",
              effect: "Uso único, multiuso u otro comportamiento."
            },
            {
              name: "Tipo / valor descuento",
              effect: "Porcentaje o monto fijo descontado."
            },
            {
              name: "Monto mínimo pedido",
              effect: "Subtotal mínimo antes de aplicar."
            },
            {
              name: "Descuento máximo",
              effect: "Tope en cupones porcentuales."
            },
            {
              name: "Límite de uso",
              effect: "Canjes totales permitidos."
            },
            {
              name: "Límite por usuario",
              effect: "Canjes por perfil de cliente."
            },
            {
              name: "Días válidos / hora inicio y fin",
              effect: "Restringe a días y horas."
            },
            {
              name: "Fecha inicio / fin",
              effect: "Ventana general de validez."
            },
            {
              name: "Apilable / solo primer pedido",
              effect: "Combinación con otros descuentos o clientes nuevos."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Formulario de cocina",
          steps: [
            "Abra Admin → Cocina → Cocinas.",
            "Agregue nombre, prioridad, impresoras vinculadas y platos.",
            "Guarde — ítems nuevos imprimen en esta estación cuando se asignan."
          ],
          caption: "Formulario de estación de cocina.",
          intro: "Las cocinas enrutan platos a impresoras y ubicaciones de inventario.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en KOT y pantalla de pedidos."
            },
            {
              name: "Prioridad",
              effect: "Orden cuando coinciden varias cocinas."
            },
            {
              name: "Impresoras",
              effect: "Dispositivos que imprimen tickets de esta cocina."
            },
            {
              name: "Ítems (platos)",
              effect: "Platos enrutados a esta estación."
            }
          ]
        },
        "workflow-form": {
          title: "Formulario de flujo de trabajo",
          steps: [
            "Abra Cocina → Flujos.",
            "Nombre el flujo y agregue etapas ordenadas.",
            "Asigne cocina a cada etapa.",
            "Vincule el flujo en platos con prep multi-paso."
          ],
          caption: "Editor de etapas de flujo.",
          intro: "Los flujos encadenan etapas de cocina para pantallas y bump bars.",
          fields: [
            {
              name: "Nombre",
              effect: "Identificador en platos y pantallas."
            },
            {
              name: "Etapas",
              effect: "Pasos ordenados (p. ej., Parrilla → Expo)."
            },
            {
              name: "Cocina de etapa",
              effect: "Estación dueña de cada etapa para routing y KPIs."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Formulario de impresora",
          steps: [
            "Abra Admin → Impresión → Impresoras.",
            "Agregue nombre y conexión: IP/puerto de red o identificadores USB.",
            "Elija tipo (recibo, cocina, etiqueta).",
            "Guarde — asigne en cocinas y ajustes del dispositivo."
          ],
          caption: "Formulario de impresora.",
          fields: [
            {
              name: "Nombre",
              effect: "Nombre amigable en admin y selectores."
            },
            {
              name: "Tipo",
              effect: "Perfil recibo, cocina o etiqueta."
            },
            {
              name: "Dirección IP / puerto",
              effect: "Conexión de red ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "IDs USB para impresoras directas."
            }
          ]
        },
        "print-setting-form": {
          title: "Formulario de ajuste de impresión",
          steps: [
            "Abra Ajustes de impresión y elija tipo de trabajo.",
            "Configure logo, encabezado/pie, bloque IVA y márgenes.",
            "Active columnas de líneas en recibos.",
            "Guarde — la próxima impresión usa el diseño actualizado."
          ],
          caption: "Editor de plantilla de impresión.",
          intro: "Cada tipo de trabajo (cuenta provisional, recibo final, cocina, resumen, delivery) tiene plantilla propia.",
          fields: [
            {
              name: "Mostrar logo",
              effect: "Incluye logo cargado en el ticket."
            },
            {
              name: "Secciones encabezado / pie",
              effect: "Bloques de texto o imagen arriba/abajo."
            },
            {
              name: "Nombre / número IVA",
              effect: "Bloque fiscal en recibos."
            },
            {
              name: "Márgenes",
              effect: "Espaciado superior/inferior/izquierdo/derecho en puntos."
            },
            {
              name: "Columnas de ítem",
              effect: "Alternar número, nombre, cant., precio y total."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Formulario de tipo de pago",
          steps: [
            "Admin → Pagos → Tipos.",
            "Agregue nombre, prioridad y tipo (Efectivo, Tarjeta, Remote, …).",
            "Para Remote: pasarela, modo test/live y claves API.",
            "Opcionalmente vincule impuesto y descuentos.",
            "Guarde — aparece en pantalla de pago y restricciones de mesa."
          ],
          caption: "Formulario con pasarela remota.",
          intro: "Incluye métodos locales y tipos Remote con Stripe, PayPal, etc.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en botones de pago."
            },
            {
              name: "Prioridad",
              effect: "Orden entre métodos."
            },
            {
              name: "Tipo",
              effect: "Perfil; Remote habilita campos de pasarela."
            },
            {
              name: "Proveedor pasarela",
              effect: "Stripe, PayPal u otro procesador."
            },
            {
              name: "Modo pasarela",
              effect: "Credenciales test vs live."
            },
            {
              name: "public_key",
              effect: "Clave publicable del lado cliente."
            },
            {
              name: "secret_key",
              effect: "Secreto del servidor para capturar cargos."
            },
            {
              name: "webhook_secret",
              effect: "Valida callbacks asíncronos."
            },
            {
              name: "client_id / client_secret",
              effect: "Pasarelas OAuth."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Campos específicos del comerciante."
            },
            {
              name: "Impuesto",
              effect: "Regla fiscal predeterminada."
            },
            {
              name: "Descuentos",
              effect: "Reglas auto-aplicadas al método."
            }
          ]
        },
        "tax-form": {
          title: "Formulario de impuesto",
          steps: [
            "Abra Pagos → Impuestos.",
            "Defina nombre, tasa y comportamiento inclusive/exclusive.",
            "Guarde — asigne a tipos de pago o predeterminados."
          ],
          caption: "Formulario de impuesto.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en recibos."
            },
            {
              name: "Tasa",
              effect: "Porcentaje sobre montos gravables."
            },
            {
              name: "Inclusive",
              effect: "Si true, impuesto incluido en precios mostrados."
            }
          ]
        },
        "order-type-form": {
          title: "Formulario de tipo de pedido",
          steps: [
            "Abra Pagos → Tipos de pedido.",
            "Defina nombre y banderas (local, para llevar, delivery).",
            "Guarde — usado en mesas, POS e informes."
          ],
          caption: "Formulario de tipo de pedido.",
          fields: [
            {
              name: "Nombre",
              effect: "Tipo mostrado en cuentas y filtros."
            },
            {
              name: "Prioridad",
              effect: "Orden en selectores."
            },
            {
              name: "Predeterminado",
              effect: "Preseleccionado en pedidos nuevos cuando aplique."
            }
          ]
        },
        "extra-form": {
          title: "Formulario de extra (cargo de servicio)",
          steps: [
            "Abra Pagos → Extras.",
            "Nombre el cargo y defina monto o porcentaje.",
            "Configure cuándo aplica (tipo pedido, pago, etc.).",
            "Guarde — pedidos calificados incluyen el recargo."
          ],
          caption: "Formulario de recargo extra.",
          intro: "Los extras agregan recargos automáticos (servicio, coperto) por contexto de pago o pedido.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta en recibo del cliente."
            },
            {
              name: "Monto / tasa",
              effect: "Moneda fija o porcentaje del total elegible."
            },
            {
              name: "Gravable",
              effect: "Si se calcula impuesto sobre el recargo."
            },
            {
              name: "Reglas auto-aplicar",
              effect: "Vínculos a tipos de pedido, pago o pisos."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Formulario de usuario",
          steps: [
            "Admin → Usuarios y agregue o edite.",
            "Defina método login, nombre, credenciales, rol y turno.",
            "Opcionalmente cree empleado RR. HH. vinculado.",
            "Guarde — puede iniciar sesión con permisos asignados."
          ],
          caption: "Formulario de cuenta de usuario.",
          intro: "Operadores POS inician con PIN o contraseña y heredan permisos de rol.",
          fields: [
            {
              name: "Método de login",
              effect: "PIN (4 dígitos) o contraseña."
            },
            {
              name: "Nombre / apellido",
              effect: "Nombre en cuentas e informes."
            },
            {
              name: "Login / PIN",
              effect: "Credencial de inicio de sesión."
            },
            {
              name: "Contraseña",
              effect: "Obligatoria si login es contraseña."
            },
            {
              name: "Rol de usuario",
              effect: "Paquete de permisos de módulos."
            },
            {
              name: "Turno de usuario",
              effect: "Turno predeterminado para informes laborales."
            },
            {
              name: "Crear empleado",
              effect: "Auto-crea empleado HR vinculado."
            }
          ]
        },
        "role-form": {
          title: "Formulario de rol",
          steps: [
            "Usuarios → Roles.",
            "Nombre el rol y busque en el árbol de módulos.",
            "Marque módulos padre o acciones individuales.",
            "Guarde — asigne el rol en usuarios."
          ],
          caption: "Editor de permisos de rol.",
          intro: "Los roles otorgan acceso a módulos y acciones vía protectAction.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta del rol en formulario de usuario."
            },
            {
              name: "Permisos de módulo",
              effect: "Casillas jerárquicas de pantallas y sub-acciones."
            }
          ]
        },
        "shift-form": {
          title: "Formulario de plantilla de turno",
          steps: [
            "Usuarios → Turnos.",
            "Ingrese nombre, hora inicio y fin.",
            "Turnos nocturnos activan ends_next_day automáticamente.",
            "Guarde — seleccionable en usuarios y horarios."
          ],
          caption: "Formulario plantilla de turno.",
          intro: "Turnos en Admin → Usuarios definen ventanas horarias para turno predeterminado y plantillas RR. HH.",
          fields: [
            {
              name: "Nombre",
              effect: "Etiqueta (p. ej., Mañana, Cierre)."
            },
            {
              name: "Hora inicio",
              effect: "Inicio programado."
            },
            {
              name: "Hora fin",
              effect: "Fin programado; puede pasar al día siguiente."
            }
          ]
        },
        "tips-definition": {
          title: "Definición de propinas (distribución)",
          steps: [
            "Usuarios → Definición de propinas.",
            "Agregue filas de rol con porcentajes o puntos de peso.",
            "Opcionalmente agregue anulaciones por usuario.",
            "Guarde — informes de distribución usan estos pesos."
          ],
          caption: "Panel admin distribución de propinas.",
          intro: "Configure cómo se ponderan las propinas agrupadas por roles y usuarios para informes de liquidación.",
          fields: [
            {
              name: "Peso por rol",
              effect: "Participación del fondo por rol (p. ej., mesero 70%, busser 30%)."
            },
            {
              name: "Peso por usuario",
              effect: "Anulación opcional del default del rol."
            }
          ]
        }
      }
    }
  },
  tr: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Mutabakat sekmesi",
          steps: [
            "Envanter → Mutfak mutabakatı.",
            "Konum ve iş tarihi seçin.",
            "Üret ile teorik satırları oluşturun.",
            "Gerçek miktarları girin veya CSV içe aktarın.",
            "Taslak kaydedin, farkları inceleyin, Doğrulayın."
          ],
          caption: "Araç çubuğu, ızgara ve fark paneli.",
          intro: "POS satışları ve tarifelerden ızgara oluşturun, gerçek sayımları girin veya içe aktarın.",
          fields: [
            {
              name: "Konum",
              effect: "Mutabakatı yapılan mutfak veya depo."
            },
            {
              name: "İş tarihi",
              effect: "Teorik kullanım ve sayımların geçerli olduğu gün."
            },
            {
              name: "Üret",
              effect: "Satış ve tarifelerden satırları oluşturur/günceller."
            },
            {
              name: "Gerçek miktar",
              effect: "Kalem başına fiziksel sayım; farkı belirler."
            },
            {
              name: "Doğrula",
              effect: "Yönetici onayı sonrası mutabakatı kilitler."
            }
          ]
        },
        "reconciliation-form": {
          title: "Manuel sayım girişi",
          steps: [
            "Gerçek sütununda hücreye tıklayıp sayım girin.",
            "Doğrulamadan taslak kaydedin.",
            "CSV ile toplu yükleme.",
            "Doğrulamadan önce fark panelini inceleyin."
          ],
          caption: "Gerçek miktar düzenlemeli ızgara.",
          intro: "Izgara düzenleme ve CSV içe aktarma aynı satır yapısını kullanır.",
          fields: [
            {
              name: "Kalem",
              effect: "Satırdaki envanter kalemi."
            },
            {
              name: "Teorik",
              effect: "Tarif ve satışlardan hesaplanan kullanım."
            },
            {
              name: "Gerçek",
              effect: "Girdiğiniz sayım veya kullanım miktarı."
            },
            {
              name: "Fark",
              effect: "Gerçek ile teorik arasındaki fark."
            },
            {
              name: "Notlar",
              effect: "Satırda isteğe bağlı açıklama."
            }
          ]
        }
      },
      title: "Mutfak mutabakatı",
      intro: "Teorik mutfak kullanımını fiziksel sayımlarla karşılaştırın."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Tarif listesi",
          steps: [
            "Envanter → Tarifler.",
            "Aktif tarifleri inceleyin.",
            "Tarif ekleyin veya düzenleyin."
          ],
          caption: "Tarif bakım sekmesi."
        },
        "recipe-form": {
          title: "Tarif formu",
          steps: [
            "Tarif ekle veya düzenle.",
            "Ad, kod ve temel parti miktarını girin.",
            "Girdi satırları ekleyin.",
            "Çıktı satırları ve verim % ekleyin.",
            "Kaydedin."
          ],
          caption: "Girdi/çıktılı tarif formu.",
          intro: "Girdi, çıktı verimi ve maliyet dağılımını tanımlar.",
          fields: [
            {
              name: "Ad",
              effect: "Üretim ve raporlarda görünen ad."
            },
            {
              name: "Kod",
              effect: "İsteğe bağlı mutfak kodu."
            },
            {
              name: "Temel parti miktarı",
              effect: "Malzemeleri ölçeklemek için standart parti."
            },
            {
              name: "Maliyet dağılımı",
              effect: "Girdi maliyetini çıktılara yayma yöntemi."
            },
            {
              name: "Girdi kalemleri",
              effect: "Parti başına tüketilen kalemler."
            },
            {
              name: "Çıktı kalemleri",
              effect: "Verim % ile üretilen kalemler."
            },
            {
              name: "Aktif",
              effect: "Pasif tarifler yeni üretimde görünmez."
            }
          ]
        },
        production: {
          title: "Üretim çalıştırmaları",
          steps: [
            "Üretim sekmesini açın.",
            "Aktif tariften yeni parti başlatın.",
            "Önizleyip tamamlayın."
          ],
          caption: "Parti listeli üretim sekmesi."
        },
        "production-form": {
          title: "Üretim partisi formu",
          steps: [
            "Yeni üretim.",
            "Tarif, konum, miktar seçin.",
            "Önizlemeyi inceleyin.",
            "Tamamlayın."
          ],
          caption: "Önizlemeli parti formu.",
          intro: "Tamamlanınca girdiler düşülür, çıktılar konuma eklenir.",
          fields: [
            {
              name: "Tarif",
              effect: "Parti malzemelerini belirler."
            },
            {
              name: "Konum",
              effect: "Stok tüketim/üretim yeri."
            },
            {
              name: "Üretilen miktar",
              effect: "Tarifi temel partiden ölçekler."
            },
            {
              name: "Parti no",
              effect: "Etiket/geçmiş referansı."
            },
            {
              name: "Kalem maliyetini güncelle",
              effect: "Çıktı maliyetini yeniden hesaplar."
            },
            {
              name: "Notlar",
              effect: "Serbest not."
            }
          ]
        },
        "production-history": {
          title: "Üretim geçmişi",
          steps: [
            "Tamamlanan partileri denetleyin.",
            "Tarih/tarif/konuma göre filtreleyin.",
            "Satır açarak detay görün."
          ],
          caption: "Üretim geçmişi listesi."
        }
      },
      title: "Tarifler ve üretim",
      intro: "Parti tarifleri tanımlayın, üretim çalıştırın ve geçmişi inceleyin."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Buffet menüleri",
          steps: [
            "Envanter → Buffet → Menüler.",
            "Kahvaltı/öğle/akşam şablonları.",
            "Misafir başına tarif miktarları."
          ],
          caption: "Buffet menü listesi."
        },
        "buffet-menu-form": {
          title: "Buffet menü formu",
          steps: [
            "Menü ekle/düzenle.",
            "Oturum tipi ve misafir başına tarif.",
            "Kaydet."
          ],
          caption: "Buffet menü formu.",
          fields: [
            {
              name: "Ad",
              effect: "Oturum başlatmada etiket."
            },
            {
              name: "Kod",
              effect: "İsteğe bağlı mutfak kodu."
            },
            {
              name: "Oturum tipi",
              effect: "Kahvaltı/öğle/akşam."
            },
            {
              name: "Tarif satırları",
              effect: "Misafir başına tarif ve miktar."
            },
            {
              name: "Aktif",
              effect: "Yalnız aktif menüler seçilir."
            }
          ]
        },
        "buffet-sessions": {
          title: "Buffet oturumları",
          steps: [
            "Buffet → Oturumlar.",
            "Menüden oturum başlatın.",
            "Serviste üretim vs tahmin.",
            "Kapatın."
          ],
          caption: "Buffet oturum paneli."
        },
        "buffet-session-form": {
          title: "Buffet oturumu başlat",
          steps: [
            "Yeni oturum.",
            "Menü, konum, tarih, tip.",
            "Beklenen misafir ve fiyat.",
            "Kaydet."
          ],
          caption: "Yeni buffet oturum formu.",
          fields: [
            {
              name: "Menü",
              effect: "Tarif satırları ve tahminler."
            },
            {
              name: "Konum",
              effect: "Stok hareketleri deposu."
            },
            {
              name: "İş tarihi",
              effect: "Oturum iş günü."
            },
            {
              name: "Oturum tipi",
              effect: "Menü servisiyle uyumlu."
            },
            {
              name: "Beklenen misafir",
              effect: "İlk tarif tahminleri."
            },
            {
              name: "Buffet fiyatı",
              effect: "Misafir başına gelir."
            }
          ]
        }
      },
      title: "Buffet menüleri ve oturumlar",
      intro: "Misafir başına tarifler planlayın ve oturumları yönetin."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Maliyet merkezi listesi",
          steps: [
            "İK → Maliyet merkezleri.",
            "Kodları inceleyin.",
            "Ekle/düzenle."
          ],
          caption: "Maliyet merkezleri sekmesi."
        },
        "cost-center-form": {
          title: "Maliyet merkezi formu",
          steps: [
            "Ekle veya düzenle.",
            "Kod, ad, açıklama.",
            "Aktif/pasif.",
            "Kaydet."
          ],
          caption: "Maliyet merkezi modalı.",
          fields: [
            {
              name: "Kod",
              effect: "Benzersiz kısa tanımlayıcı."
            },
            {
              name: "Ad",
              effect: "Açılır listede etiket."
            },
            {
              name: "Açıklama",
              effect: "İsteğe bağlı notlar."
            },
            {
              name: "Aktif",
              effect: "Pasif yeni kayıtlarda seçilemez."
            }
          ]
        }
      },
      title: "Maliyet merkezleri",
      intro: "Emek ve bordroyu raporlama birimlerine etiketleyin."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Ödeme profilleri",
          steps: [
            "İK → Ödeme → Profiller.",
            "Çalışan bazlı temel ücret.",
            "Bordro hesaplamasını besler."
          ],
          caption: "Ödeme profili listesi."
        },
        "pay-profile-form": {
          title: "Ödeme profili formu",
          steps: [
            "Profil ekle/düzenle.",
            "Ödeme tipi ve temel ücret.",
            "Kaydet."
          ],
          caption: "Ödeme profili formu.",
          fields: [
            {
              name: "Çalışan",
              effect: "Bu temel ücreti alan personel."
            },
            {
              name: "Ödeme tipi",
              effect: "Saatlik, maaş, sözleşme, komisyon veya karma."
            },
            {
              name: "Temel ücret",
              effect: "Ana ücret veya maaş tutarı."
            },
            {
              name: "Para birimi",
              effect: "ISO para birimi."
            },
            {
              name: "Geçerlilik başlangıcı",
              effect: "Profilin ilk günü."
            },
            {
              name: "Geçerlilik bitişi",
              effect: "İsteğe bağlı bitiş."
            }
          ]
        },
        "pay-rules": {
          title: "Ödeme kuralları",
          steps: [
            "Ödeme → Kurallar.",
            "Öncelik ve yığınlama modları.",
            "Çalışan/departman/tatil filtreleri."
          ],
          caption: "Ödeme kuralları listesi."
        },
        "pay-rule-form": {
          title: "Ödeme kuralı formu",
          steps: [
            "Kod ve ad ile kural ekle.",
            "Etkileri tanımla.",
            "Tarih/saat filtreleri.",
            "Çalışan/departman ata.",
            "Kaydet."
          ],
          caption: "Etkili kural formu.",
          intro: "Etkiler ve uygunluk filtreleri içerir.",
          fields: [
            {
              name: "Kod",
              effect: "Benzersiz kural kimliği."
            },
            {
              name: "Ad",
              effect: "Admin listede etiket."
            },
            {
              name: "Öncelik",
              effect: "Yığınlama önceliği."
            },
            {
              name: "Yığınlama modu",
              effect: "Diğer kurallarla etkileşim."
            },
            {
              name: "Etkiler",
              effect: "Çarpan veya tutar ayarları."
            },
            {
              name: "Çalışan/departman/pozisyon/maliyet merkezi filtreleri",
              effect: "Kapsamı sınırlar."
            },
            {
              name: "Tarih ve saat penceresi",
              effect: "İsteğe bağlı aralık."
            },
            {
              name: "Haftanın günleri / aylar",
              effect: "Takvim kısıtları."
            },
            {
              name: "Tatiller",
              effect: "Seçili resmi tatiller."
            },
            {
              name: "Fazla mesai (gün/hafta)",
              effect: "Eşik aşımında tetiklenir."
            }
          ]
        }
      },
      title: "Ödeme profilleri ve kuralları",
      intro: "Temel ücretler ve prim kuralları."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Bordro dönemleri",
          steps: [
            "İK → Bordro → Dönemler.",
            "Ödeme döngüsüne göre dönem oluşturun.",
            "Final öncesi kilitleyin."
          ],
          caption: "Bordro dönem listesi."
        },
        "payroll-period-form": {
          title: "Bordro dönemi formu",
          steps: [
            "Ad, tip, tarih aralığı.",
            "Açık durumda bırakın.",
            "Kilitli/Kapalı/Ödendi değiştirin."
          ],
          caption: "Bordro dönemi formu.",
          fields: [
            {
              name: "Dönem adı",
              effect: "Run ve dışa aktarmalarda etiket."
            },
            {
              name: "Dönem tipi",
              effect: "Haftalık, iki haftalık, aylık veya özel."
            },
            {
              name: "Başlangıç",
              effect: "Dönemin ilk günü."
            },
            {
              name: "Bitiş",
              effect: "Dönemin son günü."
            },
            {
              name: "Durum",
              effect: "Açık düzenlemeye izin verir; kilitli/kapalı kısıtlar."
            }
          ]
        },
        "payroll-runs": {
          title: "Bordro çalıştırmaları",
          steps: [
            "Bordro → Çalıştırmalar.",
            "Önizleme oluşturun.",
            "Anlık görüntüleri inceleyin."
          ],
          caption: "Dönem bordro çalıştırmaları."
        },
        "payroll-run-form": {
          title: "Bordro çalıştırması oluştur",
          steps: [
            "Yeni çalıştırma.",
            "Açık dönem seçin.",
            "Önizleme oluşturun."
          ],
          caption: "Yeni bordro çalıştırma formu.",
          fields: [
            {
              name: "Bordro dönemi",
              effect: "Dahil saat ve düzeltmeleri belirler."
            },
            {
              name: "Çalıştırma no",
              effect: "Aynı dönemde sıralı kimlik."
            }
          ]
        },
        adjustments: {
          title: "Bordro düzeltmeleri",
          steps: [
            "Bordro → Düzeltmeler.",
            "Bonus/ceza/ödenek ekleyin.",
            "Döneme bağlayın."
          ],
          caption: "İş gücü düzeltme listesi."
        },
        "adjustment-form": {
          title: "Düzeltme formu",
          steps: [
            "Çalışan, tip, tutar, tarih.",
            "İsteğe bağlı dönem.",
            "Kaydet."
          ],
          caption: "Bordro düzeltme formu.",
          fields: [
            {
              name: "Çalışan",
              effect: "Düzeltmeyi alan personel."
            },
            {
              name: "Bordro dönemi",
              effect: "İsteğe bağlı run bağlantısı."
            },
            {
              name: "Tip",
              effect: "Bonus, ceza, ödenek, iade, avans, kredi, düzeltme veya kesinti."
            },
            {
              name: "Tutar",
              effect: "Brüte eklenen/çıkarılan tutar."
            },
            {
              name: "Geçerlilik tarihi",
              effect: "Hangi run'a dahil olacağını belirler."
            },
            {
              name: "Açıklama",
              effect: "Bordro detayı ve denetim."
            }
          ]
        }
      },
      title: "Bordro dönemleri ve çalıştırmalar",
      intro: "Dönemleri kapatın, önizlemeli bordro oluşturun."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Belge listesi",
          steps: [
            "İK → Belgeler.",
            "Çalışan/kategori filtre.",
            "Yükle veya güncelle."
          ],
          caption: "Çalışan belgeleri sekmesi."
        },
        "document-form": {
          title: "Belge formu",
          steps: [
            "Belge ekle.",
            "Çalışan, başlık, kategori.",
            "Dosya ekle, son tarih.",
            "Kaydet."
          ],
          caption: "Belge yükleme formu.",
          fields: [
            {
              name: "Çalışan",
              effect: "Belge kaydının sahibi."
            },
            {
              name: "Başlık",
              effect: "Listelerde görünen ad."
            },
            {
              name: "Kategori",
              effect: "Sözleşme, sertifika, lisans, kimlik, tıbbi, uyarı veya diğer."
            },
            {
              name: "Son tarih",
              effect: "Yenileme uyarıları için isteğe bağlı."
            },
            {
              name: "Dosya ekle",
              effect: "Oluşturmada zorunlu; kütüphanede saklar."
            }
          ]
        }
      },
      title: "Çalışan belgeleri",
      intro: "Sözleşme, kimlik ve lisans dosyalarını saklayın."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Performans listesi",
          steps: [
            "İK → Performans.",
            "Çalışan/tip/şiddete göre inceleyin.",
            "Olay veya değerlendirme sonrası ekleyin."
          ],
          caption: "Performans notları sekmesi."
        },
        "performance-form": {
          title: "Performans notu formu",
          steps: [
            "Çalışan, tip, başlık, metin.",
            "Şiddet belirleyin.",
            "Çalışana görünür seçeneği.",
            "Kaydet."
          ],
          caption: "Performans notu formu.",
          fields: [
            {
              name: "Çalışan",
              effect: "Notun konusu."
            },
            {
              name: "Tip",
              effect: "Uyarı, övgü, değerlendirme veya olay."
            },
            {
              name: "Başlık",
              effect: "Listelerde kısa özet."
            },
            {
              name: "İçerik",
              effect: "Olayın tam anlatımı."
            },
            {
              name: "Şiddet",
              effect: "Düşük, orta, yüksek veya kritik."
            },
            {
              name: "Çalışana görünür",
              effect: "Açıksa çalışan görebilir."
            }
          ]
        }
      },
      title: "Performans notları",
      intro: "Uyarı, övgü ve olay kayıtları."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Sipariş iptal veya void",
          steps: [
            "Devam eden siparişte ⋯ açın ve Siparişi iptal et seçin.",
            "Void nedeni seçin (raporlama için zorunlu).",
            "Tam void için tümünü seçili bırakın veya kısmi için satır seçin.",
            "Onaylayın; masa uygunsa serbest bırakılır."
          ],
          caption: "Neden ve kalem seçimli iptal modalı.",
          intro: "Devam eden çeki iptal eder. Tam void tüm satırları; kısmi void seçili kalemleri kaldırır.",
          fields: [
            {
              name: "Neden",
              effect: "Denetim ve raporlar için kaydedilen zorunlu void nedeni."
            },
            {
              name: "Tüm kalemleri seç",
              effect: "İşaretliyken tüm çek void edilir; değilse satır seçimi açılır."
            },
            {
              name: "Kısmi void",
              effect: "Yalnızca seçili miktarları void eder, kalan çek açık kalır."
            }
          ]
        },
        refund: {
          title: "Ödenmiş siparişi iade et",
          steps: [
            "Ödenmiş siparişi açın ve İade seçin.",
            "İade edilecek kalemleri ve miktarları seçin.",
            "İade nedeni seçip onaylayın.",
            "Sistem iadeyi kaydeder ve ödeme toplamlarını günceller."
          ],
          caption: "Kalem seçimli iade modalı.",
          intro: "Ödenmiş çeke iade yapar; isteğe bağlı seçili kalemler.",
          fields: [
            {
              name: "İade kalemleri",
              effect: "Müşteriye iade edilen ödenmiş satırlar ve miktarlar."
            },
            {
              name: "Neden",
              effect: "Yönetici incelemesi ve raporlar için iade gerekçesi."
            }
          ]
        },
        "split-seats": {
          title: "Koltuklara göre böl",
          steps: [
            "⋯ menüsünden Koltuklara göre böl seçin.",
            "Koltuk gruplarını inceleyin.",
            "Onaylayın; her koltuk için ayrı çek oluşur."
          ],
          caption: "Onay öncesi koltuk bölme önizlemesi.",
          intro: "Çeki koltuk numarasına göre ayrı çeklere böler."
        },
        "split-items": {
          title: "Kalemlere göre böl",
          steps: [
            "⋯ → Kalemlere göre böl.",
            "Her satırı yeni çek sütununa taşıyın.",
            "Onaylayın; ayrı Devam eden çekler oluşur."
          ],
          caption: "Kalem atama ızgarası.",
          intro: "Satırları koltuktan bağımsız yeni çeklere atar."
        },
        "split-amount": {
          title: "Tutara göre böl",
          steps: [
            "⋯ → Tutara göre böl.",
            "Parça sayısı veya özel tutarlar girin.",
            "Onaylayın; her parça için alt çek oluşur."
          ],
          caption: "Tutar bölme diyalogu.",
          intro: "Toplamı sabit veya eşit parçalara böler."
        },
        merge: {
          title: "Siparişleri birleştir",
          steps: [
            "İlk siparişte ⋯ → Birleştir.",
            "Her ek sipariş için tekrarlayın.",
            "Masa seçin ve hedef masayı belirleyin.",
            "Birleştirmeyi onaylayın."
          ],
          caption: "Seçili siparişler ve masa seçici çubuğu.",
          intro: "Birden fazla Devam eden çeki bir masada birleştirir.",
          fields: [
            {
              name: "Sipariş seç",
              effect: "Birleştirme setine sipariş ekler."
            },
            {
              name: "Masa seç",
              effect: "Birleşik çeğin oturacağı masayı belirler."
            },
            {
              name: "Birleştirmeyi onayla",
              effect: "Seçili çekleri tek Devam eden siparişte birleştirir."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Kar ve zarar",
          steps: [
            "Hesaplar → Kar/Zarar sekmesi.",
            "Tarih aralığı veya dönem seçin.",
            "Hesap gruplarını genişletin.",
            "Dönem kapandığında dışa aktarın."
          ],
          caption: "Kar/zarar tab sekmesi.",
          intro: "Seçilen dönem gelir tablosu: gelir, satış maliyeti, giderler."
        },
        "cash-flow": {
          title: "Nakit akışı",
          steps: [
            "Hesaplar → Nakit akışı sekmesi.",
            "Diğer tablolarla aynı dönemi seçin.",
            "Açılış, net değişim ve kapanışı inceleyin.",
            "Tahakkuk farklarını açıklamak için K/Z ile kullanın."
          ],
          caption: "Nakit akışı sekmesi.",
          intro: "Dönem operasyonel, yatırım ve finansman nakit hareketlerini özetler."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Çalışan formu",
          steps: [
            "Çalışanlar → Ekle/düzenle.",
            "Numara, ad, istihdam detayları.",
            "POS kullanıcı, departman, pozisyon bağla.",
            "Kaydet."
          ],
          caption: "Çalışan oluştur/düzenle modalı.",
          intro: "POS kullanıcısı ve org yapısını bağlayan temel İK kaydı.",
          fields: [
            {
              name: "Çalışan no",
              effect: "Program ve exportlarda benzersiz id."
            },
            {
              name: "Ad / soyad",
              effect: "İK belgelerinde görünen ad."
            },
            {
              name: "Bağlı kullanıcı",
              effect: "İsteğe bağlı POS girişi."
            },
            {
              name: "Departman",
              effect: "Raporlama birimi."
            },
            {
              name: "Pozisyon",
              effect: "Program ve ödeme kurallarında unvan."
            },
            {
              name: "Maliyet merkezi",
              effect: "Varsayılan işçilik maliyeti."
            },
            {
              name: "Yönetici",
              effect: "Onay hattı."
            },
            {
              name: "İstihdam durumu",
              effect: "Aktif, pasif, ayrılmış, izinli veya askıda."
            },
            {
              name: "İstihdam tipi",
              effect: "Saatlik, maaş, sözleşme vb."
            },
            {
              name: "İşe giriş / ayrılış",
              effect: "Kıdem ve uygunluk."
            }
          ]
        },
        "department-form": {
          title: "Departman formu",
          steps: [
            "Departmanlar veya satır içi ekle.",
            "Kod, ad, açıklama.",
            "Kaydet."
          ],
          caption: "Departman formu.",
          fields: [
            {
              name: "Kod",
              effect: "Entegrasyonlar için kısa id."
            },
            {
              name: "Ad",
              effect: "Listelerde görünen ad."
            },
            {
              name: "Açıklama",
              effect: "İsteğe bağlı notlar."
            },
            {
              name: "Aktif",
              effect: "Pasif departmanlar yeni atamalarda gizli."
            }
          ]
        },
        "position-form": {
          title: "Pozisyon formu",
          steps: [
            "Pozisyonlar veya inline.",
            "Kod, ad, departman, maliyet merkezi.",
            "Kaydet."
          ],
          caption: "Pozisyon formu.",
          fields: [
            {
              name: "Kod",
              effect: "Bordro export iş kodu."
            },
            {
              name: "Ad",
              effect: "İK ve programlarda unvan."
            },
            {
              name: "Departman",
              effect: "Varsayılan org birimi."
            },
            {
              name: "Varsayılan maliyet merkezi",
              effect: "Programlarda önceden doldurulur."
            },
            {
              name: "Aktif",
              effect: "Artık işe alınmayan unvanları kaldırır."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Manuel devam girişi",
          steps: [
            "Devam → Manuel giriş.",
            "Çalışan ve giriş/çıkış saatleri.",
            "Not ekleyip kaydedin."
          ],
          caption: "Manuel devam modalı.",
          intro: "Eksik punch'ları düzeltir veya terminal yokken süre ekler.",
          fields: [
            {
              name: "Çalışan",
              effect: "Kaydı oluşturulan/düzeltilen kişi."
            },
            {
              name: "Giriş",
              effect: "Çalışma aralığı başlangıcı."
            },
            {
              name: "Çıkış",
              effect: "Bitiş; girişten sonra olmalı."
            },
            {
              name: "Notlar",
              effect: "Manuel giriş gerekçesi."
            }
          ]
        },
        "schedule-form": {
          title: "Çalışma programı formu",
          steps: [
            "Planlama → program ekle.",
            "Ad ve dönem başlangıç/bitiş.",
            "Taslakta vardiya ekle/üret."
          ],
          caption: "Çalışma programı formu.",
          intro: "Taslak veya yayınlanmış vardiyalar içeren tarih aralığı.",
          fields: [
            {
              name: "Ad",
              effect: "Dönem etiketi (örn. Hafta 12)."
            },
            {
              name: "Dönem başlangıcı",
              effect: "Kapsanan ilk zaman."
            },
            {
              name: "Dönem bitişi",
              effect: "Kapsanan son zaman."
            }
          ]
        },
        "shift-form": {
          title: "Planlı vardiya formu",
          intro: "Taslak programda çalışanı zaman bloğuna atar.",
          steps: [
            "Taslak programda vardiya ekle.",
            "Program, çalışan, başlangıç/bitiş.",
            "Şablon ve org etiketleri isteğe bağlı.",
            "Kaydet."
          ],
          caption: "Planlı vardiya formu.",
          fields: [
            {
              name: "Çalışma programı",
              effect: "Düzenlenebilir taslak program."
            },
            {
              name: "Çalışan",
              effect: "Vardiyaya atanan personel."
            },
            {
              name: "Vardiya şablonu",
              effect: "Admin → Kullanıcılar → Vardiyalar preset."
            },
            {
              name: "Departman / pozisyon / maliyet merkezi",
              effect: "Bu vardiya için org etiketleri."
            },
            {
              name: "Başlangıç / bitiş",
              effect: "Planlı saat penceresi."
            }
          ]
        },
        "schedule-template": {
          title: "Program şablonu formu",
          steps: [
            "Planlama → Şablonlar.",
            "Ad ve günler/saatler.",
            "Vardiya şablonu/org isteğe bağlı.",
            "Kaydet."
          ],
          caption: "Program şablonu formu.",
          intro: "Toplu vardiya üretimi için haftalık kalıp.",
          fields: [
            {
              name: "Ad",
              effect: "Üret dialog etiketi."
            },
            {
              name: "Haftanın günleri",
              effect: "Vardiya alan günler."
            },
            {
              name: "Başlangıç / bitiş saati",
              effect: "Günlük pencere."
            },
            {
              name: "Mola dakikası",
              effect: "Ücretsiz mola düşülür."
            },
            {
              name: "Vardiya şablonu",
              effect: "POS vardiya tanımı."
            }
          ]
        },
        "schedule-generate": {
          title: "Şablondan program üret",
          steps: [
            "Planlama → Üret.",
            "Taslak program ve şablon.",
            "Çalışanları seç.",
            "Üret."
          ],
          caption: "Program üret dialogu.",
          fields: [
            {
              name: "Çalışma programı",
              effect: "Hedef taslak."
            },
            {
              name: "Şablon",
              effect: "Haftalık gün/saat kalıbı."
            },
            {
              name: "Çalışanlar",
              effect: "Şablon vardiyalarını alan personel."
            }
          ]
        },
        "schedule-swap": {
          title: "Vardiya değişim talebi",
          steps: [
            "Planlama → Değişim talep et.",
            "Planlı vardiya ve talep eden.",
            "Hedef çalışan isteğe bağlı.",
            "Gönder."
          ],
          caption: "Değişim talep formu.",
          fields: [
            {
              name: "Planlı vardiya",
              effect: "Talep edilen vardiya."
            },
            {
              name: "Talep eden",
              effect: "Değişimi başlatan."
            },
            {
              name: "Hedef çalışan",
              effect: "İsteğe bağlı alıcı."
            },
            {
              name: "Önerilen vardiya",
              effect: "Karşı vardiya."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "İzin talep formu",
          steps: [
            "İzin → Talep ekle.",
            "Çalışan, tip, tarih aralığı.",
            "Gün ve neden.",
            "Kaydet."
          ],
          caption: "İzin talep formu.",
          intro: "Yapılandırılmış izin türlerine göre talep gönderir.",
          fields: [
            {
              name: "Çalışan",
              effect: "İzin isteyen personel."
            },
            {
              name: "İzin tipi",
              effect: "Ücretli/ücretsiz ve onay kuralları."
            },
            {
              name: "Başlangıç / bitiş",
              effect: "Kapsayıcı tarihler."
            },
            {
              name: "Günler",
              effect: "Tüketilen iş günleri."
            },
            {
              name: "Neden",
              effect: "Onaylayıcılar için not."
            }
          ]
        },
        "holiday-form": {
          title: "Resmi tatil formu",
          steps: [
            "İzin → Tatiller.",
            "Ad, tarih, ülke kodu.",
            "Yinelenen işaretle.",
            "Kaydet."
          ],
          caption: "Resmi tatil formu.",
          intro: "Ödeme kuralları ve planlamayla etkileşir.",
          fields: [
            {
              name: "Ad",
              effect: "Takvim ve kurallarda etiket."
            },
            {
              name: "Tarih",
              effect: "Gözlemlenen tarih."
            },
            {
              name: "Ülke kodu",
              effect: "ISO kodu isteğe bağlı."
            },
            {
              name: "Yinelenen",
              effect: "Her yıl aynı gün."
            },
            {
              name: "Aktif",
              effect: "Pasif tatiller yeni kurallarda yok sayılır."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Yemek formu",
          steps: [
            "Admin → Menüler → Yemekler.",
            "No, ad, fiyat, maliyet, kategoriler.",
            "Modifier grupları ve mutfak bağla.",
            "Kaydet."
          ],
          caption: "Yemek bakım formu.",
          intro: "Satılabilir ürünler: fiyat, kategori, modifier, tarif, mutfak.",
          fields: [
            {
              name: "No / ad",
              effect: "POS kimliği ve görünen ad."
            },
            {
              name: "Fiyat / maliyet",
              effect: "Satış fiyatı ve teorik maliyet."
            },
            {
              name: "Kategoriler",
              effect: "Menü gruplama ve indirim hedefi."
            },
            {
              name: "Modifier grupları",
              effect: "Özelleştirme akışı."
            },
            {
              name: "Tarif satırları",
              effect: "Satışta envanter tüketimi."
            },
            {
              name: "Mutfak / iş akışı",
              effect: "KOT yönlendirme ve hazırlık."
            }
          ]
        },
        "menu-form": {
          title: "Menü formu",
          steps: [
            "Menüler sekmesi.",
            "Ad ve saatler.",
            "Gece menüsü için ertesi gün bitiş.",
            "Kaydet."
          ],
          caption: "Menü formu.",
          intro: "POS'ta hangi kategorilerin görüneceğini zamanlar.",
          fields: [
            {
              name: "Ad",
              effect: "POS seçicide etiket."
            },
            {
              name: "Başlangıç / bitiş",
              effect: "Otomatik kullanılabilirlik."
            },
            {
              name: "Ertesi gün biter",
              effect: "Gece yarısı sonrası servis."
            },
            {
              name: "Aktif",
              effect: "Pasif menüler gizli."
            }
          ]
        },
        "category-form": {
          title: "Kategori formu",
          steps: [
            "Kategoriler.",
            "Ad, öncelik, menüde göster.",
            "Kaydet."
          ],
          caption: "Kategori formu.",
          fields: [
            {
              name: "Ad",
              effect: "POS ve raporlarda başlık."
            },
            {
              name: "Öncelik",
              effect: "Sıralama."
            },
            {
              name: "Menüde göster",
              effect: "Kapalıysa müşteri menüsünde gizli."
            }
          ]
        },
        "modifier-group-form": {
          title: "Modifier grup formu",
          steps: [
            "Modifier grupları.",
            "Ad, öncelik, fiyatlar.",
            "Sonraki gruplar.",
            "Kaydet."
          ],
          caption: "İç içe gruplu form.",
          intro: "Modifier, fiyat ve iç içe sonraki gruplar.",
          fields: [
            {
              name: "Ad / öncelik",
              effect: "Etiket ve sıra."
            },
            {
              name: "Modifier",
              effect: "Seçilebilir seçenek."
            },
            {
              name: "Fiyat",
              effect: "Ek ücret."
            },
            {
              name: "İzinli sonraki gruplar",
              effect: "Seçim sonrası açılan gruplar."
            },
            {
              name: "Sonraki grup geçersiz kılmaları",
              effect: "Gizle veya fiyat değiştir."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Kat formu",
          steps: [
            "Admin → Katlar.",
            "Ad, öncelik, renkler.",
            "Kaydet."
          ],
          caption: "Kat formu.",
          fields: [
            {
              name: "Ad",
              effect: "POS kat seçicide etiket."
            },
            {
              name: "Öncelik",
              effect: "Sıralama."
            },
            {
              name: "Arka plan / renk",
              effect: "Plan varsayılan stili."
            }
          ]
        },
        "table-form": {
          title: "Masa formu",
          steps: [
            "Kat seç, masa ekle.",
            "No, ad, renkler.",
            "Kısıtlamalar isteğe bağlı.",
            "Kişi sayısı sor.",
            "Kaydet."
          ],
          caption: "Masa formu.",
          intro: "Kat ve kategori/sipariş/ödeme kısıtları.",
          fields: [
            {
              name: "Ad / no",
              effect: "Planda etiket."
            },
            {
              name: "Kat",
              effect: "Üst kat planı."
            },
            {
              name: "Öncelik",
              effect: "Sıralama."
            },
            {
              name: "Kategoriler / sipariş / ödeme tipleri",
              effect: "İsteğe bağlı kısıtlar."
            },
            {
              name: "Kişi sayısı sor",
              effect: "Açılışta misafir sayısı."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "İndirim kuralı formu",
          steps: [
            "Admin → Promosyonlar → İndirimler.",
            "Kategori, kapsam, mod.",
            "Hedefler ve değer.",
            "Kaydet."
          ],
          caption: "Kategori ve hedefli form.",
          intro: "14 kategori ve scope: item, category, cart, customer, floor.",
          fields: [
            {
              name: "Kategori",
              effect: "14 tipten biri."
            },
            {
              name: "Kapsam",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "Uygulama modu",
              effect: "manual, automatic, both."
            },
            {
              name: "Hedefler",
              effect: "Uygun ürün/kategori/müşteri/kat."
            },
            {
              name: "Tip (yüzde / sabit)",
              effect: "Min/max türü."
            },
            {
              name: "Min / max oran",
              effect: "İzin verilen aralık."
            },
            {
              name: "Max tavan",
              effect: "Yüzde indirimlerde üst limit."
            },
            {
              name: "Öncelik",
              effect: "Otomatik kurallarda sıra."
            },
            {
              name: "Min sipariş tutarı",
              effect: "Alt toplam eşiği."
            },
            {
              name: "Yığınlama modu",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Vergi muamelesi",
              effect: "tax_before/after_discount, inclusive, exclusive."
            },
            {
              name: "Programlar",
              effect: "Gün/saat pencereleri."
            },
            {
              name: "Koşullar",
              effect: "Buy X Get Y."
            },
            {
              name: "Neden / onay gerekir",
              effect: "Manuel uygulamada PIN."
            }
          ]
        },
        "coupon-form": {
          title: "Kupon formu",
          steps: [
            "Promosyonlar → Kuponlar.",
            "Kod, indirim tip/değer, limitler.",
            "Geçerli günler ve tarihler.",
            "Kaydet."
          ],
          caption: "Kupon formu.",
          fields: [
            {
              name: "Kod",
              effect: "Ödemede girilen dize."
            },
            {
              name: "Kupon tipi",
              effect: "Tek/çok kullanım."
            },
            {
              name: "İndirim tip/değer",
              effect: "Yüzde veya sabit."
            },
            {
              name: "Min sipariş tutarı",
              effect: "Alt toplam eşiği."
            },
            {
              name: "Max indirim",
              effect: "Yüzde kuponlarda tavan."
            },
            {
              name: "Kullanım limiti",
              effect: "Toplam kullanım."
            },
            {
              name: "Kullanıcı başına limit",
              effect: "Müşteri profili başına."
            },
            {
              name: "Geçerli günler / saatler",
              effect: "Gün ve saat kısıtı."
            },
            {
              name: "Başlangıç / bitiş tarihi",
              effect: "Genel geçerlilik."
            },
            {
              name: "Yığılabilir / sadece ilk sipariş",
              effect: "Kombinasyon kuralları."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Mutfak formu",
          steps: [
            "Admin → Mutfak → Mutfaklar.",
            "Ad, öncelik, yazıcılar, yemekler.",
            "Kaydet."
          ],
          caption: "Mutfak istasyon formu.",
          intro: "Yemekleri yazıcı ve envanter konumlarına yönlendirir.",
          fields: [
            {
              name: "Ad",
              effect: "KOT ve sipariş ekranında etiket."
            },
            {
              name: "Öncelik",
              effect: "Eşleşen mutfaklarda sıra."
            },
            {
              name: "Yazıcılar",
              effect: "Bu mutfak için ticket yazdıran cihazlar."
            },
            {
              name: "Kalemler (yemekler)",
              effect: "Bu istasyona yönlendirilen yemekler."
            }
          ]
        },
        "workflow-form": {
          title: "İş akışı formu",
          steps: [
            "Mutfak → İş akışları.",
            "Ad ve sıralı aşamalar.",
            "Her aşamaya mutfak ata.",
            "Yemeklere bağla."
          ],
          caption: "Aşama düzenleyici.",
          intro: "Mutfak aşamalarını zincirler.",
          fields: [
            {
              name: "Ad",
              effect: "Yemeklerde tanımlayıcı."
            },
            {
              name: "Aşamalar",
              effect: "Sıralı hazırlık adımları."
            },
            {
              name: "Aşama mutfağı",
              effect: "Her aşamanın istasyonu."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Yazıcı formu",
          steps: [
            "Admin → Yazdırma → Yazıcılar.",
            "Ad ve bağlantı (IP/USB).",
            "Tip seç (fiş, mutfak, etiket).",
            "Kaydet."
          ],
          caption: "Yazıcı formu.",
          fields: [
            {
              name: "Ad",
              effect: "Admin ve seçicilerde ad."
            },
            {
              name: "Tip",
              effect: "Fiş, mutfak veya etiket profili."
            },
            {
              name: "IP / port",
              effect: "Ağ ESC/POS bağlantısı."
            },
            {
              name: "VID / PID",
              effect: "USB tanımlayıcıları."
            }
          ]
        },
        "print-setting-form": {
          title: "Yazdırma ayarı formu",
          steps: [
            "Yazdırma ayarları.",
            "İş tipi seç.",
            "Logo, üst/alt, KDV, kenar boşlukları.",
            "Kaydet."
          ],
          caption: "Şablon düzenleyici.",
          intro: "Her iş tipinin kendi şablonu vardır.",
          fields: [
            {
              name: "Logo göster",
              effect: "Yüklenen logo ticket'ta."
            },
            {
              name: "Üst / alt bölümler",
              effect: "Metin veya görsel bloklar."
            },
            {
              name: "KDV ad/no",
              effect: "Vergi bloğu."
            },
            {
              name: "Kenar boşlukları",
              effect: "Üst/alt/sol/sağ nokta."
            },
            {
              name: "Kalem sütunları",
              effect: "No, ad, miktar, fiyat, toplam."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Ödeme tipi formu",
          steps: [
            "Admin → Ödemeler → Tipler.",
            "Ad, öncelik, tip.",
            "Remote: gateway, mod, API anahtarları.",
            "Kaydet."
          ],
          caption: "Remote gateway formu.",
          intro: "Yerel ve Remote (Stripe, PayPal) tipleri.",
          fields: [
            {
              name: "Ad",
              effect: "Ödeme ekranı etiketi."
            },
            {
              name: "Öncelik",
              effect: "Sıralama."
            },
            {
              name: "Tip",
              effect: "Remote gateway alanlarını açar."
            },
            {
              name: "Gateway sağlayıcı",
              effect: "Stripe, PayPal vb."
            },
            {
              name: "Gateway modu",
              effect: "Test vs live."
            },
            {
              name: "public_key",
              effect: "İstemci tarafı anahtar."
            },
            {
              name: "secret_key",
              effect: "Sunucu gizli anahtarı."
            },
            {
              name: "webhook_secret",
              effect: "Asenkron callback doğrulama."
            },
            {
              name: "client_id / client_secret",
              effect: "OAuth gateway."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Sağlayıcı alanları."
            },
            {
              name: "Vergi",
              effect: "Varsayılan vergi kuralı."
            },
            {
              name: "İndirimler",
              effect: "Otomatik indirim kuralları."
            }
          ]
        },
        "tax-form": {
          title: "Vergi formu",
          steps: [
            "Ödemeler → Vergiler.",
            "Ad, oran, inclusive/exclusive.",
            "Kaydet."
          ],
          caption: "Vergi formu.",
          fields: [
            {
              name: "Ad",
              effect: "Fiş etiketi."
            },
            {
              name: "Oran",
              effect: "Vergilendirilebilir tutara yüzde."
            },
            {
              name: "Inclusive",
              effect: "True ise fiyata dahil."
            }
          ]
        },
        "order-type-form": {
          title: "Sipariş tipi formu",
          steps: [
            "Ödemeler → Sipariş tipleri.",
            "Ad ve bayraklar.",
            "Kaydet."
          ],
          caption: "Sipariş tipi formu.",
          fields: [
            {
              name: "Ad",
              effect: "Çeklerde görünen tip."
            },
            {
              name: "Öncelik",
              effect: "Seçici sırası."
            },
            {
              name: "Varsayılan",
              effect: "Yeni siparişlerde ön seçili."
            }
          ]
        },
        "extra-form": {
          title: "Extra (servis ücreti) formu",
          steps: [
            "Ödemeler → Extras.",
            "Ad ve tutar/yüzde.",
            "Ne zaman uygulanacağını ayarla.",
            "Kaydet."
          ],
          caption: "Ek ücret formu.",
          intro: "Otomatik ek ücretler ekler.",
          fields: [
            {
              name: "Ad",
              effect: "Misafir fişi etiketi."
            },
            {
              name: "Tutar / oran",
              effect: "Sabit veya yüzde."
            },
            {
              name: "Vergilendirilebilir",
              effect: "Ek ücrete vergi hesaplanır mı."
            },
            {
              name: "Otomatik uygulama kuralları",
              effect: "Sipariş/ödeme/kat bağlantıları."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Kullanıcı formu",
          steps: [
            "Admin → Kullanıcılar.",
            "Giriş yöntemi, ad, kimlik bilgileri, rol, vardiya.",
            "İsteğe bağlı çalışan oluştur.",
            "Kaydet."
          ],
          caption: "Kullanıcı hesap formu.",
          intro: "POS operatörleri PIN veya şifre ile giriş yapar.",
          fields: [
            {
              name: "Giriş yöntemi",
              effect: "PIN (4 hane) veya şifre."
            },
            {
              name: "Ad / soyad",
              effect: "Çeklerde görünen ad."
            },
            {
              name: "Login / PIN",
              effect: "Giriş kimlik bilgisi."
            },
            {
              name: "Şifre",
              effect: "Şifre girişinde zorunlu."
            },
            {
              name: "Kullanıcı rolü",
              effect: "Modül izin paketi."
            },
            {
              name: "Kullanıcı vardiyası",
              effect: "Varsayılan vardiya."
            },
            {
              name: "Çalışan oluştur",
              effect: "Bağlı HR çalışanı oluşturur."
            }
          ]
        },
        "role-form": {
          title: "Rol formu",
          steps: [
            "Kullanıcılar → Roller.",
            "Ad ve modül ağacı.",
            "Modül/eylem işaretle.",
            "Kaydet."
          ],
          caption: "Rol izin düzenleyici.",
          intro: "Modül ve eylem erişimi verir.",
          fields: [
            {
              name: "Ad",
              effect: "Kullanıcı formunda etiket."
            },
            {
              name: "Modül izinleri",
              effect: "Hiyerarşik onay kutuları."
            }
          ]
        },
        "shift-form": {
          title: "Vardiya şablonu formu",
          steps: [
            "Kullanıcılar → Vardiyalar.",
            "Ad, başlangıç/bitiş saati.",
            "Gece vardiyası otomatik ertesi gün.",
            "Kaydet."
          ],
          caption: "Vardiya şablon formu.",
          intro: "Admin vardiya tanımları.",
          fields: [
            {
              name: "Ad",
              effect: "Etiket (örn. Sabah)."
            },
            {
              name: "Başlangıç saati",
              effect: "Planlı başlangıç."
            },
            {
              name: "Bitiş saati",
              effect: "Planlı bitiş."
            }
          ]
        },
        "tips-definition": {
          title: "Bahşiş tanımı (dağıtım)",
          steps: [
            "Kullanıcılar → Bahşiş tanımı.",
            "Rol satırları ve ağırlıklar.",
            "Kullanıcı geçersiz kılmaları.",
            "Kaydet."
          ],
          caption: "Bahşiş dağıtım paneli.",
          intro: "Havuz bahşişlerinin rol/kullanıcı ağırlıklarını ayarlar.",
          fields: [
            {
              name: "Rol ağırlığı",
              effect: "Rol başına havuz payı."
            },
            {
              name: "Kullanıcı ağırlığı",
              effect: "İsteğe bağlı kullanıcı override."
            }
          ]
        }
      }
    }
  },
  "pt-br": {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Aba Reconciliação",
          steps: [
            "Inventário → Reconciliação cozinha.",
            "Selecione local e data operacional.",
            "Clique Gerar para linhas teóricas.",
            "Informe quantidades reais ou importe CSV.",
            "Salve rascunho, revise variâncias e Verifique."
          ],
          caption: "Barra, grade e painel de variância.",
          intro: "Gere grade a partir de vendas POS e receitas; insira ou importe contagens.",
          fields: [
            {
              name: "Local",
              effect: "Cozinha ou depósito reconciliado."
            },
            {
              name: "Data operacional",
              effect: "Dia comercial do uso teórico e contagens."
            },
            {
              name: "Gerar",
              effect: "Cria/atualiza linhas de vendas e receitas."
            },
            {
              name: "Quantidade real",
              effect: "Contagem física por item."
            },
            {
              name: "Verificar",
              effect: "Bloqueia após aprovação gerencial."
            }
          ]
        },
        "reconciliation-form": {
          title: "Entrada manual de contagem",
          steps: [
            "Clique célula Real para contagem.",
            "Salvar rascunho sem verificar.",
            "Importe CSV em lote.",
            "Revise variâncias antes de verificar."
          ],
          caption: "Grade com edição de quantidade real.",
          intro: "Edição na grade e importação CSV usam a mesma estrutura.",
          fields: [
            {
              name: "Item",
              effect: "Item de estoque na linha."
            },
            {
              name: "Teórico",
              effect: "Uso calculado por receitas e vendas."
            },
            {
              name: "Real",
              effect: "Quantidade contada informada."
            },
            {
              name: "Variância",
              effect: "Diferença real vs. teórico."
            },
            {
              name: "Notas",
              effect: "Explicação opcional na linha."
            }
          ]
        }
      },
      title: "Reconciliação da cozinha",
      intro: "Compare uso teórico com contagens físicas por local e data operacional."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Lista de receitas",
          steps: [
            "Inventário → Receitas.",
            "Navegue receitas ativas.",
            "Adicione ou edite receitas."
          ],
          caption: "Aba manutenção de receitas."
        },
        "recipe-form": {
          title: "Formulário de receita",
          steps: [
            "Adicionar ou editar receita.",
            "Nome, código e qty base do lote.",
            "Linhas de insumo e saída.",
            "Salvar."
          ],
          caption: "Formulário com insumos e saídas.",
          intro: "Define insumos, rendimentos e alocação de custo.",
          fields: [
            {
              name: "Nome",
              effect: "Nome em produção e relatórios."
            },
            {
              name: "Código",
              effect: "Código curto opcional."
            },
            {
              name: "Qty base do lote",
              effect: "Tamanho padrão do lote."
            },
            {
              name: "Alocação de custo",
              effect: "Reparte custo dos insumos."
            },
            {
              name: "Itens de insumo",
              effect: "Consumidos por lote."
            },
            {
              name: "Itens de saída",
              effect: "Produzidos com rendimento %."
            },
            {
              name: "Ativo",
              effect: "Inativas ocultas em novos lotes."
            }
          ]
        },
        production: {
          title: "Execuções de produção",
          steps: [
            "Abra aba Produção.",
            "Inicie lote de receita ativa.",
            "Pré-visualize e complete."
          ],
          caption: "Aba Produção com lotes."
        },
        "production-form": {
          title: "Formulário lote produção",
          steps: [
            "Nova produção.",
            "Receita, local, qty.",
            "Revise prévia.",
            "Complete."
          ],
          caption: "Formulário com prévia.",
          intro: "Concluir deduz insumos e adiciona saídas no local.",
          fields: [
            {
              name: "Receita",
              effect: "Define ingredientes e saídas."
            },
            {
              name: "Local",
              effect: "Onde estoque é consumido/produzido."
            },
            {
              name: "Qty produzida",
              effect: "Escala receita da base."
            },
            {
              name: "Nº lote",
              effect: "Referência opcional."
            },
            {
              name: "Atualizar custo item",
              effect: "Recalcula custo saída."
            },
            {
              name: "Notas",
              effect: "Nota livre."
            }
          ]
        },
        "production-history": {
          title: "Histórico de produção",
          steps: [
            "Audite lotes concluídos.",
            "Filtre por data/receita/local.",
            "Abra linha para detalhes."
          ],
          caption: "Lista histórico produção."
        }
      },
      title: "Receitas e produção",
      intro: "Defina receitas em lote, execute produção e revise o histórico."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Menus buffet",
          steps: [
            "Inventário → Buffet → Menus.",
            "Modelos café/almoço/jantar.",
            "Receitas por convidado."
          ],
          caption: "Lista menus buffet."
        },
        "buffet-menu-form": {
          title: "Formulário menu buffet",
          steps: [
            "Adicionar/editar menu.",
            "Tipo sessão e linhas receita.",
            "Salvar."
          ],
          caption: "Formulário menu buffet.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo ao iniciar sessão."
            },
            {
              name: "Código",
              effect: "Sigla opcional."
            },
            {
              name: "Tipo sessão",
              effect: "Café/almoço/jantar."
            },
            {
              name: "Linhas receita",
              effect: "Receita e qty por convidado."
            },
            {
              name: "Ativo",
              effect: "Só menus ativos na configuração."
            }
          ]
        },
        "buffet-sessions": {
          title: "Sessões buffet",
          steps: [
            "Buffet → Sessões.",
            "Inicie sessão do menu.",
            "Monitore produção vs previsão.",
            "Feche sessão."
          ],
          caption: "Painel sessões buffet."
        },
        "buffet-session-form": {
          title: "Iniciar sessão buffet",
          steps: [
            "Nova sessão.",
            "Menu, local, data, tipo.",
            "Convidados e preço.",
            "Salvar."
          ],
          caption: "Formulário nova sessão.",
          fields: [
            {
              name: "Menu",
              effect: "Carrega linhas e previsões."
            },
            {
              name: "Local",
              effect: "Depósito de movimentos."
            },
            {
              name: "Data operacional",
              effect: "Dia comercial."
            },
            {
              name: "Tipo sessão",
              effect: "Alinha ao menu."
            },
            {
              name: "Convidados esperados",
              effect: "Previsões iniciais."
            },
            {
              name: "Preço buffet",
              effect: "Receita por convidado."
            }
          ]
        }
      },
      title: "Menus e sessões de buffet",
      intro: "Planeje receitas por convidado e gerencie sessões de buffet."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Lista centros de custo",
          steps: [
            "RH → Centros de custo.",
            "Revise códigos.",
            "Adicione/edite."
          ],
          caption: "Aba centros de custo."
        },
        "cost-center-form": {
          title: "Formulário centro de custo",
          steps: [
            "Adicionar/editar.",
            "Código, nome, descrição.",
            "Ativo/inativo.",
            "Salvar."
          ],
          caption: "Modal centro de custo.",
          fields: [
            {
              name: "Código",
              effect: "Identificador único curto."
            },
            {
              name: "Nome",
              effect: "Rótulo nos seletores."
            },
            {
              name: "Descrição",
              effect: "Notas opcionais."
            },
            {
              name: "Ativo",
              effect: "Inativos ocultos em novos registros."
            }
          ]
        }
      },
      title: "Centros de custo",
      intro: "Etiquetam mão de obra e folha para locais e departamentos."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Perfis de pagamento",
          steps: [
            "RH → Pagamento → Perfis.",
            "Taxa base por funcionário.",
            "Alimenta folha."
          ],
          caption: "Lista perfis pagamento."
        },
        "pay-profile-form": {
          title: "Formulário perfil pagamento",
          steps: [
            "Adicionar/editar perfil.",
            "Tipo e taxa base.",
            "Salvar."
          ],
          caption: "Formulário perfil.",
          fields: [
            {
              name: "Funcionário",
              effect: "Recebe esta compensação base."
            },
            {
              name: "Tipo pagamento",
              effect: "Horista, salário, contrato, comissão ou misto."
            },
            {
              name: "Taxa base",
              effect: "Taxa principal ou salário."
            },
            {
              name: "Moeda",
              effect: "Moeda ISO."
            },
            {
              name: "Vigente de",
              effect: "Primeiro dia do perfil."
            },
            {
              name: "Vigente até",
              effect: "Fim opcional."
            }
          ]
        },
        "pay-rules": {
          title: "Regras de pagamento",
          steps: [
            "Pagamento → Regras.",
            "Empilham por prioridade.",
            "Filtros por funcionário/departamento."
          ],
          caption: "Lista regras pagamento."
        },
        "pay-rule-form": {
          title: "Formulário regra pagamento",
          steps: [
            "Adicionar regra.",
            "Definir efeitos.",
            "Filtros data/hora.",
            "Atribuir funcionários.",
            "Salvar."
          ],
          caption: "Formulário regra.",
          intro: "Efeitos e filtros de elegibilidade.",
          fields: [
            {
              name: "Código",
              effect: "ID único."
            },
            {
              name: "Nome",
              effect: "Rótulo admin."
            },
            {
              name: "Prioridade",
              effect: "Ordem de empilhamento."
            },
            {
              name: "Modo empilhamento",
              effect: "Interação com outras regras."
            },
            {
              name: "Efeitos",
              effect: "Multiplicadores ou ajustes."
            },
            {
              name: "Filtros funcionário/departamento/cargo/centro custo",
              effect: "Limita escopo."
            },
            {
              name: "Janela data/hora",
              effect: "Intervalo opcional."
            },
            {
              name: "Dias semana / meses",
              effect: "Padrões calendário."
            },
            {
              name: "Feriados",
              effect: "Feriados selecionados."
            },
            {
              name: "Horas extras (dia/semana)",
              effect: "Após limiares."
            }
          ]
        }
      },
      title: "Perfis e regras de pagamento",
      intro: "Perfis de base e regras de prêmios e deduções."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Períodos folha",
          steps: [
            "RH → Folha → Períodos.",
            "Crie períodos do ciclo.",
            "Bloqueie antes do final."
          ],
          caption: "Lista períodos folha."
        },
        "payroll-period-form": {
          title: "Formulário período folha",
          steps: [
            "Nome, tipo, datas.",
            "Status Aberto.",
            "Altere para Bloqueado/Fechado/Pago."
          ],
          caption: "Formulário período.",
          fields: [
            {
              name: "Nome período",
              effect: "Rótulo em runs e exportações."
            },
            {
              name: "Tipo período",
              effect: "Semanal, quinzenal, mensal ou custom."
            },
            {
              name: "Data início",
              effect: "Primeiro dia incluído."
            },
            {
              name: "Data fim",
              effect: "Último dia incluído."
            },
            {
              name: "Status",
              effect: "Aberto permite edições; bloqueado restringe."
            }
          ]
        },
        "payroll-runs": {
          title: "Execuções folha",
          steps: [
            "Folha → Execuções.",
            "Gere execução com prévia.",
            "Revise snapshots."
          ],
          caption: "Execuções do período."
        },
        "payroll-run-form": {
          title: "Gerar execução folha",
          steps: [
            "Nova execução.",
            "Período aberto.",
            "Gerar prévia."
          ],
          caption: "Formulário nova execução.",
          fields: [
            {
              name: "Período folha",
              effect: "Define horas e ajustes incluídos."
            },
            {
              name: "Nº execução",
              effect: "ID sequencial no período."
            }
          ]
        },
        adjustments: {
          title: "Ajustes folha",
          steps: [
            "Folha → Ajustes.",
            "Adicione bônus/penalidades.",
            "Vincule ao período."
          ],
          caption: "Lista ajustes."
        },
        "adjustment-form": {
          title: "Formulário ajuste",
          steps: [
            "Funcionário, tipo, valor, data.",
            "Período opcional.",
            "Salvar."
          ],
          caption: "Formulário ajuste folha.",
          fields: [
            {
              name: "Funcionário",
              effect: "Recebe o ajuste."
            },
            {
              name: "Período folha",
              effect: "Vínculo opcional ao run."
            },
            {
              name: "Tipo",
              effect: "Bônus, penalidade, verba, reembolso, adiantamento, empréstimo, correção ou dedução."
            },
            {
              name: "Valor",
              effect: "Montante no bruto."
            },
            {
              name: "Data efetiva",
              effect: "Define qual run inclui."
            },
            {
              name: "Descrição",
              effect: "Detalhe holerite e auditoria."
            }
          ]
        }
      },
      title: "Períodos e execuções de folha",
      intro: "Feche períodos, gere execuções com prévia e ajustes."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Lista documentos",
          steps: [
            "RH → Documentos.",
            "Filtre funcionário/categoria.",
            "Envie ou atualize."
          ],
          caption: "Aba documentos."
        },
        "document-form": {
          title: "Formulário documento",
          steps: [
            "Adicionar documento.",
            "Funcionário, título, categoria.",
            "Anexe arquivo e validade.",
            "Salvar."
          ],
          caption: "Formulário upload documento.",
          fields: [
            {
              name: "Funcionário",
              effect: "Dono do registro."
            },
            {
              name: "Título",
              effect: "Nome em listas."
            },
            {
              name: "Categoria",
              effect: "Contrato, certificado, licença, ID, médico, advertência ou outro."
            },
            {
              name: "Expira em",
              effect: "Data opcional para alertas."
            },
            {
              name: "Anexar arquivo",
              effect: "Obrigatório na criação."
            }
          ]
        }
      },
      title: "Documentos do funcionário",
      intro: "Armazene contratos, IDs e licenças com vencimento."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Lista desempenho",
          steps: [
            "RH → Desempenho.",
            "Navegue por funcionário/tipo.",
            "Adicione após incidentes."
          ],
          caption: "Aba notas desempenho."
        },
        "performance-form": {
          title: "Formulário nota desempenho",
          steps: [
            "Funcionário, tipo, título, texto.",
            "Severidade se aplicável.",
            "Visível ao funcionário.",
            "Salvar."
          ],
          caption: "Formulário nota desempenho.",
          fields: [
            {
              name: "Funcionário",
              effect: "Sujeito da nota."
            },
            {
              name: "Tipo",
              effect: "Advertência, elogio, revisão ou incidente."
            },
            {
              name: "Título",
              effect: "Resumo curto."
            },
            {
              name: "Conteúdo",
              effect: "Narrativa completa."
            },
            {
              name: "Severidade",
              effect: "Baixa, média, alta ou crítica."
            },
            {
              name: "Visível ao funcionário",
              effect: "Pode mostrar ao usuário funcionário."
            }
          ]
        }
      },
      title: "Notas de desempenho",
      intro: "Registre advertências, elogios e incidentes."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Cancelar ou anular pedido",
          steps: [
            "Abra ⋯ no pedido Em andamento e escolha Cancelar pedido.",
            "Escolha um motivo de void (obrigatório para relatórios).",
            "Mantenha Selecionar todos para void total ou desmarque linhas específicas.",
            "Confirme para anular e liberar a mesa quando aplicável."
          ],
          caption: "Modal cancelar com motivo e seleção de itens.",
          intro: "Anula uma conta Em andamento. Void total cancela todas as linhas; parcial remove itens selecionados.",
          fields: [
            {
              name: "Motivo",
              effect: "Motivo de void obrigatório registrado no pedido."
            },
            {
              name: "Selecionar todos os itens",
              effect: "Marcado anula toda a conta; desmarcado permite seleção por linha."
            },
            {
              name: "Void parcial",
              effect: "Anula apenas quantidades selecionadas mantendo o resto aberto."
            }
          ]
        },
        refund: {
          title: "Reembolsar pedido pago",
          steps: [
            "Abra pedido Pago e escolha Reembolso.",
            "Selecione itens e quantidades.",
            "Escolha motivo e confirme.",
            "O sistema registra o reembolso e atualiza totais."
          ],
          caption: "Modal de reembolso com itens e motivo.",
          intro: "Emite reembolso em conta paga, opcionalmente por itens selecionados.",
          fields: [
            {
              name: "Itens a reembolsar",
              effect: "Linhas pagas e quantidades devolvidas ao cliente."
            },
            {
              name: "Motivo",
              effect: "Documenta o reembolso para gestão e relatórios."
            }
          ]
        },
        "split-seats": {
          title: "Dividir por assentos",
          steps: [
            "Em ⋯ escolha Dividir por assentos.",
            "Revise agrupamento por assento.",
            "Confirme para criar um filho por assento."
          ],
          caption: "Prévia de divisão por assentos.",
          intro: "Divide a conta em cheques separados por número de assento."
        },
        "split-items": {
          title: "Dividir por itens",
          steps: [
            "Em ⋯ escolha Dividir por itens.",
            "Mova cada linha para nova coluna.",
            "Confirme para contas Em andamento separadas."
          ],
          caption: "Grade de atribuição por itens.",
          intro: "Atribui linhas manualmente a novas contas."
        },
        "split-amount": {
          title: "Dividir por valor",
          steps: [
            "Em ⋯ escolha Dividir por valor.",
            "Informe partes ou valores.",
            "Confirme para contas filhas com cada parcela."
          ],
          caption: "Diálogo dividir por valor.",
          intro: "Divide o total em partes fixas ou iguais."
        },
        merge: {
          title: "Mesclar pedidos",
          steps: [
            "No primeiro pedido, ⋯ → Mesclar.",
            "Repita para cada pedido adicional.",
            "Toque Escolher mesa e selecione destino.",
            "Confirme para unir linhas em uma conta."
          ],
          caption: "Barra de mesclagem com seletor de mesa.",
          intro: "Combina várias contas Em andamento em uma mesa.",
          fields: [
            {
              name: "Selecionar pedidos",
              effect: "Marca pedido para mesclagem pendente."
            },
            {
              name: "Escolher mesa",
              effect: "Define mesa da conta mesclada."
            },
            {
              name: "Confirmar mesclagem",
              effect: "Combina contas selecionadas em um pedido Em andamento."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Lucros e perdas",
          steps: [
            "Abra Contas → Lucros e perdas.",
            "Defina intervalo ou período.",
            "Expanda grupos de contas.",
            "Exporte ao fechar o período."
          ],
          caption: "Aba de lucros e perdas.",
          intro: "DRE do período: receita, CMV e despesas operacionais."
        },
        "cash-flow": {
          title: "Fluxo de caixa",
          steps: [
            "Abra Fluxo de caixa em Contas.",
            "Use o mesmo período dos demais.",
            "Revise saldo inicial, variação e final.",
            "Use com DRE para diferenças caixa vs. competência."
          ],
          caption: "Aba fluxo de caixa.",
          intro: "Resume movimentos operacionais, investimento e financiamento."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Formulário funcionário",
          steps: [
            "Funcionários → Adicionar/editar.",
            "Número, nome, detalhes.",
            "Vincule POS, dept, cargo.",
            "Salvar."
          ],
          caption: "Modal funcionário.",
          intro: "Registro HR ligando usuário POS e estrutura org.",
          fields: [
            {
              name: "Nº funcionário",
              effect: "ID único em escalas."
            },
            {
              name: "Nome / sobrenome",
              effect: "Nome legal/preferido."
            },
            {
              name: "Usuário vinculado",
              effect: "Login POS opcional."
            },
            {
              name: "Departamento",
              effect: "Unidade org."
            },
            {
              name: "Cargo",
              effect: "Título em escalas."
            },
            {
              name: "Centro custo",
              effect: "Alocação laboral padrão."
            },
            {
              name: "Gerente",
              effect: "Linha de aprovação."
            },
            {
              name: "Status emprego",
              effect: "Ativo, inativo, demitido, licença ou suspenso."
            },
            {
              name: "Tipo emprego",
              effect: "Horista, salário, contrato etc."
            },
            {
              name: "Admissão / demissão",
              effect: "Tempo de casa e elegibilidade."
            }
          ]
        },
        "department-form": {
          title: "Formulário departamento",
          steps: [
            "Departamentos ou inline.",
            "Código, nome, descrição.",
            "Salvar."
          ],
          caption: "Formulário departamento.",
          fields: [
            {
              name: "Código",
              effect: "ID curto integrações."
            },
            {
              name: "Nome",
              effect: "Nome em listas."
            },
            {
              name: "Descrição",
              effect: "Notas opcionais."
            },
            {
              name: "Ativo",
              effect: "Inativos ocultos em novas atribuições."
            }
          ]
        },
        "position-form": {
          title: "Formulário cargo",
          steps: [
            "Cargos ou inline.",
            "Código, nome, dept, centro custo.",
            "Salvar."
          ],
          caption: "Formulário cargo.",
          fields: [
            {
              name: "Código",
              effect: "Código folha export."
            },
            {
              name: "Nome",
              effect: "Título em RH e escalas."
            },
            {
              name: "Departamento",
              effect: "Unidade org padrão."
            },
            {
              name: "Centro custo padrão",
              effect: "Pré-preenchido em escalas."
            },
            {
              name: "Ativo",
              effect: "Retira títulos não usados."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Entrada manual presença",
          steps: [
            "Presença → Entrada manual.",
            "Funcionário e horários.",
            "Notas e salvar."
          ],
          caption: "Modal presença manual.",
          intro: "Corrige punches faltantes ou preenche tempo.",
          fields: [
            {
              name: "Funcionário",
              effect: "De quem é o registro."
            },
            {
              name: "Entrada",
              effect: "Início do intervalo."
            },
            {
              name: "Saída",
              effect: "Fim após entrada."
            },
            {
              name: "Notas",
              effect: "Motivo manual."
            }
          ]
        },
        "schedule-form": {
          title: "Formulário escala",
          steps: [
            "Escalas → adicionar.",
            "Nome e início/fim.",
            "Turnos ou gerar de modelo."
          ],
          caption: "Formulário escala.",
          intro: "Intervalo de datas com turnos rascunho ou publicados.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo do período."
            },
            {
              name: "Início período",
              effect: "Primeiro datetime coberto."
            },
            {
              name: "Fim período",
              effect: "Último datetime coberto."
            }
          ]
        },
        "shift-form": {
          title: "Formulário turno agendado",
          intro: "Atribui funcionário a bloco em escala rascunho.",
          steps: [
            "Rascunho → adicionar turno.",
            "Escala, funcionário, horários.",
            "Template/org opcional.",
            "Salvar."
          ],
          caption: "Formulário turno.",
          fields: [
            {
              name: "Escala",
              effect: "Pai deve estar rascunho."
            },
            {
              name: "Funcionário",
              effect: "Atribuído ao turno."
            },
            {
              name: "Template turno",
              effect: "Preset Admin → Usuários → Turnos."
            },
            {
              name: "Dept / cargo / centro custo",
              effect: "Override org neste turno."
            },
            {
              name: "Início / fim",
              effect: "Janela horária."
            }
          ]
        },
        "schedule-template": {
          title: "Formulário template escala",
          steps: [
            "Escalas → Templates.",
            "Nome e dias/horários.",
            "Template turno opcional.",
            "Salvar."
          ],
          caption: "Formulário template.",
          intro: "Padrão semanal reutilizável.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo gerar."
            },
            {
              name: "Dias semana",
              effect: "Dias com turnos."
            },
            {
              name: "Hora início/fim",
              effect: "Janela diária."
            },
            {
              name: "Minutos pausa",
              effect: "Pausa não paga."
            },
            {
              name: "Template turno",
              effect: "Definição POS."
            }
          ]
        },
        "schedule-generate": {
          title: "Gerar escala do template",
          steps: [
            "Escalas → Gerar.",
            "Rascunho e template.",
            "Selecione funcionários.",
            "Gerar."
          ],
          caption: "Diálogo gerar escala.",
          fields: [
            {
              name: "Escala",
              effect: "Rascunho destino."
            },
            {
              name: "Template",
              effect: "Padrão semanal."
            },
            {
              name: "Funcionários",
              effect: "Recebem cópia dos turnos."
            }
          ]
        },
        "schedule-swap": {
          title: "Pedido troca turno",
          steps: [
            "Escalas → Solicitar troca.",
            "Turno e solicitante.",
            "Colega alvo opcional.",
            "Enviar."
          ],
          caption: "Formulário troca.",
          fields: [
            {
              name: "Turno agendado",
              effect: "Turno a ceder/trocar."
            },
            {
              name: "Solicitante",
              effect: "Inicia a troca."
            },
            {
              name: "Colega alvo",
              effect: "Opcional."
            },
            {
              name: "Turno proposto",
              effect: "Contra-turno."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Formulário pedido licença",
          steps: [
            "Licenças → Adicionar.",
            "Funcionário, tipo, datas.",
            "Dias e motivo.",
            "Salvar."
          ],
          caption: "Formulário licença.",
          intro: "Envia/edita pedidos conforme tipos.",
          fields: [
            {
              name: "Funcionário",
              effect: "Solicitante."
            },
            {
              name: "Tipo licença",
              effect: "Pago/não pago e aprovação."
            },
            {
              name: "Data início/fim",
              effect: "Datas inclusivas."
            },
            {
              name: "Dias",
              effect: "Dias úteis consumidos."
            },
            {
              name: "Motivo",
              effect: "Nota opcional."
            }
          ]
        },
        "holiday-form": {
          title: "Formulário feriado",
          steps: [
            "Licenças → Feriados.",
            "Nome, data, país.",
            "Recorrente se anual.",
            "Salvar."
          ],
          caption: "Formulário feriado.",
          intro: "Interage com regras pagamento e escalas.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo calendários."
            },
            {
              name: "Data",
              effect: "Data observada."
            },
            {
              name: "Código país",
              effect: "ISO opcional."
            },
            {
              name: "Recorrente",
              effect: "Repete anualmente."
            },
            {
              name: "Ativo",
              effect: "Inativos ignorados em regras novas."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Formulário prato",
          steps: [
            "Admin → Menus → Pratos.",
            "Número, nome, preço, categorias.",
            "Modificadores, receita, cozinha.",
            "Salvar."
          ],
          caption: "Formulário manutenção prato.",
          intro: "Itens vendáveis com preço, categorias, modificadores e cozinha.",
          fields: [
            {
              name: "Número / nome",
              effect: "ID POS e nome exibido."
            },
            {
              name: "Preço / custo",
              effect: "Preço venda e custo teórico."
            },
            {
              name: "Categorias",
              effect: "Agrupamento menu."
            },
            {
              name: "Grupos modificadores",
              effect: "Fluxo personalização."
            },
            {
              name: "Linhas receita",
              effect: "Depleção estoque."
            },
            {
              name: "Cozinha / workflow",
              effect: "Roteamento KOT."
            }
          ]
        },
        "menu-form": {
          title: "Formulário menu",
          steps: [
            "Aba Menus.",
            "Nome e horários.",
            "Ativo e termina dia seguinte.",
            "Salvar."
          ],
          caption: "Formulário menu.",
          intro: "Controla categorias no POS por horário.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo no POS."
            },
            {
              name: "Início / fim",
              effect: "Janela disponibilidade."
            },
            {
              name: "Termina dia seguinte",
              effect: "Serviço após meia-noite."
            },
            {
              name: "Ativo",
              effect: "Inativos ocultos."
            }
          ]
        },
        "category-form": {
          title: "Formulário categoria",
          steps: [
            "Categorias.",
            "Nome, prioridade, mostrar menu.",
            "Salvar."
          ],
          caption: "Formulário categoria.",
          fields: [
            {
              name: "Nome",
              effect: "Cabeçalho POS."
            },
            {
              name: "Prioridade",
              effect: "Ordem."
            },
            {
              name: "Mostrar no menu",
              effect: "Oculta se desligado."
            }
          ]
        },
        "modifier-group-form": {
          title: "Formulário grupo modificador",
          steps: [
            "Grupos modificadores.",
            "Nome, prioridade, preços.",
            "Próximos grupos.",
            "Salvar."
          ],
          caption: "Formulário grupos aninhados.",
          intro: "Define modificadores, preços e grupos aninhados.",
          fields: [
            {
              name: "Nome / prioridade",
              effect: "Rótulo e ordem."
            },
            {
              name: "Modificador",
              effect: "Opção selecionável."
            },
            {
              name: "Preço",
              effect: "Taxa extra."
            },
            {
              name: "Próximos grupos permitidos",
              effect: "Após escolha."
            },
            {
              name: "Overrides próximo grupo",
              effect: "Ocultar ou repricing."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Formulário piso",
          steps: [
            "Admin → Pisos.",
            "Nome, prioridade, cores.",
            "Salvar."
          ],
          caption: "Formulário piso.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo seletor piso."
            },
            {
              name: "Prioridade",
              effect: "Ordem lista."
            },
            {
              name: "Fundo / cor",
              effect: "Estilo padrão plano."
            }
          ]
        },
        "table-form": {
          title: "Formulário mesa",
          steps: [
            "Selecione piso.",
            "Número, nome, cores.",
            "Restrições opcionais.",
            "Pedir couvert.",
            "Salvar."
          ],
          caption: "Formulário mesa.",
          intro: "Pertence a piso; pode restringir categorias e pagamentos.",
          fields: [
            {
              name: "Nome / número",
              effect: "Rótulo plano."
            },
            {
              name: "Piso",
              effect: "Plano pai."
            },
            {
              name: "Prioridade",
              effect: "Ordem."
            },
            {
              name: "Categorias / tipos pedido / pagamento",
              effect: "Restrições."
            },
            {
              name: "Pedir couvert",
              effect: "Solicita comensais."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Formulário regra desconto",
          steps: [
            "Admin → Promoções → Descontos.",
            "Categoria, escopo, modo.",
            "Alvos e valor.",
            "Salvar."
          ],
          caption: "Formulário regra desconto.",
          intro: "14 categorias; scope item/category/cart/customer/floor.",
          fields: [
            {
              name: "Categoria",
              effect: "Um de 14 tipos."
            },
            {
              name: "Escopo",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "Modo aplicação",
              effect: "manual, automatic, both."
            },
            {
              name: "Alvos",
              effect: "Itens/categorias elegíveis."
            },
            {
              name: "Tipo (percent/fixo)",
              effect: "Min/max percent ou valor."
            },
            {
              name: "Taxa min/máx",
              effect: "Faixa permitida."
            },
            {
              name: "Teto máximo",
              effect: "Limite em descontos %."
            },
            {
              name: "Prioridade",
              effect: "Ordem regras auto."
            },
            {
              name: "Valor mín pedido",
              effect: "Subtotal exigido."
            },
            {
              name: "Modo empilhamento",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Tratamento fiscal",
              effect: "tax_before/after_discount etc."
            },
            {
              name: "Agendas",
              effect: "Janelas dia/hora."
            },
            {
              name: "Condições",
              effect: "Buy X Get Y."
            },
            {
              name: "Requer motivo/aprovação",
              effect: "PIN gerente manual."
            }
          ]
        },
        "coupon-form": {
          title: "Formulário cupom",
          steps: [
            "Promoções → Cupons.",
            "Código, tipo/valor, limites.",
            "Dias e datas válidos.",
            "Salvar."
          ],
          caption: "Formulário cupom.",
          fields: [
            {
              name: "Código",
              effect: "String no checkout."
            },
            {
              name: "Tipo cupom",
              effect: "Uso único/multi."
            },
            {
              name: "Tipo/valor desconto",
              effect: "Percent ou fixo."
            },
            {
              name: "Valor mín pedido",
              effect: "Subtotal mínimo."
            },
            {
              name: "Desconto máx",
              effect: "Teto em %."
            },
            {
              name: "Limite uso",
              effect: "Resgates totais."
            },
            {
              name: "Limite por usuário",
              effect: "Por cliente."
            },
            {
              name: "Dias válidos / horários",
              effect: "Restrição temporal."
            },
            {
              name: "Data início/fim",
              effect: "Validade geral."
            },
            {
              name: "Empilhável / só 1º pedido",
              effect: "Regras combinação."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Formulário cozinha",
          steps: [
            "Admin → Cozinha → Cozinhas.",
            "Nome, prioridade, impressoras, pratos.",
            "Salvar."
          ],
          caption: "Formulário estação cozinha.",
          intro: "Roteia pratos a impressoras e locais.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo KOT e display."
            },
            {
              name: "Prioridade",
              effect: "Ordem quando várias cozinhas."
            },
            {
              name: "Impressoras",
              effect: "Dispositivos de ticket."
            },
            {
              name: "Itens (pratos)",
              effect: "Pratos roteados."
            }
          ]
        },
        "workflow-form": {
          title: "Formulário workflow",
          steps: [
            "Cozinha → Workflows.",
            "Nome e etapas.",
            "Cozinha por etapa.",
            "Vincule a pratos."
          ],
          caption: "Editor etapas workflow.",
          intro: "Encadeia etapas de cozinha.",
          fields: [
            {
              name: "Nome",
              effect: "ID em pratos."
            },
            {
              name: "Etapas",
              effect: "Passos ordenados."
            },
            {
              name: "Cozinha etapa",
              effect: "Estação de cada etapa."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Formulário impressora",
          steps: [
            "Admin → Impressão → Impressoras.",
            "Nome e conexão IP/USB.",
            "Tipo recibo/cozinha/etiqueta.",
            "Salvar."
          ],
          caption: "Formulário impressora.",
          fields: [
            {
              name: "Nome",
              effect: "Nome amigável."
            },
            {
              name: "Tipo",
              effect: "Perfil recibo/cozinha/etiqueta."
            },
            {
              name: "IP / porta",
              effect: "Conexão rede ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "IDs USB."
            }
          ]
        },
        "print-setting-form": {
          title: "Formulário config impressão",
          steps: [
            "Config impressão.",
            "Tipo de job.",
            "Logo, cabeçalho/rodapé, IVA, margens.",
            "Salvar."
          ],
          caption: "Editor template.",
          intro: "Cada job tem template próprio.",
          fields: [
            {
              name: "Mostrar logo",
              effect: "Logo no ticket."
            },
            {
              name: "Seções cabeçalho/rodapé",
              effect: "Blocos texto/imagem."
            },
            {
              name: "Nome/nº IVA",
              effect: "Bloco fiscal."
            },
            {
              name: "Margens",
              effect: "Espaçamento em pontos."
            },
            {
              name: "Colunas item",
              effect: "Nº, nome, qtd, preço, total."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Formulário tipo pagamento",
          steps: [
            "Admin → Pagamentos → Tipos.",
            "Nome, prioridade, tipo.",
            "Remote: gateway, modo, chaves.",
            "Salvar."
          ],
          caption: "Form com gateway remoto.",
          intro: "Local e Remote com Stripe, PayPal.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo botões pagamento."
            },
            {
              name: "Prioridade",
              effect: "Ordem."
            },
            {
              name: "Tipo",
              effect: "Remote expõe gateway."
            },
            {
              name: "Provedor gateway",
              effect: "Stripe, PayPal etc."
            },
            {
              name: "Modo gateway",
              effect: "Test vs live."
            },
            {
              name: "public_key",
              effect: "Chave publicável cliente."
            },
            {
              name: "secret_key",
              effect: "Segredo servidor."
            },
            {
              name: "webhook_secret",
              effect: "Valida callbacks."
            },
            {
              name: "client_id / client_secret",
              effect: "OAuth gateways."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Campos comerciante."
            },
            {
              name: "Imposto",
              effect: "Regra fiscal padrão."
            },
            {
              name: "Descontos",
              effect: "Regras auto-aplicadas."
            }
          ]
        },
        "tax-form": {
          title: "Formulário imposto",
          steps: [
            "Pagamentos → Impostos.",
            "Nome, alíquota, inclusive/exclusive.",
            "Salvar."
          ],
          caption: "Formulário imposto.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo recibo."
            },
            {
              name: "Alíquota",
              effect: "Percentual tributável."
            },
            {
              name: "Inclusive",
              effect: "Se true, embutido no preço."
            }
          ]
        },
        "order-type-form": {
          title: "Formulário tipo pedido",
          steps: [
            "Pagamentos → Tipos pedido.",
            "Nome e flags.",
            "Salvar."
          ],
          caption: "Formulário tipo pedido.",
          fields: [
            {
              name: "Nome",
              effect: "Tipo em contas."
            },
            {
              name: "Prioridade",
              effect: "Ordem seletores."
            },
            {
              name: "Padrão",
              effect: "Pré-selecionado em novos."
            }
          ]
        },
        "extra-form": {
          title: "Formulário extra (taxa serviço)",
          steps: [
            "Pagamentos → Extras.",
            "Nome e valor/percent.",
            "Regras de aplicação.",
            "Salvar."
          ],
          caption: "Formulário sobretaxa.",
          intro: "Adiciona sobretaxas automáticas.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo recibo."
            },
            {
              name: "Valor / taxa",
              effect: "Fixo ou percentual."
            },
            {
              name: "Tributável",
              effect: "Imposto sobre extra."
            },
            {
              name: "Regras auto aplicar",
              effect: "Tipos pedido/pagamento."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Formulário usuário",
          steps: [
            "Admin → Usuários.",
            "Método login, nome, credenciais, papel, turno.",
            "Criar funcionário opcional.",
            "Salvar."
          ],
          caption: "Formulário conta usuário.",
          intro: "Operadores POS com PIN ou senha.",
          fields: [
            {
              name: "Método login",
              effect: "PIN (4 dígitos) ou senha."
            },
            {
              name: "Nome / sobrenome",
              effect: "Nome em contas."
            },
            {
              name: "Login / PIN",
              effect: "Credencial."
            },
            {
              name: "Senha",
              effect: "Obrigatória se senha."
            },
            {
              name: "Papel",
              effect: "Pacote permissões."
            },
            {
              name: "Turno",
              effect: "Turno padrão."
            },
            {
              name: "Criar funcionário",
              effect: "Auto-cria HR vinculado."
            }
          ]
        },
        "role-form": {
          title: "Formulário papel",
          steps: [
            "Usuários → Papéis.",
            "Nome e árvore módulos.",
            "Marque permissões.",
            "Salvar."
          ],
          caption: "Editor permissões papel.",
          intro: "Concede acesso a módulos e ações.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo no formulário usuário."
            },
            {
              name: "Permissões módulo",
              effect: "Checkboxes hierárquicas."
            }
          ]
        },
        "shift-form": {
          title: "Formulário template turno",
          steps: [
            "Usuários → Turnos.",
            "Nome e horários.",
            "Noturno ativa dia seguinte.",
            "Salvar."
          ],
          caption: "Formulário turno.",
          intro: "Define janelas de turno.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo turno."
            },
            {
              name: "Hora início",
              effect: "Início programado."
            },
            {
              name: "Hora fim",
              effect: "Fim programado."
            }
          ]
        },
        "tips-definition": {
          title: "Definição gorjetas (distribuição)",
          steps: [
            "Usuários → Definição gorjetas.",
            "Linhas papel com pesos.",
            "Overrides usuário opcional.",
            "Salvar."
          ],
          caption: "Painel distribuição gorjetas.",
          intro: "Pondera gorjetas por papéis e usuários.",
          fields: [
            {
              name: "Peso papel",
              effect: "Participação do pool por papel."
            },
            {
              name: "Peso usuário",
              effect: "Override opcional."
            }
          ]
        }
      }
    }
  },
  fr: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Onglet Rapprochement",
          steps: [
            "Inventaire → Rapprochement cuisine.",
            "Choisissez emplacement et date opérationnelle.",
            "Cliquez Générer.",
            "Saisissez quantités réelles ou importez CSV.",
            "Brouillon, vérifiez écarts, Vérifier."
          ],
          caption: "Barre, grille et panneau d'écarts.",
          intro: "Générez une grille depuis ventes POS et recettes, puis saisissez ou importez les comptages.",
          fields: [
            {
              name: "Emplacement",
              effect: "Cuisine ou stock rapproché."
            },
            {
              name: "Date opérationnelle",
              effect: "Jour d'activité du rapprochement."
            },
            {
              name: "Générer",
              effect: "Crée lignes théoriques."
            },
            {
              name: "Quantité réelle",
              effect: "Comptage physique par article."
            },
            {
              name: "Vérifier",
              effect: "Verrouille après approbation manager."
            }
          ]
        },
        "reconciliation-form": {
          title: "Saisie manuelle des comptages",
          steps: [
            "Cliquez cellule Réel pour saisir.",
            "Enregistrer brouillon sans vérifier.",
            "Import CSV en masse.",
            "Vérifiez écarts avant validation."
          ],
          caption: "Grille avec édition quantité réelle.",
          intro: "Édition grille et import CSV partagent la même structure.",
          fields: [
            {
              name: "Article",
              effect: "Article stock de la ligne."
            },
            {
              name: "Théorique",
              effect: "Usage calculé par recettes et ventes."
            },
            {
              name: "Réel",
              effect: "Quantité comptée saisie."
            },
            {
              name: "Écart",
              effect: "Différence réel vs théorique."
            },
            {
              name: "Notes",
              effect: "Explication optionnelle."
            }
          ]
        }
      },
      title: "Rapprochement cuisine",
      intro: "Comparez la consommation théorique aux comptages physiques par emplacement et date."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Liste des recettes",
          steps: [
            "Inventaire → Recettes.",
            "Parcourez recettes actives.",
            "Ajoutez ou modifiez recettes."
          ],
          caption: "Onglet maintenance recettes."
        },
        "recipe-form": {
          title: "Formulaire recette",
          steps: [
            "Ajouter ou modifier recette.",
            "Nom, code et qty lot de base.",
            "Lignes entrée et sortie.",
            "Enregistrer."
          ],
          caption: "Formulaire entrées/sorties.",
          intro: "Définit entrées, rendements et allocation des coûts.",
          fields: [
            {
              name: "Nom",
              effect: "Nom affiché en production."
            },
            {
              name: "Code",
              effect: "Code court optionnel."
            },
            {
              name: "Qty lot base",
              effect: "Taille standard du lot."
            },
            {
              name: "Allocation coût",
              effect: "Répartition coût entrées."
            },
            {
              name: "Entrées",
              effect: "Articles consommés par lot."
            },
            {
              name: "Sorties",
              effect: "Articles produits avec rendement %."
            },
            {
              name: "Actif",
              effect: "Inactives masquées des nouveaux lots."
            }
          ]
        },
        production: {
          title: "Exécutions production",
          steps: [
            "Onglet Production.",
            "Nouveau lot depuis recette active.",
            "Aperçu puis terminer."
          ],
          caption: "Onglet Production."
        },
        "production-form": {
          title: "Formulaire lot production",
          steps: [
            "Nouvelle production.",
            "Recette, emplacement, qty.",
            "Aperçu puis terminer."
          ],
          caption: "Formulaire avec aperçu.",
          intro: "À la complétion, déduit entrées et ajoute sorties au site.",
          fields: [
            {
              name: "Recette",
              effect: "Définit ingrédients et sorties."
            },
            {
              name: "Emplacement",
              effect: "Stock consommé/produit."
            },
            {
              name: "Qty produite",
              effect: "Met à l'échelle depuis lot base."
            },
            {
              name: "N° lot",
              effect: "Référence optionnelle."
            },
            {
              name: "MAJ coût article",
              effect: "Recalcule coût sortie."
            },
            {
              name: "Notes",
              effect: "Note libre."
            }
          ]
        },
        "production-history": {
          title: "Historique production",
          steps: [
            "Auditez lots terminés.",
            "Filtrez date/recette/site.",
            "Ouvrez ligne pour détails."
          ],
          caption: "Liste historique."
        }
      },
      title: "Recettes et production",
      intro: "Définissez des recettes par lot, lancez la production et consultez l'historique."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Menus buffet",
          steps: [
            "Inventaire → Buffet → Menus.",
            "Modèles petit-déj/déjeuner/dîner.",
            "Recettes par convive."
          ],
          caption: "Liste menus buffet."
        },
        "buffet-menu-form": {
          title: "Formulaire menu buffet",
          steps: [
            "Ajouter/modifier menu.",
            "Type session et lignes recette.",
            "Enregistrer."
          ],
          caption: "Formulaire menu buffet.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé au démarrage session."
            },
            {
              name: "Code",
              effect: "Sigle cuisine optionnel."
            },
            {
              name: "Type session",
              effect: "Petit-déj/déjeuner/dîner."
            },
            {
              name: "Lignes recette",
              effect: "Recette et qty par convive."
            },
            {
              name: "Actif",
              effect: "Seuls menus actifs visibles."
            }
          ]
        },
        "buffet-sessions": {
          title: "Sessions buffet",
          steps: [
            "Buffet → Sessions.",
            "Démarrez depuis menu.",
            "Suivez production vs prévision.",
            "Clôturez session."
          ],
          caption: "Tableau sessions buffet."
        },
        "buffet-session-form": {
          title: "Démarrer session buffet",
          steps: [
            "Nouvelle session.",
            "Menu, site, date, type.",
            "Convives et prix.",
            "Enregistrer."
          ],
          caption: "Formulaire nouvelle session.",
          fields: [
            {
              name: "Menu",
              effect: "Charge lignes et prévisions."
            },
            {
              name: "Emplacement",
              effect: "Stock des mouvements."
            },
            {
              name: "Date opérationnelle",
              effect: "Jour d'activité."
            },
            {
              name: "Type session",
              effect: "Aligné au menu."
            },
            {
              name: "Convives attendus",
              effect: "Prévisions initiales."
            },
            {
              name: "Prix buffet",
              effect: "Revenu par convive."
            }
          ]
        }
      },
      title: "Menus et sessions buffet",
      intro: "Planifiez des recettes par convive et gérez les sessions buffet."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Liste centres de coûts",
          steps: [
            "RH → Centres de coûts.",
            "Vérifiez codes.",
            "Ajoutez/modifiez."
          ],
          caption: "Onglet centres de coûts."
        },
        "cost-center-form": {
          title: "Formulaire centre de coûts",
          steps: [
            "Ajouter/modifier.",
            "Code, nom, description.",
            "Actif/inactif.",
            "Enregistrer."
          ],
          caption: "Modal centre de coûts.",
          fields: [
            {
              name: "Code",
              effect: "Identifiant court unique."
            },
            {
              name: "Nom",
              effect: "Libellé dans listes."
            },
            {
              name: "Description",
              effect: "Notes optionnelles."
            },
            {
              name: "Actif",
              effect: "Inactifs non sélectionnables."
            }
          ]
        }
      },
      title: "Centres de coûts",
      intro: "Étiquettent la main-d'œuvre et la paie pour les sites et départements."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Profils de paie",
          steps: [
            "RH → Paie → Profils.",
            "Taux de base par employé.",
            "Alimente la paie."
          ],
          caption: "Liste profils paie."
        },
        "pay-profile-form": {
          title: "Formulaire profil paie",
          steps: [
            "Ajouter/modifier profil.",
            "Type et taux de base.",
            "Enregistrer."
          ],
          caption: "Formulaire profil paie.",
          fields: [
            {
              name: "Employé",
              effect: "Personnel recevant cette base."
            },
            {
              name: "Type paie",
              effect: "Horaire, salaire, contrat, commission ou mixte."
            },
            {
              name: "Taux base",
              effect: "Taux principal ou salaire."
            },
            {
              name: "Devise",
              effect: "Devise ISO."
            },
            {
              name: "Effectif du",
              effect: "Premier jour du profil."
            },
            {
              name: "Effectif au",
              effect: "Fin optionnelle."
            }
          ]
        },
        "pay-rules": {
          title: "Règles de paie",
          steps: [
            "Paie → Règles.",
            "Empilement par priorité.",
            "Filtres employés/départements."
          ],
          caption: "Liste règles paie."
        },
        "pay-rule-form": {
          title: "Formulaire règle paie",
          steps: [
            "Ajouter règle.",
            "Définir effets.",
            "Filtres date/heure.",
            "Assigner employés.",
            "Enregistrer."
          ],
          caption: "Formulaire règle.",
          intro: "Effets et filtres d'éligibilité.",
          fields: [
            {
              name: "Code",
              effect: "ID unique."
            },
            {
              name: "Nom",
              effect: "Libellé admin."
            },
            {
              name: "Priorité",
              effect: "Ordre empilement."
            },
            {
              name: "Mode empilement",
              effect: "Interaction règles."
            },
            {
              name: "Effets",
              effect: "Multiplicateurs ou montants."
            },
            {
              name: "Filtres employé/département/poste/centre coûts",
              effect: "Limite portée."
            },
            {
              name: "Fenêtre date/heure",
              effect: "Plage optionnelle."
            },
            {
              name: "Jours semaine / mois",
              effect: "Motifs calendrier."
            },
            {
              name: "Jours fériés",
              effect: "Fériés sélectionnés."
            },
            {
              name: "Heures sup (jour/semaine)",
              effect: "Seuils dépassés."
            }
          ]
        }
      },
      title: "Profils et règles de paie",
      intro: "Profils de base et règles de primes et retenues."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Périodes de paie",
          steps: [
            "RH → Paie → Périodes.",
            "Créez selon cycle.",
            "Verrouillez avant final."
          ],
          caption: "Liste périodes paie."
        },
        "payroll-period-form": {
          title: "Formulaire période paie",
          steps: [
            "Nom, type, dates.",
            "Statut Ouvert.",
            "Passez Verrouillé/Fermé/Payé."
          ],
          caption: "Formulaire période.",
          fields: [
            {
              name: "Nom période",
              effect: "Libellé runs et exports."
            },
            {
              name: "Type période",
              effect: "Hebdo, bihebdo, mensuel ou custom."
            },
            {
              name: "Date début",
              effect: "Premier jour inclus."
            },
            {
              name: "Date fin",
              effect: "Dernier jour inclus."
            },
            {
              name: "Statut",
              effect: "Ouvert autorise edits; verrouillé restreint."
            }
          ]
        },
        "payroll-runs": {
          title: "Exécutions paie",
          steps: [
            "Paie → Exécutions.",
            "Générez aperçu brut.",
            "Vérifiez snapshots."
          ],
          caption: "Exécutions de période."
        },
        "payroll-run-form": {
          title: "Générer exécution paie",
          steps: [
            "Nouvelle exécution.",
            "Période ouverte.",
            "Générer aperçu."
          ],
          caption: "Formulaire nouvelle exécution.",
          fields: [
            {
              name: "Période paie",
              effect: "Gouverne heures et ajustements."
            },
            {
              name: "N° exécution",
              effect: "ID séquentiel dans période."
            }
          ]
        },
        adjustments: {
          title: "Ajustements paie",
          steps: [
            "Paie → Ajustements.",
            "Ajoutez bonus/pénalités.",
            "Liez à période."
          ],
          caption: "Liste ajustements."
        },
        "adjustment-form": {
          title: "Formulaire ajustement",
          steps: [
            "Employé, type, montant, date.",
            "Période optionnelle.",
            "Enregistrer."
          ],
          caption: "Formulaire ajustement paie.",
          fields: [
            {
              name: "Employé",
              effect: "Reçoit l'ajustement."
            },
            {
              name: "Période paie",
              effect: "Lien optionnel au run."
            },
            {
              name: "Type",
              effect: "Bonus, pénalité, allocation, remboursement, avance, prêt, correction ou retenue."
            },
            {
              name: "Montant",
              effect: "Valeur ajoutée/soustraite du brut."
            },
            {
              name: "Date effective",
              effect: "Détermine quel run inclut."
            },
            {
              name: "Description",
              effect: "Détail bulletin et audit."
            }
          ]
        }
      },
      title: "Périodes et exécutions de paie",
      intro: "Clôturez les périodes, générez des exécutions avec aperçu."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Liste documents",
          steps: [
            "RH → Documents.",
            "Filtrez employé/catégorie.",
            "Téléversez ou mettez à jour."
          ],
          caption: "Onglet documents employé."
        },
        "document-form": {
          title: "Formulaire document",
          steps: [
            "Ajouter document.",
            "Employé, titre, catégorie.",
            "Joindre fichier et expiration.",
            "Enregistrer."
          ],
          caption: "Formulaire upload document.",
          fields: [
            {
              name: "Employé",
              effect: "Propriétaire du dossier."
            },
            {
              name: "Titre",
              effect: "Nom affiché."
            },
            {
              name: "Catégorie",
              effect: "Contrat, certificat, licence, ID, médical, avertissement ou autre."
            },
            {
              name: "Expire le",
              effect: "Date optionnelle alertes."
            },
            {
              name: "Joindre fichier",
              effect: "Obligatoire à la création."
            }
          ]
        }
      },
      title: "Documents employé",
      intro: "Stockez contrats, pièces d'identité et licences avec échéances."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Liste performance",
          steps: [
            "RH → Performance.",
            "Parcourez par employé/type.",
            "Ajoutez après incidents."
          ],
          caption: "Onglet notes performance."
        },
        "performance-form": {
          title: "Formulaire note performance",
          steps: [
            "Employé, type, titre, texte.",
            "Sévérité si besoin.",
            "Visible employé.",
            "Enregistrer."
          ],
          caption: "Formulaire note performance.",
          fields: [
            {
              name: "Employé",
              effect: "Sujet de la note."
            },
            {
              name: "Type",
              effect: "Avertissement, compliment, revue ou incident."
            },
            {
              name: "Titre",
              effect: "Résumé court."
            },
            {
              name: "Contenu",
              effect: "Récit complet."
            },
            {
              name: "Sévérité",
              effect: "Faible, moyenne, élevée ou critique."
            },
            {
              name: "Visible employé",
              effect: "Peut être montré à l'employé."
            }
          ]
        }
      },
      title: "Notes de performance",
      intro: "Enregistrez avertissements, compliments et incidents."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Annuler ou void commande",
          steps: [
            "Ouvrez ⋯ sur une carte En cours et choisissez Annuler commande.",
            "Choisissez un motif de void (obligatoire pour les rapports).",
            "Cochez Tout sélectionner pour un void total ou choisissez des lignes.",
            "Confirmez pour void et libérer la table si applicable."
          ],
          caption: "Modal annulation avec motif et sélection.",
          intro: "Annule une addition En cours. Void total annule toutes les lignes; partiel supprime les lignes choisies.",
          fields: [
            {
              name: "Motif",
              effect: "Motif de void obligatoire enregistré sur la commande."
            },
            {
              name: "Tout sélectionner",
              effect: "Coché void toute l'addition; décoché active la sélection par ligne."
            },
            {
              name: "Void partiel",
              effect: "Void uniquement les quantités sélectionnées."
            }
          ]
        },
        refund: {
          title: "Rembourser commande payée",
          steps: [
            "Ouvrez une commande Payée et choisissez Rembourser.",
            "Sélectionnez lignes et quantités.",
            "Choisissez un motif et confirmez.",
            "Le système enregistre le remboursement et met à jour les totaux."
          ],
          caption: "Modal remboursement avec sélection et motif.",
          intro: "Émet un remboursement sur une addition payée, éventuellement par lignes.",
          fields: [
            {
              name: "Articles à rembourser",
              effect: "Lignes payées et quantités rendues au client."
            },
            {
              name: "Motif",
              effect: "Documente le remboursement pour la gestion et les rapports."
            }
          ]
        },
        "split-seats": {
          title: "Diviser par sièges",
          steps: [
            "Dans ⋯ choisissez Diviser par sièges.",
            "Vérifiez le regroupement par siège.",
            "Confirmez pour créer une addition enfant par siège."
          ],
          caption: "Aperçu division par sièges.",
          intro: "Divise l'addition en additions séparées par numéro de siège."
        },
        "split-items": {
          title: "Diviser par articles",
          steps: [
            "Dans ⋯ choisissez Diviser par articles.",
            "Déplacez chaque ligne vers une colonne.",
            "Confirmez pour des additions En cours séparées."
          ],
          caption: "Grille d'assignation par articles.",
          intro: "Assigne manuellement les lignes à de nouvelles additions."
        },
        "split-amount": {
          title: "Diviser par montant",
          steps: [
            "Dans ⋯ choisissez Diviser par montant.",
            "Saisissez parts ou montants.",
            "Confirmez pour additions enfants par part."
          ],
          caption: "Dialogue division par montant.",
          intro: "Divise le total en parts fixes ou égales."
        },
        merge: {
          title: "Fusionner commandes",
          steps: [
            "Sur la première commande, ⋯ → Fusionner.",
            "Répétez pour chaque commande.",
            "Appuyez Choisir table et sélectionnez.",
            "Confirmez la fusion."
          ],
          caption: "Barre fusion avec sélecteur de table.",
          intro: "Combine plusieurs additions En cours sur une table.",
          fields: [
            {
              name: "Sélectionner commandes",
              effect: "Marque une commande pour fusion en attente."
            },
            {
              name: "Choisir table",
              effect: "Définit la table hôte de l'addition fusionnée."
            },
            {
              name: "Confirmer fusion",
              effect: "Combine les additions en une commande En cours."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Compte de résultat",
          steps: [
            "Ouvrez Comptes → Résultat.",
            "Définissez la période.",
            "Développez les groupes de comptes.",
            "Exportez à la clôture."
          ],
          caption: "Onglet compte de résultat.",
          intro: "État des résultats : revenus, coût des ventes et charges."
        },
        "cash-flow": {
          title: "Flux de trésorerie",
          steps: [
            "Ouvrez Flux de trésorerie dans Comptes.",
            "Même période que les autres états.",
            "Vérifiez solde d'ouverture, variation et clôture.",
            "Utilisez avec le résultat pour cash vs. comptabilité d'engagement."
          ],
          caption: "Onglet flux de trésorerie.",
          intro: "Résume les flux opérationnels, d'investissement et de financement."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Formulaire employé",
          steps: [
            "Employés → Ajouter/modifier.",
            "Numéro, nom, détails.",
            "Lier POS, dept, poste.",
            "Enregistrer."
          ],
          caption: "Modal employé.",
          intro: "Dossier RH liant utilisateur POS et structure org.",
          fields: [
            {
              name: "N° employé",
              effect: "ID unique plannings."
            },
            {
              name: "Prénom / nom",
              effect: "Nom légal ou préféré."
            },
            {
              name: "Utilisateur lié",
              effect: "Login POS optionnel."
            },
            {
              name: "Département",
              effect: "Unité org."
            },
            {
              name: "Poste",
              effect: "Intitulé plannings."
            },
            {
              name: "Centre coûts",
              effect: "Affectation main-d'œuvre."
            },
            {
              name: "Manager",
              effect: "Ligne approbation."
            },
            {
              name: "Statut emploi",
              effect: "Actif, inactif, terminé, congé ou suspendu."
            },
            {
              name: "Type emploi",
              effect: "Horaire, salaire, contrat etc."
            },
            {
              name: "Embauche / fin",
              effect: "Ancienneté et éligibilité."
            }
          ]
        },
        "department-form": {
          title: "Formulaire département",
          steps: [
            "Départements ou inline.",
            "Code, nom, description.",
            "Enregistrer."
          ],
          caption: "Formulaire département.",
          fields: [
            {
              name: "Code",
              effect: "ID court intégrations."
            },
            {
              name: "Nom",
              effect: "Nom affiché."
            },
            {
              name: "Description",
              effect: "Notes optionnelles."
            },
            {
              name: "Actif",
              effect: "Inactifs masqués nouvelles affectations."
            }
          ]
        },
        "position-form": {
          title: "Formulaire poste",
          steps: [
            "Postes ou inline.",
            "Code, nom, dept, centre coûts.",
            "Enregistrer."
          ],
          caption: "Formulaire poste.",
          fields: [
            {
              name: "Code",
              effect: "Code job exports paie."
            },
            {
              name: "Nom",
              effect: "Intitulé RH et plannings."
            },
            {
              name: "Département",
              effect: "Unité org par défaut."
            },
            {
              name: "Centre coûts défaut",
              effect: "Prérempli plannings."
            },
            {
              name: "Actif",
              effect: "Retire titres non recrutés."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Saisie manuelle présence",
          steps: [
            "Présence → Saisie manuelle.",
            "Employé et horaires.",
            "Notes et enregistrer."
          ],
          caption: "Modal présence manuelle.",
          intro: "Corrige pointages manquants ou complète le temps.",
          fields: [
            {
              name: "Employé",
              effect: "Personne concernée."
            },
            {
              name: "Entrée",
              effect: "Début intervalle."
            },
            {
              name: "Sortie",
              effect: "Fin après entrée."
            },
            {
              name: "Notes",
              effect: "Motif saisie manuelle."
            }
          ]
        },
        "schedule-form": {
          title: "Formulaire planning",
          steps: [
            "Planification → ajouter.",
            "Nom et début/fin période.",
            "Shifts ou générer modèle."
          ],
          caption: "Formulaire planning.",
          intro: "Plage de dates avec shifts brouillon ou publiés.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé période."
            },
            {
              name: "Début période",
              effect: "Premier datetime couvert."
            },
            {
              name: "Fin période",
              effect: "Dernier datetime couvert."
            }
          ]
        },
        "shift-form": {
          title: "Formulaire shift planifié",
          intro: "Assigne employé à bloc horaire en brouillon.",
          steps: [
            "Brouillon → ajouter shift.",
            "Planning, employé, horaires.",
            "Modèle/org optionnel.",
            "Enregistrer."
          ],
          caption: "Formulaire shift.",
          fields: [
            {
              name: "Planning",
              effect: "Parent en brouillon."
            },
            {
              name: "Employé",
              effect: "Assigné au shift."
            },
            {
              name: "Modèle shift",
              effect: "Preset Admin → Utilisateurs → Shifts."
            },
            {
              name: "Dept / poste / centre coûts",
              effect: "Override org."
            },
            {
              name: "Début / fin",
              effect: "Fenêtre horaire."
            }
          ]
        },
        "schedule-template": {
          title: "Formulaire modèle planning",
          steps: [
            "Planification → Modèles.",
            "Nom et jours/heures.",
            "Modèle shift optionnel.",
            "Enregistrer."
          ],
          caption: "Formulaire modèle.",
          intro: "Motif hebdomadaire réutilisable.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé générer."
            },
            {
              name: "Jours semaine",
              effect: "Jours avec shifts."
            },
            {
              name: "Heure début/fin",
              effect: "Fenêtre quotidienne."
            },
            {
              name: "Minutes pause",
              effect: "Pause non payée."
            },
            {
              name: "Modèle shift",
              effect: "Définition POS."
            }
          ]
        },
        "schedule-generate": {
          title: "Générer planning depuis modèle",
          steps: [
            "Planification → Générer.",
            "Brouillon et modèle.",
            "Sélectionnez employés.",
            "Générer."
          ],
          caption: "Dialogue générer.",
          fields: [
            {
              name: "Planning",
              effect: "Brouillon cible."
            },
            {
              name: "Modèle",
              effect: "Motif hebdomadaire."
            },
            {
              name: "Employés",
              effect: "Reçoivent copie shifts."
            }
          ]
        },
        "schedule-swap": {
          title: "Demande échange shift",
          steps: [
            "Planification → Demander échange.",
            "Shift et demandeur.",
            "Collègue cible optionnel.",
            "Envoyer."
          ],
          caption: "Formulaire échange.",
          fields: [
            {
              name: "Shift planifié",
              effect: "Shift à céder/échanger."
            },
            {
              name: "Demandeur",
              effect: "Initie l'échange."
            },
            {
              name: "Employé cible",
              effect: "Optionnel."
            },
            {
              name: "Shift proposé",
              effect: "Contre-shift."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Formulaire demande congé",
          steps: [
            "Congés → Ajouter.",
            "Employé, type, dates.",
            "Jours et motif.",
            "Enregistrer."
          ],
          caption: "Formulaire congé.",
          intro: "Soumet demandes selon types configurés.",
          fields: [
            {
              name: "Employé",
              effect: "Demandeur."
            },
            {
              name: "Type congé",
              effect: "Payé/non payé et approbation."
            },
            {
              name: "Date début/fin",
              effect: "Dates inclusives."
            },
            {
              name: "Jours",
              effect: "Jours ouvrés consommés."
            },
            {
              name: "Motif",
              effect: "Note optionnelle."
            }
          ]
        },
        "holiday-form": {
          title: "Formulaire jour férié",
          steps: [
            "Congés → Jours fériés.",
            "Nom, date, pays.",
            "Récurrent si annuel.",
            "Enregistrer."
          ],
          caption: "Formulaire férié.",
          intro: "Interagit avec règles paie et plannings.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé calendriers."
            },
            {
              name: "Date",
              effect: "Date observée."
            },
            {
              name: "Code pays",
              effect: "ISO optionnel."
            },
            {
              name: "Récurrent",
              effect: "Répète chaque année."
            },
            {
              name: "Actif",
              effect: "Inactifs ignorés nouvelles règles."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Formulaire plat",
          steps: [
            "Admin → Menus → Plats.",
            "Numéro, nom, prix, catégories.",
            "Modificateurs, recette, cuisine.",
            "Enregistrer."
          ],
          caption: "Formulaire maintenance plat.",
          intro: "Articles vendables avec prix, catégories, modificateurs et cuisine.",
          fields: [
            {
              name: "Numéro / nom",
              effect: "ID POS et nom affiché."
            },
            {
              name: "Prix / coût",
              effect: "Prix vente et coût théorique."
            },
            {
              name: "Catégories",
              effect: "Regroupement menu."
            },
            {
              name: "Groupes modificateurs",
              effect: "Flux personnalisation."
            },
            {
              name: "Lignes recette",
              effect: "Déplétion stock."
            },
            {
              name: "Cuisine / workflow",
              effect: "Routage KOT."
            }
          ]
        },
        "menu-form": {
          title: "Formulaire menu",
          steps: [
            "Onglet Menus.",
            "Nom et horaires.",
            "Actif et fin lendemain.",
            "Enregistrer."
          ],
          caption: "Formulaire menu.",
          intro: "Limite catégories POS par horaire.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé sélecteur POS."
            },
            {
              name: "Début / fin",
              effect: "Fenêtre disponibilité."
            },
            {
              name: "Fin lendemain",
              effect: "Service après minuit."
            },
            {
              name: "Actif",
              effect: "Inactifs masqués."
            }
          ]
        },
        "category-form": {
          title: "Formulaire catégorie",
          steps: [
            "Catégories.",
            "Nom, priorité, afficher menu.",
            "Enregistrer."
          ],
          caption: "Formulaire catégorie.",
          fields: [
            {
              name: "Nom",
              effect: "En-tête POS."
            },
            {
              name: "Priorité",
              effect: "Ordre."
            },
            {
              name: "Afficher menu",
              effect: "Masqué si off."
            }
          ]
        },
        "modifier-group-form": {
          title: "Formulaire groupe modificateur",
          steps: [
            "Groupes modificateurs.",
            "Nom, priorité, prix.",
            "Groupes suivants.",
            "Enregistrer."
          ],
          caption: "Formulaire groupes imbriqués.",
          intro: "Modificateurs, prix et groupes imbriqués.",
          fields: [
            {
              name: "Nom / priorité",
              effect: "Libellé et ordre."
            },
            {
              name: "Modificateur",
              effect: "Option sélectionnable."
            },
            {
              name: "Prix",
              effect: "Supplément."
            },
            {
              name: "Groupes suivants autorisés",
              effect: "Après choix."
            },
            {
              name: "Overrides groupe suivant",
              effect: "Masquer ou repricing."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Formulaire étage",
          steps: [
            "Admin → Étages.",
            "Nom, priorité, couleurs.",
            "Enregistrer."
          ],
          caption: "Formulaire étage.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé sélecteur étage."
            },
            {
              name: "Priorité",
              effect: "Ordre liste."
            },
            {
              name: "Fond / couleur",
              effect: "Style tuile plan."
            }
          ]
        },
        "table-form": {
          title: "Formulaire table",
          steps: [
            "Choisir étage.",
            "Numéro, nom, couleurs.",
            "Restrictions optionnelles.",
            "Demander couverts.",
            "Enregistrer."
          ],
          caption: "Formulaire table.",
          intro: "Appartient à étage; restrictions possibles.",
          fields: [
            {
              name: "Nom / numéro",
              effect: "Libellé plan."
            },
            {
              name: "Étage",
              effect: "Plan parent."
            },
            {
              name: "Priorité",
              effect: "Ordre."
            },
            {
              name: "Catégories / types commande / paiement",
              effect: "Restrictions."
            },
            {
              name: "Demander couverts",
              effect: "Prompt couverts."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Formulaire règle remise",
          steps: [
            "Admin → Promotions → Remises.",
            "Catégorie, portée, mode.",
            "Cibles et valeur.",
            "Enregistrer."
          ],
          caption: "Formulaire règle remise.",
          intro: "14 catégories; portée item/category/cart/customer/floor.",
          fields: [
            {
              name: "Catégorie",
              effect: "Un des 14 types."
            },
            {
              name: "Portée",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "Mode application",
              effect: "manual, automatic, both."
            },
            {
              name: "Cibles",
              effect: "Articles/catégories éligibles."
            },
            {
              name: "Type (percent/fixe)",
              effect: "Min/max en % ou montant."
            },
            {
              name: "Taux min/max",
              effect: "Plage autorisée."
            },
            {
              name: "Plafond max",
              effect: "Limite remises %."
            },
            {
              name: "Priorité",
              effect: "Ordre règles auto."
            },
            {
              name: "Montant min commande",
              effect: "Seuil sous-total."
            },
            {
              name: "Mode empilement",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Traitement fiscal",
              effect: "tax_before/after_discount etc."
            },
            {
              name: "Horaires",
              effect: "Fenêtres jour/heure."
            },
            {
              name: "Conditions",
              effect: "Buy X Get Y."
            },
            {
              name: "Motif/approbation requis",
              effect: "PIN manager manuel."
            }
          ]
        },
        "coupon-form": {
          title: "Formulaire coupon",
          steps: [
            "Promotions → Coupons.",
            "Code, type/valeur, limites.",
            "Jours et dates valides.",
            "Enregistrer."
          ],
          caption: "Formulaire coupon.",
          fields: [
            {
              name: "Code",
              effect: "Chaîne au checkout."
            },
            {
              name: "Type coupon",
              effect: "Usage unique/multiple."
            },
            {
              name: "Type/valeur remise",
              effect: "Pourcent ou fixe."
            },
            {
              name: "Montant min commande",
              effect: "Sous-total min."
            },
            {
              name: "Remise max",
              effect: "Plafond %."
            },
            {
              name: "Limite utilisation",
              effect: "Total utilisations."
            },
            {
              name: "Limite par utilisateur",
              effect: "Par client."
            },
            {
              name: "Jours valides / horaires",
              effect: "Restriction temporelle."
            },
            {
              name: "Date début/fin",
              effect: "Validité globale."
            },
            {
              name: "Empilable / 1ère commande",
              effect: "Règles combinaison."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Formulaire cuisine",
          steps: [
            "Admin → Cuisine → Cuisines.",
            "Nom, priorité, imprimantes, plats.",
            "Enregistrer."
          ],
          caption: "Formulaire station cuisine.",
          intro: "Route plats vers imprimantes et stocks.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé KOT et affichage."
            },
            {
              name: "Priorité",
              effect: "Ordre si plusieurs cuisines."
            },
            {
              name: "Imprimantes",
              effect: "Appareils tickets."
            },
            {
              name: "Articles (plats)",
              effect: "Plats routés."
            }
          ]
        },
        "workflow-form": {
          title: "Formulaire workflow",
          steps: [
            "Cuisine → Workflows.",
            "Nom et étapes.",
            "Cuisine par étape.",
            "Lier aux plats."
          ],
          caption: "Éditeur étapes workflow.",
          intro: "Enchaîne étapes cuisine.",
          fields: [
            {
              name: "Nom",
              effect: "ID sur plats."
            },
            {
              name: "Étapes",
              effect: "Pas ordonnés."
            },
            {
              name: "Cuisine étape",
              effect: "Station par étape."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Formulaire imprimante",
          steps: [
            "Admin → Impression → Imprimantes.",
            "Nom et connexion IP/USB.",
            "Type reçu/cuisine/étiquette.",
            "Enregistrer."
          ],
          caption: "Formulaire imprimante.",
          fields: [
            {
              name: "Nom",
              effect: "Nom convivial."
            },
            {
              name: "Type",
              effect: "Profil reçu/cuisine/étiquette."
            },
            {
              name: "IP / port",
              effect: "Connexion réseau ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "IDs USB."
            }
          ]
        },
        "print-setting-form": {
          title: "Formulaire param impression",
          steps: [
            "Paramètres impression.",
            "Type job.",
            "Logo, en-tête/pied, TVA, marges.",
            "Enregistrer."
          ],
          caption: "Éditeur modèle.",
          intro: "Chaque job a son modèle.",
          fields: [
            {
              name: "Afficher logo",
              effect: "Logo sur ticket."
            },
            {
              name: "Sections en-tête/pied",
              effect: "Blocs texte/image."
            },
            {
              name: "Nom/n° TVA",
              effect: "Bloc fiscal."
            },
            {
              name: "Marges",
              effect: "Espacement en points."
            },
            {
              name: "Colonnes article",
              effect: "N°, nom, qté, prix, total."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Formulaire type paiement",
          steps: [
            "Admin → Paiements → Types.",
            "Nom, priorité, type.",
            "Remote: gateway, mode, clés.",
            "Enregistrer."
          ],
          caption: "Formulaire gateway remote.",
          intro: "Local et Remote Stripe, PayPal.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé boutons paiement."
            },
            {
              name: "Priorité",
              effect: "Ordre."
            },
            {
              name: "Type",
              effect: "Remote active gateway."
            },
            {
              name: "Fournisseur gateway",
              effect: "Stripe, PayPal etc."
            },
            {
              name: "Mode gateway",
              effect: "Test vs live."
            },
            {
              name: "public_key",
              effect: "Clé publiable client."
            },
            {
              name: "secret_key",
              effect: "Secret serveur."
            },
            {
              name: "webhook_secret",
              effect: "Valide callbacks."
            },
            {
              name: "client_id / client_secret",
              effect: "Gateways OAuth."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Champs marchand."
            },
            {
              name: "Taxe",
              effect: "Règle fiscale défaut."
            },
            {
              name: "Remises",
              effect: "Règles auto."
            }
          ]
        },
        "tax-form": {
          title: "Formulaire taxe",
          steps: [
            "Paiements → Taxes.",
            "Nom, taux, inclusif/exclusif.",
            "Enregistrer."
          ],
          caption: "Formulaire taxe.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé reçu."
            },
            {
              name: "Taux",
              effect: "Pourcentage taxable."
            },
            {
              name: "Inclusif",
              effect: "Si true, inclus dans prix."
            }
          ]
        },
        "order-type-form": {
          title: "Formulaire type commande",
          steps: [
            "Paiements → Types commande.",
            "Nom et drapeaux.",
            "Enregistrer."
          ],
          caption: "Formulaire type commande.",
          fields: [
            {
              name: "Nom",
              effect: "Type sur additions."
            },
            {
              name: "Priorité",
              effect: "Ordre sélecteurs."
            },
            {
              name: "Par défaut",
              effect: "Présélectionné nouveaux."
            }
          ]
        },
        "extra-form": {
          title: "Formulaire extra (service)",
          steps: [
            "Paiements → Extras.",
            "Nom et montant/taux.",
            "Règles application.",
            "Enregistrer."
          ],
          caption: "Formulaire surcharge.",
          intro: "Ajoute surcharges automatiques.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé reçu client."
            },
            {
              name: "Montant / taux",
              effect: "Fixe ou pourcent."
            },
            {
              name: "Taxable",
              effect: "TVA sur surcharge."
            },
            {
              name: "Règles auto",
              effect: "Types commande/paiement."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Formulaire utilisateur",
          steps: [
            "Admin → Utilisateurs.",
            "Méthode login, nom, identifiants, rôle, shift.",
            "Créer employé optionnel.",
            "Enregistrer."
          ],
          caption: "Formulaire compte utilisateur.",
          intro: "Opérateurs POS avec PIN ou mot de passe.",
          fields: [
            {
              name: "Méthode login",
              effect: "PIN (4 chiffres) ou mot de passe."
            },
            {
              name: "Prénom / nom",
              effect: "Nom sur additions."
            },
            {
              name: "Login / PIN",
              effect: "Identifiants."
            },
            {
              name: "Mot de passe",
              effect: "Obligatoire si mot de passe."
            },
            {
              name: "Rôle",
              effect: "Paquet permissions."
            },
            {
              name: "Shift",
              effect: "Shift par défaut."
            },
            {
              name: "Créer employé",
              effect: "Auto-création HR lié."
            }
          ]
        },
        "role-form": {
          title: "Formulaire rôle",
          steps: [
            "Utilisateurs → Rôles.",
            "Nom et arbre modules.",
            "Cochez permissions.",
            "Enregistrer."
          ],
          caption: "Éditeur permissions rôle.",
          intro: "Accorde accès modules et actions.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé formulaire utilisateur."
            },
            {
              name: "Permissions module",
              effect: "Cases hiérarchiques."
            }
          ]
        },
        "shift-form": {
          title: "Formulaire modèle shift",
          steps: [
            "Utilisateurs → Shifts.",
            "Nom et horaires.",
            "Nuit active lendemain.",
            "Enregistrer."
          ],
          caption: "Formulaire shift.",
          intro: "Définit fenêtres horaires.",
          fields: [
            {
              name: "Nom",
              effect: "Libellé shift."
            },
            {
              name: "Heure début",
              effect: "Début planifié."
            },
            {
              name: "Heure fin",
              effect: "Fin planifiée."
            }
          ]
        },
        "tips-definition": {
          title: "Définition pourboires (distribution)",
          steps: [
            "Utilisateurs → Définition pourboires.",
            "Lignes rôle avec poids.",
            "Overrides utilisateur.",
            "Enregistrer."
          ],
          caption: "Panneau distribution pourboires.",
          intro: "Pondère pourboires poolés par rôles et utilisateurs.",
          fields: [
            {
              name: "Poids rôle",
              effect: "Part du pool par rôle."
            },
            {
              name: "Poids utilisateur",
              effect: "Override optionnel."
            }
          ]
        }
      }
    }
  },
  nl: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Tab Afstemming",
          steps: [
            "Voorraad → Keukenafstemming.",
            "Kies locatie en bedrijfsdatum.",
            "Klik Genereren.",
            "Voer werkelijke hoeveelheden in of importeer CSV.",
            "Concept opslaan, afwijkingen controleren, Verifiëren."
          ],
          caption: "Werkbalk, raster en afwijkingspaneel.",
          intro: "Genereer raster uit POS-verkopen en recepten; voer tellingen in of importeer CSV.",
          fields: [
            {
              name: "Locatie",
              effect: "Keuken of magazijn dat wordt afgestemd."
            },
            {
              name: "Bedrijfsdatum",
              effect: "Handelsdag voor theoretisch gebruik."
            },
            {
              name: "Genereren",
              effect: "Maakt regels uit verkopen en recepten."
            },
            {
              name: "Werkelijke hoeveelheid",
              effect: "Fysieke telling per artikel."
            },
            {
              name: "Verifiëren",
              effect: "Vergrendelt na managergoedkeuring."
            }
          ]
        },
        "reconciliation-form": {
          title: "Handmatige telling",
          steps: [
            "Klik Werkl.-cel voor telling.",
            "Concept opslaan zonder verifiëren.",
            "CSV-import voor bulk.",
            "Controleer afwijkingen voor verificatie."
          ],
          caption: "Raster met werkelijke hoeveelheid.",
          intro: "Rasterbewerking en CSV-import delen dezelfde regelstructuur.",
          fields: [
            {
              name: "Artikel",
              effect: "Voorraadartikel op regel."
            },
            {
              name: "Theoretisch",
              effect: "Berekend gebruik uit recepten en verkopen."
            },
            {
              name: "Werkelijk",
              effect: "Ingevoerde telling."
            },
            {
              name: "Afwijking",
              effect: "Verschil werkelijk vs. theoretisch."
            },
            {
              name: "Notities",
              effect: "Optionele toelichting."
            }
          ]
        }
      },
      title: "Keukenafstemming",
      intro: "Vergelijk theoretisch keukengebruik met fysieke tellingen per locatie en datum."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Receptenlijst",
          steps: [
            "Voorraad → Recepten.",
            "Bekijk actieve recepten.",
            "Voeg toe of bewerk recepten."
          ],
          caption: "Tab receptonderhoud."
        },
        "recipe-form": {
          title: "Receptformulier",
          steps: [
            "Recept toevoegen of bewerken.",
            "Naam, code en basis batch qty.",
            "Input- en outputregels.",
            "Opslaan."
          ],
          caption: "Formulier inputs/outputs.",
          intro: "Definieert inputs, outputopbrengst en kostentoewijzing.",
          fields: [
            {
              name: "Naam",
              effect: "Weergavenaam in productie."
            },
            {
              name: "Code",
              effect: "Optionele korte code."
            },
            {
              name: "Basis batch qty",
              effect: "Standaard batchgrootte."
            },
            {
              name: "Kostentoewijzing",
              effect: "Verdeelt inputkosten."
            },
            {
              name: "Input items",
              effect: "Verbruikt per batch."
            },
            {
              name: "Output items",
              effect: "Geproduceerd met opbrengst %."
            },
            {
              name: "Actief",
              effect: "Inactief verborgen in nieuwe runs."
            }
          ]
        },
        production: {
          title: "Productieruns",
          steps: [
            "Tab Productie.",
            "Nieuwe batch van actief recept.",
            "Preview en voltooien."
          ],
          caption: "Productietab met batchlijst."
        },
        "production-form": {
          title: "Productiebatchformulier",
          steps: [
            "Nieuwe productie.",
            "Recept, locatie, qty.",
            "Preview en voltooien."
          ],
          caption: "Batchformulier met preview.",
          intro: "Bij voltooien worden inputs afgeboekt en outputs toegevoegd.",
          fields: [
            {
              name: "Recept",
              effect: "Bepaalt ingrediënten en outputs."
            },
            {
              name: "Locatie",
              effect: "Voorraad verbruik/productie."
            },
            {
              name: "Geproduceerde qty",
              effect: "Schaalt van basisbatch."
            },
            {
              name: "Batchnummer",
              effect: "Optionele referentie."
            },
            {
              name: "Itemkosten bijwerken",
              effect: "Herberekent outputkosten."
            },
            {
              name: "Notities",
              effect: "Vrije notitie."
            }
          ]
        },
        "production-history": {
          title: "Productiehistorie",
          steps: [
            "Audit voltooide batches.",
            "Filter datum/recept/locatie.",
            "Open regel voor details."
          ],
          caption: "Productiehistorielijst."
        }
      },
      title: "Recepten en productie",
      intro: "Definieer batchrecepten, voer productie uit en bekijk historie."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Buffetmenu's",
          steps: [
            "Voorraad → Buffet → Menu's.",
            "Sjablonen ontbijt/lunch/diner.",
            "Recepten per gast."
          ],
          caption: "Buffetmenulijst."
        },
        "buffet-menu-form": {
          title: "Buffetmenuformulier",
          steps: [
            "Menu toevoegen/bewerken.",
            "Sessietype en receptregels.",
            "Opslaan."
          ],
          caption: "Buffetmenuformulier.",
          fields: [
            {
              name: "Naam",
              effect: "Label bij sessiestart."
            },
            {
              name: "Code",
              effect: "Optionele keukencode."
            },
            {
              name: "Sessietype",
              effect: "Ontbijt/lunch/diner."
            },
            {
              name: "Receptregels",
              effect: "Recept en qty per gast."
            },
            {
              name: "Actief",
              effect: "Alleen actieve menu's."
            }
          ]
        },
        "buffet-sessions": {
          title: "Buffetsessies",
          steps: [
            "Buffet → Sessies.",
            "Start sessie van menu.",
            "Monitor productie vs prognose.",
            "Sluit sessie."
          ],
          caption: "Buffetsessiedashboard."
        },
        "buffet-session-form": {
          title: "Buffetsessie starten",
          steps: [
            "Nieuwe sessie.",
            "Menu, locatie, datum, type.",
            "Gasten en prijs.",
            "Opslaan."
          ],
          caption: "Formulier nieuwe sessie.",
          fields: [
            {
              name: "Menu",
              effect: "Laadt regels en prognoses."
            },
            {
              name: "Locatie",
              effect: "Magazijn voor mutaties."
            },
            {
              name: "Bedrijfsdatum",
              effect: "Handelsdag."
            },
            {
              name: "Sessietype",
              effect: "Past bij menu."
            },
            {
              name: "Verwachte gasten",
              effect: "Initiële prognoses."
            },
            {
              name: "Buffetprijs",
              effect: "Omzet per gast."
            }
          ]
        }
      },
      title: "Buffetmenu's en sessies",
      intro: "Plan recepten per gast en beheer buffet sessies."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Kostenplaatsenlijst",
          steps: [
            "HR → Kostenplaatsen.",
            "Bekijk codes.",
            "Toevoegen/bewerken."
          ],
          caption: "Tab kostenplaatsen."
        },
        "cost-center-form": {
          title: "Kostenplaatsformulier",
          steps: [
            "Toevoegen/bewerken.",
            "Code, naam, beschrijving.",
            "Actief/inactief.",
            "Opslaan."
          ],
          caption: "Modal kostenplaats.",
          fields: [
            {
              name: "Code",
              effect: "Unieke korte id."
            },
            {
              name: "Naam",
              effect: "Label in dropdowns."
            },
            {
              name: "Beschrijving",
              effect: "Optionele notities."
            },
            {
              name: "Actief",
              effect: "Inactief niet op nieuwe records."
            }
          ]
        }
      },
      title: "Kostenplaatsen",
      intro: "Labelen arbeid en loon voor locaties en afdelingen."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Salarisprofielen",
          steps: [
            "HR → Salaris → Profielen.",
            "Basistarief per medewerker.",
            "Voedt loonrun."
          ],
          caption: "Lijst salarisprofielen."
        },
        "pay-profile-form": {
          title: "Salarisprofielformulier",
          steps: [
            "Profiel toevoegen/bewerken.",
            "Type en basistarief.",
            "Opslaan."
          ],
          caption: "Salarisprofielformulier.",
          fields: [
            {
              name: "Medewerker",
              effect: "Ontvangt deze basisvergoeding."
            },
            {
              name: "Salaristype",
              effect: "Uur, salaris, contract, commissie of gemengd."
            },
            {
              name: "Basistarief",
              effect: "Hoofdtarief of salarisbedrag."
            },
            {
              name: "Valuta",
              effect: "ISO-valuta."
            },
            {
              name: "Geldig vanaf",
              effect: "Eerste dag profiel."
            },
            {
              name: "Geldig tot",
              effect: "Optioneel einde."
            }
          ]
        },
        "pay-rules": {
          title: "Salarisregels",
          steps: [
            "Salaris → Regels.",
            "Stapelen op prioriteit.",
            "Filters medewerker/afdeling."
          ],
          caption: "Lijst salarisregels."
        },
        "pay-rule-form": {
          title: "Salarisregelformulier",
          steps: [
            "Regel toevoegen.",
            "Effecten definiëren.",
            "Datum/tijd filters.",
            "Medewerkers toewijzen.",
            "Opslaan."
          ],
          caption: "Regelformulier.",
          intro: "Effecten en geschiktheidsfilters.",
          fields: [
            {
              name: "Code",
              effect: "Unieke id."
            },
            {
              name: "Naam",
              effect: "Admin label."
            },
            {
              name: "Prioriteit",
              effect: "Stapelvolgorde."
            },
            {
              name: "Stapelmodus",
              effect: "Interactie regels."
            },
            {
              name: "Effecten",
              effect: "Multipliers of bedragen."
            },
            {
              name: "Medewerker/afdeling/functie/kostenplaats filters",
              effect: "Beperkt bereik."
            },
            {
              name: "Datum/tijd venster",
              effect: "Optioneel bereik."
            },
            {
              name: "Weekdagen / maanden",
              effect: "Kalenderpatronen."
            },
            {
              name: "Feestdagen",
              effect: "Geselecteerde feestdagen."
            },
            {
              name: "Overuren (dag/week)",
              effect: "Na drempels."
            }
          ]
        }
      },
      title: "Salarisprofielen en regels",
      intro: "Basislonen en toeslagregels."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Loonperiodes",
          steps: [
            "HR → Loon → Periodes.",
            "Maak periodes aan.",
            "Vergrendel voor final run."
          ],
          caption: "Lijst loonperiodes."
        },
        "payroll-period-form": {
          title: "Loonperiodeformulier",
          steps: [
            "Naam, type, datums.",
            "Status Open.",
            "Wijzig naar Vergrendeld/Gesloten/Betaald."
          ],
          caption: "Periodeformulier.",
          fields: [
            {
              name: "Periodenaam",
              effect: "Label op runs en exports."
            },
            {
              name: "Periodetype",
              effect: "Wekelijks, tweewekelijks, maandelijks of custom."
            },
            {
              name: "Startdatum",
              effect: "Eerste dag inclusief."
            },
            {
              name: "Einddatum",
              effect: "Laatste dag inclusief."
            },
            {
              name: "Status",
              effect: "Open staat edits toe; vergrendeld beperkt."
            }
          ]
        },
        "payroll-runs": {
          title: "Loonruns",
          steps: [
            "Loon → Runs.",
            "Genereer preview.",
            "Controleer snapshots."
          ],
          caption: "Loonruns per periode."
        },
        "payroll-run-form": {
          title: "Loonrun genereren",
          steps: [
            "Nieuwe run.",
            "Open periode.",
            "Preview genereren."
          ],
          caption: "Formulier nieuwe run.",
          fields: [
            {
              name: "Loonperiode",
              effect: "Bepaalt uren en aanpassingen."
            },
            {
              name: "Runnummer",
              effect: "Sequentieel id in periode."
            }
          ]
        },
        adjustments: {
          title: "Loonaanpassingen",
          steps: [
            "Loon → Aanpassingen.",
            "Voeg bonussen/boetes toe.",
            "Koppel aan periode."
          ],
          caption: "Lijst aanpassingen."
        },
        "adjustment-form": {
          title: "Aanpassingsformulier",
          steps: [
            "Medewerker, type, bedrag, datum.",
            "Optionele periode.",
            "Opslaan."
          ],
          caption: "Loonaanpassingsformulier.",
          fields: [
            {
              name: "Medewerker",
              effect: "Ontvangt aanpassing."
            },
            {
              name: "Loonperiode",
              effect: "Optionele run-koppeling."
            },
            {
              name: "Type",
              effect: "Bonus, boete, toelage, vergoeding, voorschot, lening, correctie of inhouding."
            },
            {
              name: "Bedrag",
              effect: "Valuta op bruto."
            },
            {
              name: "Ingangsdatum",
              effect: "Bepaalt welke run opneemt."
            },
            {
              name: "Beschrijving",
              effect: "Loonstrookdetail en audit."
            }
          ]
        }
      },
      title: "Loonperiodes en runs",
      intro: "Sluit periodes af, genereer runs met preview."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Documentenlijst",
          steps: [
            "HR → Documenten.",
            "Filter medewerker/categorie.",
            "Upload of werk bij."
          ],
          caption: "Tab medewerkerdocumenten."
        },
        "document-form": {
          title: "Documentformulier",
          steps: [
            "Document toevoegen.",
            "Medewerker, titel, categorie.",
            "Bestand en vervaldatum.",
            "Opslaan."
          ],
          caption: "Uploadformulier document.",
          fields: [
            {
              name: "Medewerker",
              effect: "Eigenaar record."
            },
            {
              name: "Titel",
              effect: "Weergavenaam."
            },
            {
              name: "Categorie",
              effect: "Contract, certificaat, licentie, ID, medisch, waarschuwing of overig."
            },
            {
              name: "Verloopt op",
              effect: "Optionele herinneringsdatum."
            },
            {
              name: "Bestand bijvoegen",
              effect: "Verplicht bij aanmaken."
            }
          ]
        }
      },
      title: "Medewerkerdocumenten",
      intro: "Bewaar contracten, ID's en licenties met vervaldatum."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Prestatielijst",
          steps: [
            "HR → Prestatie.",
            "Blader per medewerker/type.",
            "Voeg toe na incidenten."
          ],
          caption: "Tab prestatienotities."
        },
        "performance-form": {
          title: "Prestatienotitieformulier",
          steps: [
            "Medewerker, type, titel, tekst.",
            "Ernst indien nodig.",
            "Zichtbaar voor medewerker.",
            "Opslaan."
          ],
          caption: "Formulier prestatienotitie.",
          fields: [
            {
              name: "Medewerker",
              effect: "Onderwerp van notitie."
            },
            {
              name: "Type",
              effect: "Waarschuwing, compliment, beoordeling of incident."
            },
            {
              name: "Titel",
              effect: "Korte samenvatting."
            },
            {
              name: "Inhoud",
              effect: "Volledig verhaal."
            },
            {
              name: "Ernst",
              effect: "Laag, medium, hoog of kritiek."
            },
            {
              name: "Zichtbaar medewerker",
              effect: "Kan aan medewerker getoond worden."
            }
          ]
        }
      },
      title: "Prestatienotities",
      intro: "Registreer waarschuwingen, complimenten en incidenten."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Bestelling annuleren of voiden",
          steps: [
            "Open ⋯ op een lopende order en kies Bestelling annuleren.",
            "Kies een void-reden (verplicht voor rapportage).",
            "Laat Alles selecteren aan voor volledige void of kies specifieke regels.",
            "Bevestig om te voiden en tafel vrij te geven indien van toepassing."
          ],
          caption: "Annuleermodal met reden en itemselectie.",
          intro: "Void een lopende rekening. Volledige void annuleert alle regels; gedeeltelijk alleen geselecteerde items.",
          fields: [
            {
              name: "Reden",
              effect: "Verplichte void-reden voor audit en rapporten."
            },
            {
              name: "Alle items selecteren",
              effect: "Aangevinkt void hele rekening; uitgevinkt per regel."
            },
            {
              name: "Gedeeltelijke void",
              effect: "Void alleen geselecteerde hoeveelheden."
            }
          ]
        },
        refund: {
          title: "Betaalde bestelling terugbetalen",
          steps: [
            "Open betaalde order en kies Terugbetaling.",
            "Selecteer regels en hoeveelheden.",
            "Kies reden en bevestig.",
            "Systeem boekt terugbetaling en werkt totalen bij."
          ],
          caption: "Terugbetalingsmodal met itemkeuze.",
          intro: "Doet terugbetaling op betaalde rekening, optioneel per geselecteerde items.",
          fields: [
            {
              name: "Te restitueren items",
              effect: "Betaalde regels en hoeveelheden aan klant."
            },
            {
              name: "Reden",
              effect: "Documenteert terugbetaling voor management en rapporten."
            }
          ]
        },
        "split-seats": {
          title: "Splitsen op stoelen",
          steps: [
            "Kies ⋯ → Splitsen op stoelen.",
            "Controleer groepering per stoel.",
            "Bevestig voor één kindbon per stoel."
          ],
          caption: "Voorvertoning splitsen op stoelen.",
          intro: "Deelt rekening in aparte bonnen per stoelnummer."
        },
        "split-items": {
          title: "Splitsen op items",
          steps: [
            "Kies ⋯ → Splitsen op items.",
            "Verplaats elke regel naar een kolom.",
            "Bevestig voor aparte lopende bonnen."
          ],
          caption: "Toewijzingsraster per item.",
          intro: "Wijst regels handmatig toe aan nieuwe rekeningen."
        },
        "split-amount": {
          title: "Splitsen op bedrag",
          steps: [
            "Kies ⋯ → Splitsen op bedrag.",
            "Voer aantal delen of bedragen in.",
            "Bevestig voor kindbonnen per deel."
          ],
          caption: "Dialoog splitsen op bedrag.",
          intro: "Deelt totaal in vaste of gelijke delen."
        },
        merge: {
          title: "Bestellingen samenvoegen",
          steps: [
            "Open ⋯ op eerste order → Samenvoegen.",
            "Herhaal voor extra orders.",
            "Tik Tafel kiezen en selecteer bestemming.",
            "Bevestig samenvoeging."
          ],
          caption: "Samenvoegbalk met tafelkiezer.",
          intro: "Combineert meerdere lopende rekeningen op één tafel.",
          fields: [
            {
              name: "Orders selecteren",
              effect: "Markeert order voor pending merge."
            },
            {
              name: "Tafel kiezen",
              effect: "Stelt tafel in voor samengevoegde rekening."
            },
            {
              name: "Samenvoeging bevestigen",
              effect: "Voegt geselecteerde bonnen samen tot één lopende order."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Winst en verlies",
          steps: [
            "Open Accounts → Winst en verlies.",
            "Stel periode in.",
            "Vouw rekeninggroepen uit.",
            "Exporteer na sluiting."
          ],
          caption: "Tab Winst en verlies.",
          intro: "Resultatenrekening: omzet, kosten van verkochte goederen en bedrijfskosten."
        },
        "cash-flow": {
          title: "Kasstroom",
          steps: [
            "Open Kasstroom in Accounts.",
            "Zelfde periode als andere overzichten.",
            "Bekijk openingsaldo, netto mutatie en eindsaldo.",
            "Gebruik naast W&V voor kas vs. accrual."
          ],
          caption: "Tab Kasstroom.",
          intro: "Vat operationele, investerings- en financieringsstromen samen."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Medewerkerformulier",
          steps: [
            "Medewerkers → Toevoegen/bewerken.",
            "Nummer, naam, details.",
            "Koppel POS, afdeling, functie.",
            "Opslaan."
          ],
          caption: "Modal medewerker.",
          intro: "HR-record met POS-gebruiker en org-structuur.",
          fields: [
            {
              name: "Medewerkernummer",
              effect: "Unieke id op roosters."
            },
            {
              name: "Voor- / achternaam",
              effect: "Juridische of voorkeursnaam."
            },
            {
              name: "Gekoppelde gebruiker",
              effect: "Optionele POS-login."
            },
            {
              name: "Afdeling",
              effect: "Org-eenheid."
            },
            {
              name: "Functie",
              effect: "Titel op roosters."
            },
            {
              name: "Kostenplaats",
              effect: "Standaard arbeidskosten."
            },
            {
              name: "Manager",
              effect: "Goedkeuringslijn."
            },
            {
              name: "Dienstverbandstatus",
              effect: "Actief, inactief, beëindigd, verlof of geschorst."
            },
            {
              name: "Dienstverbandtype",
              effect: "Uur, salaris, contract etc."
            },
            {
              name: "In dienst / uit",
              effect: "Diensttijd en geschiktheid."
            }
          ]
        },
        "department-form": {
          title: "Afdelingsformulier",
          steps: [
            "Afdelingen of inline.",
            "Code, naam, beschrijving.",
            "Opslaan."
          ],
          caption: "Afdelingsformulier.",
          fields: [
            {
              name: "Code",
              effect: "Korte id integraties."
            },
            {
              name: "Naam",
              effect: "Weergavenaam."
            },
            {
              name: "Beschrijving",
              effect: "Optionele notities."
            },
            {
              name: "Actief",
              effect: "Inactief verborgen bij nieuwe toewijzingen."
            }
          ]
        },
        "position-form": {
          title: "Functieformulier",
          steps: [
            "Functies of inline.",
            "Code, naam, afdeling, kostenplaats.",
            "Opslaan."
          ],
          caption: "Functieformulier.",
          fields: [
            {
              name: "Code",
              effect: "Jobcode loonexport."
            },
            {
              name: "Naam",
              effect: "Titel HR en roosters."
            },
            {
              name: "Afdeling",
              effect: "Standaard org-eenheid."
            },
            {
              name: "Standaard kostenplaats",
              effect: "Vooringevuld op roosters."
            },
            {
              name: "Actief",
              effect: "Pensioneert niet meer gebruikte titels."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Handmatige aanweigheid",
          steps: [
            "Aanwezigheid → Handmatig.",
            "Medewerker en tijden.",
            "Notities en opslaan."
          ],
          caption: "Modal handmatige aanwezigheid.",
          intro: "Corrigeert missende punches of vult tijd aan.",
          fields: [
            {
              name: "Medewerker",
              effect: "Wiens record wordt gemaakt."
            },
            {
              name: "Inklokken",
              effect: "Start werktinterval."
            },
            {
              name: "Uitklokken",
              effect: "Einde na inklokken."
            },
            {
              name: "Notities",
              effect: "Reden handmatige invoer."
            }
          ]
        },
        "schedule-form": {
          title: "Werkroosterformulier",
          steps: [
            "Planning → rooster toevoegen.",
            "Naam en periode start/eind.",
            "Diensten of genereren uit sjabloon."
          ],
          caption: "Werkroosterformulier.",
          intro: "Datumbereik met concept- of gepubliceerde diensten.",
          fields: [
            {
              name: "Naam",
              effect: "Label roosterperiode."
            },
            {
              name: "Periode start",
              effect: "Eerste datetime."
            },
            {
              name: "Periode einde",
              effect: "Laatste datetime."
            }
          ]
        },
        "shift-form": {
          title: "Geplande dienstformulier",
          intro: "Wijst medewerker toe aan tijdblok in conceptrooster.",
          steps: [
            "Concept → dienst toevoegen.",
            "Rooster, medewerker, tijden.",
            "Sjabloon/org optioneel.",
            "Opslaan."
          ],
          caption: "Dienstformulier.",
          fields: [
            {
              name: "Werkrooster",
              effect: "Ouder moet concept zijn."
            },
            {
              name: "Medewerker",
              effect: "Toegewezen aan dienst."
            },
            {
              name: "Dienstsjabloon",
              effect: "Preset Admin → Gebruikers → Diensten."
            },
            {
              name: "Afd / functie / kostenplaats",
              effect: "Org override."
            },
            {
              name: "Start / einde",
              effect: "Gepland venster."
            }
          ]
        },
        "schedule-template": {
          title: "Rooster sjabloonformulier",
          steps: [
            "Planning → Sjablonen.",
            "Naam en dagen/tijden.",
            "Dienstsjabloon optioneel.",
            "Opslaan."
          ],
          caption: "Sjabloonformulier.",
          intro: "Herbruikbaar weekpatroon.",
          fields: [
            {
              name: "Naam",
              effect: "Label genereren."
            },
            {
              name: "Weekdagen",
              effect: "Dagen met diensten."
            },
            {
              name: "Start/eind tijd",
              effect: "Dagelijks venster."
            },
            {
              name: "Pauzeminuten",
              effect: "Onbetaalde pauze."
            },
            {
              name: "Dienstsjabloon",
              effect: "POS shift definitie."
            }
          ]
        },
        "schedule-generate": {
          title: "Rooster genereren uit sjabloon",
          steps: [
            "Planning → Genereren.",
            "Concept en sjabloon.",
            "Selecteer medewerkers.",
            "Genereren."
          ],
          caption: "Dialoog genereren.",
          fields: [
            {
              name: "Werkrooster",
              effect: "Doelconcept."
            },
            {
              name: "Sjabloon",
              effect: "Weekpatroon."
            },
            {
              name: "Medewerkers",
              effect: "Krijgen kopie diensten."
            }
          ]
        },
        "schedule-swap": {
          title: "Dienst ruil verzoek",
          steps: [
            "Planning → Ruil aanvragen.",
            "Dienst en aanvrager.",
            "Doelcollega optioneel.",
            "Indienen."
          ],
          caption: "Ruilformulier.",
          fields: [
            {
              name: "Geplande dienst",
              effect: "Dienst om te ruilen."
            },
            {
              name: "Aanvrager",
              effect: "Initieert ruil."
            },
            {
              name: "Doelmedewerker",
              effect: "Optioneel."
            },
            {
              name: "Voorgestelde dienst",
              effect: "Tegen-dienst."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Verlofaanvraagformulier",
          steps: [
            "Verlof → Toevoegen.",
            "Medewerker, type, datums.",
            "Dagen en reden.",
            "Opslaan."
          ],
          caption: "Verlofformulier.",
          intro: "Dient verlofaanvragen in per type.",
          fields: [
            {
              name: "Medewerker",
              effect: "Aanvrager."
            },
            {
              name: "Verloftype",
              effect: "Betaald/onbetaald en goedkeuring."
            },
            {
              name: "Start/eind datum",
              effect: "Inclusieve datums."
            },
            {
              name: "Dagen",
              effect: "Werkdagen verbruikt."
            },
            {
              name: "Reden",
              effect: "Optionele notitie."
            }
          ]
        },
        "holiday-form": {
          title: "Feestdagformulier",
          steps: [
            "Verlof → Feestdagen.",
            "Naam, datum, land.",
            "Terugkerend indien jaarlijks.",
            "Opslaan."
          ],
          caption: "Feestdagformulier.",
          intro: "Werkt met salarisregels en planning.",
          fields: [
            {
              name: "Naam",
              effect: "Label kalenders."
            },
            {
              name: "Datum",
              effect: "Geobserveerde datum."
            },
            {
              name: "Landcode",
              effect: "Optionele ISO."
            },
            {
              name: "Terugkerend",
              effect: "Jaarlijks herhaald."
            },
            {
              name: "Actief",
              effect: "Inactief genegeerd door nieuwe regels."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Gerechtformulier",
          steps: [
            "Admin → Menu's → Gerechten.",
            "Nummer, naam, prijs, categorieën.",
            "Modifiers, recept, keuken.",
            "Opslaan."
          ],
          caption: "Gerecht onderhoud.",
          intro: "Verkoopbare items met prijs, categorieën, modifiers en keuken.",
          fields: [
            {
              name: "Nummer / naam",
              effect: "POS-id en weergavenaam."
            },
            {
              name: "Prijs / kosten",
              effect: "Verkoopprijs en theoretische kosten."
            },
            {
              name: "Categorieën",
              effect: "Menugroepering."
            },
            {
              name: "Modifiergroepen",
              effect: "Aanpassingsflow."
            },
            {
              name: "Receptregels",
              effect: "Voorraadafname bij verkoop."
            },
            {
              name: "Keuken / workflow",
              effect: "KOT-routing."
            }
          ]
        },
        "menu-form": {
          title: "Menuformulier",
          steps: [
            "Tab Menu's.",
            "Naam en tijden.",
            "Actief en eindigt volgende dag.",
            "Opslaan."
          ],
          caption: "Menuformulier.",
          intro: "Beperkt POS-categorieën per tijd.",
          fields: [
            {
              name: "Naam",
              effect: "Label POS-switcher."
            },
            {
              name: "Start / eind",
              effect: "Beschikbaarheidsvenster."
            },
            {
              name: "Eindigt volgende dag",
              effect: "Service na middernacht."
            },
            {
              name: "Actief",
              effect: "Inactief verborgen."
            }
          ]
        },
        "category-form": {
          title: "Categorieformulier",
          steps: [
            "Categorieën.",
            "Naam, prioriteit, toon in menu.",
            "Opslaan."
          ],
          caption: "Categorieformulier.",
          fields: [
            {
              name: "Naam",
              effect: "Kop POS."
            },
            {
              name: "Prioriteit",
              effect: "Sorteervolgorde."
            },
            {
              name: "Toon in menu",
              effect: "Verborgen indien uit."
            }
          ]
        },
        "modifier-group-form": {
          title: "Modifiergroepformulier",
          steps: [
            "Modifiergroepen.",
            "Naam, prioriteit, prijzen.",
            "Volggroepen.",
            "Opslaan."
          ],
          caption: "Formulier geneste groepen.",
          intro: "Modifiers, prijzen en geneste volggroepen.",
          fields: [
            {
              name: "Naam / prioriteit",
              effect: "Label en volgorde."
            },
            {
              name: "Modifier",
              effect: "Selecteerbare optie."
            },
            {
              name: "Prijs",
              effect: "Extra toeslag."
            },
            {
              name: "Toegestane volggroepen",
              effect: "Na keuze."
            },
            {
              name: "Volggroep overrides",
              effect: "Verbergen of prijs."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Verdiepingformulier",
          steps: [
            "Admin → Verdiepingen.",
            "Naam, prioriteit, kleuren.",
            "Opslaan."
          ],
          caption: "Verdiepingformulier.",
          fields: [
            {
              name: "Naam",
              effect: "Label verdiepingskiezer."
            },
            {
              name: "Prioriteit",
              effect: "Sorteervolgorde."
            },
            {
              name: "Achtergrond / kleur",
              effect: "Standaard tegelstijl."
            }
          ]
        },
        "table-form": {
          title: "Tafelformulier",
          steps: [
            "Verdieping kiezen.",
            "Nummer, naam, kleuren.",
            "Beperkingen optioneel.",
            "Vraag couverts.",
            "Opslaan."
          ],
          caption: "Tafelformulier.",
          intro: "Hoort bij verdieping; optionele beperkingen.",
          fields: [
            {
              name: "Naam / nummer",
              effect: "Label plattegrond."
            },
            {
              name: "Verdieping",
              effect: "Bovenliggend plan."
            },
            {
              name: "Prioriteit",
              effect: "Volgorde."
            },
            {
              name: "Categorieën / ordertypes / betaaltypes",
              effect: "Beperkingen."
            },
            {
              name: "Vraag couverts",
              effect: "Vraagt gasten."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Kortingsregelformulier",
          steps: [
            "Admin → Promoties → Kortingen.",
            "Categorie, scope, modus.",
            "Doelen en waarde.",
            "Opslaan."
          ],
          caption: "Kortingsregelformulier.",
          intro: "14 categorieën; scope item/category/cart/customer/floor.",
          fields: [
            {
              name: "Categorie",
              effect: "Een van 14 types."
            },
            {
              name: "Scope",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "Toepassingsmodus",
              effect: "manual, automatic, both."
            },
            {
              name: "Doelen",
              effect: "In aanmerking komende items."
            },
            {
              name: "Type (percent/vast)",
              effect: "Min/max als % of bedrag."
            },
            {
              name: "Min / max tarief",
              effect: "Toegestaan bereik."
            },
            {
              name: "Max plafond",
              effect: "Limiet bij % kortingen."
            },
            {
              name: "Prioriteit",
              effect: "Volgorde auto-regels."
            },
            {
              name: "Min orderbedrag",
              effect: "Subtotaal drempel."
            },
            {
              name: "Stapelmodus",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Belastingbehandeling",
              effect: "tax_before/after_discount etc."
            },
            {
              name: "Schema's",
              effect: "Dag/uur vensters."
            },
            {
              name: "Voorwaarden",
              effect: "Buy X Get Y."
            },
            {
              name: "Reden/goedkeuring vereist",
              effect: "Manager-PIN handmatig."
            }
          ]
        },
        "coupon-form": {
          title: "Couponformulier",
          steps: [
            "Promoties → Coupons.",
            "Code, type/waarde, limieten.",
            "Geldige dagen en datums.",
            "Opslaan."
          ],
          caption: "Couponformulier.",
          fields: [
            {
              name: "Code",
              effect: "String bij checkout."
            },
            {
              name: "Coupontype",
              effect: "Eenmalig/meervoudig."
            },
            {
              name: "Kortingstype/waarde",
              effect: "Procent of vast."
            },
            {
              name: "Min orderbedrag",
              effect: "Subtotaal drempel."
            },
            {
              name: "Max korting",
              effect: "Plafond %."
            },
            {
              name: "Gebruikslimiet",
              effect: "Totaal inwisselingen."
            },
            {
              name: "Limiet per gebruiker",
              effect: "Per klant."
            },
            {
              name: "Geldige dagen / tijden",
              effect: "Tijdrestrictie."
            },
            {
              name: "Start/eind datum",
              effect: "Algemene geldigheid."
            },
            {
              name: "Stapelbaar / alleen eerste order",
              effect: "Combinatieregels."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Keukenformulier",
          steps: [
            "Admin → Keuken → Keukens.",
            "Naam, prioriteit, printers, gerechten.",
            "Opslaan."
          ],
          caption: "Keukenstationformulier.",
          intro: "Routeert gerechten naar printers en locaties.",
          fields: [
            {
              name: "Naam",
              effect: "Label KOT en order display."
            },
            {
              name: "Prioriteit",
              effect: "Volgorde bij meerdere keukens."
            },
            {
              name: "Printers",
              effect: "Ticketapparaten."
            },
            {
              name: "Items (gerechten)",
              effect: "Gerouteerde gerechten."
            }
          ]
        },
        "workflow-form": {
          title: "Workflowformulier",
          steps: [
            "Keuken → Workflows.",
            "Naam en fasen.",
            "Keuken per fase.",
            "Koppel aan gerechten."
          ],
          caption: "Workflow fase-editor.",
          intro: "Koppelt keukenfasen.",
          fields: [
            {
              name: "Naam",
              effect: "ID op gerechten."
            },
            {
              name: "Fasen",
              effect: "Geordende stappen."
            },
            {
              name: "Fase keuken",
              effect: "Station per fase."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Printerformulier",
          steps: [
            "Admin → Afdrukken → Printers.",
            "Naam en IP/USB.",
            "Type bon/keuken/label.",
            "Opslaan."
          ],
          caption: "Printerformulier.",
          fields: [
            {
              name: "Naam",
              effect: "Vriendelijke naam."
            },
            {
              name: "Type",
              effect: "Bon/keuken/label profiel."
            },
            {
              name: "IP / poort",
              effect: "Netwerk ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "USB-ids."
            }
          ]
        },
        "print-setting-form": {
          title: "Afdrukinstellingformulier",
          steps: [
            "Afdrukinstellingen.",
            "Jobtype.",
            "Logo, kop/voet, BTW, marges.",
            "Opslaan."
          ],
          caption: "Sjablooneditor.",
          intro: "Elke job heeft eigen sjabloon.",
          fields: [
            {
              name: "Logo tonen",
              effect: "Logo op ticket."
            },
            {
              name: "Kop/voet secties",
              effect: "Tekst/afbeelding blokken."
            },
            {
              name: "BTW naam/nummer",
              effect: "Fiscaal blok."
            },
            {
              name: "Marges",
              effect: "Ruimte in punten."
            },
            {
              name: "Itemkolommen",
              effect: "Nr, naam, qty, prijs, totaal."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Betaaltypeformulier",
          steps: [
            "Admin → Betalingen → Types.",
            "Naam, prioriteit, type.",
            "Remote: gateway, modus, keys.",
            "Opslaan."
          ],
          caption: "Formulier remote gateway.",
          intro: "Lokaal en Remote Stripe, PayPal.",
          fields: [
            {
              name: "Naam",
              effect: "Label betaalknoppen."
            },
            {
              name: "Prioriteit",
              effect: "Volgorde."
            },
            {
              name: "Type",
              effect: "Remote toont gateway."
            },
            {
              name: "Gateway provider",
              effect: "Stripe, PayPal etc."
            },
            {
              name: "Gateway modus",
              effect: "Test vs live."
            },
            {
              name: "public_key",
              effect: "Client publishable key."
            },
            {
              name: "secret_key",
              effect: "Server secret."
            },
            {
              name: "webhook_secret",
              effect: "Valideert callbacks."
            },
            {
              name: "client_id / client_secret",
              effect: "OAuth gateways."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Merchant velden."
            },
            {
              name: "Belasting",
              effect: "Standaard belastingregel."
            },
            {
              name: "Kortingen",
              effect: "Auto-regels."
            }
          ]
        },
        "tax-form": {
          title: "Belastingformulier",
          steps: [
            "Betalingen → Belastingen.",
            "Naam, tarief, inclusief/exclusief.",
            "Opslaan."
          ],
          caption: "Belastingformulier.",
          fields: [
            {
              name: "Naam",
              effect: "Label bon."
            },
            {
              name: "Tarief",
              effect: "Percentage belastbaar."
            },
            {
              name: "Inclusief",
              effect: "Indien true, in prijs."
            }
          ]
        },
        "order-type-form": {
          title: "Ordertypeformulier",
          steps: [
            "Betalingen → Ordertypes.",
            "Naam en flags.",
            "Opslaan."
          ],
          caption: "Ordertypeformulier.",
          fields: [
            {
              name: "Naam",
              effect: "Type op bonnen."
            },
            {
              name: "Prioriteit",
              effect: "Volgorde selectors."
            },
            {
              name: "Standaard",
              effect: "Vooraf geselecteerd nieuw."
            }
          ]
        },
        "extra-form": {
          title: "Extra (servicekosten) formulier",
          steps: [
            "Betalingen → Extras.",
            "Naam en bedrag/tarief.",
            "Toepassingsregels.",
            "Opslaan."
          ],
          caption: "Toeslagformulier.",
          intro: "Voegt automatische toeslagen toe.",
          fields: [
            {
              name: "Naam",
              effect: "Label gastbon."
            },
            {
              name: "Bedrag / tarief",
              effect: "Vast of procent."
            },
            {
              name: "Belastbaar",
              effect: "BTW op toeslag."
            },
            {
              name: "Auto-toepassen regels",
              effect: "Ordertype/betaaltype."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Gebruikersformulier",
          steps: [
            "Admin → Gebruikers.",
            "Loginmethode, naam, credentials, rol, dienst.",
            "Optioneel medewerker.",
            "Opslaan."
          ],
          caption: "Gebruikersaccountformulier.",
          intro: "POS-operators met PIN of wachtwoord.",
          fields: [
            {
              name: "Loginmethode",
              effect: "PIN (4 cijfers) of wachtwoord."
            },
            {
              name: "Voor- / achternaam",
              effect: "Naam op bonnen."
            },
            {
              name: "Login / PIN",
              effect: "Inloggegevens."
            },
            {
              name: "Wachtwoord",
              effect: "Verplicht bij wachtwoord."
            },
            {
              name: "Gebruikersrol",
              effect: "Permissiepakket."
            },
            {
              name: "Gebruikersdienst",
              effect: "Standaard dienst."
            },
            {
              name: "Medewerker aanmaken",
              effect: "Auto HR-koppeling."
            }
          ]
        },
        "role-form": {
          title: "Rolformulier",
          steps: [
            "Gebruikers → Rollen.",
            "Naam en moduleboom.",
            "Vink permissies.",
            "Opslaan."
          ],
          caption: "Rol permissie-editor.",
          intro: "Verleent module- en actietoegang.",
          fields: [
            {
              name: "Naam",
              effect: "Label gebruikersformulier."
            },
            {
              name: "Module permissies",
              effect: "Hiërarchische checkboxes."
            }
          ]
        },
        "shift-form": {
          title: "Dienstsjabloonformulier",
          steps: [
            "Gebruikers → Diensten.",
            "Naam en tijden.",
            "Nacht activeert volgende dag.",
            "Opslaan."
          ],
          caption: "Dienstsjabloon.",
          intro: "Definieert tijdvensters.",
          fields: [
            {
              name: "Naam",
              effect: "Dienstlabel."
            },
            {
              name: "Starttijd",
              effect: "Geplande start."
            },
            {
              name: "Eindtijd",
              effect: "Gepland einde."
            }
          ]
        },
        "tips-definition": {
          title: "Fooidefinitie (verdeling)",
          steps: [
            "Gebruikers → Fooidefinitie.",
            "Rolregels met gewichten.",
            "Gebruiker overrides.",
            "Opslaan."
          ],
          caption: "Fooiverdeling admin.",
          intro: "Weegt gepoolde fooien per rol en gebruiker.",
          fields: [
            {
              name: "Rolgewicht",
              effect: "Poolaandeel per rol."
            },
            {
              name: "Gebruikersgewicht",
              effect: "Optionele override."
            }
          ]
        }
      }
    }
  },
  de: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Registerkarte Abstimmung",
          steps: [
            "Öffnen Sie Inventar und Küchenabstimmung.",
            "Wählen Sie Lagerort und Geschäftstag.",
            "Klicken Sie Generieren für theoretische Verbrauchszeilen.",
            "Geben Sie Ist-Mengen ein oder importieren Sie CSV.",
            "Entwurf speichern, Abweichungen prüfen, Verifizieren (Manager-PIN ggf.)."
          ],
          caption: "Abstimmungsleiste, Raster und Abweichungspanel.",
          intro: "Erzeugen Sie ein Abstimmungsraster aus POS-Verkäufen und Rezeptverbrauch, dann Ist-Zählungen eingeben oder importieren.",
          fields: [
            {
              name: "Standort",
              effect: "Küche oder Lager, dessen Bestand abgestimmt wird."
            },
            {
              name: "Geschäftstag",
              effect: "Handelstag für theoretischen Verbrauch und Zählungen."
            },
            {
              name: "Generieren",
              effect: "Erstellt oder aktualisiert Zeilen aus Verkäufen und Rezepten."
            },
            {
              name: "Istmenge",
              effect: "Physische Zählung pro Artikel; bestimmt Abweichung."
            },
            {
              name: "Verifizieren",
              effect: "Sperrt die Abstimmung nach Managerfreigabe."
            }
          ]
        },
        "reconciliation-form": {
          title: "Manuelle Zählung",
          steps: [
            "Klicken Sie eine Zelle in Ist für die Zählung.",
            "Entwurf speichern ohne Verifizierung.",
            "CSV-Import für Masseneingabe.",
            "Abweichungspanel vor Verifizierung prüfen."
          ],
          caption: "Raster mit Bearbeitung der Istmenge.",
          intro: "Inline-Bearbeitung und CSV-Import nutzen dieselbe Zeilenstruktur.",
          fields: [
            {
              name: "Artikel",
              effect: "Inventarartikel der Zeile."
            },
            {
              name: "Theoretisch",
              effect: "Systemberechneter Verbrauch aus Rezepten und Verkäufen."
            },
            {
              name: "Ist",
              effect: "Eingegebene gezählte oder Verbrauchsmenge."
            },
            {
              name: "Abweichung",
              effect: "Differenz Ist vs. theoretisch; zeigt Schwund oder Datenfehler."
            },
            {
              name: "Notizen",
              effect: "Optionale Erklärung auf der Zeile."
            }
          ]
        }
      },
      title: "Küchenabstimmung",
      intro: "Vergleichen Sie theoretischen Küchenverbrauch (Verkäufe und Rezepte) mit physischen Zählungen nach Standort und Geschäftstag. Entwürfe, Prüfung und Sperrung für Bestandsgenauigkeit."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Rezeptliste",
          steps: [
            "Öffnen Sie Inventar → Rezepte.",
            "Durchsuchen Sie aktive Rezepte mit Chargengröße und Output-Artikeln.",
            "Rezepte für Küchenvorbereitung und Kalkulation pflegen."
          ],
          caption: "Registerkarte Rezeptpflege."
        },
        "recipe-form": {
          title: "Rezeptformular",
          steps: [
            "Klicken Sie Rezept hinzufügen oder Zeile bearbeiten.",
            "Name, Code und Basis-Chargenmenge eingeben.",
            "Input-Zeilen mit Artikel und Menge hinzufügen.",
            "Output-Zeilen mit Ertrag %, Disposition und Primary-Flag.",
            "Speichern für Produktionschargen."
          ],
          caption: "Rezeptformular mit Inputs und Outputs.",
          intro: "Definiert Input-Artikel, Output-Erträge und Kostenverteilung auf Outputs.",
          fields: [
            {
              name: "Name",
              effect: "Anzeigename in Produktion und Berichten."
            },
            {
              name: "Code",
              effect: "Optionaler Kurzcode für die Küche."
            },
            {
              name: "Basis-Chargenmenge",
              effect: "Standardchargengröße zum Skalieren der Zutaten."
            },
            {
              name: "Kostenverteilung",
              effect: "Methode zur Verteilung der Input-Kosten auf Outputs."
            },
            {
              name: "Input-Artikel",
              effect: "Verbrauchte Artikel und Mengen pro Charge."
            },
            {
              name: "Output-Artikel",
              effect: "Produzierte Artikel mit Ertrag % und Primary-Output."
            },
            {
              name: "Aktiv",
              effect: "Inaktive Rezepte erscheinen nicht in neuen Produktionsläufen."
            }
          ]
        },
        production: {
          title: "Produktionsläufe",
          steps: [
            "Öffnen Sie die Produktions-Registerkarte.",
            "Starten Sie eine neue Charge aus aktivem Rezept.",
            "Skalierte Zutaten in Vorschau, dann abschließen für Bestandsbuchungen."
          ],
          caption: "Produktionstab mit Chargenliste."
        },
        "production-form": {
          title: "Produktionschargenformular",
          steps: [
            "Klicken Sie Neue Produktion.",
            "Rezept, Standort und produzierte Menge wählen.",
            "Vorschau skalierter Inputs/Outputs prüfen.",
            "Optional Artikelkosten aus Charge aktualisieren.",
            "Abschließen für Charge und Historie."
          ],
          caption: "Chargenformular mit Vorschau.",
          intro: "Beim Abschluss werden Inputs abgebucht und Outputs am gewählten Standort gutgeschrieben.",
          fields: [
            {
              name: "Rezept",
              effect: "Bestimmt Zutaten und Outputs der Charge."
            },
            {
              name: "Standort",
              effect: "Lager für Verbrauch und Produktion."
            },
            {
              name: "Produzierte Menge",
              effect: "Skaliert Rezept von Basis-Chargengröße."
            },
            {
              name: "Chargennummer",
              effect: "Optionale Referenz auf Etiketten/Historie."
            },
            {
              name: "Artikelkosten aktualisieren",
              effect: "Berechnet Output-Kosten aus Chargentotalen neu."
            },
            {
              name: "Notizen",
              effect: "Freitext im Produktionsdatensatz."
            }
          ]
        },
        "production-history": {
          title: "Produktionshistorie",
          steps: [
            "Öffnen Sie Produktionshistorie für abgeschlossene Chargen.",
            "Filtern nach Datum, Rezept oder Standort.",
            "Zeile öffnen für Inputs, Outputs und Buchungsbenutzer."
          ],
          caption: "Liste Produktionshistorie."
        }
      },
      title: "Rezepte & Produktion",
      intro: "Definieren Sie Chargenrezepte, führen Sie Produktion aus und prüfen Sie die Historie."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Buffet-Menüs",
          steps: [
            "Öffnen Sie Inventar → Buffet → Menüs.",
            "Pflegen Sie Menüvorlagen für Frühstück, Mittag oder Abend.",
            "Jedes Menü listet Rezepte mit Mengen pro Gast."
          ],
          caption: "Buffet-Menüliste."
        },
        "buffet-menu-form": {
          title: "Buffet-Menüformular",
          steps: [
            "Buffet-Menü hinzufügen oder bearbeiten.",
            "Sitzungstyp und Rezeptzeilen mit Menge pro Gast setzen.",
            "Aktive Menüs für Sitzungsstart speichern."
          ],
          caption: "Buffet-Menüformular.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung beim Sitzungsstart."
            },
            {
              name: "Code",
              effect: "Optionale Küchenkurzform."
            },
            {
              name: "Sitzungstyp",
              effect: "Frühstück, Mittag oder Abend — filtert kompatible Sitzungen."
            },
            {
              name: "Rezeptzeilen",
              effect: "Rezept und erwartete Menge pro Gast."
            },
            {
              name: "Aktiv",
              effect: "Nur aktive Menüs in Sitzungseinrichtung."
            }
          ]
        },
        "buffet-sessions": {
          title: "Buffet-Sitzungen",
          steps: [
            "Öffnen Sie Buffet → Sitzungen.",
            "Sitzung aus Menü mit erwarteten Gästen und Preis starten.",
            "Produktion vs. Prognose während Service überwachen.",
            "Sitzung schließen für Schwund, Reste und Endkosten."
          ],
          caption: "Buffet-Sitzungsdashboard."
        },
        "buffet-session-form": {
          title: "Buffet-Sitzung starten",
          steps: [
            "Klicken Sie Neue Sitzung.",
            "Menü, Standort, Geschäftstag und Sitzungstyp wählen.",
            "Erwartete Gäste und Buffetpreis pro Gast eingeben.",
            "Speichern für Live-Dashboard."
          ],
          caption: "Formular neue Buffet-Sitzung.",
          fields: [
            {
              name: "Menü",
              effect: "Lädt Rezeptzeilen und Prognosen pro Gast."
            },
            {
              name: "Standort",
              effect: "Lager für Bestandsbewegungen."
            },
            {
              name: "Geschäftstag",
              effect: "Handelstag der Sitzung."
            },
            {
              name: "Sitzungstyp",
              effect: "Muss zum Menü-Service passen."
            },
            {
              name: "Erwartete Gäste",
              effect: "Steuert anfängliche Rezeptprognosen."
            },
            {
              name: "Buffetpreis",
              effect: "Umsatz pro Gast in Sitzungsberichten."
            }
          ]
        }
      },
      title: "Buffet-Menüs & Sitzungen",
      intro: "Planen Sie Rezepte pro Gast und führen Sie Sitzungen mit Prognose, Gästeverfolgung und Abschluss mit Schwund und Kosten."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Kostenstellenliste",
          steps: [
            "Öffnen Sie HR → Kostenstellen.",
            "Prüfen Sie Codes auf Mitarbeitern, Positionen und Plänen.",
            "Kostenstellen pflegen vor Zuweisung auf Mitarbeitern."
          ],
          caption: "Registerkarte Kostenstellen."
        },
        "cost-center-form": {
          title: "Kostenstellenformular",
          steps: [
            "Hinzufügen oder Zeile bearbeiten.",
            "Code, Name und optionale Beschreibung eingeben.",
            "Aktiv umschalten zum Stilllegen ohne Historie zu löschen.",
            "Speichern — erscheint auf Mitarbeiter- und Planformularen."
          ],
          caption: "Modal Kostenstelle anlegen/bearbeiten.",
          fields: [
            {
              name: "Code",
              effect: "Kurzer eindeutiger Bezeichner für Exporte und Integrationen."
            },
            {
              name: "Name",
              effect: "Lesbare Bezeichnung in Dropdowns."
            },
            {
              name: "Beschreibung",
              effect: "Optionale Admin-Notizen."
            },
            {
              name: "Aktiv",
              effect: "Inaktive Kostenstellen nicht auf neuen Datensätzen wählbar."
            }
          ]
        }
      },
      title: "Kostenstellen",
      intro: "Kostenstellen ordnen Lohn und Gehalt Standorten, Abteilungen oder GL-Segmenten zu."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Gehaltsprofile",
          steps: [
            "Öffnen Sie HR → Gehalt → Profile.",
            "Basissatz mit Gültigkeitsdaten pro Mitarbeiter pflegen.",
            "Profile speisen die Abrechnung der aktiven Periode."
          ],
          caption: "Liste Gehaltsprofile."
        },
        "pay-profile-form": {
          title: "Gehaltsprofilformular",
          steps: [
            "Profil für Mitarbeiter hinzufügen oder bearbeiten.",
            "Gehaltstyp und Basissatz mit Gültigkeitsdaten wählen.",
            "Speichern — Abrechnung nutzt gültiges Profil je Arbeitstag."
          ],
          caption: "Gehaltsprofilformular.",
          fields: [
            {
              name: "Mitarbeiter",
              effect: "Personal mit dieser Basisvergütung."
            },
            {
              name: "Gehaltstyp",
              effect: "Stündlich, Gehalt, Vertrag, Provision oder gemischt."
            },
            {
              name: "Basissatz",
              effect: "Hauptsatz oder Gehaltsbetrag in gewählter Währung."
            },
            {
              name: "Währung",
              effect: "ISO-Währung des Satzes."
            },
            {
              name: "Gültig ab",
              effect: "Erster Tag dieses Profils."
            },
            {
              name: "Gültig bis",
              effect: "Optionales Ende bei neuem Profil."
            }
          ]
        },
        "pay-rules": {
          title: "Gehaltsregeln",
          steps: [
            "Öffnen Sie Gehalt → Regeln.",
            "Regeln stapeln nach Priorität: erlauben, verhindern, höchster gewinnt oder Priorität.",
            "Ziel: Mitarbeiter, Abteilungen, Feiertage oder Zeitfenster."
          ],
          caption: "Liste Lohnregeln."
        },
        "pay-rule-form": {
          title: "Gehaltsregelformular",
          steps: [
            "Regel mit Code und Name hinzufügen oder bearbeiten.",
            "Effekte und Anwendung auf reguläre, Überstunden oder alle Stunden definieren.",
            "Datum-, Zeit-, Wochentags- und Feiertagsfilter setzen.",
            "Mitarbeiter, Abteilungen, Positionen oder Kostenstellen zuweisen.",
            "Speichern — Motor wertet bei Stundenberechnung aus."
          ],
          caption: "Regelformular mit Effekten und Filtern.",
          intro: "Jede Regel hat Effekte (Multiplikator, fester/prozentualer Bonus/Abzug) und Eignungsfilter.",
          fields: [
            {
              name: "Code",
              effect: "Eindeutige Regel-ID für Exporte."
            },
            {
              name: "Name",
              effect: "Beschreibende Bezeichnung in Admin-Listen."
            },
            {
              name: "Priorität",
              effect: "Reihenfolge bei Stapelmodus Priorität."
            },
            {
              name: "Stapelmodus",
              effect: "Interaktion mit anderen passenden Regeln."
            },
            {
              name: "Effekte",
              effect: "Multiplikator oder Betragsanpassungen auf qualifizierende Stunden."
            },
            {
              name: "Mitarbeiter-/Abteilungs-/Positions-/Kostenstellenfilter",
              effect: "Begrenzt betroffenes Personal."
            },
            {
              name: "Datum- und Zeitfenster",
              effect: "Optionales Start-/Enddatum und Tageszeit."
            },
            {
              name: "Wochentage / Monate",
              effect: "Beschränkt auf gewählte Kalendermuster."
            },
            {
              name: "Feiertage",
              effect: "Nur an ausgewählten Feiertagen."
            },
            {
              name: "Nach Stunden (Tag/Woche)",
              effect: "Bei Überschreitung täglicher/wöchentlicher Schwellen."
            }
          ]
        }
      },
      title: "Gehaltsprofile & Regeln",
      intro: "Profile speichern Basissätze; Regeln wenden Zuschläge, Boni und Abzüge nach Zeitplan oder Kontext an."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Abrechnungsperioden",
          steps: [
            "Öffnen Sie HR → Abrechnung → Perioden.",
            "Perioden passend zum Zahlungszyklus anlegen (wöchentlich, zweiwöchentlich, monatlich, individuell).",
            "Perioden vor finalen Läufen sperren oder schließen."
          ],
          caption: "Liste Abrechnungsperioden."
        },
        "payroll-period-form": {
          title: "Abrechnungsperiodenformular",
          steps: [
            "Periode mit Name, Typ und Datumsbereich anlegen.",
            "Status Offen während Zeiterfassung und Anpassungen.",
            "Auf Gesperrt/Geschlossen/Bezahlt ändern im Zyklusverlauf."
          ],
          caption: "Formular Abrechnungsperiode.",
          fields: [
            {
              name: "Periodenname",
              effect: "Bezeichnung auf Läufen und Lohnexporten."
            },
            {
              name: "Periodentyp",
              effect: "Wöchentlich, zweiwöchentlich, monatlich oder individuell."
            },
            {
              name: "Startdatum",
              effect: "Erster eingeschlossener Tag."
            },
            {
              name: "Enddatum",
              effect: "Letzter eingeschlossener Tag."
            },
            {
              name: "Status",
              effect: "Offen erlaubt Bearbeitung; gesperrt/geschlossen schränkt ein; bezahlt markiert Abschluss."
            }
          ]
        },
        "payroll-runs": {
          title: "Abrechnungsläufe",
          steps: [
            "Öffnen Sie Abrechnung → Läufe für offene Periode.",
            "Lauf generieren für Bruttovorschau aus Anwesenheit und Regeln.",
            "Snapshots prüfen vor Abschluss des Laufs."
          ],
          caption: "Abrechnungsläufe einer Periode."
        },
        "payroll-run-form": {
          title: "Abrechnungslauf generieren",
          steps: [
            "Neuer Lauf klicken und offene Periode wählen.",
            "Vorgeschlagene Laufnummer bestätigen.",
            "Vorschau generieren für Zeilen aus Zeit, Profilen und Regeln."
          ],
          caption: "Formular neuer Abrechnungslauf.",
          fields: [
            {
              name: "Abrechnungsperiode",
              effect: "Datumsbereich und Status für enthaltene Stunden und Anpassungen."
            },
            {
              name: "Laufnummer",
              effect: "Fortlaufende ID für mehrere Vorschauen in derselben Periode."
            }
          ]
        },
        adjustments: {
          title: "Abrechnungsanpassungen",
          steps: [
            "Öffnen Sie Abrechnung → Anpassungen.",
            "Boni, Strafen, Zulagen oder Korrekturen pro Mitarbeiter hinzufügen.",
            "Mit Periode verknüpfen wenn Betrag in Lauf erscheinen soll."
          ],
          caption: "Liste Lohnanpassungen."
        },
        "adjustment-form": {
          title: "Anpassungsformular",
          steps: [
            "Mitarbeiter, Typ, Betrag und Stichtag wählen.",
            "Optional Abrechnungsperiode verknüpfen.",
            "Speichern — in nächstem passenden Lauf enthalten."
          ],
          caption: "Formular Lohnanpassung.",
          fields: [
            {
              name: "Mitarbeiter",
              effect: "Personal das die Anpassung erhält."
            },
            {
              name: "Abrechnungsperiode",
              effect: "Optionale Verknüpfung für bestimmten Lauf."
            },
            {
              name: "Typ",
              effect: "Bonus, Strafe, Zulage, Erstattung, Vorschuss, Darlehen, Korrektur oder Abzug."
            },
            {
              name: "Betrag",
              effect: "Währungswert addiert oder vom Brutto abgezogen."
            },
            {
              name: "Stichtag",
              effect: "Datum welcher Lauf die Anpassung aufnimmt."
            },
            {
              name: "Beschreibung",
              effect: "Erklärung auf Lohnabrechnung und Audit."
            }
          ]
        }
      },
      title: "Abrechnungsperioden & Läufe",
      intro: "Schließen Sie Arbeit in Abrechnungsperioden ab, erstellen Sie Läufe mit Vorschau und buchen Sie Anpassungen."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Dokumentenliste",
          steps: [
            "Öffnen Sie HR → Dokumente.",
            "Nach Mitarbeiter oder Kategorie filtern.",
            "Neue Dateien hochladen oder Metadaten aktualisieren."
          ],
          caption: "Registerkarte Mitarbeiterdokumente."
        },
        "document-form": {
          title: "Dokumentenformular",
          steps: [
            "Dokument hinzufügen klicken.",
            "Mitarbeiter, Titel und Kategorie wählen.",
            "Datei anhängen und optional Ablaufdatum setzen.",
            "Speichern — Datei wird gespeichert und mit Profil verknüpft."
          ],
          caption: "Formular Dokumenten-Upload.",
          fields: [
            {
              name: "Mitarbeiter",
              effect: "Eigentümer des Dokumenteneintrags."
            },
            {
              name: "Titel",
              effect: "Anzeigename in Listen und Erinnerungen."
            },
            {
              name: "Kategorie",
              effect: "Vertrag, Zertifikat, Lizenz, Ausweis, medizinisch, Verwarnung oder sonstiges."
            },
            {
              name: "Läuft ab am",
              effect: "Optionales Datum für Erneuerungsalarme."
            },
            {
              name: "Datei anhängen",
              effect: "Pflicht bei Erstellung; speichert Binär in Bibliothek."
            }
          ]
        }
      },
      title: "Mitarbeiterdokumente",
      intro: "Speichern Sie Verträge, Ausweise, Lizenzen und andere Dateien mit Ablaufverfolgung."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Leistungsliste",
          steps: [
            "Öffnen Sie HR → Leistung.",
            "Notizen nach Mitarbeiter, Typ und Schwere durchsuchen.",
            "Einträge nach Vorfällen oder Beurteilungen hinzufügen."
          ],
          caption: "Registerkarte Leistungsnotizen."
        },
        "performance-form": {
          title: "Leistungsnotizformular",
          steps: [
            "Mitarbeiter, Typ, Titel und Text wählen.",
            "Schweregrad für Vorfälle und Verwarnungen setzen.",
            "Sichtbar für Mitarbeiter aktivieren wenn Self-Service erlaubt.",
            "Speichern für HR-Akte."
          ],
          caption: "Formular Leistungsnotiz.",
          fields: [
            {
              name: "Mitarbeiter",
              effect: "Betreff der Notiz."
            },
            {
              name: "Typ",
              effect: "Verwarnung, Lob, Beurteilung oder Vorfall."
            },
            {
              name: "Titel",
              effect: "Kurzfassung in Listen."
            },
            {
              name: "Inhalt",
              effect: "Vollständige Schilderung des Ereignisses."
            },
            {
              name: "Schweregrad",
              effect: "Niedrig, mittel, hoch oder kritisch."
            },
            {
              name: "Für Mitarbeiter sichtbar",
              effect: "Wenn aktiv, kann Notiz dem Mitarbeiter angezeigt werden."
            }
          ]
        }
      },
      title: "Leistungsnotizen",
      intro: "Erfassen Sie Verwarnungen, Lob, Beurteilungen und Vorfälle in der Personalakte."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Bestellung stornieren oder annullieren",
          steps: [
            "Öffnen Sie ⋯ auf einer laufenden Bestellkarte und wählen Sie Bestellung stornieren.",
            "Wählen Sie einen Annullierungsgrund (Pflicht für Berichte).",
            "Alle Positionen auswählen für vollständige Annullierung, oder abwählen und einzelne Zeilen wählen.",
            "Bestätigen Sie, um den Bon zu annullieren und ggf. den Tisch freizugeben."
          ],
          caption: "Modal Stornierung mit Grund und Positionsauswahl.",
          intro: "Annulliert einen laufenden Bon. Vollständige Annullierung aller Positionen; teilweise nur ausgewählte. Manager-PIN kann erforderlich sein.",
          fields: [
            {
              name: "Grund",
              effect: "Pflicht-Annullierungsgrund auf der Bestellung für Audit und Berichte."
            },
            {
              name: "Alle Positionen auswählen",
              effect: "Angehakt annulliert den gesamten Bon; abgehakt ermöglicht Zeilenauswahl."
            },
            {
              name: "Teilannullierung",
              effect: "Einzelne Positionen annullieren, Rest des Bons bleibt offen."
            }
          ]
        },
        refund: {
          title: "Bezahlte Bestellung erstatten",
          steps: [
            "Öffnen Sie eine bezahlte Bestellung und wählen Sie Erstattung im Aktionsmenü.",
            "Wählen Sie Positionen und Mengen zur Erstattung.",
            "Wählen Sie einen Erstattungsgrund und bestätigen Sie.",
            "Das System bucht die Erstattung und aktualisiert Zahlungssummen."
          ],
          caption: "Erstattungsmodal mit Positionsauswahl und Grund.",
          intro: "Erstattet einen bezahlten Bon, optional nur für ausgewählte Positionen.",
          fields: [
            {
              name: "Zu erstattende Positionen",
              effect: "Bezahlte Zeilen und Mengen, die dem Kunden zurückgegeben werden."
            },
            {
              name: "Grund",
              effect: "Dokumentiert die Erstattung für Managerprüfung und Berichte."
            }
          ]
        },
        "split-seats": {
          title: "Nach Sitzplätzen teilen",
          steps: [
            "Wählen Sie ⋯ → Nach Sitzplätzen teilen bei laufender Bestellung.",
            "Prüfen Sie die Gruppierung pro Sitz.",
            "Bestätigen Sie — ein Kindbon pro Sitz mit gemeinsamem Tischkontext."
          ],
          caption: "Vorschau Aufteilung nach Sitzplätzen.",
          intro: "Teilt einen Bon in separate Bons nach Sitznummern auf den Positionen."
        },
        "split-items": {
          title: "Nach Positionen teilen",
          steps: [
            "Wählen Sie ⋯ → Nach Positionen teilen.",
            "Verschieben Sie jede Zeile in eine neue Bonspalte.",
            "Bestätigen Sie für separate laufende Bons."
          ],
          caption: "Zuweisungsraster nach Positionen.",
          intro: "Weist Zeilen manuell neuen Bons zu, unabhängig vom Sitz."
        },
        "split-amount": {
          title: "Nach Betrag teilen",
          steps: [
            "Wählen Sie ⋯ → Nach Betrag teilen.",
            "Geben Sie Anzahl der Teile oder eigene Beträge ein.",
            "Bestätigen Sie — Kindbons mit je einem Anteil."
          ],
          caption: "Dialog Aufteilung nach Betrag.",
          intro: "Teilt den Bonbetrag in feste oder gleiche Teile für separate Zahlung."
        },
        merge: {
          title: "Bestellungen zusammenführen",
          steps: [
            "Öffnen Sie ⋯ beim ersten Bon und wählen Sie Zusammenführen.",
            "Wiederholen Sie für weitere Bestellungen.",
            "Tippen Sie Tisch wählen und wählen Sie den Zieltisch.",
            "Bestätigen Sie die Zusammenführung."
          ],
          caption: "Zusammenführungsleiste mit Auswahl und Tischpicker.",
          intro: "Führt mehrere laufende Bons an einem Tisch zusammen. Start an jeder Karte, Abschluss in der unteren Leiste.",
          fields: [
            {
              name: "Bestellungen auswählen",
              effect: "Markiert eine Bestellung für die ausstehende Zusammenführung."
            },
            {
              name: "Tisch wählen",
              effect: "Setzt den Tisch für den zusammengeführten Bon."
            },
            {
              name: "Zusammenführung bestätigen",
              effect: "Führt alle ausgewählten Bons in einen laufenden Bon am gewählten Tisch."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Gewinn- und Verlustrechnung",
          steps: [
            "Öffnen Sie Konten und die GuV-Registerkarte.",
            "Setzen Sie Datumsbereich oder Periode für Ihren Berichtszyklus.",
            "Klappen Sie Kontogruppen auf für Kategorien-Summen.",
            "Exportieren oder drucken Sie nach Periodenabschluss."
          ],
          caption: "Registerkarte Gewinn- und Verlustrechnung.",
          intro: "Ergebnisrechnung für den gewählten Zeitraum: Umsatz, Wareneinsatz und Betriebsaufwendungen."
        },
        "cash-flow": {
          title: "Kapitalflussrechnung",
          steps: [
            "Öffnen Sie die Kapitalfluss-Registerkarte in Konten.",
            "Wählen Sie dieselbe Periode wie andere Berichte.",
            "Prüfen Sie Anfangsbestand, Nettoänderung und Endbestand.",
            "Nutzen Sie neben GuV zur Erklärung von Cash vs. Accrual."
          ],
          caption: "Registerkarte Kapitalflussrechnung.",
          intro: "Fasst operative, Investitions- und Finanzierungs-Cashflows der Periode zusammen."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Mitarbeiterformular",
          steps: [
            "Unter Mitarbeiter Hinzufügen oder Zeile bearbeiten.",
            "Personalnummer, Name und Beschäftigungsdetails ausfüllen.",
            "POS-Benutzer, Abteilung, Position, Kostenstelle und Vorgesetzten verknüpfen.",
            "Speichern — speist Anwesenheit, Urlaub und Abrechnung."
          ],
          caption: "Modal Mitarbeiter anlegen/bearbeiten.",
          intro: "Zentraler HR-Datensatz mit POS-Benutzer, Org-Struktur und Beschäftigungsdaten.",
          fields: [
            {
              name: "Personalnummer",
              effect: "Eindeutige Kennung auf Plänen und Exporten."
            },
            {
              name: "Vor- / Nachname",
              effect: "Rechtlicher oder bevorzugter Name."
            },
            {
              name: "Verknüpfter Benutzer",
              effect: "Optionaler POS-Login für Zeiterfassung."
            },
            {
              name: "Abteilung",
              effect: "Organisationseinheit für Berichte."
            },
            {
              name: "Position",
              effect: "Stellenbezeichnung für Pläne und Regeln."
            },
            {
              name: "Kostenstelle",
              effect: "Standard-Lohnkosten-Zuordnung."
            },
            {
              name: "Vorgesetzter",
              effect: "Berichtslinie für Genehmigungen."
            },
            {
              name: "Beschäftigungsstatus",
              effect: "Aktiv, inaktiv, gekündigt, beurlaubt oder suspendiert."
            },
            {
              name: "Beschäftigungsart",
              effect: "Stündlich, Gehalt, Vertrag usw."
            },
            {
              name: "Einstellungs- / Kündigungsdatum",
              effect: "Betriebszugehörigkeit und Berechtigung."
            }
          ]
        },
        "department-form": {
          title: "Abteilungsformular",
          steps: [
            "Unter Abteilungen oder inline beim Mitarbeiter.",
            "Code, Name und Beschreibung eingeben.",
            "Speichern — erscheint auf Mitarbeitern und Positionen."
          ],
          caption: "Abteilungsformular.",
          fields: [
            {
              name: "Code",
              effect: "Kurzkennung für Integrationen."
            },
            {
              name: "Name",
              effect: "Anzeigename in Dropdowns."
            },
            {
              name: "Beschreibung",
              effect: "Optionale Admin-Notizen."
            },
            {
              name: "Aktiv",
              effect: "Inaktive Abteilungen bei neuen Zuweisungen ausgeblendet."
            }
          ]
        },
        "position-form": {
          title: "Positionsformular",
          steps: [
            "Unter Positionen oder inline beim Mitarbeiter.",
            "Code, Name, Abteilung und Standard-Kostenstelle definieren.",
            "Speichern — wählbar auf Mitarbeitern und Plänen."
          ],
          caption: "Positionsformular.",
          fields: [
            {
              name: "Code",
              effect: "Jobcode für Lohnexporte."
            },
            {
              name: "Name",
              effect: "Stellenbezeichnung in HR und Plänen."
            },
            {
              name: "Abteilung",
              effect: "Standard-Org-Einheit der Rolle."
            },
            {
              name: "Standard-Kostenstelle",
              effect: "Vorausgefüllt auf Plänen für diese Position."
            },
            {
              name: "Aktiv",
              effect: "Stellt nicht mehr besetzte Titel außer Dienst."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Manuelle Anwesenheit",
          steps: [
            "Unter Anwesenheit Manueller Eintrag klicken.",
            "Mitarbeiter und Ein-/Ausstempel-Zeiten eingeben.",
            "Notizen hinzufügen und speichern — Stunden für Abrechnung und Berichte."
          ],
          caption: "Modal manueller Anwesenheitseintrag.",
          intro: "Fehlende Stempelungen korrigieren oder Zeit nachtragen wenn Terminals ausfielen.",
          fields: [
            {
              name: "Mitarbeiter",
              effect: "Wessen Zeitdatensatz erstellt/korrigiert wird."
            },
            {
              name: "Einstempeln",
              effect: "Beginn des Arbeitsintervalls."
            },
            {
              name: "Ausstempeln",
              effect: "Ende; muss nach Einstempeln liegen."
            },
            {
              name: "Notizen",
              effect: "Grund für manuellen Eintrag im Audit."
            }
          ]
        },
        "schedule-form": {
          title: "Arbeitsplanformular",
          steps: [
            "Planung öffnen und Plan hinzufügen.",
            "Name, Periodenstart und -ende setzen.",
            "Schichten hinzufügen oder aus Vorlagen generieren im Entwurf."
          ],
          caption: "Formular Arbeitsplan.",
          intro: "Ein Plan ist ein benannter Datumsbereich mit Entwurfs- oder veröffentlichten Schichten.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung der Planperiode (z. B. Woche 12)."
            },
            {
              name: "Periodenstart",
              effect: "Erster abgedeckter Zeitpunkt."
            },
            {
              name: "Periodenende",
              effect: "Letzter abgedeckter Zeitpunkt."
            }
          ]
        },
        "shift-form": {
          title: "Geplante Schichtformular",
          intro: "Weist einen Mitarbeiter einem Zeitblock in einem Entwurfsplan zu.",
          steps: [
            "Im Entwurfsplan Schicht hinzufügen klicken.",
            "Plan, Mitarbeiter und Start/Ende wählen.",
            "Optional Schichtvorlage, Abteilung, Position und Kostenstelle.",
            "Speichern — warnt bei Überschneidungen."
          ],
          caption: "Formular geplante Schicht.",
          fields: [
            {
              name: "Arbeitsplan",
              effect: "Elternplan muss Entwurf sein."
            },
            {
              name: "Mitarbeiter",
              effect: "Der Schicht zugewiesenes Personal."
            },
            {
              name: "Schichtvorlage",
              effect: "Optionales Preset aus Admin → Benutzer → Schichten."
            },
            {
              name: "Abteilung / Position / Kostenstelle",
              effect: "Org-Tags für diese Schicht überschreiben."
            },
            {
              name: "Start / Ende",
              effect: "Geplantes Zeitfenster."
            }
          ]
        },
        "schedule-template": {
          title: "Planvorlagenformular",
          steps: [
            "Vorlagen unter Planung öffnen.",
            "Vorlage benennen und Wochentage mit Start/Ende wählen.",
            "Optional Schichtvorlage und Org-Defaults verknüpfen.",
            "Speichern für Plan generieren."
          ],
          caption: "Formular Planvorlage.",
          intro: "Wiederverwendbares Wochenmuster zum Massengenerieren von Schichten.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung im Generieren-Dialog."
            },
            {
              name: "Wochentage",
              effect: "Welche Tage Schichten erhalten."
            },
            {
              name: "Start- / Endzeit",
              effect: "Tägliches Fenster an gewählten Tagen."
            },
            {
              name: "Pausenminuten",
              effect: "Unbezahlte Pause abgezogen von Stunden."
            },
            {
              name: "Schichtvorlage",
              effect: "Verknüpft POS-Schichtdefinition für Berichte."
            }
          ]
        },
        "schedule-generate": {
          title: "Plan aus Vorlage generieren",
          steps: [
            "Generieren in Planung klicken.",
            "Entwurfsplan und Vorlage wählen.",
            "Mitarbeiter multi-selektieren.",
            "Generieren — erstellt Schichten, überspringt Konflikte wenn konfiguriert."
          ],
          caption: "Dialog Plan generieren.",
          fields: [
            {
              name: "Arbeitsplan",
              effect: "Ziel-Entwurfsplan."
            },
            {
              name: "Vorlage",
              effect: "Wochenmuster mit Tagen und Zeiten."
            },
            {
              name: "Mitarbeiter",
              effect: "Personal das Vorlagen-Schichten erhält."
            }
          ]
        },
        "schedule-swap": {
          title: "Schichttausch-Anfrage",
          steps: [
            "Schichttausch anfragen in Planung klicken.",
            "Geplante Schicht und anfragenden Mitarbeiter wählen.",
            "Optional Zielmitarbeiter und Gegenschicht.",
            "Absenden — erstellt ausstehenden Tausch zur Managerfreigabe."
          ],
          caption: "Formular Schichttausch.",
          fields: [
            {
              name: "Geplante Schicht",
              effect: "Schicht die der Anfragende abgeben/tauschen will."
            },
            {
              name: "Anfragender Mitarbeiter",
              effect: "Mitarbeiter der Tausch initiiert."
            },
            {
              name: "Zielmitarbeiter",
              effect: "Optionaler Kollege zum Übernehmen/Tauschen."
            },
            {
              name: "Vorgeschlagene Schicht",
              effect: "Optionale Gegenschicht."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Urlaubsantragsformular",
          steps: [
            "Unter Urlaub Antrag hinzufügen klicken.",
            "Mitarbeiter, Urlaubsart und Datumsbereich wählen.",
            "Tage und ggf. Grund eingeben.",
            "Speichern — leitet zur Genehmigung wenn erforderlich."
          ],
          caption: "Formular Urlaubsantrag.",
          intro: "Stellen oder bearbeiten Sie Freistellungsanträge nach konfigurierten Urlaubsarten.",
          fields: [
            {
              name: "Mitarbeiter",
              effect: "Personal das Freistellung beantragt."
            },
            {
              name: "Urlaubsart",
              effect: "Bestimmt bezahlt/unbezahlt, Genehmigung und Ansammlung."
            },
            {
              name: "Start- / Enddatum",
              effect: "Inklusive Abwesenheitstage."
            },
            {
              name: "Tage",
              effect: "Verbrauchte Arbeitstage (ggf. auto-berechnet)."
            },
            {
              name: "Grund",
              effect: "Optionale Notiz für Genehmiger."
            }
          ]
        },
        "holiday-form": {
          title: "Feiertagsformular",
          steps: [
            "Feiertage unter Urlaub öffnen.",
            "Name, Datum und Ländercode hinzufügen.",
            "Wiederkehrend für jährliche feste Termine markieren.",
            "Speichern — erscheint in Regelfiltern."
          ],
          caption: "Formular Feiertag.",
          intro: "Feiertage wirken auf Gehaltsregeln und Planung.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung in Kalendern und Regeln."
            },
            {
              name: "Datum",
              effect: "Beobachtetes Kalenderdatum."
            },
            {
              name: "Ländercode",
              effect: "Optionaler ISO-Code für Multi-Country-Standorte."
            },
            {
              name: "Wiederkehrend",
              effect: "Jährliche Wiederholung am gleichen Tag/Monat."
            },
            {
              name: "Aktiv",
              effect: "Inaktive Feiertage von neuen Regeln ignoriert."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Gerichtformular",
          steps: [
            "Admin → Menüs → Gerichte öffnen und hinzufügen/bearbeiten.",
            "Nummer, Name, Preis, Kosten und Kategorien setzen.",
            "Modifikatorgruppen, Rezept, Küche und Workflow anhängen.",
            "Speichern — erscheint auf Menüs und POS wenn aktiv."
          ],
          caption: "Gerichtpflegeformular.",
          intro: "Gerichte sind verkaufbare Artikel mit Preis, Kategorien, Modifikatoren, Rezepten und Küchenrouting.",
          fields: [
            {
              name: "Nummer / Name",
              effect: "POS-Kennung und Anzeigename."
            },
            {
              name: "Preis / Kosten",
              effect: "Verkaufspreis und theoretische Wareneinsatzkosten."
            },
            {
              name: "Kategorien",
              effect: "Menügruppierung und Rabattziel."
            },
            {
              name: "Modifikatorgruppen",
              effect: "Anpassungsflow mit Pflicht/Optional-Regeln."
            },
            {
              name: "Rezeptzeilen",
              effect: "Bestandsabbau beim Verkauf."
            },
            {
              name: "Küche / Workflow",
              effect: "KOT-Routing und Prep-Stufen."
            }
          ]
        },
        "menu-form": {
          title: "Menüformular",
          steps: [
            "Registerkarte Menüs öffnen und hinzufügen/bearbeiten.",
            "Name und optionale Start-/Endzeiten setzen.",
            "Aktiv und endet am nächsten Tag für Nachtmenüs.",
            "Kategorien nach Speichern in der Liste zuweisen."
          ],
          caption: "Menüformular mit Servicezeiten.",
          intro: "Menüs steuern welche Kategorien auf dem POS erscheinen (z. B. Mittag vs. Abend).",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung im POS-Umschalter."
            },
            {
              name: "Start / Endzeit",
              effect: "Automatisches Verfügbarkeitsfenster."
            },
            {
              name: "Endet am nächsten Tag",
              effect: "Service über Mitternacht."
            },
            {
              name: "Aktiv",
              effect: "Inaktive Menüs im POS ausgeblendet."
            }
          ]
        },
        "category-form": {
          title: "Kategorieformular",
          steps: [
            "Kategorien öffnen und hinzufügen/bearbeiten.",
            "Name, Priorität und Im-Menü-anzeigen setzen.",
            "Speichern — Gerichte zuweisen und Menüs verknüpfen."
          ],
          caption: "Kategorieformular.",
          fields: [
            {
              name: "Name",
              effect: "Kategorieüberschrift auf POS und Berichten."
            },
            {
              name: "Priorität",
              effect: "Sortierung unter Geschwisterkategorien."
            },
            {
              name: "Im Menü anzeigen",
              effect: "Wenn aus, in kundenorientierten Menüansichten ausgeblendet."
            }
          ]
        },
        "modifier-group-form": {
          title: "Modifikatorgruppenformular",
          steps: [
            "Modifikatorgruppen öffnen und hinzufügen/bearbeiten.",
            "Name, Priorität und Zeilen mit Preisen setzen.",
            "Erlaubte Folgegruppen pro Modifikator konfigurieren.",
            "Overrides für verstecken/repricing verschachtelt.",
            "Speichern und Gruppe an Gerichte anhängen."
          ],
          caption: "Formular mit verschachtelten Gruppen.",
          intro: "Gruppen definieren Modifikatoren, Preise und verschachtelte Folgegruppen pro Wahl.",
          fields: [
            {
              name: "Name / Priorität",
              effect: "Bezeichnung und Reihenfolge bei mehreren Gruppen."
            },
            {
              name: "Modifikator",
              effect: "Wählbare Option (oft Gericht als Add-on)."
            },
            {
              name: "Preis",
              effect: "Aufpreis bei Auswahl."
            },
            {
              name: "Erlaubte Folgegruppen",
              effect: "Gruppen nach dieser Wahl."
            },
            {
              name: "Folgegruppen-Overrides",
              effect: "Pro verschachtelter Gruppe: verstecken oder Preis."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Etagenformular",
          steps: [
            "Admin → Etagen öffnen und hinzufügen/bearbeiten.",
            "Name, Priorität und Kachelfarben setzen.",
            "Speichern — erscheint im Etagenwechsler."
          ],
          caption: "Etagenformular.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung im POS-Etagenpicker."
            },
            {
              name: "Priorität",
              effect: "Sortierung in Etagenliste."
            },
            {
              name: "Hintergrund / Farbe",
              effect: "Standard-Kachelstil im Plan."
            }
          ]
        },
        "table-form": {
          title: "Tischformular",
          steps: [
            "Etage wählen und Tisch hinzufügen/bearbeiten.",
            "Nummer, Name, Farben und Etage setzen.",
            "Optional Kategorien, Bestell- und Zahlungsarten begrenzen.",
            "Gäste abfragen aktivieren wenn Gästezahl erforderlich."
          ],
          caption: "Tischformular.",
          intro: "Tische gehören zu einer Etage und können Kategorien, Bestell- und Zahlungsarten einschränken.",
          fields: [
            {
              name: "Name / Nummer",
              effect: "Bezeichnung auf Plan und Bons."
            },
            {
              name: "Etage",
              effect: "Eltern-Etagenplan."
            },
            {
              name: "Priorität",
              effect: "Sortierung auf dichten Plänen."
            },
            {
              name: "Kategorien / Bestelltypen / Zahlungsarten",
              effect: "Optionale Einschränkungen."
            },
            {
              name: "Gäste abfragen",
              effect: "Fragt Gästezahl beim Öffnen ab."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Rabattregelformular",
          steps: [
            "Admin → Aktionen → Rabatte → Regeln.",
            "Kategorie, Umfang und Modus (manuell, automatisch oder beides) setzen.",
            "Ziele je Umfang konfigurieren.",
            "Wert, Stapelung, Steuern und Zeitpläne definieren.",
            "Speichern — Cache aktualisiert, Regel im POS verfügbar."
          ],
          caption: "Formular mit Kategorie und Zielen.",
          intro: "Kategorien: manager, staff, vip, corporate, happy_hour, category, product, floor, damage_wastage, service_recovery, bulk_order, manual, scheduled, buy_x_get_y. Umfang: item, category, cart, customer, floor.",
          fields: [
            {
              name: "Kategorie",
              effect: "Einer von 14 Typen für Berechtigungen und Analytics."
            },
            {
              name: "Umfang",
              effect: "item, category, cart, customer oder floor."
            },
            {
              name: "Anwendungsmodus",
              effect: "manual, automatic oder both."
            },
            {
              name: "Ziele",
              effect: "Berechtigte Artikel, Kategorien, Kunden oder Etagen."
            },
            {
              name: "Typ (Prozent / fest)",
              effect: "Ob Min/Max Prozente oder Beträge sind."
            },
            {
              name: "Min / Max Satz",
              effect: "Erlaubter Bereich für manuell oder auto."
            },
            {
              name: "Max-Obergrenze",
              effect: "Währungslimit nur bei Prozentrabatten."
            },
            {
              name: "Priorität",
              effect: "Reihenfolge bei konkurrierenden Auto-Regeln."
            },
            {
              name: "Mindestbestellwert",
              effect: "Zwischensumme vor Anwendung."
            },
            {
              name: "Stapelmodus",
              effect: "allow, prevent, highest_wins oder priority."
            },
            {
              name: "Steuerbehandlung",
              effect: "tax_before_discount, tax_after_discount, inclusive oder exclusive."
            },
            {
              name: "Zeitpläne",
              effect: "Tag/Uhr-Fenster für scheduled und happy_hour."
            },
            {
              name: "Bedingungen",
              effect: "Buy X Get Y Schwellen."
            },
            {
              name: "Grund / Genehmigung erforderlich",
              effect: "Grund oder Manager-PIN bei manueller Anwendung."
            }
          ]
        },
        "coupon-form": {
          title: "Gutscheinformular",
          steps: [
            "Aktionen → Gutscheine öffnen.",
            "Code, Rabatttyp/-wert und Nutzungslimits setzen.",
            "Gültige Tage, Zeitfenster und Datumsbereich konfigurieren.",
            "Speichern — Kassierer geben Code an der Kasse ein."
          ],
          caption: "Gutscheinformular.",
          fields: [
            {
              name: "Code",
              effect: "Zeichenkette die Kunden/Personal an der Kasse eingeben."
            },
            {
              name: "Gutscheintyp",
              effect: "Einmal-, Mehrfachnutzung oder anderes Verhalten."
            },
            {
              name: "Rabatttyp / -wert",
              effect: "Prozent oder fester Abzug."
            },
            {
              name: "Mindestbestellwert",
              effect: "Mindest-Zwischensumme vor Anwendung."
            },
            {
              name: "Maximaler Rabatt",
              effect: "Obergrenze bei Prozent-Gutscheinen."
            },
            {
              name: "Nutzungslimit",
              effect: "Gesamte Einlösungen erlaubt."
            },
            {
              name: "Limit pro Benutzer",
              effect: "Einlösungen pro Kundenprofil."
            },
            {
              name: "Gültige Tage / Start- & Endzeit",
              effect: "Beschränkt auf Wochentage und Stunden."
            },
            {
              name: "Start- / Enddatum",
              effect: "Gesamtes Gültigkeitsfenster."
            },
            {
              name: "Stapelbar / nur Erstbestellung",
              effect: "Kombination mit anderen Rabatten oder Neukunden."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Küchenformular",
          steps: [
            "Admin → Küche → Küchen öffnen.",
            "Name, Priorität, verknüpfte Drucker und Gerichte hinzufügen.",
            "Speichern — neue Artikel drucken hier wenn zugewiesen."
          ],
          caption: "Küchenstationsformular.",
          intro: "Küchen leiten Gerichte zu Druckern und Lagerstandorten.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung auf KOT und Bestellanzeige."
            },
            {
              name: "Priorität",
              effect: "Reihenfolge bei mehreren passenden Küchen."
            },
            {
              name: "Drucker",
              effect: "Geräte die Tickets für diese Küche drucken."
            },
            {
              name: "Artikel (Gerichte)",
              effect: "An diese Station geroutete Gerichte."
            }
          ]
        },
        "workflow-form": {
          title: "Workflowformular",
          steps: [
            "Küche → Workflows öffnen.",
            "Workflow benennen und geordnete Stufen hinzufügen.",
            "Jeder Stufe eine Küche zuweisen.",
            "Workflow an Gerichte mit Mehrstufig-Prep verknüpfen."
          ],
          caption: "Workflow-Stufen-Editor.",
          intro: "Workflows verketten Küchenstufen für Anzeigen und Bump Bars.",
          fields: [
            {
              name: "Name",
              effect: "Kennung auf Gerichten und Displays."
            },
            {
              name: "Stufen",
              effect: "Geordnete Prep-Schritte (z. B. Grill → Expo)."
            },
            {
              name: "Stufen-Küche",
              effect: "Station die jede Stufe besitzt."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Druckerformular",
          steps: [
            "Admin → Drucken → Drucker öffnen.",
            "Name und Verbindung: Netzwerk-IP/Port oder USB-IDs.",
            "Druckertyp wählen (Beleg, Küche, Etikett).",
            "Speichern — in Küchen und Geräteeinstellungen zuweisen."
          ],
          caption: "Druckerformular.",
          fields: [
            {
              name: "Name",
              effect: "Anzeigename in Admin und Auswahl."
            },
            {
              name: "Typ",
              effect: "Beleg-, Küchen- oder Etikettprofil."
            },
            {
              name: "IP-Adresse / Port",
              effect: "Netzwerk-ESC/POS-Verbindung."
            },
            {
              name: "VID / PID",
              effect: "USB-IDs für direkt angeschlossene Drucker."
            }
          ]
        },
        "print-setting-form": {
          title: "Druckeinstellungsformular",
          steps: [
            "Druckeinstellungen öffnen und Jobtyp wählen.",
            "Logo, Kopf-/Fußbereich, USt-Block und Ränder konfigurieren.",
            "Zeilenspalten auf Belegen umschalten.",
            "Speichern — nächster Druck nutzt aktualisiertes Layout."
          ],
          caption: "Druckvorlagen-Editor.",
          intro: "Jeder Druckjob (Zwischenbon, Endbeleg, Küche, Zusammenfassung, Lieferung) hat eigene Vorlage.",
          fields: [
            {
              name: "Logo anzeigen",
              effect: "Hochgeladenes Logo auf Ticket."
            },
            {
              name: "Kopf- / Fußbereiche",
              effect: "Text- oder Bildblöcke oben/unten."
            },
            {
              name: "USt-Name / -Nummer",
              effect: "Steuerblock auf Gästebelegen."
            },
            {
              name: "Ränder",
              effect: "Abstände oben/unten/links/rechts in Druckpunkten."
            },
            {
              name: "Artikelspalten",
              effect: "Nummer, Name, Menge, Preis und Summe umschalten."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Zahlungsartformular",
          steps: [
            "Admin → Zahlungen → Arten.",
            "Name, Priorität und Typ (Bar, Karte, Remote, …) hinzufügen.",
            "Bei Remote: Gateway, Test/Live-Modus und API-Schlüssel.",
            "Optional Steuer und Rabatte verknüpfen.",
            "Speichern — erscheint auf Zahlungsbildschirm und Tischbeschränkungen."
          ],
          caption: "Formular mit Remote-Gateway.",
          intro: "Lokale Methoden und Remote-Typen mit Stripe, PayPal usw.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung auf Zahlungsschaltflächen."
            },
            {
              name: "Priorität",
              effect: "Reihenfolge unter Methoden."
            },
            {
              name: "Typ",
              effect: "Profil; Remote aktiviert Gateway-Felder."
            },
            {
              name: "Gateway-Anbieter",
              effect: "Stripe, PayPal oder anderer Prozessor."
            },
            {
              name: "Gateway-Modus",
              effect: "Test- vs. Live-Zugangsdaten."
            },
            {
              name: "public_key",
              effect: "Clientseitiger veröffentlichbarer Schlüssel."
            },
            {
              name: "secret_key",
              effect: "Servergeheimnis für Belastungen."
            },
            {
              name: "webhook_secret",
              effect: "Validiert asynchrone Callbacks."
            },
            {
              name: "client_id / client_secret",
              effect: "OAuth-Gateways."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Händlerspezifische Felder."
            },
            {
              name: "Steuer",
              effect: "Standard-Steuerregel."
            },
            {
              name: "Rabatte",
              effect: "Auto-angewendete Regeln zur Methode."
            }
          ]
        },
        "tax-form": {
          title: "Steuerformular",
          steps: [
            "Zahlungen → Steuern öffnen.",
            "Name, Satz und Inklusiv/Exklusiv-Verhalten definieren.",
            "Speichern — Zahlungsarten oder Standard zuweisen."
          ],
          caption: "Steuerformular.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung auf Belegen."
            },
            {
              name: "Satz",
              effect: "Prozentsatz auf steuerpflichtige Beträge."
            },
            {
              name: "Inklusiv",
              effect: "Wenn true, Steuer in angezeigten Preisen enthalten."
            }
          ]
        },
        "order-type-form": {
          title: "Bestelltypformular",
          steps: [
            "Zahlungen → Bestelltypen öffnen.",
            "Name und Verhaltensflags (Vor-Ort, Mitnahme, Lieferung) setzen.",
            "Speichern — für Tische, POS und Berichte."
          ],
          caption: "Bestelltypformular.",
          fields: [
            {
              name: "Name",
              effect: "Typ auf Bons und Filtern."
            },
            {
              name: "Priorität",
              effect: "Sortierung in Auswahl."
            },
            {
              name: "Standard",
              effect: "Vorausgewählt bei neuen Bestellungen wenn zutreffend."
            }
          ]
        },
        "extra-form": {
          title: "Extra-Formular (Servicegebühr)",
          steps: [
            "Zahlungen → Extras öffnen.",
            "Gebühr benennen und Betrag oder Prozent setzen.",
            "Anwendungsbedingungen konfigurieren.",
            "Speichern — qualifizierte Bestellungen enthalten Zuschlag."
          ],
          caption: "Extra-Zuschlagsformular.",
          intro: "Extras fügen automatische Zuschläge (Service, Coperto) nach Zahlungs- oder Bestellkontext hinzu.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung auf Gästebeleg."
            },
            {
              name: "Betrag / Satz",
              effect: "Fester Betrag oder Prozent des berechtigten Totals."
            },
            {
              name: "Steuerpflichtig",
              effect: "Ob Steuer auf Zuschlag berechnet wird."
            },
            {
              name: "Auto-Anwendungsregeln",
              effect: "Verknüpfungen zu Bestell-, Zahlungsarten oder Etagen."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Benutzerformular",
          steps: [
            "Admin → Benutzer hinzufügen/bearbeiten.",
            "Anmeldemethode, Name, Zugangsdaten, Rolle und Schicht setzen.",
            "Optional verknüpften HR-Mitarbeiter anlegen.",
            "Speichern — Anmeldung mit zugewiesenen Rechten."
          ],
          caption: "Benutzerkontenformular.",
          intro: "POS-Bediener melden sich mit PIN oder Passwort an und erben Rollenberechtigungen.",
          fields: [
            {
              name: "Anmeldemethode",
              effect: "PIN (4 Stellen) oder Passwort."
            },
            {
              name: "Vor- / Nachname",
              effect: "Name auf Bons und Berichten."
            },
            {
              name: "Login / PIN",
              effect: "Anmeldedaten."
            },
            {
              name: "Passwort",
              effect: "Pflicht bei Passwort-Anmeldung."
            },
            {
              name: "Benutzerrolle",
              effect: "Modul-Berechtigungspaket."
            },
            {
              name: "Benutzerschicht",
              effect: "Standard-Schicht für Arbeitsberichte."
            },
            {
              name: "Mitarbeiter anlegen",
              effect: "Erstellt automatisch verknüpften HR-Mitarbeiter."
            }
          ]
        },
        "role-form": {
          title: "Rollenformular",
          steps: [
            "Benutzer → Rollen.",
            "Rolle benennen und Modulbaum durchsuchen.",
            "Elternmodule oder einzelne Aktionen ankreuzen.",
            "Speichern — Rolle Benutzern zuweisen."
          ],
          caption: "Rollenberechtigungs-Editor.",
          intro: "Rollen gewähren Modul- und Aktionszugriff über protectAction.",
          fields: [
            {
              name: "Name",
              effect: "Rollenbezeichnung im Benutzerformular."
            },
            {
              name: "Modulberechtigungen",
              effect: "Hierarchische Checkboxen für Bildschirme und Sub-Aktionen."
            }
          ]
        },
        "shift-form": {
          title: "Schichtvorlagenformular",
          steps: [
            "Benutzer → Schichten.",
            "Name, Start- und Endzeit eingeben.",
            "Nachtschichten setzen ends_next_day automatisch.",
            "Speichern — wählbar auf Benutzern und Plänen."
          ],
          caption: "Schichtvorlagenformular.",
          intro: "Schichten unter Admin → Benutzer definieren Zeitfenster für Standard-Schicht und HR-Vorlagen.",
          fields: [
            {
              name: "Name",
              effect: "Bezeichnung (z. B. Früh, Schluss)."
            },
            {
              name: "Startzeit",
              effect: "Geplanter Schichtbeginn."
            },
            {
              name: "Endzeit",
              effect: "Geplantes Ende; kann nächsten Tag erreichen."
            }
          ]
        },
        "tips-definition": {
          title: "Trinkgeld-Definition (Verteilung)",
          steps: [
            "Benutzer → Trinkgeld-Definition.",
            "Rollenzeilen mit Gewichtsprozenten oder Punkten hinzufügen.",
            "Optional Benutzer-Overrides.",
            "Speichern — Verteilungsberichte nutzen diese Gewichte."
          ],
          caption: "Admin-Panel Trinkgeldverteilung.",
          intro: "Konfiguriert Gewichtung gepoolter Trinkgelder nach Rollen und Benutzern für Abrechnungsberichte.",
          fields: [
            {
              name: "Rollengewicht",
              effect: "Anteil am Pool pro Rolle (z. B. Service 70%, Hilfe 30%)."
            },
            {
              name: "Benutzergewicht",
              effect: "Optionale Override pro Benutzer."
            }
          ]
        }
      }
    }
  },
  it: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Scheda Riconciliazione",
          steps: [
            "Magazzino → Riconciliazione cucina.",
            "Seleziona sede e data operativa.",
            "Clicca Genera.",
            "Inserisci quantità reali o importa CSV.",
            "Salva bozza, rivedi scostamenti, Verifica."
          ],
          caption: "Barra, griglia e pannello scostamenti.",
          intro: "Genera griglia da vendite POS e ricette; inserisci o importa conteggi.",
          fields: [
            {
              name: "Sede",
              effect: "Cucina o deposito riconciliato."
            },
            {
              name: "Data operativa",
              effect: "Giorno commerciale del rapprochement."
            },
            {
              name: "Genera",
              effect: "Crea righe da vendite e ricette."
            },
            {
              name: "Quantità reale",
              effect: "Conteggio fisico per articolo."
            },
            {
              name: "Verifica",
              effect: "Blocca dopo approvazione manager."
            }
          ]
        },
        "reconciliation-form": {
          title: "Inserimento conteggio manuale",
          steps: [
            "Clicca cella Reale per conteggio.",
            "Salva bozza senza verificare.",
            "Import CSV massivo.",
            "Rivedi scostamenti prima di verificare."
          ],
          caption: "Griglia con modifica quantità reale.",
          intro: "Modifica griglia e import CSV condividono struttura righe.",
          fields: [
            {
              name: "Articolo",
              effect: "Articolo magazzino sulla riga."
            },
            {
              name: "Teorico",
              effect: "Uso calcolato da ricette e vendite."
            },
            {
              name: "Reale",
              effect: "Quantità contata inserita."
            },
            {
              name: "Scostamento",
              effect: "Differenza reale vs teorico."
            },
            {
              name: "Note",
              effect: "Spiegazione opzionale."
            }
          ]
        }
      },
      title: "Riconciliazione cucina",
      intro: "Confronta l'uso teorico con conteggi fisici per sede e data operativa."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Elenco ricette",
          steps: [
            "Magazzino → Ricette.",
            "Sfoglia ricette attive.",
            "Aggiungi o modifica ricette."
          ],
          caption: "Scheda manutenzione ricette."
        },
        "recipe-form": {
          title: "Modulo ricetta",
          steps: [
            "Aggiungi o modifica ricetta.",
            "Nome, codice e qty lotto base.",
            "Righe input e output.",
            "Salva."
          ],
          caption: "Modulo input/output.",
          intro: "Definisce input, resa output e allocazione costi.",
          fields: [
            {
              name: "Nome",
              effect: "Nome in produzione e report."
            },
            {
              name: "Codice",
              effect: "Codice breve opzionale."
            },
            {
              name: "Qty lotto base",
              effect: "Dimensione batch standard."
            },
            {
              name: "Allocazione costo",
              effect: "Ripartisce costo input."
            },
            {
              name: "Input",
              effect: "Consumati per batch."
            },
            {
              name: "Output",
              effect: "Prodotti con resa %."
            },
            {
              name: "Attivo",
              effect: "Inattive nascoste nelle nuove produzioni."
            }
          ]
        },
        production: {
          title: "Run produzione",
          steps: [
            "Scheda Produzione.",
            "Nuovo batch da ricetta attiva.",
            "Anteprima e completa."
          ],
          caption: "Scheda Produzione."
        },
        "production-form": {
          title: "Modulo batch produzione",
          steps: [
            "Nuova produzione.",
            "Ricetta, sede, qty.",
            "Anteprima e completa."
          ],
          caption: "Modulo con anteprima.",
          intro: "Al completamento deduce input e aggiunge output.",
          fields: [
            {
              name: "Ricetta",
              effect: "Definisce ingredienti e output."
            },
            {
              name: "Sede",
              effect: "Magazzino consumo/produzione."
            },
            {
              name: "Qty prodotta",
              effect: "Scala da lotto base."
            },
            {
              name: "N. batch",
              effect: "Riferimento opzionale."
            },
            {
              name: "Aggiorna costo articolo",
              effect: "Ricalcola costo output."
            },
            {
              name: "Note",
              effect: "Nota libera."
            }
          ]
        },
        "production-history": {
          title: "Storico produzione",
          steps: [
            "Verifica batch completati.",
            "Filtra data/ricetta/sede.",
            "Apri riga per dettagli."
          ],
          caption: "Elenco storico."
        }
      },
      title: "Ricette e produzione",
      intro: "Definisci ricette batch, esegui produzione e rivedi lo storico."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Menu buffet",
          steps: [
            "Magazzino → Buffet → Menu.",
            "Modelli colazione/pranzo/cena.",
            "Ricette per ospite."
          ],
          caption: "Elenco menu buffet."
        },
        "buffet-menu-form": {
          title: "Modulo menu buffet",
          steps: [
            "Aggiungi/modifica menu.",
            "Tipo sessione e righe ricetta.",
            "Salva."
          ],
          caption: "Modulo menu buffet.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta avvio sessione."
            },
            {
              name: "Codice",
              effect: "Sigla cucina opzionale."
            },
            {
              name: "Tipo sessione",
              effect: "Colazione/pranzo/cena."
            },
            {
              name: "Righe ricetta",
              effect: "Ricetta e qty per ospite."
            },
            {
              name: "Attivo",
              effect: "Solo menu attivi in setup."
            }
          ]
        },
        "buffet-sessions": {
          title: "Sessioni buffet",
          steps: [
            "Buffet → Sessioni.",
            "Avvia da menu.",
            "Monitora produzione vs previsione.",
            "Chiudi sessione."
          ],
          caption: "Dashboard sessioni buffet."
        },
        "buffet-session-form": {
          title: "Avvia sessione buffet",
          steps: [
            "Nuova sessione.",
            "Menu, sede, data, tipo.",
            "Ospiti e prezzo.",
            "Salva."
          ],
          caption: "Modulo nuova sessione.",
          fields: [
            {
              name: "Menu",
              effect: "Carica righe e previsioni."
            },
            {
              name: "Sede",
              effect: "Magazzino movimenti."
            },
            {
              name: "Data operativa",
              effect: "Giorno commerciale."
            },
            {
              name: "Tipo sessione",
              effect: "Allineato al menu."
            },
            {
              name: "Ospiti attesi",
              effect: "Previsioni iniziali."
            },
            {
              name: "Prezzo buffet",
              effect: "Ricavo per ospite."
            }
          ]
        }
      },
      title: "Menu e sessioni buffet",
      intro: "Pianifica ricette per ospite e gestisci sessioni buffet."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Elenco centri di costo",
          steps: [
            "HR → Centri di costo.",
            "Rivedi codici.",
            "Aggiungi/modifica."
          ],
          caption: "Scheda centri di costo."
        },
        "cost-center-form": {
          title: "Modulo centro di costo",
          steps: [
            "Aggiungi/modifica.",
            "Codice, nome, descrizione.",
            "Attivo/inattivo.",
            "Salva."
          ],
          caption: "Modal centro di costo.",
          fields: [
            {
              name: "Codice",
              effect: "Identificatore breve unico."
            },
            {
              name: "Nome",
              effect: "Etichetta nei menu."
            },
            {
              name: "Descrizione",
              effect: "Note opzionali."
            },
            {
              name: "Attivo",
              effect: "Inattivi non selezionabili."
            }
          ]
        }
      },
      title: "Centri di costo",
      intro: "Etichettano manodopera e paghe per sedi e reparti."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Profili retribuzione",
          steps: [
            "HR → Retribuzione → Profili.",
            "Tariffa base per dipendente.",
            "Alimenta paghe."
          ],
          caption: "Elenco profili."
        },
        "pay-profile-form": {
          title: "Modulo profilo retribuzione",
          steps: [
            "Aggiungi/modifica profilo.",
            "Tipo e tariffa base.",
            "Salva."
          ],
          caption: "Modulo profilo.",
          fields: [
            {
              name: "Dipendente",
              effect: "Riceve questa base."
            },
            {
              name: "Tipo retribuzione",
              effect: "Orario, stipendio, contratto, commissione o misto."
            },
            {
              name: "Tariffa base",
              effect: "Tariffa principale o stipendio."
            },
            {
              name: "Valuta",
              effect: "Valuta ISO."
            },
            {
              name: "Valido da",
              effect: "Primo giorno profilo."
            },
            {
              name: "Valido fino",
              effect: "Fine opzionale."
            }
          ]
        },
        "pay-rules": {
          title: "Regole retribuzione",
          steps: [
            "Retribuzione → Regole.",
            "Impilamento per priorità.",
            "Filtri dipendente/reparto."
          ],
          caption: "Elenco regole."
        },
        "pay-rule-form": {
          title: "Modulo regola retribuzione",
          steps: [
            "Aggiungi regola.",
            "Definisci effetti.",
            "Filtri data/ora.",
            "Assegna dipendenti.",
            "Salva."
          ],
          caption: "Modulo regola.",
          intro: "Effetti e filtri idoneità.",
          fields: [
            {
              name: "Codice",
              effect: "ID univoco."
            },
            {
              name: "Nome",
              effect: "Etichetta admin."
            },
            {
              name: "Priorità",
              effect: "Ordine impilamento."
            },
            {
              name: "Modalità impilamento",
              effect: "Interazione regole."
            },
            {
              name: "Effetti",
              effect: "Moltiplicatori o importi."
            },
            {
              name: "Filtri dipendente/reparto/ruolo/centro costo",
              effect: "Limita ambito."
            },
            {
              name: "Finestra data/ora",
              effect: "Intervallo opzionale."
            },
            {
              name: "Giorni settimana / mesi",
              effect: "Pattern calendario."
            },
            {
              name: "Festivi",
              effect: "Festivi selezionati."
            },
            {
              name: "Straordinari (giorno/settimana)",
              effect: "Oltre soglie."
            }
          ]
        }
      },
      title: "Profili e regole retribuzione",
      intro: "Tariffe base e regole di premi e detrazioni."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Periodi paghe",
          steps: [
            "HR → Paghe → Periodi.",
            "Crea periodi ciclo.",
            "Blocca prima del finale."
          ],
          caption: "Elenco periodi paghe."
        },
        "payroll-period-form": {
          title: "Modulo periodo paghe",
          steps: [
            "Nome, tipo, date.",
            "Stato Aperto.",
            "Passa a Bloccato/Chiuso/Pagato."
          ],
          caption: "Modulo periodo.",
          fields: [
            {
              name: "Nome periodo",
              effect: "Etichetta run ed export."
            },
            {
              name: "Tipo periodo",
              effect: "Settimanale, bisettimanale, mensile o custom."
            },
            {
              name: "Data inizio",
              effect: "Primo giorno incluso."
            },
            {
              name: "Data fine",
              effect: "Ultimo giorno incluso."
            },
            {
              name: "Stato",
              effect: "Aperto consente modifiche; bloccato limita."
            }
          ]
        },
        "payroll-runs": {
          title: "Run paghe",
          steps: [
            "Paghe → Run.",
            "Genera anteprima lordo.",
            "Rivedi snapshot."
          ],
          caption: "Run del periodo."
        },
        "payroll-run-form": {
          title: "Genera run paghe",
          steps: [
            "Nuovo run.",
            "Periodo aperto.",
            "Genera anteprima."
          ],
          caption: "Modulo nuovo run.",
          fields: [
            {
              name: "Periodo paghe",
              effect: "Regola ore e rettifiche incluse."
            },
            {
              name: "N. run",
              effect: "ID sequenziale nel periodo."
            }
          ]
        },
        adjustments: {
          title: "Rettifiche paghe",
          steps: [
            "Paghe → Rettifiche.",
            "Aggiungi bonus/penali.",
            "Collega al periodo."
          ],
          caption: "Elenco rettifiche."
        },
        "adjustment-form": {
          title: "Modulo rettifica",
          steps: [
            "Dipendente, tipo, importo, data.",
            "Periodo opzionale.",
            "Salva."
          ],
          caption: "Modulo rettifica paghe.",
          fields: [
            {
              name: "Dipendente",
              effect: "Riceve la rettifica."
            },
            {
              name: "Periodo paghe",
              effect: "Collegamento opzionale al run."
            },
            {
              name: "Tipo",
              effect: "Bonus, penalità, indennità, rimborso, anticipo, prestito, correzione o detrazione."
            },
            {
              name: "Importo",
              effect: "Valore sul lordo."
            },
            {
              name: "Data effettiva",
              effect: "Determina quale run include."
            },
            {
              name: "Descrizione",
              effect: "Dettaglio busta e audit."
            }
          ]
        }
      },
      title: "Periodi e run paghe",
      intro: "Chiudi periodi, genera run con anteprima e rettifiche."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Elenco documenti",
          steps: [
            "HR → Documenti.",
            "Filtra dipendente/categoria.",
            "Carica o aggiorna."
          ],
          caption: "Scheda documenti dipendente."
        },
        "document-form": {
          title: "Modulo documento",
          steps: [
            "Aggiungi documento.",
            "Dipendente, titolo, categoria.",
            "Allega file e scadenza.",
            "Salva."
          ],
          caption: "Modulo upload documento.",
          fields: [
            {
              name: "Dipendente",
              effect: "Proprietario record."
            },
            {
              name: "Titolo",
              effect: "Nome in elenchi."
            },
            {
              name: "Categoria",
              effect: "Contratto, certificato, licenza, ID, medico, avviso o altro."
            },
            {
              name: "Scade il",
              effect: "Data opzionale promemoria."
            },
            {
              name: "Allega file",
              effect: "Obbligatorio in creazione."
            }
          ]
        }
      },
      title: "Documenti dipendente",
      intro: "Archivia contratti, documenti e licenze con scadenze."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Elenco performance",
          steps: [
            "HR → Performance.",
            "Sfoglia per dipendente/tipo.",
            "Aggiungi dopo incidenti."
          ],
          caption: "Scheda note performance."
        },
        "performance-form": {
          title: "Modulo nota performance",
          steps: [
            "Dipendente, tipo, titolo, testo.",
            "Severità se applicabile.",
            "Visibile al dipendente.",
            "Salva."
          ],
          caption: "Modulo nota performance.",
          fields: [
            {
              name: "Dipendente",
              effect: "Soggetto della nota."
            },
            {
              name: "Tipo",
              effect: "Avviso, complimento, revisione o incidente."
            },
            {
              name: "Titolo",
              effect: "Breve riepilogo."
            },
            {
              name: "Contenuto",
              effect: "Resoconto completo."
            },
            {
              name: "Severità",
              effect: "Bassa, media, alta o critica."
            },
            {
              name: "Visibile dipendente",
              effect: "Può essere mostrata al dipendente."
            }
          ]
        }
      },
      title: "Note performance",
      intro: "Registra avvisi, complimenti e incidenti."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Annulla o void ordine",
          steps: [
            "Apri ⋯ su ordine In corso e scegli Annulla ordine.",
            "Scegli un motivo void (obbligatorio per report).",
            "Lascia Seleziona tutti per void totale o scegli righe specifiche.",
            "Conferma per void e liberare il tavolo se applicabile."
          ],
          caption: "Modal annullamento con motivo e selezione.",
          intro: "Annulla uno scontrino In corso. Void totale cancella tutte le righe; parziale solo quelle selezionate.",
          fields: [
            {
              name: "Motivo",
              effect: "Motivo void obbligatorio registrato sull'ordine."
            },
            {
              name: "Seleziona tutti gli articoli",
              effect: "Selezionato void intero scontrino; deselezionato per riga."
            },
            {
              name: "Void parziale",
              effect: "Void solo quantità selezionate mantenendo il resto aperto."
            }
          ]
        },
        refund: {
          title: "Rimborsare ordine pagato",
          steps: [
            "Apri ordine Pagato e scegli Rimborso.",
            "Seleziona righe e quantità.",
            "Scegli motivo e conferma.",
            "Il sistema registra il rimborso e aggiorna i totali."
          ],
          caption: "Modal rimborso con selezione articoli.",
          intro: "Emette rimborso su scontrino pagato, opzionalmente per righe selezionate.",
          fields: [
            {
              name: "Articoli da rimborsare",
              effect: "Righe pagate e quantità restituite al cliente."
            },
            {
              name: "Motivo",
              effect: "Documenta il rimborso per revisione e report."
            }
          ]
        },
        "split-seats": {
          title: "Dividi per posti",
          steps: [
            "Da ⋯ scegli Dividi per posti.",
            "Rivedi raggruppamento per posto.",
            "Conferma per uno scontrino figlio per posto."
          ],
          caption: "Anteprima divisione per posti.",
          intro: "Divide lo scontrino in conti separati per numero posto."
        },
        "split-items": {
          title: "Dividi per articoli",
          steps: [
            "Da ⋯ scegli Dividi per articoli.",
            "Sposta ogni riga in una colonna.",
            "Conferma per scontrini In corso separati."
          ],
          caption: "Griglia assegnazione articoli.",
          intro: "Assegna manualmente righe a nuovi conti."
        },
        "split-amount": {
          title: "Dividi per importo",
          steps: [
            "Da ⋯ scegli Dividi per importo.",
            "Inserisci parti o importi.",
            "Conferma per scontrini figli per quota."
          ],
          caption: "Dialogo divisione per importo.",
          intro: "Divide il totale in parti fisse o uguali."
        },
        merge: {
          title: "Unisci ordini",
          steps: [
            "Sul primo ordine, ⋯ → Unisci.",
            "Ripeti per ogni ordine aggiuntivo.",
            "Tocca Scegli tavolo e seleziona.",
            "Conferma unione."
          ],
          caption: "Barra unione con selettore tavolo.",
          intro: "Combina più conti In corso su un tavolo.",
          fields: [
            {
              name: "Seleziona ordini",
              effect: "Segna ordine per unione in sospeso."
            },
            {
              name: "Scegli tavolo",
              effect: "Imposta tavolo per conto unito."
            },
            {
              name: "Conferma unione",
              effect: "Unisce conti selezionati in un ordine In corso."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Profitti e perdite",
          steps: [
            "Apri Conti → Profitti e perdite.",
            "Imposta intervallo o periodo.",
            "Espandi gruppi conto.",
            "Esporta a chiusura periodo."
          ],
          caption: "Scheda profitti e perdite.",
          intro: "Conto economico del periodo: ricavi, costo venduto e spese."
        },
        "cash-flow": {
          title: "Flusso di cassa",
          steps: [
            "Apri Flusso di cassa in Conti.",
            "Stesso periodo degli altri prospetti.",
            "Rivedi saldo iniziale, variazione e finale.",
            "Usa con P&L per cassa vs. competenza."
          ],
          caption: "Scheda flusso di cassa.",
          intro: "Riassume movimenti operativi, investimenti e finanziamento."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Modulo dipendente",
          steps: [
            "Dipendenti → Aggiungi/modifica.",
            "Numero, nome, dettagli.",
            "Collega POS, reparto, ruolo.",
            "Salva."
          ],
          caption: "Modal dipendente.",
          intro: "Record HR con utente POS e struttura org.",
          fields: [
            {
              name: "N. dipendente",
              effect: "ID univoco su turni."
            },
            {
              name: "Nome / cognome",
              effect: "Nome legale o preferito."
            },
            {
              name: "Utente collegato",
              effect: "Login POS opzionale."
            },
            {
              name: "Reparto",
              effect: "Unità org."
            },
            {
              name: "Posizione",
              effect: "Titolo su turni."
            },
            {
              name: "Centro costo",
              effect: "Allocazione manodopera default."
            },
            {
              name: "Manager",
              effect: "Linea approvazioni."
            },
            {
              name: "Stato impiego",
              effect: "Attivo, inattivo, terminato, congedo o sospeso."
            },
            {
              name: "Tipo impiego",
              effect: "Orario, stipendio, contratto etc."
            },
            {
              name: "Assunzione / fine",
              effect: "Anzianità e idoneità."
            }
          ]
        },
        "department-form": {
          title: "Modulo reparto",
          steps: [
            "Reparti o inline.",
            "Codice, nome, descrizione.",
            "Salva."
          ],
          caption: "Modulo reparto.",
          fields: [
            {
              name: "Codice",
              effect: "ID breve integrazioni."
            },
            {
              name: "Nome",
              effect: "Nome visualizzato."
            },
            {
              name: "Descrizione",
              effect: "Note opzionali."
            },
            {
              name: "Attivo",
              effect: "Inattivi nascosti in nuove assegnazioni."
            }
          ]
        },
        "position-form": {
          title: "Modulo posizione",
          steps: [
            "Posizioni o inline.",
            "Codice, nome, reparto, centro costo.",
            "Salva."
          ],
          caption: "Modulo posizione.",
          fields: [
            {
              name: "Codice",
              effect: "Codice job export paghe."
            },
            {
              name: "Nome",
              effect: "Titolo HR e turni."
            },
            {
              name: "Reparto",
              effect: "Unità org default."
            },
            {
              name: "Centro costo default",
              effect: "Precompilato su turni."
            },
            {
              name: "Attivo",
              effect: "Ritira titoli non più assunti."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Inserimento presenza manuale",
          steps: [
            "Presenze → Inserimento manuale.",
            "Dipendente e orari.",
            "Note e salva."
          ],
          caption: "Modal presenza manuale.",
          intro: "Corregge timbrature mancanti o integra ore.",
          fields: [
            {
              name: "Dipendente",
              effect: "Soggetto del record."
            },
            {
              name: "Entrata",
              effect: "Inizio intervallo."
            },
            {
              name: "Uscita",
              effect: "Fine dopo entrata."
            },
            {
              name: "Note",
              effect: "Motivo inserimento manuale."
            }
          ]
        },
        "schedule-form": {
          title: "Modulo programma lavoro",
          steps: [
            "Pianificazione → aggiungi.",
            "Nome e inizio/fine periodo.",
            "Turni o genera da template."
          ],
          caption: "Modulo programma.",
          intro: "Intervallo date con turni bozza o pubblicati.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta periodo."
            },
            {
              name: "Inizio periodo",
              effect: "Primo datetime coperto."
            },
            {
              name: "Fine periodo",
              effect: "Ultimo datetime coperto."
            }
          ]
        },
        "shift-form": {
          title: "Modulo turno programmato",
          intro: "Assegna dipendente a blocco in bozza.",
          steps: [
            "Bozza → aggiungi turno.",
            "Programma, dipendente, orari.",
            "Template/org opzionale.",
            "Salva."
          ],
          caption: "Modulo turno.",
          fields: [
            {
              name: "Programma lavoro",
              effect: "Genitore in bozza."
            },
            {
              name: "Dipendente",
              effect: "Assegnato al turno."
            },
            {
              name: "Template turno",
              effect: "Preset Admin → Utenti → Turni."
            },
            {
              name: "Reparto / ruolo / centro costo",
              effect: "Override org."
            },
            {
              name: "Inizio / fine",
              effect: "Finestra oraria."
            }
          ]
        },
        "schedule-template": {
          title: "Modulo template programma",
          steps: [
            "Pianificazione → Template.",
            "Nome e giorni/orari.",
            "Template turno opzionale.",
            "Salva."
          ],
          caption: "Modulo template.",
          intro: "Schema settimanale riutilizzabile.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta genera."
            },
            {
              name: "Giorni settimana",
              effect: "Giorni con turni."
            },
            {
              name: "Ora inizio/fine",
              effect: "Finestra giornaliera."
            },
            {
              name: "Minuti pausa",
              effect: "Pausa non retribuita."
            },
            {
              name: "Template turno",
              effect: "Definizione POS."
            }
          ]
        },
        "schedule-generate": {
          title: "Genera programma da template",
          steps: [
            "Pianificazione → Genera.",
            "Bozza e template.",
            "Seleziona dipendenti.",
            "Genera."
          ],
          caption: "Dialogo genera.",
          fields: [
            {
              name: "Programma",
              effect: "Bozza destinazione."
            },
            {
              name: "Template",
              effect: "Schema settimanale."
            },
            {
              name: "Dipendenti",
              effect: "Ricevono copia turni."
            }
          ]
        },
        "schedule-swap": {
          title: "Richiesta scambio turno",
          steps: [
            "Pianificazione → Richiedi scambio.",
            "Turno e richiedente.",
            "Collega target opzionale.",
            "Invia."
          ],
          caption: "Formulario scambio.",
          fields: [
            {
              name: "Turno programmato",
              effect: "Turno da cedere/scambiare."
            },
            {
              name: "Richiedente",
              effect: "Avvia scambio."
            },
            {
              name: "Collega target",
              effect: "Opzionale."
            },
            {
              name: "Turno proposto",
              effect: "Contro-turno."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Modulo richiesta permesso",
          steps: [
            "Permessi → Aggiungi.",
            "Dipendente, tipo, date.",
            "Giorni e motivo.",
            "Salva."
          ],
          caption: "Modulo permesso.",
          intro: "Invia richieste per tipi configurati.",
          fields: [
            {
              name: "Dipendente",
              effect: "Richiedente."
            },
            {
              name: "Tipo permesso",
              effect: "Retribuito/non e approvazione."
            },
            {
              name: "Data inizio/fine",
              effect: "Date inclusive."
            },
            {
              name: "Giorni",
              effect: "Giorni lavorativi consumati."
            },
            {
              name: "Motivo",
              effect: "Nota opzionale."
            }
          ]
        },
        "holiday-form": {
          title: "Modulo festività",
          steps: [
            "Permessi → Festività.",
            "Nome, data, paese.",
            "Ricorrente se annuale.",
            "Salva."
          ],
          caption: "Modulo festività.",
          intro: "Interagisce con regole paghe e pianificazione.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta calendari."
            },
            {
              name: "Data",
              effect: "Data osservata."
            },
            {
              name: "Codice paese",
              effect: "ISO opzionale."
            },
            {
              name: "Ricorrente",
              effect: "Ripete ogni anno."
            },
            {
              name: "Attivo",
              effect: "Inattivi ignorati nuove regole."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Modulo piatto",
          steps: [
            "Admin → Menu → Piatti.",
            "Numero, nome, prezzo, categorie.",
            "Modifier, ricetta, cucina.",
            "Salva."
          ],
          caption: "Modulo manutenzione piatto.",
          intro: "Articoli vendibili con prezzo, categorie, modifier e cucina.",
          fields: [
            {
              name: "Numero / nome",
              effect: "ID POS e nome visualizzato."
            },
            {
              name: "Prezzo / costo",
              effect: "Prezzo vendita e costo teorico."
            },
            {
              name: "Categorie",
              effect: "Raggruppamento menu."
            },
            {
              name: "Gruppi modifier",
              effect: "Flusso personalizzazione."
            },
            {
              name: "Righe ricetta",
              effect: "Depletion magazzino."
            },
            {
              name: "Cucina / workflow",
              effect: "Routing KOT."
            }
          ]
        },
        "menu-form": {
          title: "Modulo menu",
          steps: [
            "Scheda Menu.",
            "Nome e orari.",
            "Attivo e finisce giorno dopo.",
            "Salva."
          ],
          caption: "Modulo menu.",
          intro: "Limita categorie POS per orario.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta selettore POS."
            },
            {
              name: "Inizio / fine",
              effect: "Finestra disponibilità."
            },
            {
              name: "Finisce giorno dopo",
              effect: "Servizio oltre mezzanotte."
            },
            {
              name: "Attivo",
              effect: "Inattivi nascosti."
            }
          ]
        },
        "category-form": {
          title: "Modulo categoria",
          steps: [
            "Categorie.",
            "Nome, priorità, mostra menu.",
            "Salva."
          ],
          caption: "Modulo categoria.",
          fields: [
            {
              name: "Nome",
              effect: "Intestazione POS."
            },
            {
              name: "Priorità",
              effect: "Ordine."
            },
            {
              name: "Mostra in menu",
              effect: "Nascosto se off."
            }
          ]
        },
        "modifier-group-form": {
          title: "Modulo gruppo modifier",
          steps: [
            "Gruppi modifier.",
            "Nome, priorità, prezzi.",
            "Gruppi successivi.",
            "Salva."
          ],
          caption: "Modulo gruppi annidati.",
          intro: "Modifier, prezzi e gruppi annidati.",
          fields: [
            {
              name: "Nome / priorità",
              effect: "Etichetta e ordine."
            },
            {
              name: "Modifier",
              effect: "Opzione selezionabile."
            },
            {
              name: "Prezzo",
              effect: "Extra charge."
            },
            {
              name: "Gruppi successivi consentiti",
              effect: "Dopo scelta."
            },
            {
              name: "Override gruppo successivo",
              effect: "Nascondi o repricing."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Modulo piano",
          steps: [
            "Admin → Piani.",
            "Nome, priorità, colori.",
            "Salva."
          ],
          caption: "Modulo piano.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta selettore piano."
            },
            {
              name: "Priorità",
              effect: "Ordine lista."
            },
            {
              name: "Sfondo / colore",
              effect: "Stile tile piano."
            }
          ]
        },
        "table-form": {
          title: "Modulo tavolo",
          steps: [
            "Seleziona piano.",
            "Numero, nome, colori.",
            "Restrizioni opzionali.",
            "Chiedi coperti.",
            "Salva."
          ],
          caption: "Modulo tavolo.",
          intro: "Appartiene a piano; restrizioni opzionali.",
          fields: [
            {
              name: "Nome / numero",
              effect: "Etichetta planimetria."
            },
            {
              name: "Piano",
              effect: "Piano padre."
            },
            {
              name: "Priorità",
              effect: "Ordine."
            },
            {
              name: "Categorie / tipi ordine / pagamento",
              effect: "Restrizioni."
            },
            {
              name: "Chiedi coperti",
              effect: "Prompt commensali."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Modulo regola sconto",
          steps: [
            "Admin → Promozioni → Sconti.",
            "Categoria, scope, modalità.",
            "Target e valore.",
            "Salva."
          ],
          caption: "Modulo regola sconto.",
          intro: "14 categorie; scope item/category/cart/customer/floor.",
          fields: [
            {
              name: "Categoria",
              effect: "Uno di 14 tipi."
            },
            {
              name: "Scope",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "Modalità applicazione",
              effect: "manual, automatic, both."
            },
            {
              name: "Target",
              effect: "Articoli/categorie eleggibili."
            },
            {
              name: "Tipo (percent/fisso)",
              effect: "Min/max percent o importo."
            },
            {
              name: "Tasso min/max",
              effect: "Intervallo consentito."
            },
            {
              name: "Cap massimo",
              effect: "Limite sconti %."
            },
            {
              name: "Priorità",
              effect: "Ordine regole auto."
            },
            {
              name: "Importo min ordine",
              effect: "Soglia subtotale."
            },
            {
              name: "Modalità stacking",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Trattamento fiscale",
              effect: "tax_before/after_discount etc."
            },
            {
              name: "Orari",
              effect: "Finestre giorno/ora."
            },
            {
              name: "Condizioni",
              effect: "Buy X Get Y."
            },
            {
              name: "Richiede motivo/approvazione",
              effect: "PIN manager manuale."
            }
          ]
        },
        "coupon-form": {
          title: "Modulo coupon",
          steps: [
            "Promozioni → Coupon.",
            "Codice, tipo/valore, limiti.",
            "Giorni e date validi.",
            "Salva."
          ],
          caption: "Modulo coupon.",
          fields: [
            {
              name: "Codice",
              effect: "Stringa al checkout."
            },
            {
              name: "Tipo coupon",
              effect: "Uso singolo/multiplo."
            },
            {
              name: "Tipo/valore sconto",
              effect: "Percent o fisso."
            },
            {
              name: "Importo min ordine",
              effect: "Soglia subtotale."
            },
            {
              name: "Sconto max",
              effect: "Cap su %."
            },
            {
              name: "Limite utilizzo",
              effect: "Riscatti totali."
            },
            {
              name: "Limite per utente",
              effect: "Per cliente."
            },
            {
              name: "Giorni validi / orari",
              effect: "Restrizione temporale."
            },
            {
              name: "Data inizio/fine",
              effect: "Validità globale."
            },
            {
              name: "Impilabile / solo primo ordine",
              effect: "Regole combinazione."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Modulo cucina",
          steps: [
            "Admin → Cucina → Cucine.",
            "Nome, priorità, stampanti, piatti.",
            "Salva."
          ],
          caption: "Modulo stazione cucina.",
          intro: "Instrada piatti a stampanti e magazzini.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta KOT e display."
            },
            {
              name: "Priorità",
              effect: "Ordine con più cucine."
            },
            {
              name: "Stampanti",
              effect: "Dispositivi ticket."
            },
            {
              name: "Articoli (piatti)",
              effect: "Piatti instradati."
            }
          ]
        },
        "workflow-form": {
          title: "Modulo workflow",
          steps: [
            "Cucina → Workflow.",
            "Nome e fasi.",
            "Cucina per fase.",
            "Collega ai piatti."
          ],
          caption: "Editor fasi workflow.",
          intro: "Concatena fasi cucina.",
          fields: [
            {
              name: "Nome",
              effect: "ID su piatti."
            },
            {
              name: "Fasi",
              effect: "Passi ordinati."
            },
            {
              name: "Cucina fase",
              effect: "Stazione per fase."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Modulo stampante",
          steps: [
            "Admin → Stampa → Stampanti.",
            "Nome e connessione IP/USB.",
            "Tipo scontrino/cucina/etichetta.",
            "Salva."
          ],
          caption: "Modulo stampante.",
          fields: [
            {
              name: "Nome",
              effect: "Nome friendly."
            },
            {
              name: "Tipo",
              effect: "Profilo scontrino/cucina/etichetta."
            },
            {
              name: "IP / porta",
              effect: "Connessione rete ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "ID USB."
            }
          ]
        },
        "print-setting-form": {
          title: "Modulo impostazione stampa",
          steps: [
            "Impostazioni stampa.",
            "Tipo job.",
            "Logo, header/footer, IVA, margini.",
            "Salva."
          ],
          caption: "Editor template.",
          intro: "Ogni job ha template proprio.",
          fields: [
            {
              name: "Mostra logo",
              effect: "Logo sul ticket."
            },
            {
              name: "Sezioni header/footer",
              effect: "Blocchi testo/immagine."
            },
            {
              name: "Nome/n° IVA",
              effect: "Blocco fiscale."
            },
            {
              name: "Margini",
              effect: "Spaziatura in punti."
            },
            {
              name: "Colonne articolo",
              effect: "N°, nome, qty, prezzo, totale."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Modulo tipo pagamento",
          steps: [
            "Admin → Pagamenti → Tipi.",
            "Nome, priorità, tipo.",
            "Remote: gateway, modalità, chiavi.",
            "Salva."
          ],
          caption: "Modulo gateway remote.",
          intro: "Locale e Remote Stripe, PayPal.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta pulsanti."
            },
            {
              name: "Priorità",
              effect: "Ordine."
            },
            {
              name: "Tipo",
              effect: "Remote abilita gateway."
            },
            {
              name: "Provider gateway",
              effect: "Stripe, PayPal etc."
            },
            {
              name: "Modalità gateway",
              effect: "Test vs live."
            },
            {
              name: "public_key",
              effect: "Chiave pubblicabile client."
            },
            {
              name: "secret_key",
              effect: "Secret server."
            },
            {
              name: "webhook_secret",
              effect: "Valida callback."
            },
            {
              name: "client_id / client_secret",
              effect: "Gateway OAuth."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Campi merchant."
            },
            {
              name: "Tassa",
              effect: "Regola fiscale default."
            },
            {
              name: "Sconti",
              effect: "Regole auto."
            }
          ]
        },
        "tax-form": {
          title: "Modulo tassa",
          steps: [
            "Pagamenti → Tasse.",
            "Nome, aliquota, inclusive/exclusive.",
            "Salva."
          ],
          caption: "Modulo tassa.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta scontrino."
            },
            {
              name: "Aliquota",
              effect: "Percentuale imponibile."
            },
            {
              name: "Inclusive",
              effect: "Se true, nel prezzo."
            }
          ]
        },
        "order-type-form": {
          title: "Modulo tipo ordine",
          steps: [
            "Pagamenti → Tipi ordine.",
            "Nome e flag.",
            "Salva."
          ],
          caption: "Modulo tipo ordine.",
          fields: [
            {
              name: "Nome",
              effect: "Tipo su scontrini."
            },
            {
              name: "Priorità",
              effect: "Ordine selettori."
            },
            {
              name: "Default",
              effect: "Preselezionato nuovi ordini."
            }
          ]
        },
        "extra-form": {
          title: "Modulo extra (servizio)",
          steps: [
            "Pagamenti → Extra.",
            "Nome e importo/tasso.",
            "Regole applicazione.",
            "Salva."
          ],
          caption: "Modulo maggiorazione.",
          intro: "Aggiunge maggiorazioni automatiche.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta scontrino."
            },
            {
              name: "Importo / tasso",
              effect: "Fisso o percentuale."
            },
            {
              name: "Tassabile",
              effect: "IVA su maggiorazione."
            },
            {
              name: "Regole auto apply",
              effect: "Tipi ordine/pagamento."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Modulo utente",
          steps: [
            "Admin → Utenti.",
            "Metodo login, nome, credenziali, ruolo, turno.",
            "Crea dipendente opzionale.",
            "Salva."
          ],
          caption: "Modulo account utente.",
          intro: "Operatori POS con PIN o password.",
          fields: [
            {
              name: "Metodo login",
              effect: "PIN (4 cifre) o password."
            },
            {
              name: "Nome / cognome",
              effect: "Nome su scontrini."
            },
            {
              name: "Login / PIN",
              effect: "Credenziali."
            },
            {
              name: "Password",
              effect: "Obbligatoria se password."
            },
            {
              name: "Ruolo utente",
              effect: "Pacchetto permessi."
            },
            {
              name: "Turno utente",
              effect: "Turno default."
            },
            {
              name: "Crea dipendente",
              effect: "Auto-crea HR collegato."
            }
          ]
        },
        "role-form": {
          title: "Modulo ruolo",
          steps: [
            "Utenti → Ruoli.",
            "Nome e albero moduli.",
            "Seleziona permessi.",
            "Salva."
          ],
          caption: "Editor permessi ruolo.",
          intro: "Concede accesso moduli e azioni.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta form utente."
            },
            {
              name: "Permessi modulo",
              effect: "Checkbox gerarchiche."
            }
          ]
        },
        "shift-form": {
          title: "Modulo template turno",
          steps: [
            "Utenti → Turni.",
            "Nome e orari.",
            "Notturno attiva giorno dopo.",
            "Salva."
          ],
          caption: "Modulo turno.",
          intro: "Definisce finestre orarie.",
          fields: [
            {
              name: "Nome",
              effect: "Etichetta turno."
            },
            {
              name: "Ora inizio",
              effect: "Inizio programmato."
            },
            {
              name: "Ora fine",
              effect: "Fine programmata."
            }
          ]
        },
        "tips-definition": {
          title: "Definizione mance (distribuzione)",
          steps: [
            "Utenti → Definizione mance.",
            "Righe ruolo con pesi.",
            "Override utente.",
            "Salva."
          ],
          caption: "Pannello distribuzione mance.",
          intro: "Pondera mance pooled per ruoli e utenti.",
          fields: [
            {
              name: "Peso ruolo",
              effect: "Quota pool per ruolo."
            },
            {
              name: "Peso utente",
              effect: "Override opzionale."
            }
          ]
        }
      }
    }
  },
  ar: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "تبويب التسوية",
          steps: [
            "المخزون → تسوية المطبخ.",
            "اختر الموقع وتاريخ العمل.",
            "انقر إنشاء للاستخدام النظري.",
            "أدخل الكميات الفعلية أو استورد CSV.",
            "احفظ مسودة، راجع الفروق، تحقق."
          ],
          caption: "شريط الأدوات والشبكة ولوحة الفروق.",
          intro: "أنشئ شبكة من مبيعات POS والوصفات ثم أدخل أو استورد الجرد الفعلي.",
          fields: [
            {
              name: "الموقع",
              effect: "المطبخ أو المخزن المُسوّى."
            },
            {
              name: "تاريخ العمل",
              effect: "يوم التداول للاستخدام والجرد."
            },
            {
              name: "إنشاء",
              effect: "ينشئ/يحدّث البنود من المبيعات والوصفات."
            },
            {
              name: "الكمية الفعلية",
              effect: "الجرد الفعلي لكل صنف."
            },
            {
              name: "تحقق",
              effect: "يقفل التسوية بعد موافقة المدير."
            }
          ]
        },
        "reconciliation-form": {
          title: "إدخال العد اليدوي",
          steps: [
            "انقر خلية الفعلي لإدخال العد.",
            "احفظ مسودة دون تحقق.",
            "استورد CSV بالجملة.",
            "راجع الفروق قبل التحقق."
          ],
          caption: "شبكة مع تحرير الكمية الفعلية.",
          intro: "تحرير الشبكة واستيراد CSV يتشاركان بنية السطر.",
          fields: [
            {
              name: "الصنف",
              effect: "صنف المخزون في السطر."
            },
            {
              name: "النظري",
              effect: "الاستخدام المحسوب من الوصفات والمبيعات."
            },
            {
              name: "الفعلي",
              effect: "الكمية المعدودة المدخلة."
            },
            {
              name: "الفرق",
              effect: "الفرق بين الفعلي والنظري."
            },
            {
              name: "ملاحظات",
              effect: "شرح اختياري على السطر."
            }
          ]
        }
      },
      title: "تسوية المطبخ",
      intro: "قارن الاستخدام النظري مع الجرد الفعلي حسب الموقع وتاريخ العمل."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "قائمة الوصفات",
          steps: [
            "المخزون → الوصفات.",
            "تصفح الوصفات النشطة.",
            "أضف أو عدّل الوصفات."
          ],
          caption: "تبويب صيانة الوصفات."
        },
        "recipe-form": {
          title: "نموذج الوصفة",
          steps: [
            "أضف أو عدّل وصفة.",
            "الاسم والرمز وكمية الدفعة الأساسية.",
            "أسطر المدخلات والمخرجات.",
            "احفظ."
          ],
          caption: "نموذج المدخلات والمخرجات.",
          intro: "يعرّف المدخلات ومخرجات الإنتاج وتوزيع التكلفة.",
          fields: [
            {
              name: "الاسم",
              effect: "الاسم في الإنتاج والتقارير."
            },
            {
              name: "الرمز",
              effect: "رمز مختصر اختياري."
            },
            {
              name: "كمية الدفعة الأساسية",
              effect: "حجم الدفعة القياسي."
            },
            {
              name: "توزيع التكلفة",
              effect: "طريقة توزيع تكلفة المدخلات."
            },
            {
              name: "مدخلات",
              effect: "الأصناف المستهلكة لكل دفعة."
            },
            {
              name: "مخرجات",
              effect: "المنتجات مع نسبة الإنتاج."
            },
            {
              name: "نشط",
              effect: "غير النشطة مخفية من الإنتاج الجديد."
            }
          ]
        },
        production: {
          title: "تشغيلات الإنتاج",
          steps: [
            "افتح تبويب الإنتاج.",
            "ابدأ دفعة من وصفة نشطة.",
            "عاين ثم أكمل."
          ],
          caption: "تبويب الإنتاج مع قائمة الدفعات."
        },
        "production-form": {
          title: "نموذج دفعة الإنتاج",
          steps: [
            "إنتاج جديد.",
            "الوصفة والموقع والكمية.",
            "راجع المعاينة.",
            "أكمل."
          ],
          caption: "نموذج الدفعة مع المعاينة.",
          intro: "عند الإكمال تُخصم المدخلات وتُضاف المخرجات في الموقع.",
          fields: [
            {
              name: "الوصفة",
              effect: "تحدد المكونات والمخرجات."
            },
            {
              name: "الموقع",
              effect: "مكان الاستهلاك/الإنتاج."
            },
            {
              name: "الكمية المنتجة",
              effect: "توسّع من حجم الدفعة الأساسي."
            },
            {
              name: "رقم الدفعة",
              effect: "مرجع اختياري."
            },
            {
              name: "تحديث تكلفة الصنف",
              effect: "يعيد حساب تكلفة المخرجات."
            },
            {
              name: "ملاحظات",
              effect: "ملاحظة حرة."
            }
          ]
        },
        "production-history": {
          title: "سجل الإنتاج",
          steps: [
            "راجع الدفعات المكتملة.",
            "صفّ حسب التاريخ/الوصفة/الموقع.",
            "افتح السطر للتفاصيل."
          ],
          caption: "قائمة سجل الإنتاج."
        }
      },
      title: "الوصفات والإنتاج",
      intro: "عرّف وصفات الدفعات ونفّذ الإنتاج وراجع السجل."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "قوائم البuffet",
          steps: [
            "المخزون → Buffet → القوائم.",
            "قوالب الإفطار/الغداء/العشاء.",
            "وصفات لكل ضيف."
          ],
          caption: "قائمة قوائم البuffet."
        },
        "buffet-menu-form": {
          title: "نموذج قائمة البuffet",
          steps: [
            "أضف أو عدّل القائمة.",
            "نوع الجلسة وأسطر الوصفة.",
            "احفظ."
          ],
          caption: "نموذج قائمة البuffet.",
          fields: [
            {
              name: "الاسم",
              effect: "التسمية عند بدء الجلسة."
            },
            {
              name: "الرمز",
              effect: "اختصار المطبخ اختياري."
            },
            {
              name: "نوع الجلسة",
              effect: "إفطار/غداء/عشاء."
            },
            {
              name: "أسطر الوصفة",
              effect: "وصفة وكمية لكل ضيف."
            },
            {
              name: "نشط",
              effect: "القوائم النشطة فقط."
            }
          ]
        },
        "buffet-sessions": {
          title: "جلسات البuffet",
          steps: [
            "Buffet → الجلسات.",
            "ابدأ جلسة من القائمة.",
            "راقب الإنتاج مقابل التوقع.",
            "أغلق الجلسة."
          ],
          caption: "لوحة جلسات البuffet."
        },
        "buffet-session-form": {
          title: "بدء جلسة البuffet",
          steps: [
            "جلسة جديدة.",
            "القائمة والموقع والتاريخ.",
            "الضيوف والسعر.",
            "احفظ."
          ],
          caption: "نموذج جلسة جديدة.",
          fields: [
            {
              name: "القائمة",
              effect: "تحمّل الأسطر والتوقعات."
            },
            {
              name: "الموقع",
              effect: "مخزن الحركات."
            },
            {
              name: "تاريخ العمل",
              effect: "يوم التداول."
            },
            {
              name: "نوع الجلسة",
              effect: "يتوافق مع القائمة."
            },
            {
              name: "الضيوف المتوقعون",
              effect: "توقعات أولية."
            },
            {
              name: "سعر البuffet",
              effect: "إيراد لكل ضيف."
            }
          ]
        }
      },
      title: "قوائم وجلسات البuffet",
      intro: "خطّط وصفات لكل ضيف وأدر جلسات البuffet."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "قائمة مراكز التكلفة",
          steps: [
            "الموارد البشرية → مراكز التكلفة.",
            "راجع الرموز.",
            "أضف أو عدّل."
          ],
          caption: "تبويب مراكز التكلفة."
        },
        "cost-center-form": {
          title: "نموذج مركز التكلفة",
          steps: [
            "أضف أو عدّل.",
            "الرمز والاسم والوصف.",
            "نشط/غير نشط.",
            "احفظ."
          ],
          caption: "نافذة مركز التكلفة.",
          fields: [
            {
              name: "الرمز",
              effect: "معرّف قصير فريد."
            },
            {
              name: "الاسم",
              effect: "التسمية في القوائم."
            },
            {
              name: "الوصف",
              effect: "ملاحظات اختيارية."
            },
            {
              name: "نشط",
              effect: "غير النشط غير متاح للسجلات الجديدة."
            }
          ]
        }
      },
      title: "مراكز التكلفة",
      intro: "توسّم العمالة والرواتب للمواقع والأقسام."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "ملفات الأجر",
          steps: [
            "الموارد البشرية → الأجر → الملفات.",
            "الأجر الأساسي لكل موظف.",
            "يغذي حساب الرواتب."
          ],
          caption: "قائمة ملفات الأجر."
        },
        "pay-profile-form": {
          title: "نموذج ملف الأجر",
          steps: [
            "أضف أو عدّل الملف.",
            "نوع الأجر والأجر الأساسي.",
            "احفظ."
          ],
          caption: "نموذج ملف الأجر.",
          fields: [
            {
              name: "الموظف",
              effect: "من يتلقى هذا الأجر الأساسي."
            },
            {
              name: "نوع الأجر",
              effect: "بالساعة أو راتب أو عقد أو عمولة أو مختلط."
            },
            {
              name: "الأجر الأساسي",
              effect: "المعدل أو مبلغ الراتب."
            },
            {
              name: "العملة",
              effect: "عملة ISO."
            },
            {
              name: "ساري من",
              effect: "أول يوم للملف."
            },
            {
              name: "ساري حتى",
              effect: "نهاية اختيارية."
            }
          ]
        },
        "pay-rules": {
          title: "قواعد الأجر",
          steps: [
            "الأجر → القواعد.",
            "ترتيب بالأولوية.",
            "فلاتر الموظف/القسم."
          ],
          caption: "قائمة قواعد الأجر."
        },
        "pay-rule-form": {
          title: "نموذج قاعدة الأجر",
          steps: [
            "أضف القاعدة.",
            "عرّف التأثيرات.",
            "فلاتر التاريخ/الوقت.",
            "عيّن الموظفين.",
            "احفظ."
          ],
          caption: "نموذج القاعدة.",
          intro: "تأثيرات وفلاتر أهلية.",
          fields: [
            {
              name: "الرمز",
              effect: "معرّف فريد."
            },
            {
              name: "الاسم",
              effect: "تسمية الإدارة."
            },
            {
              name: "الأولوية",
              effect: "ترتيب التراكم."
            },
            {
              name: "وضع التراكم",
              effect: "تفاعل القواعد."
            },
            {
              name: "التأثيرات",
              effect: "مضاعفات أو مبالغ."
            },
            {
              name: "فلاتر الموظف/القسم/المنصب/مركز التكلفة",
              effect: "يحد النطاق."
            },
            {
              name: "نافذة التاريخ والوقت",
              effect: "نطاق اختياري."
            },
            {
              name: "أيام الأسبوع / الأشهر",
              effect: "أنماط التقويم."
            },
            {
              name: "العطل",
              effect: "العطل المحددة."
            },
            {
              name: "ساعات إضافية (يوم/أسبوع)",
              effect: "عند تجاوز العتبات."
            }
          ]
        }
      },
      title: "ملفات وقواعد الأجر",
      intro: "الأجور الأساسية وقواعد العلاوات والخصومات."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "فترات الرواتب",
          steps: [
            "الموارد البشرية → الرواتب → الفترات.",
            "أنشئ فترات الدورة.",
            "اقفل قبل النهائي."
          ],
          caption: "قائمة فترات الرواتب."
        },
        "payroll-period-form": {
          title: "نموذج فترة الرواتب",
          steps: [
            "الاسم والنوع والتواريخ.",
            "الحالة مفتوحة.",
            "غيّر إلى مقفل/مغلق/مدفوع."
          ],
          caption: "نموذج الفترة.",
          fields: [
            {
              name: "اسم الفترة",
              effect: "التسمية في التشغيلات والتصدير."
            },
            {
              name: "نوع الفترة",
              effect: "أسبوعي أو نصف شهري أو شهري أو مخصص."
            },
            {
              name: "تاريخ البداية",
              effect: "أول يوم مشمول."
            },
            {
              name: "تاريخ النهاية",
              effect: "آخر يوم مشمول."
            },
            {
              name: "الحالة",
              effect: "مفتوح يسمح بالتعديل؛ المقفل يقيّد."
            }
          ]
        },
        "payroll-runs": {
          title: "تشغيلات الرواتب",
          steps: [
            "الرواتب → التشغيلات.",
            "أنشئ معاينة.",
            "راجع اللقطات."
          ],
          caption: "تشغيلات الفترة."
        },
        "payroll-run-form": {
          title: "إنشاء تشغيل رواتب",
          steps: [
            "تشغيل جديد.",
            "فترة مفتوحة.",
            "أنشئ معاينة."
          ],
          caption: "نموذج تشغيل جديد.",
          fields: [
            {
              name: "فترة الرواتب",
              effect: "تحكم الساعات والتعديلات."
            },
            {
              name: "رقم التشغيل",
              effect: "معرّف تسلسلي في الفترة."
            }
          ]
        },
        adjustments: {
          title: "تعديلات الرواتب",
          steps: [
            "الرواتب → التعديلات.",
            "أضف مكافآت/جزاءات.",
            "اربط بالفترة."
          ],
          caption: "قائمة التعديلات."
        },
        "adjustment-form": {
          title: "نموذج التعديل",
          steps: [
            "الموظف والنوع والمبلغ والتاريخ.",
            "فترة اختيارية.",
            "احفظ."
          ],
          caption: "نموذج تعديل الرواتب.",
          fields: [
            {
              name: "الموظف",
              effect: "من يتلقى التعديل."
            },
            {
              name: "فترة الرواتب",
              effect: "ربط اختياري بالتشغيل."
            },
            {
              name: "النوع",
              effect: "مكافأة أو جزاء أو بدل أو سلفة أو قرض أو تصحيح أو خصم."
            },
            {
              name: "المبلغ",
              effect: "قيمة تُضاف أو تُخصم من الإجمالي."
            },
            {
              name: "التاريخ الفعلي",
              effect: "يحدد أي تشغيل يشمله."
            },
            {
              name: "الوصف",
              effect: "تفصيل كشف الراتب والتدقيق."
            }
          ]
        }
      },
      title: "فترات وتشغيلات الرواتب",
      intro: "أغلق الفترات وأنشئ تشغيلات مع معاينة."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "قائمة المستندات",
          steps: [
            "الموارد البشرية → المستندات.",
            "صفّ حسب الموظف/الفئة.",
            "ارفع أو حدّث."
          ],
          caption: "تبويب مستندات الموظف."
        },
        "document-form": {
          title: "نموذج المستند",
          steps: [
            "أضف مستنداً.",
            "الموظف والعنوان والفئة.",
            "أرفق الملف وتاريخ الانتهاء.",
            "احفظ."
          ],
          caption: "نموذج رفع المستند.",
          fields: [
            {
              name: "الموظف",
              effect: "مالك السجل."
            },
            {
              name: "العنوان",
              effect: "الاسم في القوائم."
            },
            {
              name: "الفئة",
              effect: "عقد أو شهادة أو ترخيص أو هوية أو طبي أو تحذير أو أخرى."
            },
            {
              name: "ينتهي في",
              effect: "تاريخ اختياري للتنبيهات."
            },
            {
              name: "إرفاق ملف",
              effect: "إلزامي عند الإنشاء."
            }
          ]
        }
      },
      title: "مستندات الموظف",
      intro: "خزّن العقود والهويات والتراخيص مع تتبع الانتهاء."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "قائمة الأداء",
          steps: [
            "الموارد البشرية → الأداء.",
            "تصفح حسب الموظف/النوع.",
            "أضف بعد الحوادث."
          ],
          caption: "تبويب ملاحظات الأداء."
        },
        "performance-form": {
          title: "نموذج ملاحظة الأداء",
          steps: [
            "الموظف والنوع والعنوان والنص.",
            "حدد الشدة.",
            "مرئي للموظف.",
            "احفظ."
          ],
          caption: "نموذج ملاحظة الأداء.",
          fields: [
            {
              name: "الموظف",
              effect: "موضوع الملاحظة."
            },
            {
              name: "النوع",
              effect: "تحذير أو مديح أو مراجعة أو حادث."
            },
            {
              name: "العنوان",
              effect: "ملخص قصير."
            },
            {
              name: "المحتوى",
              effect: "السرد الكامل."
            },
            {
              name: "الشدة",
              effect: "منخفض أو متوسط أو عالٍ أو حرج."
            },
            {
              name: "مرئي للموظف",
              effect: "قد تُعرض للموظف."
            }
          ]
        }
      },
      title: "ملاحظات الأداء",
      intro: "سجّل التحذيرات والمديح والحوادث."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "إلغاء أو void الطلب",
          steps: [
            "افتح ⋯ على بطاقة قيد التنفيذ واختر إلغاء الطلب.",
            "اختر سبب void (مطلوب للتقارير).",
            "اترك تحديد الكل للvoid الكامل أو ألغِ واختر بنوداً.",
            "أكّد لإلغاء الحساب وتحرير الطاولة عند الحاجة."
          ],
          caption: "نافذة الإلغاء مع السبب واختيار البنود.",
          intro: "يلغي حساباً قيد التنفيذ. void كامل يلغي كل البنود؛ الجزئي يزيل البنود المحددة فقط.",
          fields: [
            {
              name: "السبب",
              effect: "سبب void إلزامي مسجّل على الطلب للتدقيق والتقارير."
            },
            {
              name: "تحديد كل البنود",
              effect: "عند التفعيل يلغي الحساب بالكامل؛ عند الإلغاء اختيار لكل بند."
            },
            {
              name: "void جزئي",
              effect: "يلغي الكميات المحددة فقط ويبقي الباقي مفتوحاً."
            }
          ]
        },
        refund: {
          title: "استرداد الطلب المدفوع",
          steps: [
            "افتح طلباً مدفوعاً واختر استرداد.",
            "حدد البنود والكميات.",
            "اختر السبب وأكّد.",
            "يسجل النظام الاسترداد ويحدّث إجماليات الدفع."
          ],
          caption: "نافذة الاسترداد مع اختيار البنود.",
          intro: "يصدر استرداداً على حساب مدفوع، اختيارياً لبنود محددة.",
          fields: [
            {
              name: "بنود الاسترداد",
              effect: "البنود المدفوعة والكميات المرتجعة للعميل."
            },
            {
              name: "السبب",
              effect: "يوثّق سبب الاسترداد للمراجعة والتقارير."
            }
          ]
        },
        "split-seats": {
          title: "تقسيم حسب المقاعد",
          steps: [
            "من ⋯ اختر تقسيم حسب المقاعد.",
            "راجع تجميع البنود لكل مقعد.",
            "أكّد لإنشاء حساب فرعي لكل مقعد."
          ],
          caption: "معاينة التقسيم حسب المقاعد.",
          intro: "يقسم الحساب إلى حسابات منفصلة حسب رقم المقعد."
        },
        "split-items": {
          title: "تقسيم حسب البنود",
          steps: [
            "من ⋯ اختر تقسيم حسب البنود.",
            "انقل كل بند إلى عمود حساب جديد.",
            "أكّد لإنشاء حسابات منفصلة قيد التنفيذ."
          ],
          caption: "شبكة تعيين البنود.",
          intro: "يعيّن البنود يدوياً لحسابات جديدة بغض النظر عن المقعد."
        },
        "split-amount": {
          title: "تقسيم حسب المبلغ",
          steps: [
            "من ⋯ اختر تقسيم حسب المبلغ.",
            "أدخل عدد الأجزاء أو مبالغ مخصصة.",
            "أكّد لإنشاء حسابات فرعية لكل جزء."
          ],
          caption: "حوار التقسيم حسب المبلغ.",
          intro: "يقسم الإجمالي إلى أجزاء ثابتة أو متساوية للدفع المنفصل."
        },
        merge: {
          title: "دمج الطلبات",
          steps: [
            "في الطلب الأول ⋯ → دمج.",
            "كرر لكل طلب إضافي.",
            "اضغط اختيار الطاولة وحدد الوجهة.",
            "أكّد الدمج."
          ],
          caption: "شريط الدمج مع محدد الطاولة.",
          intro: "يجمع عدة حسابات قيد التنفيذ على طاولة واحدة.",
          fields: [
            {
              name: "تحديد الطلبات",
              effect: "يضم الطلب لمجموعة الدمج المعلقة."
            },
            {
              name: "اختيار الطاولة",
              effect: "يحدد الطاولة المستضيفة للحساب المدمج."
            },
            {
              name: "تأكيد الدمج",
              effect: "يدمج الحسابات المحددة في طلب واحد قيد التنفيذ."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "الأرباح والخسائر",
          steps: [
            "افتح الحسابات → الأرباح والخسائر.",
            "حدد نطاق التاريخ أو الفترة.",
            "وسّع مجموعات الحسابات.",
            "صدّر عند إغلاق الفترة."
          ],
          caption: "تبويب الأرباح والخسائر.",
          intro: "قائمة الدخل للفترة: الإيرادات وتكلفة المبيعات والمصروفات."
        },
        "cash-flow": {
          title: "التدفق النقدي",
          steps: [
            "افتح تبويب التدفق النقدي.",
            "استخدم نفس فترة البيانات الأخرى.",
            "راجع الرصيد الافتتاحي والتغير والختام.",
            "استخدمه مع الأرباح والخسائر لفروق النقد والاستحقاق."
          ],
          caption: "تبويب التدفق النقدي.",
          intro: "يلخص حركة النقد التشغيلية والاستثمارية والتمويلية."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "نموذج الموظف",
          steps: [
            "الموظفون → إضافة/تعديل.",
            "الرقم والاسم والتفاصيل.",
            "اربط POS والقسم والمنصب.",
            "احفظ."
          ],
          caption: "نافذة إنشاء/تعديل الموظف.",
          intro: "سجل HR يربط مستخدم POS والهيكل التنظيمي.",
          fields: [
            {
              name: "رقم الموظف",
              effect: "معرّف فريد في الجداول."
            },
            {
              name: "الاسم / العائلة",
              effect: "الاسم القانوني أو المفضل."
            },
            {
              name: "المستخدم المرتبط",
              effect: "تسجيل POS اختياري."
            },
            {
              name: "القسم",
              effect: "الوحدة التنظيمية."
            },
            {
              name: "المنصب",
              effect: "المسمى في الجداول."
            },
            {
              name: "مركز التكلفة",
              effect: "تخصيص العمالة الافتراضي."
            },
            {
              name: "المدير",
              effect: "خط الموافقات."
            },
            {
              name: "حالة التوظيف",
              effect: "نشط أو غير نشط أو منتهٍ أو إجازة أو موقوف."
            },
            {
              name: "نوع التوظيف",
              effect: "بالساعة أو راتب أو عقد إلخ."
            },
            {
              name: "تاريخ التعيين / الإنهاء",
              effect: "الأقدمية والأهلية."
            }
          ]
        },
        "department-form": {
          title: "نموذج القسم",
          steps: [
            "الأقسام أو إضافة مضمنة.",
            "الرمز والاسم والوصف.",
            "احفظ."
          ],
          caption: "نموذج القسم.",
          fields: [
            {
              name: "الرمز",
              effect: "معرّف قصير للتكاملات."
            },
            {
              name: "الاسم",
              effect: "الاسم في القوائم."
            },
            {
              name: "الوصف",
              effect: "ملاحظات اختيارية."
            },
            {
              name: "نشط",
              effect: "غير النشط مخفي في التعيينات الجديدة."
            }
          ]
        },
        "position-form": {
          title: "نموذج المنصب",
          steps: [
            "المناصب أو إضافة مضمنة.",
            "الرمز والاسم والقسم ومركز التكلفة.",
            "احفظ."
          ],
          caption: "نموذج المنصب.",
          fields: [
            {
              name: "الرمز",
              effect: "رمز الوظيفة للتصدير."
            },
            {
              name: "الاسم",
              effect: "المسمى في HR والجداول."
            },
            {
              name: "القسم",
              effect: "الوحدة الافتراضية."
            },
            {
              name: "مركز التكلفة الافتراضي",
              effect: "يُملأ مسبقاً في الجداول."
            },
            {
              name: "نشط",
              effect: "يُ retire المناصب غير المستخدمة."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "إدخال الحضور اليدوي",
          steps: [
            "الحضور → إدخال يدوي.",
            "الموظف وأوقات الدخول/الخروج.",
            "ملاحظات واحفظ."
          ],
          caption: "نافذة الحضور اليدوي.",
          intro: "يصحح البصمات الناقصة أو يكمل الوقت.",
          fields: [
            {
              name: "الموظف",
              effect: "صاحب السجل."
            },
            {
              name: "الدخول",
              effect: "بداية فترة العمل."
            },
            {
              name: "الخروج",
              effect: "النهاية بعد الدخول."
            },
            {
              name: "ملاحظات",
              effect: "سبب الإدخال اليدوي."
            }
          ]
        },
        "schedule-form": {
          title: "نموذج جدول العمل",
          steps: [
            "الجدولة → إضافة جدول.",
            "الاسم وبداية/نهاية الفترة.",
            "أضف ورديات أو أنشئ من قالب."
          ],
          caption: "نموذج جدول العمل.",
          intro: "نطاق تواريخ يحتوي ورديات مسودة أو منشورة.",
          fields: [
            {
              name: "الاسم",
              effect: "تسمية الفترة."
            },
            {
              name: "بداية الفترة",
              effect: "أول وقت مشمول."
            },
            {
              name: "نهاية الفترة",
              effect: "آخر وقت مشمول."
            }
          ]
        },
        "shift-form": {
          title: "نموذج الوردية المجدولة",
          intro: "يعيّن موظفاً لكتلة زمنية في جدول مسودة.",
          steps: [
            "مسودة → إضافة وردية.",
            "الجدول والموظف والأوقات.",
            "قالب/org اختياري.",
            "احفظ."
          ],
          caption: "نموذج الوردية.",
          fields: [
            {
              name: "جدول العمل",
              effect: "الأب يجب أن يكون مسودة."
            },
            {
              name: "الموظف",
              effect: "المعيّن للوردية."
            },
            {
              name: "قالب الوردية",
              effect: "Preset من Admin → Users → Shifts."
            },
            {
              name: "قسم / منصب / مركز تكلفة",
              effect: "تجاوز org."
            },
            {
              name: "البداية / النهاية",
              effect: "نافذة الوقت."
            }
          ]
        },
        "schedule-template": {
          title: "نموذج قالب الجدول",
          steps: [
            "الجدولة → القوالب.",
            "الاسم والأيام/الأوقات.",
            "قالب وردية اختياري.",
            "احفظ."
          ],
          caption: "نموذج القالب.",
          intro: "نمط أسبوعي قابل لإعادة الاستخدام.",
          fields: [
            {
              name: "الاسم",
              effect: "تسمية الإنشاء."
            },
            {
              name: "أيام الأسبوع",
              effect: "أيام الورديات."
            },
            {
              name: "وقت البداية/النهاية",
              effect: "نافذة يومية."
            },
            {
              name: "دقائق الاستراحة",
              effect: "استراحة غير مدفوعة."
            },
            {
              name: "قالب الوردية",
              effect: "تعريف POS."
            }
          ]
        },
        "schedule-generate": {
          title: "إنشاء جدول من قالب",
          steps: [
            "الجدولة → إنشاء.",
            "مسودة وقالب.",
            "حدد الموظفين.",
            "أنشئ."
          ],
          caption: "حوار الإنشاء.",
          fields: [
            {
              name: "جدول العمل",
              effect: "المسودة الهدف."
            },
            {
              name: "القالب",
              effect: "نمط أسبوعي."
            },
            {
              name: "الموظفون",
              effect: "يحصلون على نسخة الورديات."
            }
          ]
        },
        "schedule-swap": {
          title: "طلب تبديل الوردية",
          steps: [
            "الجدولة → طلب تبديل.",
            "الوردية والطالب.",
            "زميل مستهدف اختياري.",
            "إرسال."
          ],
          caption: "نموذج التبديل.",
          fields: [
            {
              name: "الوردية المجدولة",
              effect: "الوردية المراد تبديلها."
            },
            {
              name: "الموظف الطالب",
              effect: "يبدأ الطلب."
            },
            {
              name: "الموظف المستهدف",
              effect: "اختياري."
            },
            {
              name: "الوردية المقترحة",
              effect: "وردية مقابلة."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "نموذج طلب الإجازة",
          steps: [
            "الإجازات → إضافة طلب.",
            "الموظف والنوع والتواريخ.",
            "الأيام والسبب.",
            "احفظ."
          ],
          caption: "نموذج طلب الإجازة.",
          intro: "يقدّم طلبات الإجازة حسب الأنواع الم configured.",
          fields: [
            {
              name: "الموظف",
              effect: "طالب الإجازة."
            },
            {
              name: "نوع الإجازة",
              effect: "مدفوع/غير مدفوع والموافقة."
            },
            {
              name: "تاريخ البداية/النهاية",
              effect: "تواريخ شاملة."
            },
            {
              name: "الأيام",
              effect: "أيام العمل المستهلكة."
            },
            {
              name: "السبب",
              effect: "ملاحظة اختيارية."
            }
          ]
        },
        "holiday-form": {
          title: "نموذج العطلة الرسمية",
          steps: [
            "الإجازات → العطل.",
            "الاسم والتاريخ ورمز الدولة.",
            "متكرر إن كان سنوياً.",
            "احفظ."
          ],
          caption: "نموذج العطلة.",
          intro: "يتفاعل مع قواعد الأجر والجدولة.",
          fields: [
            {
              name: "الاسم",
              effect: "التسمية في التقويمات."
            },
            {
              name: "التاريخ",
              effect: "التاريخ المعتمد."
            },
            {
              name: "رمز الدولة",
              effect: "ISO اختياري."
            },
            {
              name: "متكرر",
              effect: "يتكرر سنوياً."
            },
            {
              name: "نشط",
              effect: "غير النشط يُ ignored في القواعد الجديدة."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "نموذج الطبق",
          steps: [
            "Admin → القوائم → الأطباق.",
            "الرقم والاسم والسعر والفئات.",
            "المعدّلات والوصفة والمطبخ.",
            "احفظ."
          ],
          caption: "نموذج صيانة الطبق.",
          intro: "أصناف قابلة للبيع مع السعر والفئات والمعدّلات والمطبخ.",
          fields: [
            {
              name: "الرقم / الاسم",
              effect: "معرّف POS والاسم المعروض."
            },
            {
              name: "السعر / التكلفة",
              effect: "سعر البيع والتكلفة النظرية."
            },
            {
              name: "الفئات",
              effect: "تجميع القائمة."
            },
            {
              name: "مجموعات المعدّلات",
              effect: "تدفق التخصيص."
            },
            {
              name: "أسطر الوصفة",
              effect: "استهلاك المخزون."
            },
            {
              name: "المطبخ / سير العمل",
              effect: "توجيه KOT."
            }
          ]
        },
        "menu-form": {
          title: "نموذج القائمة",
          steps: [
            "تبويب القوائم.",
            "الاسم والأوقات.",
            "نشط وينتهي اليوم التالي.",
            "احفظ."
          ],
          caption: "نموذج القائمة.",
          intro: "يحدّد الفئات على POS حسب الوقت.",
          fields: [
            {
              name: "الاسم",
              effect: "التسمية في مبدّل POS."
            },
            {
              name: "من / إلى",
              effect: "نافذة التوفر."
            },
            {
              name: "ينتهي اليوم التالي",
              effect: "خدمة بعد منتصف الليل."
            },
            {
              name: "نشط",
              effect: "غير النشط مخفي."
            }
          ]
        },
        "category-form": {
          title: "نموذج الفئة",
          steps: [
            "الفئات.",
            "الاسم والأولوية وإظهار في القائمة.",
            "احفظ."
          ],
          caption: "نموذج الفئة.",
          fields: [
            {
              name: "الاسم",
              effect: "عنوان الفئة على POS."
            },
            {
              name: "الأولوية",
              effect: "ترتيب الفرز."
            },
            {
              name: "إظهار في القائمة",
              effect: "يخفى إن أُوقف."
            }
          ]
        },
        "modifier-group-form": {
          title: "نموذج مجموعة المعدّلات",
          steps: [
            "مجموعات المعدّلات.",
            "الاسم والأولوية والأسعار.",
            "المجموعات التالية.",
            "احفظ."
          ],
          caption: "نموذج مجموعات متداخلة.",
          intro: "المعدّلات والأسعار والمجموعات المتداخلة.",
          fields: [
            {
              name: "الاسم / الأولوية",
              effect: "التسمية والترتيب."
            },
            {
              name: "المعدّل",
              effect: "خيار قابل للاختيار."
            },
            {
              name: "السعر",
              effect: "رسوم إضافية."
            },
            {
              name: "المجموعات التالية المسموحة",
              effect: "بعد الاختيار."
            },
            {
              name: "تجاوزات المجموعة التالية",
              effect: "إخفاء أو تغيير السعر."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "نموذج الطابق",
          steps: [
            "Admin → الطوابق.",
            "الاسم والأولوية والألوان.",
            "احفظ."
          ],
          caption: "نموذج الطابق.",
          fields: [
            {
              name: "الاسم",
              effect: "تسمية محدد الطابق."
            },
            {
              name: "الأولوية",
              effect: "ترتيب القائمة."
            },
            {
              name: "الخلفية / اللون",
              effect: "نمط البلاط الافتراضي."
            }
          ]
        },
        "table-form": {
          title: "نموذج الطاولة",
          steps: [
            "اختر الطابق.",
            "الرقم والاسم والألوان.",
            "قيود اختيارية.",
            "اسأل عن عدد الضيوف.",
            "احفظ."
          ],
          caption: "نموذج الطاولة.",
          intro: "تنتمي لطابق؛ قيود اختيارية.",
          fields: [
            {
              name: "الاسم / الرقم",
              effect: "التسمية على المخطط."
            },
            {
              name: "الطابق",
              effect: "المخطط الأب."
            },
            {
              name: "الأولوية",
              effect: "ترتيب الفرز."
            },
            {
              name: "الفئات / أنواع الطلب / الدفع",
              effect: "قيود اختيارية."
            },
            {
              name: "اسأل عن الضيوف",
              effect: "يطلب عدد الضيوف."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "نموذج قاعدة الخصم",
          steps: [
            "Admin → العروض → الخصومات.",
            "الفئة والنطاق والوضع.",
            "الأهداف والقيمة.",
            "احفظ."
          ],
          caption: "نموذج قاعدة الخصم.",
          intro: "14 فئة؛ النطاق item/category/cart/customer/floor.",
          fields: [
            {
              name: "الفئة",
              effect: "أحد 14 نوعاً."
            },
            {
              name: "النطاق",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "وضع التطبيق",
              effect: "manual, automatic, both."
            },
            {
              name: "الأهداف",
              effect: "العناصر/الفئات المؤهلة."
            },
            {
              name: "النوع (نسبة/ثابت)",
              effect: "min/max كنسبة أو مبلغ."
            },
            {
              name: "الحد الأدنى/الأقصى",
              effect: "النطاق المسموح."
            },
            {
              name: "الحد الأقصى",
              effect: "سقف الخصومات النسبية."
            },
            {
              name: "الأولوية",
              effect: "ترتيب القواعد التلقائية."
            },
            {
              name: "الحد الأدنى للطلب",
              effect: "المجموع الفرعي المطلوب."
            },
            {
              name: "وضع التراكم",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "المعاملة الضريبية",
              effect: "tax_before/after_discount إلخ."
            },
            {
              name: "الجداول",
              effect: "نوافذ اليوم/الوقت."
            },
            {
              name: "الشروط",
              effect: "Buy X Get Y."
            },
            {
              name: "يتطلب سبب/موافقة",
              effect: "PIN المدير يدوياً."
            }
          ]
        },
        "coupon-form": {
          title: "نموذج القسيمة",
          steps: [
            "العروض → القسائم.",
            "الرمز والنوع/القيمة والحدود.",
            "الأيام والتواريخ.",
            "احفظ."
          ],
          caption: "نموذج القسيمة.",
          fields: [
            {
              name: "الرمز",
              effect: "النص عند الدفع."
            },
            {
              name: "نوع القسيمة",
              effect: "استخدام واحد/متعدد."
            },
            {
              name: "نوع/قيمة الخصم",
              effect: "نسبة أو ثابت."
            },
            {
              name: "الحد الأدنى للطلب",
              effect: "المجموع الفرعي."
            },
            {
              name: "الحد الأقصى للخصم",
              effect: "سقف النسبة."
            },
            {
              name: "حد الاستخدام",
              effect: "إجمالي الاسترداد."
            },
            {
              name: "حد لكل مستخدم",
              effect: "لكل عميل."
            },
            {
              name: "الأيام/الأوقات الصالحة",
              effect: "قيود زمنية."
            },
            {
              name: "تاريخ البداية/النهاية",
              effect: "الصلاحية العامة."
            },
            {
              name: "قابل للتراكم / الطلب الأول فقط",
              effect: "قواعد الدمج."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "نموذج المطبخ",
          steps: [
            "Admin → المطبخ → المطابخ.",
            "الاسم والأولوية والطابعات والأطباق.",
            "احفظ."
          ],
          caption: "نموذج محطة المطبخ.",
          intro: "يوجّه الأطباق للطابعات ومواقع المخزون.",
          fields: [
            {
              name: "الاسم",
              effect: "التسمية على KOT وشاشة الطلبات."
            },
            {
              name: "الأولوية",
              effect: "الترتيب عند تطابق مطابخ."
            },
            {
              name: "الطابعات",
              effect: "أجهزة طباعة التذاكر."
            },
            {
              name: "البنود (الأطباق)",
              effect: "الأطباق الموجّهة."
            }
          ]
        },
        "workflow-form": {
          title: "نموذج سير العمل",
          steps: [
            "المطبخ → سير العمل.",
            "الاسم والمراحل.",
            "مطبخ لكل مرحلة.",
            "اربط بالأطباق."
          ],
          caption: "محرر مراحل سير العمل.",
          intro: "يربط مراحل المطبخ.",
          fields: [
            {
              name: "الاسم",
              effect: "المعرّف على الأطباق."
            },
            {
              name: "المراحل",
              effect: "خطوات مرتبة."
            },
            {
              name: "مطبخ المرحلة",
              effect: "المحطة لكل مرحلة."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "نموذج الطابعة",
          steps: [
            "Admin → الطباعة → الطابعات.",
            "الاسم والاتصال IP/USB.",
            "نوع إيصال/مطبخ/ملصق.",
            "احفظ."
          ],
          caption: "نموذج الطابعة.",
          fields: [
            {
              name: "الاسم",
              effect: "اسم ودي."
            },
            {
              name: "النوع",
              effect: "ملف إيصال/مطبخ/ملصق."
            },
            {
              name: "IP / المنفذ",
              effect: "اتصال شبكة ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "معرّفات USB."
            }
          ]
        },
        "print-setting-form": {
          title: "نموذج إعداد الطباعة",
          steps: [
            "إعدادات الطباعة.",
            "اختر نوع المهمة.",
            "الشعار والرأس/التذييل والضريبة والهوامش.",
            "احفظ."
          ],
          caption: "محرر القالب.",
          intro: "لكل نوع مهمة قالب خاص.",
          fields: [
            {
              name: "إظهار الشعار",
              effect: "الشعار على التذكرة."
            },
            {
              name: "أقسام الرأس/التذييل",
              effect: "كتل نص/صورة."
            },
            {
              name: "اسم/رقم VAT",
              effect: "كتلة ضريبية."
            },
            {
              name: "الهوامش",
              effect: "تباعد بالنقاط."
            },
            {
              name: "أعمدة البند",
              effect: "الرقم والاسم والكمية والسعر والإجمالي."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "نموذج نوع الدفع",
          steps: [
            "Admin → المدفوعات → الأنواع.",
            "الاسم والأولوية والنوع.",
            "Remote: البوابة والوضع والمفاتيح.",
            "احفظ."
          ],
          caption: "نموذج بوابة Remote.",
          intro: "محلي وRemote مع Stripe وPayPal.",
          fields: [
            {
              name: "الاسم",
              effect: "تسمية أزرار الدفع."
            },
            {
              name: "الأولوية",
              effect: "الترتيب."
            },
            {
              name: "النوع",
              effect: "Remote يفعّل حقول البوابة."
            },
            {
              name: "مزود البوابة",
              effect: "Stripe أو PayPal."
            },
            {
              name: "وضع البوابة",
              effect: "test مقابل live."
            },
            {
              name: "public_key",
              effect: "مفتاح العميل القابل للنشر."
            },
            {
              name: "secret_key",
              effect: "سر الخادم لتحصيل المدفوعات."
            },
            {
              name: "webhook_secret",
              effect: "يتحقق من callbacks."
            },
            {
              name: "client_id / client_secret",
              effect: "بوابات OAuth."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "حقول التاجر."
            },
            {
              name: "الضريبة",
              effect: "قاعدة ضريبية افتراضية."
            },
            {
              name: "الخصومات",
              effect: "قواعد تطبق تلقائياً."
            }
          ]
        },
        "tax-form": {
          title: "نموذج الضريبة",
          steps: [
            "المدفوعات → الضرائب.",
            "الاسم والنسبة inclusive/exclusive.",
            "احفظ."
          ],
          caption: "نموذج الضريبة.",
          fields: [
            {
              name: "الاسم",
              effect: "تسمية الإيصال."
            },
            {
              name: "النسبة",
              effect: "نسبة المبالغ الخاضعة."
            },
            {
              name: "Inclusive",
              effect: "إن true تُضمّن في السعر."
            }
          ]
        },
        "order-type-form": {
          title: "نموذج نوع الطلب",
          steps: [
            "المدفوعات → أنواع الطلب.",
            "الاسم والأعلام.",
            "احفظ."
          ],
          caption: "نموذج نوع الطلب.",
          fields: [
            {
              name: "الاسم",
              effect: "النوع على الحسابات."
            },
            {
              name: "الأولوية",
              effect: "ترتيب المحددات."
            },
            {
              name: "افتراضي",
              effect: "محدّد مسبقاً للطلبات الجديدة."
            }
          ]
        },
        "extra-form": {
          title: "نموذج الإضافة (رسوم الخدمة)",
          steps: [
            "المدفوعات → الإضافات.",
            "الاسم والمبلغ/النسبة.",
            "قواعد التطبيق.",
            "احفظ."
          ],
          caption: "نموذج الرسوم الإضافية.",
          intro: "يضيف رسوماً تلقائية.",
          fields: [
            {
              name: "الاسم",
              effect: "التسمية على إيصال الضيف."
            },
            {
              name: "المبلغ / النسبة",
              effect: "ثابت أو نسبة."
            },
            {
              name: "خاضع للضريبة",
              effect: "هل تُحسب ضريبة على الرسوم."
            },
            {
              name: "قواعد التطبيق التلقائي",
              effect: "أنواع الطلب/الدفع."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "نموذج المستخدم",
          steps: [
            "Admin → المستخدمون.",
            "طريقة الدخول والاسم والبيانات والدور والوردية.",
            "إنشاء موظف اختياري.",
            "احفظ."
          ],
          caption: "نموذج حساب المستخدم.",
          intro: "مشغلو POS يسجلون الدخول بـ PIN أو كلمة مرور.",
          fields: [
            {
              name: "طريقة الدخول",
              effect: "PIN (4 أرقام) أو كلمة مرور."
            },
            {
              name: "الاسم / العائلة",
              effect: "الاسم على الحسابات."
            },
            {
              name: "Login / PIN",
              effect: "بيانات الدخول."
            },
            {
              name: "كلمة المرور",
              effect: "إلزامية عند كلمة المرور."
            },
            {
              name: "دور المستخدم",
              effect: "حزمة الصلاحيات."
            },
            {
              name: "وردية المستخدم",
              effect: "الوردية الافتراضية."
            },
            {
              name: "إنشاء موظف",
              effect: "ينشئ موظف HR مرتبطاً."
            }
          ]
        },
        "role-form": {
          title: "نموذج الدور",
          steps: [
            "المستخدمون → الأدوار.",
            "الاسم وشجرة الوحدات.",
            "حدّد الصلاحيات.",
            "احفظ."
          ],
          caption: "محرر صلاحيات الدور.",
          intro: "يمنح الوصول للوحدات والإجراءات.",
          fields: [
            {
              name: "الاسم",
              effect: "التسمية في نموذج المستخدم."
            },
            {
              name: "صلاحيات الوحدة",
              effect: "مربعات اختيار هرمية."
            }
          ]
        },
        "shift-form": {
          title: "نموذج قالب الوردية",
          steps: [
            "المستخدمون → الورديات.",
            "الاسم وأوقات البداية/النهاية.",
            "الليلي يفعّل اليوم التالي.",
            "احفظ."
          ],
          caption: "نموذج قالب الوردية.",
          intro: "يحدّد نوافذ الوقت للورديات.",
          fields: [
            {
              name: "الاسم",
              effect: "تسمية الوردية."
            },
            {
              name: "وقت البداية",
              effect: "بداية مجدولة."
            },
            {
              name: "وقت النهاية",
              effect: "نهاية مجدولة."
            }
          ]
        },
        "tips-definition": {
          title: "تعريف الإكراميات (التوزيع)",
          steps: [
            "المستخدمون → تعريف الإكراميات.",
            "صفوف الأدوار بالأوزان.",
            "تجاوزات المستخدم.",
            "احفظ."
          ],
          caption: "لوحة توزيع الإكراميات.",
          intro: "يضبط أوزان الإكراميات المجمّعة حسب الأدوار والمستخدمين.",
          fields: [
            {
              name: "وزن الدور",
              effect: "حصة المجموعة لكل دور."
            },
            {
              name: "وزن المستخدم",
              effect: "تجاوز اختياري."
            }
          ]
        }
      }
    }
  },
  ru: {
    "inventory-reconciliation": {
      sections: {
        reconciliation: {
          title: "Вкладка Сверка",
          steps: [
            "Склад → Сверка кухни.",
            "Выберите локацию и рабочую дату.",
            "Нажмите Сформировать.",
            "Введите факт или импортируйте CSV.",
            "Черновик, проверьте отклонения, Подтвердить."
          ],
          caption: "Панель, сетка и блок отклонений.",
          intro: "Сформируйте сетку из продаж POS и рецептов; введите или импортируйте факт.",
          fields: [
            {
              name: "Локация",
              effect: "Кухня или склад сверки."
            },
            {
              name: "Рабочая дата",
              effect: "Торговый день теории и подсчётов."
            },
            {
              name: "Сформировать",
              effect: "Строки из продаж и рецептов."
            },
            {
              name: "Фактическое кол-во",
              effect: "Физический подсчёт по позиции."
            },
            {
              name: "Подтвердить",
              effect: "Блокирует после одобрения менеджера."
            }
          ]
        },
        "reconciliation-form": {
          title: "Ручной ввод подсчёта",
          steps: [
            "Клик по ячейке Факт для ввода.",
            "Сохранить черновик без подтверждения.",
            "CSV для массовой загрузки.",
            "Проверьте отклонения перед подтверждением."
          ],
          caption: "Сетка с редактированием факта.",
          intro: "Редактирование сетки и CSV-импорт используют одну структуру строк.",
          fields: [
            {
              name: "Позиция",
              effect: "Складская позиция строки."
            },
            {
              name: "Теория",
              effect: "Расчётный расход из рецептов и продаж."
            },
            {
              name: "Факт",
              effect: "Введённое количество."
            },
            {
              name: "Отклонение",
              effect: "Разница факт vs теория."
            },
            {
              name: "Примечания",
              effect: "Необязательное пояснение."
            }
          ]
        }
      },
      title: "Сверка кухни",
      intro: "Сравните теоретический расход с фактическими подсчётами по локации и дате."
    },
    "inventory-production": {
      sections: {
        recipes: {
          title: "Список рецептов",
          steps: [
            "Склад → Рецепты.",
            "Просмотрите активные рецепты.",
            "Добавьте или измените рецепты."
          ],
          caption: "Вкладка обслуживания рецептов."
        },
        "recipe-form": {
          title: "Форма рецепта",
          steps: [
            "Добавить или изменить рецепт.",
            "Имя, код и базовое qty партии.",
            "Строки входов и выходов.",
            "Сохранить."
          ],
          caption: "Форма входов и выходов.",
          intro: "Задаёт входы, выходы и распределение себестоимости.",
          fields: [
            {
              name: "Имя",
              effect: "Отображаемое имя в производстве."
            },
            {
              name: "Код",
              effect: "Необязательный короткий код."
            },
            {
              name: "Базовое qty партии",
              effect: "Стандартный размер партии."
            },
            {
              name: "Распределение cost",
              effect: "Метод распределения cost входов."
            },
            {
              name: "Входы",
              effect: "Потребляемые позиции на партию."
            },
            {
              name: "Выходы",
              effect: "Производимые с yield %."
            },
            {
              name: "Активен",
              effect: "Неактивные скрыты в новых запусках."
            }
          ]
        },
        production: {
          title: "Запуски производства",
          steps: [
            "Вкладка Производство.",
            "Новая партия из активного рецепта.",
            "Предпросмотр и завершение."
          ],
          caption: "Вкладка производства."
        },
        "production-form": {
          title: "Форма партии производства",
          steps: [
            "Новое производство.",
            "Рецепт, локация, qty.",
            "Предпросмотр и завершение."
          ],
          caption: "Форма партии с preview.",
          intro: "При завершении списывает входы и добавляет выходы на локации.",
          fields: [
            {
              name: "Рецепт",
              effect: "Определяет ингредиенты и выходы."
            },
            {
              name: "Локация",
              effect: "Склад потребления/производства."
            },
            {
              name: "Произведено qty",
              effect: "Масштабирует от базовой партии."
            },
            {
              name: "Номер партии",
              effect: "Необязательная ссылка."
            },
            {
              name: "Обновить cost позиции",
              effect: "Пересчитывает cost выхода."
            },
            {
              name: "Примечания",
              effect: "Свободная заметка."
            }
          ]
        },
        "production-history": {
          title: "История производства",
          steps: [
            "Аудит завершённых партий.",
            "Фильтр по дате/рецепту/локации.",
            "Откройте строку для деталей."
          ],
          caption: "Список истории."
        }
      },
      title: "Рецепты и производство",
      intro: "Задайте рецепты партий, запускайте производство и просматривайте историю."
    },
    "inventory-buffet": {
      sections: {
        "buffet-menus": {
          title: "Меню шведского стола",
          steps: [
            "Склад → Buffet → Меню.",
            "Шаблоны завтрак/обед/ужин.",
            "Рецепты на гостя."
          ],
          caption: "Список меню."
        },
        "buffet-menu-form": {
          title: "Форма меню buffet",
          steps: [
            "Добавить/изменить меню.",
            "Тип сессии и строки рецепта.",
            "Сохранить."
          ],
          caption: "Форма меню buffet.",
          fields: [
            {
              name: "Имя",
              effect: "Метка при старте сессии."
            },
            {
              name: "Код",
              effect: "Необяз. код кухни."
            },
            {
              name: "Тип сессии",
              effect: "Завтрак/обед/ужин."
            },
            {
              name: "Строки рецепта",
              effect: "Рецепт и qty на гостя."
            },
            {
              name: "Активен",
              effect: "Только активные меню."
            }
          ]
        },
        "buffet-sessions": {
          title: "Сессии buffet",
          steps: [
            "Buffet → Сессии.",
            "Старт из меню.",
            "Мониторинг производства vs прогноз.",
            "Закрыть сессию."
          ],
          caption: "Панель сессий buffet."
        },
        "buffet-session-form": {
          title: "Старт сессии buffet",
          steps: [
            "Новая сессия.",
            "Меню, локация, дата, тип.",
            "Гости и цена.",
            "Сохранить."
          ],
          caption: "Форма новой сессии.",
          fields: [
            {
              name: "Меню",
              effect: "Загружает строки и прогнозы."
            },
            {
              name: "Локация",
              effect: "Склад движений."
            },
            {
              name: "Рабочая дата",
              effect: "Торговый день."
            },
            {
              name: "Тип сессии",
              effect: "Согласован с меню."
            },
            {
              name: "Ожидаемые гости",
              effect: "Начальные прогнозы."
            },
            {
              name: "Цена buffet",
              effect: "Выручка на гостя."
            }
          ]
        }
      },
      title: "Меню и сессии шведского стола",
      intro: "Планируйте рецепты на гостя и ведите сессии шведского стола."
    },
    "hr-cost-centers": {
      sections: {
        "cost-centers": {
          title: "Список центров затрат",
          steps: [
            "HR → Центры затрат.",
            "Проверьте коды.",
            "Добавить/изменить."
          ],
          caption: "Вкладка центров затрат."
        },
        "cost-center-form": {
          title: "Форма центра затрат",
          steps: [
            "Добавить/изменить.",
            "Код, имя, описание.",
            "Активен/неактивен.",
            "Сохранить."
          ],
          caption: "Модальное окно центра затрат.",
          fields: [
            {
              name: "Код",
              effect: "Уникальный короткий id."
            },
            {
              name: "Имя",
              effect: "Метка в списках."
            },
            {
              name: "Описание",
              effect: "Необяз. заметки."
            },
            {
              name: "Активен",
              effect: "Неактивные недоступны в новых записях."
            }
          ]
        }
      },
      title: "Центры затрат",
      intro: "Метки труда и зарплаты для площадок и отделов."
    },
    "hr-pay": {
      sections: {
        "pay-profiles": {
          title: "Профили оплаты",
          steps: [
            "HR → Оплата → Профили.",
            "Базовая ставка на сотрудника.",
            "Питает расчёт зарплаты."
          ],
          caption: "Список профилей."
        },
        "pay-profile-form": {
          title: "Форма профиля оплаты",
          steps: [
            "Добавить/изменить профиль.",
            "Тип и базовая ставка.",
            "Сохранить."
          ],
          caption: "Форма профиля оплаты.",
          fields: [
            {
              name: "Сотрудник",
              effect: "Получает эту базовую компенсацию."
            },
            {
              name: "Тип оплаты",
              effect: "Почасовая, оклад, контракт, комиссия или смешанная."
            },
            {
              name: "Базовая ставка",
              effect: "Основная ставка или оклад."
            },
            {
              name: "Валюта",
              effect: "ISO валюта."
            },
            {
              name: "Действует с",
              effect: "Первый день профиля."
            },
            {
              name: "Действует до",
              effect: "Необяз. окончание."
            }
          ]
        },
        "pay-rules": {
          title: "Правила оплаты",
          steps: [
            "Оплата → Правила.",
            "Стек по приоритету.",
            "Фильтры сотрудник/отдел."
          ],
          caption: "Список правил оплаты."
        },
        "pay-rule-form": {
          title: "Форма правила оплаты",
          steps: [
            "Добавить правило.",
            "Задать эффекты.",
            "Фильтры дата/время.",
            "Назначить сотрудников.",
            "Сохранить."
          ],
          caption: "Форма правила.",
          intro: "Эффекты и фильтры eligibility.",
          fields: [
            {
              name: "Код",
              effect: "Уникальный id."
            },
            {
              name: "Имя",
              effect: "Метка в admin."
            },
            {
              name: "Приоритет",
              effect: "Порядок stacking."
            },
            {
              name: "Режим stacking",
              effect: "Взаимодействие правил."
            },
            {
              name: "Эффекты",
              effect: "Множители или суммы."
            },
            {
              name: "Фильтры сотрудник/отдел/должность/центр затрат",
              effect: "Ограничивает охват."
            },
            {
              name: "Окно дата/время",
              effect: "Необяз. диапазон."
            },
            {
              name: "Дни недели / месяцы",
              effect: "Календарные шаблоны."
            },
            {
              name: "Праздники",
              effect: "Выбранные праздники."
            },
            {
              name: "Сверхурочные (день/неделя)",
              effect: "При превышении порогов."
            }
          ]
        }
      },
      title: "Профили и правила оплаты",
      intro: "Базовые ставки и правила надбавок и удержаний."
    },
    "hr-payroll": {
      sections: {
        "payroll-periods": {
          title: "Периоды зарплаты",
          steps: [
            "HR → Зарплата → Периоды.",
            "Создайте периоды цикла.",
            "Заблокируйте перед финалом."
          ],
          caption: "Список периодов."
        },
        "payroll-period-form": {
          title: "Форма периода зарплаты",
          steps: [
            "Имя, тип, даты.",
            "Статус Open.",
            "Смените на Locked/Closed/Paid."
          ],
          caption: "Форма периода.",
          fields: [
            {
              name: "Имя периода",
              effect: "Метка в runs и экспорте."
            },
            {
              name: "Тип периода",
              effect: "Weekly, biweekly, monthly или custom."
            },
            {
              name: "Дата начала",
              effect: "Первый включённый день."
            },
            {
              name: "Дата окончания",
              effect: "Последний включённый день."
            },
            {
              name: "Статус",
              effect: "Open разрешает правки; locked ограничивает."
            }
          ]
        },
        "payroll-runs": {
          title: "Прогоны зарплаты",
          steps: [
            "Зарплата → Runs.",
            "Сгенерируйте preview.",
            "Проверьте snapshots."
          ],
          caption: "Runs периода."
        },
        "payroll-run-form": {
          title: "Создать прогон зарплаты",
          steps: [
            "Новый run.",
            "Открытый период.",
            "Сгенерировать preview."
          ],
          caption: "Форма нового run.",
          fields: [
            {
              name: "Период зарплаты",
              effect: "Определяет часы и adjustments."
            },
            {
              name: "Номер run",
              effect: "Последовательный id в периоде."
            }
          ]
        },
        adjustments: {
          title: "Корректировки зарплаты",
          steps: [
            "Зарплата → Adjustments.",
            "Добавьте бонусы/штрафы.",
            "Привяжите к периоду."
          ],
          caption: "Список adjustments."
        },
        "adjustment-form": {
          title: "Форма adjustment",
          steps: [
            "Сотрудник, тип, сумма, дата.",
            "Необяз. период.",
            "Сохранить."
          ],
          caption: "Форма payroll adjustment.",
          fields: [
            {
              name: "Сотрудник",
              effect: "Получает adjustment."
            },
            {
              name: "Период зарплаты",
              effect: "Необяз. связь с run."
            },
            {
              name: "Тип",
              effect: "Bonus, penalty, allowance, reimbursement, advance, loan, correction или deduction."
            },
            {
              name: "Сумма",
              effect: "Значение к gross."
            },
            {
              name: "Effective date",
              effect: "Определяет run."
            },
            {
              name: "Описание",
              effect: "Деталь payslip и audit."
            }
          ]
        }
      },
      title: "Периоды и прогоны зарплаты",
      intro: "Закрывайте периоды, создавайте прогоны с предпросмотром."
    },
    "hr-documents": {
      sections: {
        documents: {
          title: "Список документов",
          steps: [
            "HR → Documents.",
            "Фильтр сотрудник/категория.",
            "Загрузить или обновить."
          ],
          caption: "Вкладка документов."
        },
        "document-form": {
          title: "Форма документа",
          steps: [
            "Добавить документ.",
            "Сотрудник, заголовок, категория.",
            "Прикрепить файл и срок.",
            "Сохранить."
          ],
          caption: "Форма загрузки документа.",
          fields: [
            {
              name: "Сотрудник",
              effect: "Владелец записи."
            },
            {
              name: "Заголовок",
              effect: "Имя в списках."
            },
            {
              name: "Категория",
              effect: "Contract, certificate, license, ID, medical, warning или other."
            },
            {
              name: "Истекает",
              effect: "Необяз. дата напоминаний."
            },
            {
              name: "Прикрепить файл",
              effect: "Обязательно при создании."
            }
          ]
        }
      },
      title: "Документы сотрудника",
      intro: "Храните договоры, удостоверения и лицензии со сроками."
    },
    "hr-performance": {
      sections: {
        performance: {
          title: "Список performance",
          steps: [
            "HR → Performance.",
            "Просмотр по сотруднику/типу.",
            "Добавляйте после инцидентов."
          ],
          caption: "Вкладка заметок."
        },
        "performance-form": {
          title: "Форма заметки performance",
          steps: [
            "Сотрудник, тип, заголовок, текст.",
            "Severity при необходимости.",
            "Visible to employee.",
            "Сохранить."
          ],
          caption: "Форма performance note.",
          fields: [
            {
              name: "Сотрудник",
              effect: "Субъект заметки."
            },
            {
              name: "Тип",
              effect: "Warning, compliment, review или incident."
            },
            {
              name: "Заголовок",
              effect: "Краткое резюме."
            },
            {
              name: "Содержание",
              effect: "Полный текст."
            },
            {
              name: "Severity",
              effect: "Low, medium, high или critical."
            },
            {
              name: "Visible to employee",
              effect: "Может показываться сотруднику."
            }
          ]
        }
      },
      title: "Заметки об эффективности",
      intro: "Фиксируйте предупреждения, похвалу и инциденты."
    },
    orders: {
      sections: {
        "cancel-void": {
          title: "Отмена или void заказа",
          steps: [
            "Откройте ⋯ на карточке In Progress и выберите Отменить заказ.",
            "Выберите причину void (обязательна для отчётов).",
            "Оставьте Выбрать все для полного void или снимите и выберите строки.",
            "Подтвердите void и освобождение стола при необходимости."
          ],
          caption: "Модальное окно отмены с причиной и выбором позиций.",
          intro: "Аннулирует чек In Progress. Полный void отменяет все строки; частичный — только выбранные.",
          fields: [
            {
              name: "Причина",
              effect: "Обязательная причина void для аудита и отчётов."
            },
            {
              name: "Выбрать все позиции",
              effect: "Отмечено — void всего чека; снято — выбор по строкам."
            },
            {
              name: "Частичный void",
              effect: "Void только выбранных количеств, остальное остаётся открытым."
            }
          ]
        },
        refund: {
          title: "Возврат оплаченного заказа",
          steps: [
            "Откройте оплаченный заказ и выберите Возврат.",
            "Выберите строки и количества.",
            "Укажите причину и подтвердите.",
            "Система проводит возврат и обновляет итоги оплаты."
          ],
          caption: "Модальное окно возврата с выбором позиций.",
          intro: "Оформляет возврат по оплаченному чеку, опционально по выбранным позициям.",
          fields: [
            {
              name: "Позиции к возврату",
              effect: "Оплаченные строки и количества, возвращаемые клиенту."
            },
            {
              name: "Причина",
              effect: "Документирует возврат для менеджера и отчётов."
            }
          ]
        },
        "split-seats": {
          title: "Разделить по местам",
          steps: [
            "В ⋯ выберите Разделить по местам.",
            "Проверьте группировку по местам.",
            "Подтвердите — дочерний чек на каждое место."
          ],
          caption: "Предпросмотр разделения по местам.",
          intro: "Делит чек на отдельные по номеру места на строках."
        },
        "split-items": {
          title: "Разделить по позициям",
          steps: [
            "В ⋯ выберите Разделить по позициям.",
            "Переместите каждую строку в новую колонку.",
            "Подтвердите для отдельных чеков In Progress."
          ],
          caption: "Сетка назначения позиций.",
          intro: "Вручную назначает строки новым чекам независимо от места."
        },
        "split-amount": {
          title: "Разделить по сумме",
          steps: [
            "В ⋯ выберите Разделить по сумме.",
            "Укажите число частей или суммы.",
            "Подтвердите — дочерние чеки на каждую долю."
          ],
          caption: "Диалог разделения по сумме.",
          intro: "Делит итог на фиксированные или равные части."
        },
        merge: {
          title: "Объединить заказы",
          steps: [
            "На первом заказе ⋯ → Объединить.",
            "Повторите для каждого дополнительного.",
            "Нажмите Выбрать стол и укажите стол.",
            "Подтвердите объединение."
          ],
          caption: "Панель объединения с выбором стола.",
          intro: "Объединяет несколько чеков In Progress на одном столе.",
          fields: [
            {
              name: "Выбрать заказы",
              effect: "Отмечает заказ для pending merge."
            },
            {
              name: "Выбрать стол",
              effect: "Задаёт стол для объединённого чека."
            },
            {
              name: "Подтвердить объединение",
              effect: "Объединяет выбранные чеки в один In Progress."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Прибыли и убытки",
          steps: [
            "Откройте Счета → P&L.",
            "Задайте диапазон или период.",
            "Разверните группы счетов.",
            "Экспортируйте после закрытия периода."
          ],
          caption: "Вкладка P&L.",
          intro: "Отчёт о прибылях и убытках за период: выручка, себестоимость и расходы."
        },
        "cash-flow": {
          title: "Движение денежных средств",
          steps: [
            "Откройте вкладку Cash flow в Счетах.",
            "Выберите тот же период, что и для других отчётов.",
            "Проверьте opening, net change и closing cash.",
            "Используйте вместе с P&L для cash vs. accrual."
          ],
          caption: "Вкладка cash flow.",
          intro: "Сводка операционных, инвестиционных и финансовых потоков за период."
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Форма сотрудника",
          steps: [
            "Сотрудники → Добавить/изменить.",
            "Номер, имя, детали.",
            "Связать POS, отдел, должность.",
            "Сохранить."
          ],
          caption: "Модальное окно сотрудника.",
          intro: "HR-запись с POS-пользователем и оргструктурой.",
          fields: [
            {
              name: "Номер сотрудника",
              effect: "Уникальный id в расписаниях."
            },
            {
              name: "Имя / фамилия",
              effect: "Юридическое или предпочитаемое имя."
            },
            {
              name: "Связанный пользователь",
              effect: "Необяз. POS login."
            },
            {
              name: "Отдел",
              effect: "Org unit."
            },
            {
              name: "Должность",
              effect: "Title в расписаниях."
            },
            {
              name: "Центр затрат",
              effect: "Default allocation труда."
            },
            {
              name: "Менеджер",
              effect: "Линия approvals."
            },
            {
              name: "Статус employment",
              effect: "Active, inactive, terminated, on leave или suspended."
            },
            {
              name: "Тип employment",
              effect: "Hourly, salary, contract и т.д."
            },
            {
              name: "Дата найма / увольнения",
              effect: "Tenure и eligibility."
            }
          ]
        },
        "department-form": {
          title: "Форма отдела",
          steps: [
            "Отделы или inline.",
            "Код, имя, описание.",
            "Сохранить."
          ],
          caption: "Форма отдела.",
          fields: [
            {
              name: "Код",
              effect: "Короткий id для интеграций."
            },
            {
              name: "Имя",
              effect: "Отображаемое имя."
            },
            {
              name: "Описание",
              effect: "Необяз. заметки."
            },
            {
              name: "Активен",
              effect: "Неактивные скрыты в новых назначениях."
            }
          ]
        },
        "position-form": {
          title: "Форма должности",
          steps: [
            "Должности или inline.",
            "Код, имя, отдел, центр затрат.",
            "Сохранить."
          ],
          caption: "Форма должности.",
          fields: [
            {
              name: "Код",
              effect: "Job code для payroll export."
            },
            {
              name: "Имя",
              effect: "Title в HR и расписаниях."
            },
            {
              name: "Отдел",
              effect: "Default org unit."
            },
            {
              name: "Default cost center",
              effect: "Prefill в расписаниях."
            },
            {
              name: "Активен",
              effect: "Retire неиспользуемые titles."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Ручной ввод attendance",
          steps: [
            "Attendance → Manual entry.",
            "Сотрудник и clock in/out.",
            "Notes и сохранить."
          ],
          caption: "Модальное окно manual attendance.",
          intro: "Исправляет пропущенные punches или дополняет время.",
          fields: [
            {
              name: "Сотрудник",
              effect: "Чей record создаётся."
            },
            {
              name: "Clock in",
              effect: "Начало интервала."
            },
            {
              name: "Clock out",
              effect: "Конец после clock in."
            },
            {
              name: "Примечания",
              effect: "Причина manual entry."
            }
          ]
        },
        "schedule-form": {
          title: "Форма work schedule",
          steps: [
            "Scheduling → add schedule.",
            "Name, period start/end.",
            "Add shifts or generate from template."
          ],
          caption: "Форма work schedule.",
          intro: "Именованный диапазон дат с draft или published shifts.",
          fields: [
            {
              name: "Name",
              effect: "Метка периода (напр. Week 12)."
            },
            {
              name: "Period start",
              effect: "Первый datetime."
            },
            {
              name: "Period end",
              effect: "Последний datetime."
            }
          ]
        },
        "shift-form": {
          title: "Форма запланированной смены",
          intro: "Назначает сотрудника на блок времени в черновом расписании.",
          steps: [
            "В черновике нажмите Добавить смену.",
            "Выберите расписание, сотрудника и время начала/окончания.",
            "Опционально шаблон смены, отдел, должность и центр затрат.",
            "Сохраните — предупреждает о конфликтах."
          ],
          caption: "Форма запланированной смены.",
          fields: [
            {
              name: "Рабочее расписание",
              effect: "Родительское расписание должно быть черновиком."
            },
            {
              name: "Сотрудник",
              effect: "Персонал, назначенный на смену."
            },
            {
              name: "Шаблон смены",
              effect: "Опциональный preset из Admin → Users → Shifts."
            },
            {
              name: "Отдел / должность / центр затрат",
              effect: "Переопределение org-тегов для этой смены."
            },
            {
              name: "Начало / окончание",
              effect: "Запланированное окно времени."
            }
          ]
        },
        "schedule-template": {
          title: "Форма schedule template",
          steps: [
            "Scheduling → Templates.",
            "Name and weekdays/times.",
            "Shift template optional.",
            "Save."
          ],
          caption: "Schedule template form.",
          intro: "Reusable weekly pattern.",
          fields: [
            {
              name: "Name",
              effect: "Label in generate dialog."
            },
            {
              name: "Days of week",
              effect: "Weekdays with shifts."
            },
            {
              name: "Start / end time",
              effect: "Daily window."
            },
            {
              name: "Break minutes",
              effect: "Unpaid break subtracted."
            },
            {
              name: "Shift template",
              effect: "Links POS shift definition."
            }
          ]
        },
        "schedule-generate": {
          title: "Generate schedule from template",
          steps: [
            "Scheduling → Generate.",
            "Draft schedule and template.",
            "Multi-select employees.",
            "Generate."
          ],
          caption: "Generate schedule dialog.",
          fields: [
            {
              name: "Work schedule",
              effect: "Target draft."
            },
            {
              name: "Template",
              effect: "Weekly pattern."
            },
            {
              name: "Employees",
              effect: "Staff receiving template shifts."
            }
          ]
        },
        "schedule-swap": {
          title: "Shift swap request",
          steps: [
            "Scheduling → Request swap.",
            "Scheduled shift and requester.",
            "Target employee optional.",
            "Submit."
          ],
          caption: "Shift swap form.",
          fields: [
            {
              name: "Scheduled shift",
              effect: "Shift to give up/exchange."
            },
            {
              name: "Requesting employee",
              effect: "Initiates swap."
            },
            {
              name: "Target employee",
              effect: "Optional coworker."
            },
            {
              name: "Proposed shift",
              effect: "Optional counter-shift."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-form": {
          title: "Leave request form",
          steps: [
            "Leave → Add request.",
            "Employee, type, dates.",
            "Days and reason.",
            "Save."
          ],
          caption: "Leave request form.",
          intro: "Submit/edit time-off per leave types.",
          fields: [
            {
              name: "Employee",
              effect: "Requesting staff."
            },
            {
              name: "Leave type",
              effect: "Paid/unpaid and approval rules."
            },
            {
              name: "Start / end date",
              effect: "Inclusive absence dates."
            },
            {
              name: "Days",
              effect: "Working days consumed."
            },
            {
              name: "Reason",
              effect: "Optional note for approvers."
            }
          ]
        },
        "holiday-form": {
          title: "Public holiday form",
          steps: [
            "Leave → Holidays.",
            "Name, date, country code.",
            "Recurring for annual dates.",
            "Save."
          ],
          caption: "Public holiday form.",
          intro: "Interact with pay rules and scheduling.",
          fields: [
            {
              name: "Name",
              effect: "Label in calendars and rules."
            },
            {
              name: "Date",
              effect: "Observed calendar date."
            },
            {
              name: "Country code",
              effect: "Optional ISO for multi-country."
            },
            {
              name: "Is recurring",
              effect: "Repeats every year."
            },
            {
              name: "Is active",
              effect: "Inactive ignored by new rules."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Форма блюда",
          steps: [
            "Admin → Menus → Dishes.",
            "Number, name, price, categories.",
            "Modifiers, recipe, kitchen.",
            "Save."
          ],
          caption: "Dish maintenance form.",
          intro: "Sellable items с price, categories, modifiers, kitchen.",
          fields: [
            {
              name: "Number / name",
              effect: "POS id и display name."
            },
            {
              name: "Price / cost",
              effect: "Selling price и food cost."
            },
            {
              name: "Categories",
              effect: "Menu grouping."
            },
            {
              name: "Modifier groups",
              effect: "Customization flow."
            },
            {
              name: "Recipe lines",
              effect: "Inventory depletion."
            },
            {
              name: "Kitchen / workflow",
              effect: "KOT routing."
            }
          ]
        },
        "menu-form": {
          title: "Menu form",
          steps: [
            "Menus tab.",
            "Name and times.",
            "Active and ends next day.",
            "Save."
          ],
          caption: "Menu form.",
          intro: "Time-boxes categories on POS.",
          fields: [
            {
              name: "Name",
              effect: "POS switcher label."
            },
            {
              name: "Start / end time",
              effect: "Availability window."
            },
            {
              name: "Ends on next day",
              effect: "Overnight service."
            },
            {
              name: "Active",
              effect: "Inactive hidden from POS."
            }
          ]
        },
        "category-form": {
          title: "Category form",
          steps: [
            "Categories.",
            "Name, priority, show in menu.",
            "Save."
          ],
          caption: "Category form.",
          fields: [
            {
              name: "Name",
              effect: "Category header on POS."
            },
            {
              name: "Priority",
              effect: "Sort order."
            },
            {
              name: "Show in menu",
              effect: "Hidden when off."
            }
          ]
        },
        "modifier-group-form": {
          title: "Modifier group form",
          steps: [
            "Modifier groups.",
            "Name, priority, prices.",
            "Next groups.",
            "Save."
          ],
          caption: "Nested groups form.",
          intro: "Modifiers, prices, nested next groups.",
          fields: [
            {
              name: "Name / priority",
              effect: "Label and order."
            },
            {
              name: "Modifier",
              effect: "Selectable option."
            },
            {
              name: "Price",
              effect: "Extra charge."
            },
            {
              name: "Allowed next groups",
              effect: "After this choice."
            },
            {
              name: "Next group overrides",
              effect: "Hide or reprice nested."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Floor form",
          steps: [
            "Admin → Floors.",
            "Name, priority, colors.",
            "Save."
          ],
          caption: "Floor form.",
          fields: [
            {
              name: "Name",
              effect: "Floor picker label."
            },
            {
              name: "Priority",
              effect: "Sort order."
            },
            {
              name: "Background / color",
              effect: "Default tile styling."
            }
          ]
        },
        "table-form": {
          title: "Table form",
          steps: [
            "Select floor.",
            "Number, name, colors.",
            "Optional limits.",
            "Ask for covers.",
            "Save."
          ],
          caption: "Table form.",
          intro: "Belongs to floor; optional restrictions.",
          fields: [
            {
              name: "Name / number",
              effect: "Floor plan label."
            },
            {
              name: "Floor",
              effect: "Parent floor plan."
            },
            {
              name: "Priority",
              effect: "Sort on dense layouts."
            },
            {
              name: "Categories / order types / payment types",
              effect: "Optional restrictions."
            },
            {
              name: "Ask for covers",
              effect: "Prompts guest count."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Discount rule form",
          steps: [
            "Admin → Promotions → Discounts.",
            "Category, scope, mode.",
            "Targets and value.",
            "Save."
          ],
          caption: "Discount rule form.",
          intro: "14 categories; scope item/category/cart/customer/floor.",
          fields: [
            {
              name: "Category",
              effect: "One of 14 types."
            },
            {
              name: "Scope",
              effect: "item, category, cart, customer, floor."
            },
            {
              name: "Application mode",
              effect: "manual, automatic, both."
            },
            {
              name: "Targets",
              effect: "Eligible items/categories."
            },
            {
              name: "Type (percent / fixed)",
              effect: "Min/max as % or currency."
            },
            {
              name: "Min / max rate",
              effect: "Allowed range."
            },
            {
              name: "Max cap",
              effect: "Cap on percent discounts."
            },
            {
              name: "Priority",
              effect: "Order when auto rules compete."
            },
            {
              name: "Min order amount",
              effect: "Cart subtotal threshold."
            },
            {
              name: "Stacking mode",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Tax treatment",
              effect: "tax_before/after_discount, inclusive, exclusive."
            },
            {
              name: "Schedules",
              effect: "Day/time windows."
            },
            {
              name: "Conditions",
              effect: "Buy X Get Y thresholds."
            },
            {
              name: "Requires reason / approval",
              effect: "Manager PIN when manual."
            }
          ]
        },
        "coupon-form": {
          title: "Coupon form",
          steps: [
            "Promotions → Coupons.",
            "Code, discount type/value, limits.",
            "Valid days and dates.",
            "Save."
          ],
          caption: "Coupon form.",
          fields: [
            {
              name: "Code",
              effect: "String at checkout."
            },
            {
              name: "Coupon type",
              effect: "Single/multi use."
            },
            {
              name: "Discount type / value",
              effect: "Percent or fixed."
            },
            {
              name: "Min order amount",
              effect: "Subtotal threshold."
            },
            {
              name: "Max discount amount",
              effect: "Cap on percent coupons."
            },
            {
              name: "Usage limit",
              effect: "Total redemptions."
            },
            {
              name: "Usage limit per user",
              effect: "Per customer profile."
            },
            {
              name: "Valid days / start & end time",
              effect: "Time restriction."
            },
            {
              name: "Start / end date",
              effect: "Overall validity."
            },
            {
              name: "Stackable / first order only",
              effect: "Combination rules."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Kitchen form",
          steps: [
            "Admin → Kitchen → Kitchens.",
            "Name, priority, printers, dishes.",
            "Save."
          ],
          caption: "Kitchen station form.",
          intro: "Routes dishes to printers and inventory locations.",
          fields: [
            {
              name: "Name",
              effect: "Label on KOT and order display."
            },
            {
              name: "Priority",
              effect: "Order when multiple kitchens match."
            },
            {
              name: "Printers",
              effect: "Devices printing tickets."
            },
            {
              name: "Items (dishes)",
              effect: "Dishes routed here."
            }
          ]
        },
        "workflow-form": {
          title: "Workflow form",
          steps: [
            "Kitchen → Workflows.",
            "Name and ordered stages.",
            "Kitchen per stage.",
            "Link on dishes."
          ],
          caption: "Workflow stages editor.",
          intro: "Chains kitchen stages for displays.",
          fields: [
            {
              name: "Name",
              effect: "Identifier on dishes."
            },
            {
              name: "Stages",
              effect: "Ordered prep steps."
            },
            {
              name: "Stage kitchen",
              effect: "Station owning each stage."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Printer form",
          steps: [
            "Admin → Printing → Printers.",
            "Name and IP/USB connection.",
            "Type receipt/kitchen/label.",
            "Save."
          ],
          caption: "Printer form.",
          fields: [
            {
              name: "Name",
              effect: "Friendly name in admin."
            },
            {
              name: "Type",
              effect: "Receipt, kitchen, or label profile."
            },
            {
              name: "IP address / port",
              effect: "Network ESC/POS."
            },
            {
              name: "VID / PID",
              effect: "USB vendor/product IDs."
            }
          ]
        },
        "print-setting-form": {
          title: "Print setting form",
          steps: [
            "Print settings tab.",
            "Pick job type.",
            "Logo, header/footer, VAT, margins.",
            "Save."
          ],
          caption: "Print template editor.",
          intro: "Each print job type has its own template.",
          fields: [
            {
              name: "Show logo",
              effect: "Includes uploaded logo."
            },
            {
              name: "Header / footer sections",
              effect: "Rich text or image blocks."
            },
            {
              name: "VAT name / number",
              effect: "Tax block on receipts."
            },
            {
              name: "Margins",
              effect: "Spacing in printer dots."
            },
            {
              name: "Item columns",
              effect: "Toggle number, name, qty, price, total."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Payment type form",
          steps: [
            "Admin → Payments → Types.",
            "Name, priority, type.",
            "Remote: gateway, mode, API keys.",
            "Save."
          ],
          caption: "Form with remote gateway.",
          intro: "Local and Remote with Stripe, PayPal.",
          fields: [
            {
              name: "Name",
              effect: "Payment screen label."
            },
            {
              name: "Priority",
              effect: "Sort order."
            },
            {
              name: "Type",
              effect: "Remote enables gateway fields."
            },
            {
              name: "Gateway provider",
              effect: "Stripe, PayPal, etc."
            },
            {
              name: "Gateway mode",
              effect: "Test vs live."
            },
            {
              name: "public_key",
              effect: "Client-side publishable API key."
            },
            {
              name: "secret_key",
              effect: "Server-side secret for charges."
            },
            {
              name: "webhook_secret",
              effect: "Validates async callbacks."
            },
            {
              name: "client_id / client_secret",
              effect: "OAuth gateways."
            },
            {
              name: "merchant_id / integrity_salt",
              effect: "Provider-specific fields."
            },
            {
              name: "Tax",
              effect: "Default tax rule."
            },
            {
              name: "Discounts",
              effect: "Auto-applied rules."
            }
          ]
        },
        "tax-form": {
          title: "Tax form",
          steps: [
            "Payments → Taxes.",
            "Name, rate, inclusive/exclusive.",
            "Save."
          ],
          caption: "Tax form.",
          fields: [
            {
              name: "Name",
              effect: "Tax label on receipts."
            },
            {
              name: "Rate",
              effect: "Percentage on taxable amounts."
            },
            {
              name: "Inclusive",
              effect: "When true, tax embedded in prices."
            }
          ]
        },
        "order-type-form": {
          title: "Order type form",
          steps: [
            "Payments → Order types.",
            "Name and behavior flags.",
            "Save."
          ],
          caption: "Order type form.",
          fields: [
            {
              name: "Name",
              effect: "Type on checks and filters."
            },
            {
              name: "Priority",
              effect: "Sort in selectors."
            },
            {
              name: "Default",
              effect: "Pre-selected for new orders."
            }
          ]
        },
        "extra-form": {
          title: "Extra (service charge) form",
          steps: [
            "Payments → Extras.",
            "Name and amount/percent.",
            "When it applies.",
            "Save."
          ],
          caption: "Extra surcharge form.",
          intro: "Adds automatic surcharges by context.",
          fields: [
            {
              name: "Name",
              effect: "Surcharge label on receipt."
            },
            {
              name: "Amount / rate",
              effect: "Fixed or percent of eligible total."
            },
            {
              name: "Taxable",
              effect: "Whether tax on surcharge."
            },
            {
              name: "Auto apply rules",
              effect: "Links to order/payment types."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "User form",
          steps: [
            "Admin → Users.",
            "Login method, name, credentials, role, shift.",
            "Optional linked HR employee.",
            "Save."
          ],
          caption: "User account form.",
          intro: "POS operators login with PIN or password.",
          fields: [
            {
              name: "Login method",
              effect: "PIN (4 digits) or password."
            },
            {
              name: "First / last name",
              effect: "Displayed name."
            },
            {
              name: "Login / PIN",
              effect: "Sign-in credential."
            },
            {
              name: "Password",
              effect: "Required for password login."
            },
            {
              name: "User role",
              effect: "Permission bundle."
            },
            {
              name: "User shift",
              effect: "Default work shift."
            },
            {
              name: "Create employee",
              effect: "Auto-creates linked HR employee."
            }
          ]
        },
        "role-form": {
          title: "Role form",
          steps: [
            "Users → Roles.",
            "Name role and search module tree.",
            "Check modules or actions.",
            "Save."
          ],
          caption: "Role permissions editor.",
          intro: "Grants module and action access.",
          fields: [
            {
              name: "Name",
              effect: "Role label on user form."
            },
            {
              name: "Module permissions",
              effect: "Hierarchical checkboxes."
            }
          ]
        },
        "shift-form": {
          title: "Shift template form",
          steps: [
            "Users → Shifts.",
            "Name, start and end time.",
            "Overnight sets ends_next_day.",
            "Save."
          ],
          caption: "Shift template form.",
          intro: "Named time windows for users and schedules.",
          fields: [
            {
              name: "Name",
              effect: "Shift label."
            },
            {
              name: "Start time",
              effect: "Scheduled start."
            },
            {
              name: "End time",
              effect: "Scheduled end."
            }
          ]
        },
        "tips-definition": {
          title: "Tips definition (tip distribution)",
          steps: [
            "Users → Tips definition.",
            "Role rows with weight %.",
            "Optional user overrides.",
            "Save."
          ],
          caption: "Tip distribution admin panel.",
          intro: "Configure pooled tip weights by roles and users.",
          fields: [
            {
              name: "Role weight",
              effect: "Share of pool per role."
            },
            {
              name: "User weight",
              effect: "Optional per-user override."
            }
          ]
        }
      }
    }
  }
};
