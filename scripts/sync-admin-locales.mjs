import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const LANGS = ["ar", "de", "es", "fr", "it", "nl", "pt-br", "ru", "tr"];
const EXEMPT = new Set(["forms.vid", "forms.pid"]);

const PART_A = {
  ar: {
    "forms.headerSections": "أقسام الرأس",
    "forms.footerSections": "أقسام التذييل",
    "forms.addSection": "إضافة قسم",
    "forms.noReceiptSections": "لا توجد أقسام بعد. أضف قسمًا لتخصيص هذه المنطقة.",
    "forms.sectionEnabled": "مفعّل",
    "forms.sectionType": "النوع",
    "forms.sectionTypeText": "نص",
    "forms.sectionTypeImage": "صورة",
    "forms.sectionAlign": "المحاذاة",
    "forms.sectionAlignLeft": "يسار",
    "forms.sectionAlignCenter": "وسط",
    "forms.sectionAlignRight": "يمين",
    "forms.sectionSize": "حجم النص",
    "forms.sectionSizeNormal": "عادي",
    "forms.sectionSizeMedium": "متوسط",
    "forms.sectionSizeLarge": "كبير",
    "forms.sectionContent": "المحتوى",
    "forms.sectionImagePreview": "معاينة صورة القسم",
    "forms.removeSectionImage": "إزالة صورة القسم",
    "forms.deleteReceiptSection":
      "هل أنت متأكد أنك تريد إزالة قسم الإيصال هذا؟ لا يمكن التراجع عن ذلك حتى تحفظ.",
    "securityAlerts.badgeTooltipPlural": "{{count}} تنبيهات حرجة مفتوحة",
  },
  de: {
    "forms.headerSections": "Kopfbereich-Abschnitte",
    "forms.footerSections": "Fußbereich-Abschnitte",
    "forms.addSection": "Abschnitt hinzufügen",
    "forms.noReceiptSections":
      "Noch keine Abschnitte. Fügen Sie einen hinzu, um diesen Bereich anzupassen.",
    "forms.sectionEnabled": "Aktiviert",
    "forms.sectionType": "Typ",
    "forms.sectionTypeText": "Text",
    "forms.sectionTypeImage": "Bild",
    "forms.sectionAlign": "Ausrichtung",
    "forms.sectionAlignLeft": "Links",
    "forms.sectionAlignCenter": "Zentriert",
    "forms.sectionAlignRight": "Rechts",
    "forms.sectionSize": "Textgröße",
    "forms.sectionSizeNormal": "Normal",
    "forms.sectionSizeMedium": "Mittel",
    "forms.sectionSizeLarge": "Groß",
    "forms.sectionContent": "Inhalt",
    "forms.sectionImagePreview": "Vorschau Abschnittsbild",
    "forms.removeSectionImage": "Abschnittsbild entfernen",
    "forms.deleteReceiptSection":
      "Möchten Sie diesen Belegabschnitt wirklich entfernen? Dies kann erst rückgängig gemacht werden, wenn Sie speichern.",
    "securityAlerts.badgeTooltipPlural": "{{count}} offene kritische Warnungen",
  },
  es: {
    "forms.headerSections": "Secciones del encabezado",
    "forms.footerSections": "Secciones del pie",
    "forms.addSection": "Agregar sección",
    "forms.noReceiptSections":
      "Aún no hay secciones. Agregue una para personalizar esta área.",
    "forms.sectionEnabled": "Habilitado",
    "forms.sectionType": "Tipo",
    "forms.sectionTypeText": "Texto",
    "forms.sectionTypeImage": "Imagen",
    "forms.sectionAlign": "Alineación",
    "forms.sectionAlignLeft": "Izquierda",
    "forms.sectionAlignCenter": "Centro",
    "forms.sectionAlignRight": "Derecha",
    "forms.sectionSize": "Tamaño del texto",
    "forms.sectionSizeNormal": "Normal",
    "forms.sectionSizeMedium": "Mediano",
    "forms.sectionSizeLarge": "Grande",
    "forms.sectionContent": "Contenido",
    "forms.sectionImagePreview": "Vista previa de imagen de sección",
    "forms.removeSectionImage": "Eliminar imagen de sección",
    "forms.deleteReceiptSection":
      "¿Está seguro de que desea eliminar esta sección del recibo? No se puede deshacer hasta que guarde.",
    "securityAlerts.badgeTooltipPlural": "{{count}} alertas críticas abiertas",
  },
  fr: {
    "forms.headerSections": "Sections d'en-tête",
    "forms.footerSections": "Sections de pied de page",
    "forms.addSection": "Ajouter une section",
    "forms.noReceiptSections":
      "Aucune section pour l'instant. Ajoutez-en une pour personnaliser cette zone.",
    "forms.sectionEnabled": "Activé",
    "forms.sectionType": "Type",
    "forms.sectionTypeText": "Texte",
    "forms.sectionTypeImage": "Image",
    "forms.sectionAlign": "Alignement",
    "forms.sectionAlignLeft": "Gauche",
    "forms.sectionAlignCenter": "Centre",
    "forms.sectionAlignRight": "Droite",
    "forms.sectionSize": "Taille du texte",
    "forms.sectionSizeNormal": "Normal",
    "forms.sectionSizeMedium": "Moyen",
    "forms.sectionSizeLarge": "Grand",
    "forms.sectionContent": "Contenu",
    "forms.sectionImagePreview": "Aperçu de l'image de section",
    "forms.removeSectionImage": "Supprimer l'image de section",
    "forms.deleteReceiptSection":
      "Voulez-vous vraiment supprimer cette section de reçu ? Cela ne pourra être annulé qu'après enregistrement.",
    "securityAlerts.badgeTooltipPlural": "{{count}} alertes critiques ouvertes",
  },
  it: {
    "forms.headerSections": "Sezioni intestazione",
    "forms.footerSections": "Sezioni piè di pagina",
    "forms.addSection": "Aggiungi sezione",
    "forms.noReceiptSections":
      "Nessuna sezione ancora. Aggiungine una per personalizzare quest'area.",
    "forms.sectionEnabled": "Abilitato",
    "forms.sectionType": "Tipo",
    "forms.sectionTypeText": "Testo",
    "forms.sectionTypeImage": "Immagine",
    "forms.sectionAlign": "Allineamento",
    "forms.sectionAlignLeft": "Sinistra",
    "forms.sectionAlignCenter": "Centro",
    "forms.sectionAlignRight": "Destra",
    "forms.sectionSize": "Dimensione testo",
    "forms.sectionSizeNormal": "Normale",
    "forms.sectionSizeMedium": "Medio",
    "forms.sectionSizeLarge": "Grande",
    "forms.sectionContent": "Contenuto",
    "forms.sectionImagePreview": "Anteprima immagine sezione",
    "forms.removeSectionImage": "Rimuovi immagine sezione",
    "forms.deleteReceiptSection":
      "Sei sicuro di voler rimuovere questa sezione dello scontrino? Non potrà essere annullato finché non salvi.",
    "securityAlerts.badgeTooltipPlural": "{{count}} avvisi critici aperti",
  },
  nl: {
    "forms.headerSections": "Kopsecties",
    "forms.footerSections": "Voettekstsecties",
    "forms.addSection": "Sectie toevoegen",
    "forms.noReceiptSections":
      "Nog geen secties. Voeg er een toe om dit gebied aan te passen.",
    "forms.sectionEnabled": "Ingeschakeld",
    "forms.sectionType": "Type",
    "forms.sectionTypeText": "Tekst",
    "forms.sectionTypeImage": "Afbeelding",
    "forms.sectionAlign": "Uitlijning",
    "forms.sectionAlignLeft": "Links",
    "forms.sectionAlignCenter": "Gecentreerd",
    "forms.sectionAlignRight": "Rechts",
    "forms.sectionSize": "Tekstgrootte",
    "forms.sectionSizeNormal": "Normaal",
    "forms.sectionSizeMedium": "Middel",
    "forms.sectionSizeLarge": "Groot",
    "forms.sectionContent": "Inhoud",
    "forms.sectionImagePreview": "Voorbeeld sectieafbeelding",
    "forms.removeSectionImage": "Sectieafbeelding verwijderen",
    "forms.deleteReceiptSection":
      "Weet u zeker dat u deze bonsectie wilt verwijderen? Dit kan pas ongedaan worden gemaakt nadat u opslaat.",
    "securityAlerts.badgeTooltipPlural": "{{count}} open kritieke waarschuwingen",
  },
  "pt-br": {
    "forms.headerSections": "Seções do cabeçalho",
    "forms.footerSections": "Seções do rodapé",
    "forms.addSection": "Adicionar seção",
    "forms.noReceiptSections":
      "Ainda não há seções. Adicione uma para personalizar esta área.",
    "forms.sectionEnabled": "Ativado",
    "forms.sectionType": "Tipo",
    "forms.sectionTypeText": "Texto",
    "forms.sectionTypeImage": "Imagem",
    "forms.sectionAlign": "Alinhamento",
    "forms.sectionAlignLeft": "Esquerda",
    "forms.sectionAlignCenter": "Centro",
    "forms.sectionAlignRight": "Direita",
    "forms.sectionSize": "Tamanho do texto",
    "forms.sectionSizeNormal": "Normal",
    "forms.sectionSizeMedium": "Médio",
    "forms.sectionSizeLarge": "Grande",
    "forms.sectionContent": "Conteúdo",
    "forms.sectionImagePreview": "Pré-visualização da imagem da seção",
    "forms.removeSectionImage": "Remover imagem da seção",
    "forms.deleteReceiptSection":
      "Tem certeza de que deseja remover esta seção do recibo? Isso não poderá ser desfeito até salvar.",
    "securityAlerts.badgeTooltipPlural": "{{count}} alertas críticos abertos",
  },
  ru: {
    "forms.headerSections": "Разделы шапки",
    "forms.footerSections": "Разделы подвала",
    "forms.addSection": "Добавить раздел",
    "forms.noReceiptSections":
      "Разделов пока нет. Добавьте один, чтобы настроить эту область.",
    "forms.sectionEnabled": "Включено",
    "forms.sectionType": "Тип",
    "forms.sectionTypeText": "Текст",
    "forms.sectionTypeImage": "Изображение",
    "forms.sectionAlign": "Выравнивание",
    "forms.sectionAlignLeft": "Слева",
    "forms.sectionAlignCenter": "По центру",
    "forms.sectionAlignRight": "Справа",
    "forms.sectionSize": "Размер текста",
    "forms.sectionSizeNormal": "Обычный",
    "forms.sectionSizeMedium": "Средний",
    "forms.sectionSizeLarge": "Крупный",
    "forms.sectionContent": "Содержимое",
    "forms.sectionImagePreview": "Предпросмотр изображения раздела",
    "forms.removeSectionImage": "Удалить изображение раздела",
    "forms.deleteReceiptSection":
      "Вы уверены, что хотите удалить этот раздел чека? Отменить это можно только после сохранения.",
    "securityAlerts.badgeTooltipPlural": "{{count}} открытых критических оповещений",
  },
  tr: {
    "forms.headerSections": "Üst bilgi bölümleri",
    "forms.footerSections": "Alt bilgi bölümleri",
    "forms.addSection": "Bölüm ekle",
    "forms.noReceiptSections":
      "Henüz bölüm yok. Bu alanı özelleştirmek için bir tane ekleyin.",
    "forms.sectionEnabled": "Etkin",
    "forms.sectionType": "Tür",
    "forms.sectionTypeText": "Metin",
    "forms.sectionTypeImage": "Görsel",
    "forms.sectionAlign": "Hizalama",
    "forms.sectionAlignLeft": "Sol",
    "forms.sectionAlignCenter": "Orta",
    "forms.sectionAlignRight": "Sağ",
    "forms.sectionSize": "Metin boyutu",
    "forms.sectionSizeNormal": "Normal",
    "forms.sectionSizeMedium": "Orta",
    "forms.sectionSizeLarge": "Büyük",
    "forms.sectionContent": "İçerik",
    "forms.sectionImagePreview": "Bölüm görseli önizlemesi",
    "forms.removeSectionImage": "Bölüm görselini kaldır",
    "forms.deleteReceiptSection":
      "Bu fiş bölümünü kaldırmak istediğinizden emin misiniz? Kaydedene kadar geri alınamaz.",
    "securityAlerts.badgeTooltipPlural": "{{count}} açık kritik uyarı",
  },
};

const HR_TAB_MAP = {
  "accessRules.permissions.hr.dashboard": "dashboard",
  "accessRules.permissions.hr.employees": "employees",
  "accessRules.permissions.hr.departments": "departments",
  "accessRules.permissions.hr.positions": "positions",
  "accessRules.permissions.hr.cost_centers": "costCenters",
  "accessRules.permissions.hr.pay_profiles": "payProfiles",
  "accessRules.permissions.hr.pay_rules": "payRules",
  "accessRules.permissions.hr.scheduling": "scheduling",
  "accessRules.permissions.hr.attendance": "attendance",
  "accessRules.permissions.hr.leave": "leave",
  "accessRules.permissions.hr.holidays": "holidays",
  "accessRules.permissions.hr.payroll_periods": "payrollPeriods",
  "accessRules.permissions.hr.payroll_runs": "payrollRuns",
  "accessRules.permissions.hr.adjustments": "adjustments",
  "accessRules.permissions.hr.documents": "documents",
  "accessRules.permissions.hr.performance": "performance",
};

const ACCOUNTS_TAB_MAP = {
  "accessRules.permissions.accounts.chart_of_accounts": "chartOfAccounts",
  "accessRules.permissions.accounts.account_groups": "accountGroups",
  "accessRules.permissions.accounts.journal_entries": "journalEntries",
  "accessRules.permissions.accounts.general_ledger": "generalLedger",
  "accessRules.permissions.accounts.trial_balance": "trialBalance",
  "accessRules.permissions.accounts.balance_sheet": "balanceSheet",
  "accessRules.permissions.accounts.profit_loss": "profitLoss",
  "accessRules.permissions.accounts.cash_flow": "cashFlow",
  "accessRules.permissions.accounts.customer_statement": "customerStatement",
  "accessRules.permissions.accounts.supplier_statement": "supplierStatement",
};

const REPORTS_MAP = {
  "accessRules.permissions.reports.production": ["reports", "productionReport"],
  "accessRules.permissions.reports.buffet": ["reports", "buffetReport"],
  "accessRules.permissions.reports.labor_dashboard": ["reports", "laborDashboard"],
  "accessRules.permissions.reports.daily_labor_cost": ["reports", "dailyLaborCost"],
  "accessRules.permissions.reports.weekly_labor_cost": ["reports", "weeklyLaborCost"],
  "accessRules.permissions.reports.monthly_labor_cost": ["reports", "monthlyLaborCost"],
  "accessRules.permissions.reports.employee_labor_cost": ["reports", "employeeLaborCost"],
  "accessRules.permissions.reports.department_labor_cost": ["reports", "departmentLaborCost"],
  "accessRules.permissions.reports.cost_center_labor_cost": ["reports", "costCenterLaborCost"],
  "accessRules.permissions.reports.average_hourly_cost": ["reports", "averageHourlyCost"],
  "accessRules.permissions.reports.labor_percent": ["reports", "laborPercent"],
  "accessRules.permissions.reports.sales_per_labor_hour": ["reports", "salesPerLaborHour"],
  "accessRules.permissions.reports.revenue_per_employee": ["reports", "revenuePerEmployee"],
  "accessRules.permissions.reports.overtime": ["reports", "overtimeReport"],
  "accessRules.permissions.reports.attendance": ["reports", "attendanceReport"],
  "accessRules.permissions.reports.late_arrival": ["reports", "lateArrivalReport"],
  "accessRules.permissions.reports.absence": ["reports", "absenceReport"],
  "accessRules.permissions.reports.leave": ["reports", "leaveReport"],
  "accessRules.permissions.reports.holiday_cost": ["reports", "holidayCostReport"],
  "accessRules.permissions.reports.scheduled_vs_actual": ["reports", "scheduledVsActual"],
  "accessRules.permissions.reports.manager_approval": ["reports", "managerApprovalReport"],
  "accessRules.permissions.reports.top_labor_cost_employees": ["reports", "topLaborCostEmployees"],
  "accessRules.permissions.reports.top_overtime_employees": ["reports", "topOvertimeEmployees"],
  "accessRules.permissions.reports.payroll_summary": ["reports", "payrollSummary"],
  "accessRules.permissions.reports.payroll_details": ["reports", "payrollDetails"],
  "accessRules.permissions.reports.labor_trend": ["reports", "laborTrend"],
  "accessRules.permissions.reports.labor_forecast_dataset": ["reports", "laborForecast"],
  "accessRules.permissions.reports.coupon": ["titles", "coupon"],
  "accessRules.permissions.reports.sales_hourly_labour": ["titles", "salesHourlyLabour"],
  "accessRules.permissions.reports.sales_hourly_labour_weekly": ["titles", "salesHourlyLabourWeekly"],
};

const INVENTORY_TAB_MAP = {
  "accessRules.permissions.inventory.adjustments": "adjustments",
  "accessRules.permissions.inventory.stock_transfers": "stockTransfers",
  "accessRules.permissions.inventory.kitchen_reconciliation": "kitchenReconciliation",
  "accessRules.permissions.inventory.production_recipes": "recipes",
  "accessRules.permissions.inventory.production": "production",
  "accessRules.permissions.inventory.production_history": "productionHistory",
  "accessRules.permissions.inventory.buffet_menus": "buffetMenus",
  "accessRules.permissions.inventory.buffet_sessions": "buffetSessions",
};

const INVENTORY_EDIT_DELETE = {
  "accessRules.permissions.inventory.purchases.update": "purchases",
  "accessRules.permissions.inventory.purchases.delete": "purchases",
  "accessRules.permissions.inventory.purchase_returns.update": "purchaseReturns",
  "accessRules.permissions.inventory.purchase_returns.delete": "purchaseReturns",
  "accessRules.permissions.inventory.issues.update": "issues",
  "accessRules.permissions.inventory.issues.delete": "issues",
  "accessRules.permissions.inventory.issue_returns.update": "issueReturns",
  "accessRules.permissions.inventory.issue_returns.delete": "issueReturns",
  "accessRules.permissions.inventory.wastes.update": "wastes",
  "accessRules.permissions.inventory.wastes.delete": "wastes",
  "accessRules.permissions.inventory.adjustments.update": "adjustments",
  "accessRules.permissions.inventory.adjustments.delete": "adjustments",
  "accessRules.permissions.inventory.stock_transfers.update": "stockTransfers",
};

const SETTINGS_MAP = {
  "accessRules.permissions.settings.printers": ["printers", "title"],
  "accessRules.permissions.settings.print_options": ["printOptions", "title"],
  "accessRules.permissions.settings.session_security": ["sessionSecurity", "title"],
  "accessRules.permissions.settings.auto_clock_out": ["autoClockOut", "title"],
  "accessRules.permissions.settings.translate_receipts": ["translateReceipts", "title"],
  "accessRules.permissions.settings.inventory": ["inventory", "title"],
  "accessRules.permissions.settings.menus": ["menus", "title"],
};

const ADMIN_TAB_MAP = {
  "accessRules.permissions.admin.workflows": "workflows",
  "accessRules.permissions.admin.extras": "extras",
  "accessRules.permissions.admin.coupons": "coupons",
  "accessRules.permissions.admin.menus": "menus",
  "accessRules.permissions.admin.printers": "printers",
  "accessRules.permissions.admin.roles": "roles",
  "accessRules.permissions.admin.tables": "tables",
  "accessRules.permissions.admin.taxes": "taxes",
};

const MODULE_LABEL_MAP = {
  "accessRules.modules.menu.label": "Menu",
  "accessRules.modules.order_display.label": "Order Display",
  "accessRules.modules.hr.label": "HR",
  "accessRules.modules.accounts.label": "Accounts",
  "accessRules.modules.delivery.label": "Delivery",
  "accessRules.modules.admin.label": "Admin",
};

const TOP_PERMISSION_MAP = {
  "accessRules.permissions.menu": "Menu",
  "accessRules.permissions.order_display": "Order Display",
  "accessRules.permissions.delivery": "Delivery",
  "accessRules.permissions.accounts": "Accounts",
  "accessRules.permissions.hr": "HR",
  "accessRules.permissions.admin": "Admin",
};

const VERBS = {
  ar: { edit: (n) => `تعديل ${n}`, delete: (n) => `حذف ${n}` },
  de: { edit: (n) => `${n} bearbeiten`, delete: (n) => `${n} löschen` },
  es: { edit: (n) => `Editar ${n}`, delete: (n) => `Eliminar ${n}` },
  fr: { edit: (n) => `Modifier ${n}`, delete: (n) => `Supprimer ${n}` },
  it: { edit: (n) => `Modifica ${n}`, delete: (n) => `Elimina ${n}` },
  nl: { edit: (n) => `${n} bewerken`, delete: (n) => `${n} verwijderen` },
  "pt-br": { edit: (n) => `Editar ${n}`, delete: (n) => `Excluir ${n}` },
  ru: { edit: (n) => `Редактировать ${n}`, delete: (n) => `Удалить ${n}` },
  tr: { edit: (n) => `${n} düzenle`, delete: (n) => `${n} sil` },
};

const ORDER_PERMISSIONS = {
  ar: {
    "accessRules.permissions.orders.complete_payment": "إكمال دفع الطلب",
    "accessRules.permissions.orders.update_payment": "تحديث تفاصيل دفع الطلب",
    "accessRules.permissions.orders.move_table": "نقل طاولة الطلب",
    "accessRules.permissions.orders.remote_payment_create": "إنشاء نية دفع عن بُعد",
    "accessRules.permissions.orders.remote_payment_verify": "التحقق من الدفع عن بُعد",
  },
  de: {
    "accessRules.permissions.orders.complete_payment": "Bestellzahlung abschließen",
    "accessRules.permissions.orders.update_payment": "Bestellzahlungsdetails aktualisieren",
    "accessRules.permissions.orders.move_table": "Bestelltisch verschieben",
    "accessRules.permissions.orders.remote_payment_create": "Remote-Zahlungsabsicht erstellen",
    "accessRules.permissions.orders.remote_payment_verify": "Remote-Zahlung prüfen",
  },
  es: {
    "accessRules.permissions.orders.complete_payment": "Completar pago del pedido",
    "accessRules.permissions.orders.update_payment": "Actualizar detalles de pago del pedido",
    "accessRules.permissions.orders.move_table": "Mover mesa del pedido",
    "accessRules.permissions.orders.remote_payment_create": "Crear intención de pago remoto",
    "accessRules.permissions.orders.remote_payment_verify": "Verificar pago remoto",
  },
  fr: {
    "accessRules.permissions.orders.complete_payment": "Finaliser le paiement de la commande",
    "accessRules.permissions.orders.update_payment": "Mettre à jour les détails de paiement",
    "accessRules.permissions.orders.move_table": "Déplacer la table de la commande",
    "accessRules.permissions.orders.remote_payment_create": "Créer une intention de paiement à distance",
    "accessRules.permissions.orders.remote_payment_verify": "Vérifier le paiement à distance",
  },
  it: {
    "accessRules.permissions.orders.complete_payment": "Completa pagamento ordine",
    "accessRules.permissions.orders.update_payment": "Aggiorna dettagli pagamento ordine",
    "accessRules.permissions.orders.move_table": "Sposta tavolo ordine",
    "accessRules.permissions.orders.remote_payment_create": "Crea intent di pagamento remoto",
    "accessRules.permissions.orders.remote_payment_verify": "Verifica pagamento remoto",
  },
  nl: {
    "accessRules.permissions.orders.complete_payment": "Bestellingsbetaling voltooien",
    "accessRules.permissions.orders.update_payment": "Betalingsgegevens bestelling bijwerken",
    "accessRules.permissions.orders.move_table": "Bestellingstafel verplaatsen",
    "accessRules.permissions.orders.remote_payment_create": "Externe betalingsintentie aanmaken",
    "accessRules.permissions.orders.remote_payment_verify": "Externe betaling verifiëren",
  },
  "pt-br": {
    "accessRules.permissions.orders.complete_payment": "Concluir pagamento do pedido",
    "accessRules.permissions.orders.update_payment": "Atualizar detalhes de pagamento do pedido",
    "accessRules.permissions.orders.move_table": "Mover mesa do pedido",
    "accessRules.permissions.orders.remote_payment_create": "Criar intenção de pagamento remoto",
    "accessRules.permissions.orders.remote_payment_verify": "Verificar pagamento remoto",
  },
  ru: {
    "accessRules.permissions.orders.complete_payment": "Завершить оплату заказа",
    "accessRules.permissions.orders.update_payment": "Обновить данные оплаты заказа",
    "accessRules.permissions.orders.move_table": "Переместить стол заказа",
    "accessRules.permissions.orders.remote_payment_create": "Создать удалённое платёжное намерение",
    "accessRules.permissions.orders.remote_payment_verify": "Проверить удалённый платёж",
  },
  tr: {
    "accessRules.permissions.orders.complete_payment": "Sipariş ödemesini tamamla",
    "accessRules.permissions.orders.update_payment": "Sipariş ödeme ayrıntılarını güncelle",
    "accessRules.permissions.orders.move_table": "Sipariş masasını taşı",
    "accessRules.permissions.orders.remote_payment_create": "Uzaktan ödeme niyeti oluştur",
    "accessRules.permissions.orders.remote_payment_verify": "Uzaktan ödemeyi doğrula",
  },
};

const STATIC_PATCHES = {
  ar: {
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "تجريبي / مباشر",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "اللون",
    "forms.roundnessCircle": "دائري",
    "forms.lineTotal": "الإجمالي",
    "forms.moduleCount": "{{count}} وحدة",
    "forms.modules": "الوحدات",
    "forms.password": "كلمة المرور",
    "forms.photo": "صورة",
    "forms.reset": "إعادة تعيين",
    "forms.roleModulesTitle": "الوحدات — {{name}}",
    "discountEngine.placeholders.startTime": "15:00",
    "discountEngine.placeholders.endTime": "18:00",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "ساعة سعيدة",
    "discountEngine.categories.manual": "يدوي",
    "discountEngine.applicationModes.manual": "يدوي",
    "discountEngine.categories.manager": "مدير",
    "discountEngine.categories.product": "منتج",
    "discountEngine.columns.code": "الرمز",
    "discountEngine.columns.mode": "الوضع",
    "discountEngine.fields.minPercent": "الحد الأدنى %",
    "discountEngine.fields.maxPercent": "الحد الأقصى %",
    "discountEngine.fields.type": "النوع",
    "discountEngine.scopes.item": "عنصر",
    "discountEngine.sections.options": "خيارات",
    "securityAlerts.actor": "الفاعل",
    "securityAlerts.actorId": "معرف الفاعل",
    "securityAlerts.info": "معلومات",
    "securityAlerts.count": "×{{n}}",
    "accessRules.permissions.settings.access_control": "التحكم في الوصول",
    "tabs.coupons": "القسائم",
    "tabs.extras": "الإضافات",
    "tabs.menus": "القوائم",
    "tabs.printers": "الطابعات",
    "tabs.roles": "الأدوار",
    "tabs.tables": "الطاولات",
    "tabs.taxes": "الضرائب",
    "tabs.workflows": "سير العمل",
    "columns.actions": "الإجراءات",
    "columns.code": "الرمز",
    "columns.delivery": "التوصيل",
    "columns.description": "الوصف",
    "columns.gateway": "البوابة",
    "columns.login": "تسجيل الدخول",
    "columns.mode": "الوضع",
    "columns.modifiers": "المعدّلات",
    "columns.modules": "الوحدات",
    "columns.name": "الاسم",
    "columns.no": "لا",
    "columns.photo": "صورة",
    "columns.port": "المنفذ",
    "columns.printers": "الطابعات",
    "columns.tables": "الطاولات",
    "columns.type": "النوع",
    "buttons.coupon": "قسيمة",
    "buttons.extra": "إضافة",
    "buttons.layout": "التخطيط",
    "buttons.menu": "قائمة",
    "buttons.printer": "طابعة",
    "buttons.table": "طاولة",
    "buttons.workflow": "سير عمل",
    "entities.coupon": "قسيمة",
    "entities.extra": "إضافة",
    "entities.menu": "قائمة",
    "entities.printer": "طابعة",
    "entities.table": "طاولة",
    "entities.workflow": "سير عمل",
    "dishView.item": "عنصر",
  },
  de: {
    "tabs.workflows": "Arbeitsabläufe",
    "columns.gateway": "Schnittstelle",
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "Sandbox / Live",
    "discountEngine.categories.manager": "Manager",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Happy Hour",
    "discountEngine.categories.manual": "Manuell",
    "discountEngine.applicationModes.manual": "Manuell",
    "discountEngine.categories.product": "Produkt",
    "discountEngine.columns.code": "Code",
    "discountEngine.columns.mode": "Modus",
    "discountEngine.fields.minPercent": "Min. %",
    "discountEngine.fields.maxPercent": "Max. %",
    "discountEngine.fields.type": "Typ",
    "discountEngine.scopes.item": "Artikel",
    "discountEngine.sections.options": "Optionen",
    "securityAlerts.actor": "Akteur",
    "securityAlerts.actorId": "Akteur-ID",
    "securityAlerts.info": "Info",
    "accessRules.permissions.settings.access_control": "Zugriffskontrolle",
    "entities.extra": "Extra",
    "buttons.extra": "Extra",
    "buttons.workflow": "Workflow",
    "entities.workflow": "Workflow",
    "buttons.coupon": "Gutschein",
    "buttons.layout": "Layout",
    "buttons.menu": "Menü",
    "buttons.printer": "Drucker",
    "buttons.table": "Tisch",
    "dishView.item": "Artikel",
  },
  es: {
    "tabs.extras": "Extras",
    "tabs.roles": "Roles",
    "forms.factor": "Factor",
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "sandbox / live",
    "forms.color": "Color",
    "forms.roundnessCircle": "Circular",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.lineTotal": "Total",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Happy hour",
    "discountEngine.categories.manual": "Manual",
    "discountEngine.applicationModes.manual": "Manual",
    "discountEngine.columns.code": "Código",
    "discountEngine.columns.mode": "Modo",
    "discountEngine.fields.minPercent": "Mín. %",
    "discountEngine.fields.maxPercent": "Máx. %",
    "discountEngine.fields.type": "Tipo",
    "discountEngine.scopes.item": "Artículo",
    "discountEngine.sections.options": "Opciones",
    "securityAlerts.actor": "Actor",
    "securityAlerts.actorId": "ID del actor",
    "securityAlerts.info": "Info",
    "accessRules.permissions.settings.access_control": "Control de acceso",
    "columns.no": "No",
    "entities.extra": "Extra",
    "buttons.extra": "Extra",
    "buttons.coupon": "Cupón",
    "buttons.layout": "Diseño",
    "buttons.menu": "Menú",
    "buttons.printer": "Impresora",
    "buttons.table": "Mesa",
    "buttons.workflow": "Flujo de trabajo",
    "entities.coupon": "Cupón",
    "entities.menu": "Menú",
    "entities.printer": "Impresora",
    "entities.table": "Mesa",
    "entities.workflow": "Flujo de trabajo",
    "dishView.item": "Artículo",
  },
  fr: {
    "tabs.menus": "Cartes",
    "tabs.coupons": "Bons",
    "tabs.taxes": "Taxes",
    "tabs.tables": "Tables",
    "tabs.printers": "Imprimantes",
    "tabs.roles": "Rôles",
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "bac à sable / production",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "Couleur",
    "forms.roundnessCircle": "Circulaire",
    "forms.lineTotal": "Total",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Heure creuse",
    "discountEngine.categories.manual": "Manuel",
    "discountEngine.applicationModes.manual": "Manuel",
    "discountEngine.categories.manager": "Manager",
    "discountEngine.categories.product": "Produit",
    "discountEngine.columns.code": "Code",
    "discountEngine.columns.mode": "Mode",
    "discountEngine.fields.minPercent": "Min. %",
    "discountEngine.fields.maxPercent": "Max. %",
    "discountEngine.fields.type": "Type",
    "discountEngine.scopes.item": "Article",
    "discountEngine.sections.options": "Options",
    "securityAlerts.actor": "Acteur",
    "securityAlerts.actorId": "ID acteur",
    "securityAlerts.info": "Info",
    "accessRules.permissions.settings.access_control": "Contrôle d'accès",
    "columns.actions": "Actions",
    "columns.code": "Code",
    "columns.description": "Description",
    "columns.mode": "Mode",
    "columns.modules": "Modules",
    "columns.photo": "Photo",
    "columns.port": "Port",
    "columns.type": "Type",
    "entities.coupon": "Coupon",
    "entities.menu": "Carte",
    "buttons.coupon": "Coupon",
    "buttons.extra": "Supplément",
    "buttons.layout": "Plan",
    "buttons.menu": "Carte",
    "buttons.printer": "Imprimante",
    "buttons.table": "Table",
    "buttons.workflow": "Flux de travail",
    "dishView.item": "Article",
  },
  it: {
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "sandbox / live",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "Colore",
    "forms.roundnessCircle": "Circolare",
    "forms.lineTotal": "Totale",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Happy hour",
    "discountEngine.categories.manual": "Manuale",
    "discountEngine.applicationModes.manual": "Manuale",
    "discountEngine.categories.manager": "Manager",
    "discountEngine.categories.product": "Prodotto",
    "discountEngine.columns.code": "Codice",
    "discountEngine.columns.mode": "Modalità",
    "discountEngine.fields.minPercent": "Min. %",
    "discountEngine.fields.maxPercent": "Max. %",
    "discountEngine.fields.type": "Tipo",
    "discountEngine.scopes.item": "Articolo",
    "discountEngine.sections.options": "Opzioni",
    "securityAlerts.actor": "Attore",
    "securityAlerts.actorId": "ID attore",
    "securityAlerts.info": "Info",
    "accessRules.permissions.settings.access_control": "Controllo accessi",
    "tabs.coupons": "Coupon",
    "tabs.extras": "Extra",
    "tabs.menus": "Menu",
    "tabs.printers": "Stampanti",
    "tabs.roles": "Ruoli",
    "tabs.tables": "Tavoli",
    "tabs.taxes": "Tasse",
    "tabs.workflows": "Flussi di lavoro",
    "columns.actions": "Azioni",
    "columns.code": "Codice",
    "columns.description": "Descrizione",
    "columns.gateway": "Gateway",
    "columns.mode": "Modalità",
    "columns.modules": "Moduli",
    "columns.photo": "Foto",
    "columns.port": "Porta",
    "columns.type": "Tipo",
    "buttons.coupon": "Coupon",
    "buttons.extra": "Extra",
    "buttons.layout": "Layout",
    "buttons.menu": "Menu",
    "buttons.printer": "Stampante",
    "buttons.table": "Tavolo",
    "buttons.workflow": "Flusso di lavoro",
    "entities.coupon": "Coupon",
    "entities.extra": "Extra",
    "entities.menu": "Menu",
    "entities.printer": "Stampante",
    "entities.table": "Tavolo",
    "entities.workflow": "Flusso di lavoro",
    "dishView.item": "Articolo",
  },
  nl: {
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "sandbox / live",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "Kleur",
    "forms.roundnessCircle": "Rond",
    "forms.lineTotal": "Totaal",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Happy hour",
    "discountEngine.categories.manual": "Handmatig",
    "discountEngine.applicationModes.manual": "Handmatig",
    "discountEngine.categories.manager": "Manager",
    "discountEngine.categories.product": "Product",
    "discountEngine.columns.code": "Code",
    "discountEngine.columns.mode": "Modus",
    "discountEngine.fields.minPercent": "Min. %",
    "discountEngine.fields.maxPercent": "Max. %",
    "discountEngine.fields.type": "Type",
    "discountEngine.scopes.item": "Artikel",
    "discountEngine.sections.options": "Opties",
    "securityAlerts.actor": "Actor",
    "securityAlerts.actorId": "Actor-ID",
    "securityAlerts.info": "Info",
    "accessRules.permissions.settings.access_control": "Toegangscontrole",
    "tabs.coupons": "Coupons",
    "tabs.extras": "Extra's",
    "tabs.menus": "Menu's",
    "tabs.printers": "Printers",
    "tabs.roles": "Rollen",
    "tabs.tables": "Tafels",
    "tabs.taxes": "Belastingen",
    "tabs.workflows": "Workflows",
    "columns.actions": "Acties",
    "columns.delivery": "Bezorging",
    "columns.description": "Beschrijving",
    "columns.gateway": "Gateway",
    "columns.login": "Login",
    "columns.mode": "Modus",
    "columns.modifiers": "Modificaties",
    "columns.modules": "Modules",
    "columns.name": "Naam",
    "columns.no": "Nee",
    "columns.photo": "Foto",
    "columns.port": "Poort",
    "columns.printers": "Printers",
    "columns.tables": "Tafels",
    "columns.type": "Type",
    "buttons.coupon": "Coupon",
    "buttons.extra": "Extra",
    "buttons.layout": "Indeling",
    "buttons.menu": "Menu",
    "buttons.printer": "Printer",
    "buttons.table": "Tafel",
    "buttons.workflow": "Workflow",
    "entities.coupon": "Coupon",
    "entities.extra": "Extra",
    "entities.menu": "Menu",
    "entities.printer": "Printer",
    "entities.table": "Tafel",
    "entities.workflow": "Workflow",
    "dishView.item": "Artikel",
  },
  "pt-br": {
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "sandbox / live",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "Cor",
    "forms.roundnessCircle": "Circular",
    "forms.lineTotal": "Total",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Happy hour",
    "discountEngine.categories.manual": "Manual",
    "discountEngine.applicationModes.manual": "Manual",
    "discountEngine.categories.manager": "Gerente",
    "discountEngine.categories.product": "Produto",
    "discountEngine.columns.code": "Código",
    "discountEngine.columns.mode": "Modo",
    "discountEngine.fields.minPercent": "Mín. %",
    "discountEngine.fields.maxPercent": "Máx. %",
    "discountEngine.fields.type": "Tipo",
    "discountEngine.scopes.item": "Item",
    "discountEngine.sections.options": "Opções",
    "securityAlerts.actor": "Ator",
    "securityAlerts.actorId": "ID do ator",
    "securityAlerts.info": "Info",
    "accessRules.permissions.settings.access_control": "Controle de acesso",
    "tabs.coupons": "Cupons",
    "tabs.extras": "Extras",
    "tabs.menus": "Menus",
    "tabs.printers": "Impressoras",
    "tabs.roles": "Funções",
    "tabs.tables": "Mesas",
    "tabs.taxes": "Impostos",
    "tabs.workflows": "Fluxos de trabalho",
    "columns.actions": "Ações",
    "columns.code": "Código",
    "columns.delivery": "Entrega",
    "columns.description": "Descrição",
    "columns.gateway": "Gateway",
    "columns.login": "Login",
    "columns.mode": "Modo",
    "columns.modifiers": "Modificadores",
    "columns.modules": "Módulos",
    "columns.name": "Nome",
    "columns.no": "Não",
    "columns.photo": "Foto",
    "columns.port": "Porta",
    "columns.printers": "Impressoras",
    "columns.tables": "Mesas",
    "columns.type": "Tipo",
    "buttons.coupon": "Cupom",
    "buttons.extra": "Extra",
    "buttons.layout": "Layout",
    "buttons.menu": "Menu",
    "buttons.printer": "Impressora",
    "buttons.table": "Mesa",
    "buttons.workflow": "Fluxo de trabalho",
    "entities.coupon": "Cupom",
    "entities.extra": "Extra",
    "entities.menu": "Menu",
    "entities.printer": "Impressora",
    "entities.table": "Mesa",
    "entities.workflow": "Fluxo de trabalho",
    "dishView.item": "Item",
  },
  ru: {
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "песочница / боевой",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "Цвет",
    "forms.roundnessCircle": "Круглый",
    "forms.lineTotal": "Итого",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Счастливый час",
    "discountEngine.categories.manual": "Вручную",
    "discountEngine.applicationModes.manual": "Вручную",
    "discountEngine.categories.manager": "Менеджер",
    "discountEngine.categories.product": "Продукт",
    "discountEngine.columns.code": "Код",
    "discountEngine.columns.mode": "Режим",
    "discountEngine.fields.minPercent": "Мин. %",
    "discountEngine.fields.maxPercent": "Макс. %",
    "discountEngine.fields.type": "Тип",
    "discountEngine.scopes.item": "Позиция",
    "discountEngine.sections.options": "Параметры",
    "securityAlerts.actor": "Субъект",
    "securityAlerts.actorId": "ID субъекта",
    "securityAlerts.info": "Информация",
    "accessRules.permissions.settings.access_control": "Контроль доступа",
    "tabs.coupons": "Купоны",
    "tabs.extras": "Дополнения",
    "tabs.menus": "Меню",
    "tabs.printers": "Принтеры",
    "tabs.roles": "Роли",
    "tabs.tables": "Столы",
    "tabs.taxes": "Налоги",
    "tabs.workflows": "Рабочие процессы",
    "columns.actions": "Действия",
    "columns.code": "Код",
    "columns.delivery": "Доставка",
    "columns.description": "Описание",
    "columns.gateway": "Шлюз",
    "columns.login": "Логин",
    "columns.mode": "Режим",
    "columns.modifiers": "Модификаторы",
    "columns.modules": "Модули",
    "columns.name": "Название",
    "columns.no": "Нет",
    "columns.photo": "Фото",
    "columns.port": "Порт",
    "columns.printers": "Принтеры",
    "columns.tables": "Столы",
    "columns.type": "Тип",
    "buttons.coupon": "Купон",
    "buttons.extra": "Дополнение",
    "buttons.layout": "Расположение",
    "buttons.menu": "Меню",
    "buttons.printer": "Принтер",
    "buttons.table": "Стол",
    "buttons.workflow": "Рабочий процесс",
    "entities.coupon": "Купон",
    "entities.extra": "Дополнение",
    "entities.menu": "Меню",
    "entities.printer": "Принтер",
    "entities.table": "Стол",
    "entities.workflow": "Рабочий процесс",
    "dishView.item": "Позиция",
  },
  tr: {
    "columns.port": "Port",
    "forms.modifierGroupTitle": "{{modifier}} — {{group}}",
    "forms.sandboxLive": "sandbox / canlı",
    "forms.menuNestedModifierPricesTitle": "{{modifier}} — {{group}}",
    "forms.color": "Renk",
    "forms.roundnessCircle": "Dairesel",
    "forms.lineTotal": "Toplam",
    "discountEngine.fields.minPercent": "Min. %",
    "discountEngine.categories.vip": "VIP",
    "discountEngine.categories.happy_hour": "Mutlu saat",
    "discountEngine.categories.manual": "Manuel",
    "discountEngine.applicationModes.manual": "Manuel",
    "discountEngine.categories.manager": "Yönetici",
    "discountEngine.categories.product": "Ürün",
    "discountEngine.columns.code": "Kod",
    "discountEngine.columns.mode": "Mod",
    "discountEngine.fields.maxPercent": "Maks. %",
    "discountEngine.fields.type": "Tür",
    "discountEngine.scopes.item": "Kalem",
    "discountEngine.sections.options": "Seçenekler",
    "securityAlerts.actor": "Aktör",
    "securityAlerts.actorId": "Aktör ID",
    "securityAlerts.info": "Bilgi",
    "accessRules.permissions.settings.access_control": "Erişim kontrolü",
    "tabs.coupons": "Kuponlar",
    "tabs.extras": "Ekstralar",
    "tabs.menus": "Menüler",
    "tabs.printers": "Yazıcılar",
    "tabs.roles": "Roller",
    "tabs.tables": "Masalar",
    "tabs.taxes": "Vergiler",
    "tabs.workflows": "İş akışları",
    "columns.actions": "İşlemler",
    "columns.code": "Kod",
    "columns.delivery": "Teslimat",
    "columns.description": "Açıklama",
    "columns.gateway": "Ağ geçidi",
    "columns.login": "Giriş",
    "columns.mode": "Mod",
    "columns.modifiers": "Değiştiriciler",
    "columns.modules": "Modüller",
    "columns.name": "Ad",
    "columns.no": "Hayır",
    "columns.photo": "Fotoğraf",
    "columns.printers": "Yazıcılar",
    "columns.tables": "Masalar",
    "columns.type": "Tür",
    "buttons.coupon": "Kupon",
    "buttons.extra": "Ekstra",
    "buttons.layout": "Düzen",
    "buttons.menu": "Menü",
    "buttons.printer": "Yazıcı",
    "buttons.table": "Masa",
    "buttons.workflow": "İş akışı",
    "entities.coupon": "Kupon",
    "entities.extra": "Ekstra",
    "entities.menu": "Menü",
    "entities.printer": "Yazıcı",
    "entities.table": "Masa",
    "entities.workflow": "İş akışı",
    "dishView.item": "Kalem",
  },
};

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), "utf8"));
}

function getLeafPaths(obj, prefix = "") {
  const paths = {};
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(paths, getLeafPaths(v, p));
    } else {
      paths[p] = v;
    }
  }
  return paths;
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== "object" || Array.isArray(cur[parts[i]])) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function setAdminValue(obj, path, value) {
  if (path.startsWith("accessRules.permissions.")) {
    const key = path.slice("accessRules.permissions.".length);
    if (!obj.accessRules) obj.accessRules = {};
    if (!obj.accessRules.permissions) obj.accessRules.permissions = {};
    obj.accessRules.permissions[key] = value;
    return;
  }
  setByPath(obj, path, value);
}

function flattenPermissions(permissions) {
  const result = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        result[`${key}.${subKey}`] = subValue;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

const TOP_LEVEL_PERMISSION_MODULES = {
  "accessRules.permissions.orders": "Orders",
  "accessRules.permissions.reports": "Reports",
  "accessRules.permissions.admin": "Admin",
  "accessRules.permissions.inventory": "Inventory",
  "accessRules.permissions.hr": "HR",
  "accessRules.permissions.settings": "Settings",
  "accessRules.permissions.accounts": "Accounts",
};

function buildAutoPatches(lang, admin) {
  const nav = loadJson(`src/locales/${lang}/navigation.json`);
  const accounts = loadJson(`src/locales/${lang}/accounts.json`);
  const hr = loadJson(`src/locales/${lang}/hr.json`);
  const reports = loadJson(`src/locales/${lang}/reports.json`);
  const inventory = loadJson(`src/locales/${lang}/inventory.json`);
  const settings = loadJson(`src/locales/${lang}/settings.json`);
  const orders = loadJson(`src/locales/${lang}/orders.json`);
  const verbs = VERBS[lang];
  const patches = {};

  for (const [path, moduleKey] of Object.entries(MODULE_LABEL_MAP)) {
    patches[path] = nav.modules[moduleKey];
  }

  for (const [path, moduleKey] of Object.entries(TOP_PERMISSION_MAP)) {
    patches[path] = nav.modules[moduleKey];
  }

  for (const [path, tabKey] of Object.entries(HR_TAB_MAP)) {
    if (path.endsWith(".dashboard")) {
      patches[path] = `${nav.modules.HR} — ${hr.tabs[tabKey]}`;
    } else {
      patches[path] = hr.tabs[tabKey];
    }
  }

  for (const [path, tabKey] of Object.entries(ACCOUNTS_TAB_MAP)) {
    patches[path] = accounts.tabs[tabKey];
  }

  for (const [path, [section, key]] of Object.entries(REPORTS_MAP)) {
    patches[path] = reports[section][key];
  }

  for (const [path, tabKey] of Object.entries(INVENTORY_TAB_MAP)) {
    patches[path] = inventory.tabs[tabKey];
  }

  patches["accessRules.permissions.reports.kitchen_reconciliation"] =
    inventory.tabs.kitchenReconciliation;
  patches["accessRules.permissions.inventory.kitchen_reconciliation"] =
    inventory.tabs.kitchenReconciliation;

  if (inventory.tabs.adjustments === "Adjustments" && hr.tabs.adjustments) {
    patches["accessRules.permissions.inventory.adjustments"] = hr.tabs.adjustments;
  }

  for (const [path, tabKey] of Object.entries(INVENTORY_EDIT_DELETE)) {
    const label = inventory.tabs[tabKey];
    patches[path] = path.endsWith(".delete") ? verbs.delete(label) : verbs.edit(label);
  }

  for (const [path, [section, key]] of Object.entries(SETTINGS_MAP)) {
    patches[path] = settings[section][key];
  }

  for (const [path, tabKey] of Object.entries(ADMIN_TAB_MAP)) {
    patches[path] = admin.tabs[tabKey];
  }

  patches["accessRules.permissions.orders.open_cash_drawer"] =
    orders.actions.openCashDrawer;

  Object.assign(patches, ORDER_PERMISSIONS[lang]);

  for (const [path, moduleKey] of Object.entries(TOP_LEVEL_PERMISSION_MODULES)) {
    patches[path] = nav.modules[moduleKey];
  }

  return patches;
}

function analyze(enLeaves, locLeaves) {
  const missing = Object.keys(enLeaves).filter((k) => !(k in locLeaves));
  const identical = Object.keys(enLeaves).filter(
    (k) =>
      k in locLeaves &&
      locLeaves[k] === enLeaves[k] &&
      typeof enLeaves[k] === "string" &&
      !EXEMPT.has(k),
  );
  return { missing, identical };
}

const en = loadJson("src/locales/en/admin.json");
const enLeaves = getLeafPaths(en);
const before = {};

for (const lang of LANGS) {
  const loc = loadJson(`src/locales/${lang}/admin.json`);
  before[lang] = analyze(enLeaves, getLeafPaths(loc));
}

for (const lang of LANGS) {
  const filePath = `src/locales/${lang}/admin.json`;
  const admin = loadJson(filePath);
  if (admin.accessRules?.permissions) {
    admin.accessRules.permissions = flattenPermissions(admin.accessRules.permissions);
  }

  const patches = {
    ...buildAutoPatches(lang, admin),
    ...PART_A[lang],
    ...STATIC_PATCHES[lang],
  };

  for (const [path, value] of Object.entries(patches)) {
    if (value !== undefined && value !== null && value !== "") {
      setAdminValue(admin, path, value);
    }
  }

  writeFileSync(join(ROOT, filePath), `${JSON.stringify(admin, null, 2)}\n`, "utf8");
}

console.log("admin.json locale sync complete\n");
console.log("lang\tmissing_before\tstillEN_before\tmissing_after\tstillEN_after");
for (const lang of LANGS) {
  const loc = loadJson(`src/locales/${lang}/admin.json`);
  const after = analyze(enLeaves, getLeafPaths(loc));
  console.log(
    `${lang}\t${before[lang].missing.length}\t${before[lang].identical.length}\t${after.missing.length}\t${after.identical.length}`,
  );
}
