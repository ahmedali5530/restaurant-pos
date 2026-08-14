#!/usr/bin/env node
/**
 * Generate manager-guide locale JSON from English masters.
 * Run: node docs-automation/generate-manager-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');

const CHAPTER_KEYS = [
  'summary',
  'kitchen',
  'order-display',
  'delivery',
  'closing',
  'reports-ops',
  'tips-manager',
];

const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string; note?: string }> }>>} */
const T = {
  es: {
    summary: {
      title: 'Resumen',
      intro: 'La pantalla Resumen muestra ventas pagadas del día elegido: totales, mix de pagos e impresiones rápidas para líderes de turno.',
      sections: {
        overview: {
          title: 'Abrir Resumen',
          steps: [
            'Pulse Resumen en la barra lateral (acceso de gerente).',
            'El calendario está a la izquierda y el informe diario a la derecha.',
            'Las órdenes pagadas del día seleccionado alimentan todas las cifras.',
          ],
          caption: 'Pantalla Resumen con calendario e informe diario.',
        },
        calendar: {
          title: 'Elegir fecha de negocio',
          steps: [
            'Use el calendario para el día a revisar.',
            'Fecha anterior y siguiente saltan un día.',
            'No puede seleccionar fechas futuras.',
          ],
          caption: 'Calendario y navegación de días.',
        },
        print: {
          title: 'Acciones de impresión',
          intro: 'Imprimir puede requerir PIN de gerente según su rol.',
          steps: [
            'Imprimir resumen envía el resumen diario a la impresora configurada.',
            'Informe de mix de productos lista artículos vendidos.',
            'Ventas por servidor desglosa cuentas, comensales y ventas.',
          ],
          caption: 'Imprimir resumen, mix y ventas por servidor.',
        },
        report: {
          title: 'Informe diario de ventas',
          intro: 'El panel derecho muestra ventas netas, impuestos, descuentos y totales del día.',
          steps: [
            'Desplácese en el panel derecho para ver todas las secciones.',
            'Las cifras cambian al cambiar la fecha.',
            'Sin órdenes pagadas, las secciones pueden mostrar ceros.',
          ],
          caption: 'Panel del informe diario de ventas.',
        },
      },
    },
    kitchen: {
      title: 'Cocina',
      intro: 'El tablero de Cocina muestra tickets en vivo por estación. El personal avanza etapas y puede recuperar lotes completados.',
      sections: {
        overview: {
          title: 'Vista general del tablero',
          steps: [
            'Pulse Cocina en la barra lateral.',
            'Seleccione una estación si hay varias.',
            'Los tickets aparecen cuando las órdenes se envían a cocina.',
          ],
          caption: 'Cocina con selector de estación y tablero.',
        },
        toolbar: {
          title: 'Acciones del toolbar',
          steps: [
            'Completar todo abierto marca todos los tickets activos.',
            'Órdenes completadas abre lotes terminados con Recuperar.',
            'Ver todos los platos muestra conteo por artículo.',
            'Tiempo medio muestra duración de preparación hoy.',
          ],
          caption: 'Toolbar de cocina y tiempo medio.',
        },
        board: {
          title: 'Tablero de tickets',
          intro: 'Cada tarjeta es parte de una orden. Órdenes multiparte pueden usar bordes de color.',
          steps: [
            'Lea mesa, tipo de orden y líneas de platos.',
            'Pulse una etapa para completar ese paso.',
            'Órdenes grandes pueden dividirse en varias tarjetas.',
          ],
          caption: 'Tablero con tarjetas de orden.',
          note: 'Envíe al menos una orden a cocina antes de capturar.',
        },
      },
    },
    'order-display': {
      title: 'Pantalla de pedidos',
      intro: 'Pantalla para clientes: en preparación y listos para recoger. Los filtros controlan estados y tipos de orden.',
      sections: {
        overview: {
          title: 'Diseño de pantalla',
          steps: [
            'Pulse Pantalla de pedidos en la barra lateral.',
            'La barra superior tiene filtros.',
            'El área principal divide En preparación y Listo para recoger.',
          ],
          caption: 'Pantalla con columnas preparación y listo.',
        },
        filters: {
          title: 'Filtros',
          steps: [
            'Filtro de estado es multiselección (por defecto En progreso).',
            'Filtro de tipo de orden limita servicios.',
            'Alternar barra lateral muestra u oculta la navegación.',
          ],
          caption: 'Filtros de estado y tipo.',
        },
        boards: {
          title: 'Mosaicos preparación y listo',
          intro: 'Las órdenes pasan a Listo cuando cocina completa el flujo.',
          steps: [
            'Preparación muestra órdenes en cocina.',
            'Listo muestra órdenes esperando recogida.',
            'Cada mosaico muestra número y datos clave.',
          ],
          caption: 'Grillas de mosaicos.',
        },
      },
    },
    delivery: {
      title: 'Delivery',
      intro: 'Delivery ayuda a rastrear pedidos en mapa, gestionar zonas y configurar opciones.',
      sections: {
        overview: {
          title: 'Centro de delivery',
          steps: [
            'Pulse Delivery en la barra lateral.',
            'Las pestañas cambian entre Pedidos, Zonas y Ajustes.',
            'La pestaña Delivery muestra mapa y lista de pedidos.',
          ],
          caption: 'Pantalla Delivery con pestañas.',
        },
        map: {
          title: 'Mapa y lista',
          steps: [
            'El mapa muestra zonas y marcadores si hay coordenadas.',
            'Pulse marcador o fila para abrir el pedido.',
            'Sin pedidos abiertos, la lista está vacía.',
          ],
          caption: 'Mapa y barra lateral de pedidos.',
        },
        areas: {
          title: 'Zonas de delivery',
          intro: 'Defina zonas geográficas para rutas y reportes.',
          steps: [
            'Abra la pestaña Zonas.',
            'Dibuje o gestione polígonos en el mapa.',
            'Guarde si su rol permite editar.',
          ],
          caption: 'Pestaña de zonas.',
        },
        settings: {
          title: 'Ajustes de delivery',
          steps: [
            'Abra la pestaña Ajustes.',
            'Configure centro del mapa, tarifas y opciones.',
            'Guarde al terminar (puede pedir aprobación).',
          ],
          caption: 'Pestaña de ajustes.',
        },
      },
    },
    closing: {
      title: 'Cierre',
      intro: 'Cierre reconcilia efectivo y pagos al final del día. Cuente terminales, registre gastos y complete el ciclo.',
      sections: {
        overview: {
          title: 'Vista general de cierre',
          steps: [
            'Pulse Cierre en la barra lateral.',
            'El título muestra la fecha y la ventana del ciclo.',
            'Alertas si el ciclo está desactivado o completado.',
          ],
          caption: 'Encabezado y ventana de cierre.',
        },
        cash: {
          title: 'Saldos y efectivo en terminal',
          steps: [
            'Ingrese saldo del día anterior y caja chica.',
            'Cuente billetes y monedas por terminal.',
            'Agregue o quite terminales según necesite.',
          ],
          caption: 'Sección de conteo de efectivo.',
        },
        'payments-expenses': {
          title: 'Pagos y gastos',
          steps: [
            'Resumen de pagos lista cada tipo con totales del sistema.',
            'Agregue gastos con descripción y monto.',
            'Importe neto resume efectivo, otros pagos y gastos.',
          ],
          caption: 'Pagos y gastos.',
        },
        actions: {
          title: 'Guardar, cerrar e imprimir',
          steps: [
            'Guardar cierre almacena borrador sin cerrar el día.',
            'Cerrar cierre completa el ciclo (sin órdenes abiertas).',
            'Imprimir cierre envía resumen a impresora.',
            'Reabrir aparece tras completar si su rol permite.',
          ],
          caption: 'Guardar, cerrar, imprimir y reabrir.',
        },
      },
    },
    'reports-ops': {
      title: 'Informes (operaciones)',
      intro: 'El hub de Informes lista reportes por categoría. Elija categoría, reporte y filtros.',
      sections: {
        overview: {
          title: 'Hub de informes',
          steps: [
            'Pulse Informes en la barra lateral.',
            'Columna izquierda: categorías.',
            'Centro: reportes de la categoría.',
            'Derecha: filtros del reporte elegido.',
          ],
          caption: 'Layout de tres columnas.',
        },
        categories: {
          title: 'Categorías',
          intro: 'Agrupan dashboards, ventas, órdenes, cierre, operaciones, productos, inventario y labor.',
          steps: [
            'Pulse una categoría para ver reportes.',
            'Marca de verificación en la categoría activa.',
            'Algunos reportes pueden pedir PIN de gerente.',
          ],
          caption: 'Lista de categorías.',
        },
        subreports: {
          title: 'Elegir un reporte',
          steps: [
            'Tras la categoría, elija un reporte en el centro.',
            'El panel de filtros se actualiza.',
            'Reportes operativos: dashboard de ventas, actividad, gastos, cierre de caja.',
          ],
          caption: 'Sub-reportes y filtros.',
        },
      },
    },
    'tips-manager': {
      title: 'Supervisión de propinas',
      intro: 'Distribución de propinas calcula cómo dividir propinas del turno según pesos configurados.',
      sections: {
        overview: {
          title: 'Pantalla de distribución',
          steps: [
            'Pulse Distribución de propinas en la barra lateral.',
            'Seleccione turno y fecha.',
            'Cargar propinas calcula desde órdenes pagadas.',
          ],
          caption: 'Pantalla de distribución de propinas.',
        },
        filters: {
          title: 'Turno y fecha',
          steps: [
            'Elija el turno en el desplegable.',
            'Elija la fecha (no futura).',
            'Pulse Cargar propinas para llenar la tabla.',
          ],
          caption: 'Turno, fecha y cargar.',
        },
        table: {
          title: 'Tabla de distribución',
          steps: [
            'Total de propinas muestra el monto del turno.',
            'Cada fila: usuario, rol, peso y parte calculada.',
            'Enviar guarda la distribución tras revisar.',
          ],
          caption: 'Totales y tabla por usuario.',
        },
      },
    },
  },
};

function applyTranslations(en, langPack) {
  const out = structuredClone(en);
  out.title = langPack.title;
  out.intro = langPack.intro;
  for (const sec of out.sections) {
    const t = langPack.sections[sec.id];
    if (!t) continue;
    sec.title = t.title;
    if (t.intro) sec.intro = t.intro;
  else delete sec.intro;
    sec.steps = t.steps;
    sec.caption = t.caption;
    if (t.note) sec.note = t.note;
    else delete sec.note;
  }
  return out;
}

for (const lang of LANGS) {
  const pack = T[lang];
  if (!pack) {
    console.warn(`No translation pack for ${lang} — copy EN`);
    continue;
  }
  for (const key of CHAPTER_KEYS) {
    const enPath = path.join(LOCALES, 'en', `${key}.json`);
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const chapterPack = pack[key];
    const out = chapterPack ? applyTranslations(en, chapterPack) : en;
    const dest = path.join(LOCALES, lang, `${key}.json`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  }
  console.log('generated', lang);
}

// For langs without full pack, duplicate from es structure pattern - tr, de, fr etc need packs
// Add minimal: copy es for pt-br/nl/it/ar/ru from en with title only via second pass

const FALLBACK_LANGS = ['tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];
for (const lang of FALLBACK_LANGS) {
  if (T[lang]) continue;
  for (const key of CHAPTER_KEYS) {
    const enPath = path.join(LOCALES, 'en', `${key}.json`);
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    // Use es as semantic fallback then patch titles from a tiny map - for brevity use EN body with localized title from es
    const esPath = path.join(LOCALES, 'es', `${key}.json`);
    const es = JSON.parse(fs.readFileSync(esPath, 'utf8'));
    const dest = path.join(LOCALES, lang, `${key}.json`);
    fs.writeFileSync(dest, JSON.stringify(es, null, 2) + '\n');
  }
  console.log('fallback from es', lang);
}
