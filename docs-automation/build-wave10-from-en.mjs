#!/usr/bin/env node
/**
 * Builds docs-automation/wave10-translations.mjs from wave10-en-chapters.mjs
 * Run: node docs-automation/build-wave10-from-en.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WAVE10_EN, WAVE10_NEW_KEYS, WAVE10_EXPAND_KEYS } from './wave10-en-chapters.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'wave10-translations.mjs');
const ALL_KEYS = [...WAVE10_NEW_KEYS, ...WAVE10_EXPAND_KEYS];
const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

function serialize(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(obj)) {
    if (obj.every((x) => typeof x === 'string'))
      return '[\n' + obj.map((s) => padIn + JSON.stringify(s)).join(',\n') + '\n' + pad + ']';
    return '[\n' + obj.map((v) => padIn + serialize(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (obj && typeof obj === 'object') {
    return '{\n' + Object.entries(obj).map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$-]*$/.test(k) && !k.includes('-') ? k : JSON.stringify(k);
      return padIn + key + ': ' + serialize(v, indent + 1);
    }).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(obj);
}

function t(str, lang, map) {
  if (!str || !map) return str;
  if (map[str]) return map[str];
  let out = str;
  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    if (from.length > 2) out = out.split(from).join(to);
  }
  return out;
}

function translatePack(enChapter, map) {
  const out = { sections: {} };
  if (enChapter.title) out.title = t(enChapter.title, null, map);
  if (enChapter.intro) out.intro = t(enChapter.intro, null, map);
  for (const sec of enChapter.sections || []) {
    const s = {
      title: t(sec.title, null, map),
      steps: (sec.steps || []).map((x) => t(x, null, map)),
      caption: t(sec.caption, null, map),
    };
    if (sec.intro) s.intro = t(sec.intro, null, map);
    if (sec.fields?.length) {
      s.fields = sec.fields.map((f) => ({ name: t(f.name, null, map), effect: t(f.effect, null, map) }));
    }
    out.sections[sec.id] = s;
  }
  return out;
}

// --- Translation dictionaries (EN phrase -> target). Technical tokens preserved. ---
const ES = {
  'Cancel or void order': 'Cancelar o anular pedido',
  'Refund paid order': 'Reembolsar pedido pagado',
  'Split by seats': 'Dividir por asientos',
  'Split by items': 'Dividir por ítems',
  'Split by amount': 'Dividir por importe',
  'Merge orders': 'Fusionar pedidos',
  'Profit & loss': 'Pérdidas y ganancias',
  'Cash flow': 'Flujo de caja',
  'Kitchen reconciliation': 'Conciliación de cocina',
  'Recipes & production': 'Recetas y producción',
  'Buffet menus & sessions': 'Menús y sesiones de buffet',
  'Cost centers': 'Centros de costo',
  'Pay profiles & rules': 'Perfiles y reglas de pago',
  'Payroll periods & runs': 'Períodos y ejecuciones de nómina',
  'Employee documents': 'Documentos del empleado',
  'Performance notes': 'Notas de desempeño',
  'Employee form': 'Formulario de empleado',
  'Department form': 'Formulario de departamento',
  'Position form': 'Formulario de puesto',
  'Manual attendance entry': 'Entrada manual de asistencia',
  'Leave request form': 'Formulario de solicitud de licencia',
  'Public holiday form': 'Formulario de feriado',
  'Dish form': 'Formulario de plato',
  'Menu form': 'Formulario de menú',
  'Category form': 'Formulario de categoría',
  'Modifier group form': 'Formulario de grupo de modificadores',
  'Floor form': 'Formulario de piso',
  'Table form': 'Formulario de mesa',
  'Discount rule form': 'Formulario de regla de descuento',
  'Coupon form': 'Formulario de cupón',
  'Kitchen form': 'Formulario de cocina',
  'Workflow form': 'Formulario de flujo de trabajo',
  'Printer form': 'Formulario de impresora',
  'Print setting form': 'Formulario de ajuste de impresión',
  'Payment type form': 'Formulario de tipo de pago',
  'Tax form': 'Formulario de impuesto',
  'Order type form': 'Formulario de tipo de pedido',
  'Extra (service charge) form': 'Formulario de extra (cargo por servicio)',
  'User form': 'Formulario de usuario',
  'Role form': 'Formulario de rol',
  'Shift template form': 'Formulario de plantilla de turno',
  'Tips definition (tip distribution)': 'Definición de propinas (distribución)',
  'Reason': 'Motivo',
  'Select all items': 'Seleccionar todos los ítems',
  'Partial void': 'Anulación parcial',
  'Items to refund': 'Ítems a reembolsar',
  'Employee': 'Empleado',
  'Save': 'Guardar',
  'Generate': 'Generar',
  'Verify': 'Verificar',
  'Location': 'Ubicación',
  'Name': 'Nombre',
  'Open ': 'Abra ',
  'Click ': 'Haga clic ',
  'Choose ': 'Elija ',
  'Select ': 'Seleccione ',
  'Confirm': 'Confirmar',
  'order': 'pedido',
  'Order': 'Pedido',
  'orders': 'pedidos',
  'check': 'cuenta',
  'Check': 'Cuenta',
  'Manager PIN': 'PIN de gerente',
  'In Progress': 'En curso',
  'Paid': 'Pagado',
  'Inventory': 'Inventario',
  'Production': 'Producción',
  'Recipes': 'Recetas',
  'HR': 'RR. HH.',
  'Admin': 'Administración',
  'Payment': 'Pago',
  'Payments': 'Pagos',
  'Users': 'Usuarios',
  'Kitchen': 'Cocina',
  'Printer': 'Impresora',
  'Discount': 'Descuento',
  'Coupon': 'Cupón',
  'Tax': 'Impuesto',
  'Shift': 'Turno',
  'Role': 'Rol',
  'Password': 'Contraseña',
  'Active': 'Activo',
  'Department': 'Departamento',
  'Position': 'Puesto',
  'Schedule': 'Horario',
  'Leave': 'Licencia',
  'Holiday': 'Feriado',
  'Workflow': 'Flujo de trabajo',
  'Floor': 'Piso',
  'Table': 'Mesa',
  'Dish': 'Plato',
  'Menu': 'Menú',
  'Category': 'Categoría',
  'Modifier': 'Modificador',
  'Reconciliation tab': 'Pestaña Conciliación',
  'Manual count entry': 'Entrada manual de conteos',
  'Recipes list': 'Lista de recetas',
  'Recipe form': 'Formulario de receta',
  'Production runs': 'Ejecuciones de producción',
  'Production batch form': 'Formulario de lote de producción',
  'Production history': 'Historial de producción',
  'Buffet menus': 'Menús de buffet',
  'Buffet menu form': 'Formulario de menú buffet',
  'Buffet sessions': 'Sesiones de buffet',
  'Start buffet session': 'Iniciar sesión de buffet',
  'Cost center list': 'Lista de centros de costo',
  'Cost center form': 'Formulario de centro de costo',
  'Pay profiles': 'Perfiles de pago',
  'Pay profile form': 'Formulario de perfil de pago',
  'Pay rules': 'Reglas de pago',
  'Pay rule form': 'Formulario de regla de pago',
  'Payroll periods': 'Períodos de nómina',
  'Payroll period form': 'Formulario de período de nómina',
  'Payroll runs': 'Ejecuciones de nómina',
  'Generate payroll run': 'Generar ejecución de nómina',
  'Payroll adjustments': 'Ajustes de nómina',
  'Adjustment form': 'Formulario de ajuste',
  'Documents list': 'Lista de documentos',
  'Document form': 'Formulario de documento',
  'Performance list': 'Lista de desempeño',
  'Performance note form': 'Formulario de nota de desempeño',
  'Work schedule form': 'Formulario de horario de trabajo',
  'Scheduled shift form': 'Formulario de turno programado',
  'Schedule template form': 'Formulario de plantilla de horario',
  'Generate schedule from template': 'Generar horario desde plantilla',
  'Shift swap request': 'Solicitud de intercambio de turno',
};

const TR = {
  'Cancel or void order': 'Siparişi iptal et / geçersiz kıl',
  'Refund paid order': 'Ödenmiş siparişi iade et',
  'Split by seats': 'Koltuklara böl',
  'Split by items': 'Kalemlere böl',
  'Split by amount': 'Tutara göre böl',
  'Merge orders': 'Siparişleri birleştir',
  'Profit & loss': 'Kar ve zarar',
  'Cash flow': 'Nakit akışı',
  'Kitchen reconciliation': 'Mutfak mutabakatı',
  'Recipes & production': 'Reçeteler ve üretim',
  'Buffet menus & sessions': 'Açık büfe menüleri ve oturumları',
  'Cost centers': 'Maliyet merkezleri',
  'Pay profiles & rules': 'Ödeme profilleri ve kuralları',
  'Payroll periods & runs': 'Bordro dönemleri ve çalıştırmalar',
  'Employee documents': 'Çalışan belgeleri',
  'Performance notes': 'Performans notları',
  'Reason': 'Neden',
  'Employee': 'Çalışan',
  'Save': 'Kaydet',
  'Generate': 'Oluştur',
  'Verify': 'Doğrula',
  'Location': 'Konum',
  'Name': 'Ad',
  'order': 'sipariş',
  'Order': 'Sipariş',
  'check': 'adisyon',
  'Manager PIN': 'Yönetici PIN',
  'In Progress': 'Devam Eden',
  'Paid': 'Ödenmiş',
  'Inventory': 'Envanter',
  'HR': 'İK',
  'Admin': 'Yönetim',
  'Kitchen': 'Mutfak',
  'Payment': 'Ödeme',
  'Users': 'Kullanıcılar',
};

const PT = {
  'Cancel or void order': 'Cancelar / anular pedido',
  'Refund paid order': 'Reembolsar pedido pago',
  'Split by seats': 'Dividir por assentos',
  'Split by items': 'Dividir por itens',
  'Split by amount': 'Dividir por valor',
  'Merge orders': 'Mesclar pedidos',
  'Profit & loss': 'Demonstração de resultados',
  'Cash flow': 'Fluxo de caixa',
  'Kitchen reconciliation': 'Conciliação de cozinha',
  'Recipes & production': 'Receitas e produção',
  'Buffet menus & sessions': 'Cardápios e sessões de buffet',
  'Cost centers': 'Centros de custo',
  'Pay profiles & rules': 'Perfis e regras de pagamento',
  'Payroll periods & runs': 'Períodos e execuções de folha',
  'Employee documents': 'Documentos do funcionário',
  'Performance notes': 'Notas de desempenho',
  'Reason': 'Motivo',
  'Employee': 'Funcionário',
  'Save': 'Salvar',
  'order': 'pedido',
  'Order': 'Pedido',
  'check': 'conta',
  'Manager PIN': 'PIN gerente',
  'In Progress': 'Em andamento',
  'Paid': 'Pago',
  'Inventory': 'Estoque',
  'HR': 'RH',
};

const FR = {
  'Cancel or void order': 'Annuler / invalider la commande',
  'Refund paid order': 'Rembourser une commande payée',
  'Split by seats': 'Diviser par sièges',
  'Split by items': 'Diviser par articles',
  'Split by amount': 'Diviser par montant',
  'Merge orders': 'Fusionner des commandes',
  'Profit & loss': 'Compte de résultat',
  'Cash flow': 'Flux de trésorerie',
  'Kitchen reconciliation': 'Rapprochement cuisine',
  'Recipes & production': 'Recettes et production',
  'Buffet menus & sessions': 'Menus et sessions buffet',
  'Cost centers': 'Centres de coûts',
  'Pay profiles & rules': 'Profils et règles de paie',
  'Payroll periods & runs': 'Périodes et exécutions de paie',
  'Employee documents': 'Documents employés',
  'Performance notes': 'Notes de performance',
  'Reason': 'Motif',
  'Employee': 'Employé',
  'Save': 'Enregistrer',
  'Generate': 'Générer',
  'Verify': 'Vérifier',
  'Location': 'Emplacement',
  'Name': 'Nom',
  'order': 'commande',
  'Order': 'Commande',
  'check': 'addition',
  'Manager PIN': 'PIN manager',
  'In Progress': 'En cours',
  'Paid': 'Payé',
  'Inventory': 'Stock',
  'HR': 'RH',
  'Kitchen': 'Cuisine',
};

const NL = {
  'Cancel or void order': 'Bestelling annuleren / ongeldig maken',
  'Refund paid order': 'Betaalde bestelling terugbetalen',
  'Split by seats': 'Splitsen per stoelen',
  'Split by items': 'Splitsen per items',
  'Split by amount': 'Splitsen per bedrag',
  'Merge orders': 'Bestellingen samenvoegen',
  'Profit & loss': 'Winst- en verliesrekening',
  'Cash flow': 'Kasstroom',
  'Kitchen reconciliation': 'Keukenafstemming',
  'Reason': 'Reden',
  'Employee': 'Werknemer',
  'Save': 'Opslaan',
  'order': 'bestelling',
  'Order': 'Bestelling',
  'check': 'rekening',
  'In Progress': 'In behandeling',
  'Paid': 'Betaald',
  'Inventory': 'Voorraad',
  'Kitchen': 'Keuken',
};

const DE = {
  'Cancel or void order': 'Bestellung stornieren / ungültig machen',
  'Refund paid order': 'Bezahlte Bestellung erstatten',
  'Split by seats': 'Nach Sitzplätzen teilen',
  'Split by items': 'Nach Artikeln teilen',
  'Split by amount': 'Nach Betrag teilen',
  'Merge orders': 'Bestellungen zusammenführen',
  'Profit & loss': 'Gewinn- und Verlustrechnung',
  'Cash flow': 'Kapitalflussrechnung',
  'Kitchen reconciliation': 'Küchenabstimmung',
  'Reason': 'Grund',
  'Employee': 'Mitarbeiter',
  'Save': 'Speichern',
  'order': 'Bestellung',
  'Order': 'Bestellung',
  'check': 'Rechnung',
  'In Progress': 'In Bearbeitung',
  'Paid': 'Bezahlt',
  'Inventory': 'Bestand',
  'Kitchen': 'Küche',
};

const IT = {
  'Cancel or void order': 'Annulla / invalida ordine',
  'Refund paid order': 'Rimborsa ordine pagato',
  'Split by seats': 'Dividi per posti',
  'Split by items': 'Dividi per articoli',
  'Split by amount': 'Dividi per importo',
  'Merge orders': 'Unisci ordini',
  'Profit & loss': 'Conto economico',
  'Cash flow': 'Flusso di cassa',
  'Kitchen reconciliation': 'Riconciliazione cucina',
  'Reason': 'Motivo',
  'Employee': 'Dipendente',
  'Save': 'Salva',
  'order': 'ordine',
  'Order': 'Ordine',
  'check': 'conto',
  'In Progress': 'In corso',
  'Paid': 'Pagato',
  'Inventory': 'Magazzino',
  'Kitchen': 'Cucina',
};

const AR = {
  'Cancel or void order': 'إلغاء / إبطال الطلب',
  'Refund paid order': 'استرداد طلب مدفوع',
  'Split by seats': 'تقسيم حسب المقاعد',
  'Split by items': 'تقسيم حسب العناصر',
  'Split by amount': 'تقسيم حسب المبلغ',
  'Merge orders': 'دمج الطلبات',
  'Profit & loss': 'الأرباح والخسائر',
  'Cash flow': 'التدفق النقدي',
  'Kitchen reconciliation': 'تسوية المطبخ',
  'Reason': 'السبب',
  'Employee': 'موظف',
  'Save': 'حفظ',
  'Generate': 'إنشاء',
  'Verify': 'تحقق',
  'order': 'طلب',
  'Order': 'طلب',
  'check': 'فاتورة',
  'In Progress': 'قيد التنفيذ',
  'Paid': 'مدفوع',
  'Inventory': 'المخزون',
  'Kitchen': 'المطبخ',
};

const RU = {
  'Cancel or void order': 'Отмена / аннулирование заказа',
  'Refund paid order': 'Возврат оплаченного заказа',
  'Split by seats': 'Разделить по местам',
  'Split by items': 'Разделить по позициям',
  'Split by amount': 'Разделить по сумме',
  'Merge orders': 'Объединить заказы',
  'Profit & loss': 'Отчёт о прибылях и убытках',
  'Cash flow': 'Движение денежных средств',
  'Kitchen reconciliation': 'Сверка кухни',
  'Reason': 'Причина',
  'Employee': 'Сотрудник',
  'Save': 'Сохранить',
  'Generate': 'Сгенерировать',
  'Verify': 'Проверить',
  'order': 'заказ',
  'Order': 'Заказ',
  'check': 'чек',
  'In Progress': 'В процессе',
  'Paid': 'Оплачен',
  'Inventory': 'Склад',
  'Kitchen': 'Кухня',
};

/** @type {Record<string, Record<string, string>>} */
const MAPS = { es: ES, tr: TR, 'pt-br': PT, fr: FR, nl: NL, de: DE, it: IT, ar: AR, ru: RU };

const WAVE10_T = {};
for (const lang of LANGS) {
  WAVE10_T[lang] = {};
  for (const key of ALL_KEYS) {
    WAVE10_T[lang][key] = translatePack(WAVE10_EN[key], MAPS[lang]);
  }
}

const header = `/**
 * Wave 10 documentation translations — orders modals, inventory & HR chapters, admin form fields.
 * Consumed by generate-wave10-locales.mjs
 * @type {Record<string, Record<string, { title?: string, intro?: string, sections: Record<string, { title: string, intro?: string, steps: string[], caption: string, fields?: { name: string, effect: string }[] }> }>>}
 */
export const WAVE10_T = `;

fs.writeFileSync(OUT, header + serialize(WAVE10_T, 0) + ';\n');
console.log('Wrote', OUT, 'langs:', LANGS.join(', '), 'chapters:', ALL_KEYS.length);
