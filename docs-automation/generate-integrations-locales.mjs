#!/usr/bin/env node
/**
 * Generate integrations locale JSON from English master.
 * Run: node docs-automation/generate-integrations-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');
const KEY = 'integrations';
const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>} */
const T = {
  es: {
    title: 'Integraciones',
    intro: 'Las integraciones conectan POSR con proveedores externos de contabilidad, fiscalidad, logging e inventario. Active proveedores, configure credenciales y supervise salud y cola.',
    sections: {
      open: { title: 'Abrir Integraciones', steps: ['Inicie sesión con acceso a integraciones.', 'Pulse Integraciones en la barra lateral.', 'Se abre en la pestaña Proveedores por defecto.'], caption: 'Pantalla Integraciones con pestañas y lista de proveedores.' },
      tabs: { title: 'Navegación por pestañas', intro: 'Las pestañas cubren lista, configuración, salud y cola. Cambiar puede requerir PIN de gerente.', steps: ['Proveedores lista conectores y switches.', 'Configuración guarda credenciales y opciones.', 'Salud y Cola muestran estado y trabajos pendientes.'], caption: 'Barra de pestañas de Integraciones.' },
      providers: { title: 'Proveedores', steps: ['Revise cada tarjeta: nombre, categoría, versión y estado.', 'Use el switch para activar o desactivar (puede pedir aprobación).', 'Pulse Configurar para abrir ese proveedor en Configuración.'], caption: 'Lista de proveedores con switches.' },
      configuration: { title: 'Configuración', intro: 'Guarda secretos y opciones de mapeo del proveedor seleccionado.', steps: ['Seleccione un proveedor o llegue vía Configurar.', 'Complete campos requeridos (API keys, IDs, mapeos).', 'Conecte o ejecute sincronización inicial si aplica.'], caption: 'Panel de configuración de un proveedor.' },
      health: { title: 'Salud', steps: ['Abra Salud para ver estados de proveedores.', 'Los sanos pueden enviar eventos; los fallidos necesitan revisión.', 'Se actualiza al abrir Integraciones o al activar/desactivar.'], caption: 'Panel de estado de salud.' },
      queue: { title: 'Cola', intro: 'La cola guarda trabajos salientes hacia sistemas externos.', steps: ['Abra Cola para ver pendientes, reintentos o fallidos.', 'Los trabajos se actualizan con la pestaña abierta.', 'Los fallidos suelen limpiarse tras corregir la configuración.'], caption: 'Panel de cola de integración.' },
    },
  },
  tr: {
    title: 'Entegrasyonlar',
    intro: 'Entegrasyonlar POSR\'yi muhasebe, mali, günlük ve envanter sağlayıcılarına bağlar. Sağlayıcıları etkinleştirin, kimlik bilgilerini yapılandırın, sağlık ve kuyruğu izleyin.',
    sections: {
      open: { title: 'Entegrasyonları aç', steps: ['Entegrasyon erişimiyle giriş yapın.', 'Yan menüde Entegrasyonlar\'a dokunun.', 'Varsayılan olarak Sağlayıcılar sekmesi açılır.'], caption: 'Entegrasyonlar ekranı.' },
      tabs: { title: 'Sekme gezinmesi', intro: 'Sekmeler liste, yapılandırma, sağlık ve kuyruğu kapsar.', steps: ['Sağlayıcılar bağlayıcıları listeler.', 'Yapılandırma kimlik bilgilerini tutar.', 'Sağlık ve Kuyruk durum ve işleri gösterir.'], caption: 'Entegrasyonlar sekme çubuğu.' },
      providers: { title: 'Sağlayıcılar', steps: ['Her kartı inceleyin: ad, kategori, sürüm.', 'Anahtarla etkinleştirin veya kapatın.', 'Yapılandır ile Yapılandırma sekmesine gidin.'], caption: 'Sağlayıcı listesi.' },
      configuration: { title: 'Yapılandırma', intro: 'Seçili sağlayıcı için gizli anahtarlar ve eşlemeler.', steps: ['Sağlayıcı seçin.', 'Gerekli alanları doldurun.', 'OAuth veya ilk senkronizasyonu çalıştırın.'], caption: 'Yapılandırma paneli.' },
      health: { title: 'Sağlık', steps: ['Sağlık sekmesini açın.', 'Sağlıklı sağlayıcılar olay gönderebilir.', 'Açılışta veya etkinleştirmede yenilenir.'], caption: 'Sağlık paneli.' },
      queue: { title: 'Kuyruk', intro: 'Dış sistemlere giden işleri tutar.', steps: ['Kuyruk sekmesini açın.', 'Sekme açıkken işler güncellenir.', 'Başarısız işler yapılandırma sonrası düzelir.'], caption: 'Kuyruk paneli.' },
    },
  },
  'pt-br': {
    title: 'Integrações',
    intro: 'Integrações conectam o POSR a provedores externos de contabilidade, fiscal, logging e estoque. Ative provedores, configure credenciais e monitore saúde e fila.',
    sections: {
      open: { title: 'Abrir Integrações', steps: ['Entre com acesso a integrações.', 'Toque em Integrações na barra lateral.', 'Abre na aba Provedores.'], caption: 'Tela Integrações.' },
      tabs: { title: 'Navegação por abas', intro: 'Abas cobrem lista, configuração, saúde e fila.', steps: ['Provedores lista conectores.', 'Configuração guarda credenciais.', 'Saúde e Fila mostram status e jobs.'], caption: 'Barra de abas Integrações.' },
      providers: { title: 'Provedores', steps: ['Revise cada cartão: nome, categoria, versão.', 'Use o switch para ativar ou desativar.', 'Toque em Configurar para abrir a configuração.'], caption: 'Lista de provedores.' },
      configuration: { title: 'Configuração', intro: 'Armazena segredos e mapeamentos do provedor.', steps: ['Selecione um provedor.', 'Preencha os campos obrigatórios.', 'Conecte ou rode a sincronização inicial.'], caption: 'Painel de configuração.' },
      health: { title: 'Saúde', steps: ['Abra Saúde para ver status.', 'Provedores saudáveis enviam eventos.', 'Atualiza ao abrir ou ao ativar/desativar.'], caption: 'Painel de saúde.' },
      queue: { title: 'Fila', intro: 'Guarda jobs de saída para sistemas externos.', steps: ['Abra Fila para ver pendentes ou falhas.', 'Jobs atualizam com a aba aberta.', 'Falhas costumam limpar após corrigir a configuração.'], caption: 'Painel da fila.' },
    },
  },
  fr: {
    title: 'Intégrations',
    intro: 'Les intégrations connectent POSR à des fournisseurs externes (comptabilité, fiscal, logging, inventaire). Activez, configurez et surveillez santé et file.',
    sections: {
      open: { title: 'Ouvrir Intégrations', steps: ['Connectez-vous avec accès intégrations.', 'Appuyez sur Intégrations.', 'S\'ouvre sur Fournisseurs.'], caption: 'Écran Intégrations.' },
      tabs: { title: 'Navigation par onglets', intro: 'Onglets : liste, configuration, santé et file.', steps: ['Fournisseurs liste les connecteurs.', 'Configuration stocke les identifiants.', 'Santé et File montrent l\'état et les jobs.'], caption: 'Barre d\'onglets Intégrations.' },
      providers: { title: 'Fournisseurs', steps: ['Examinez chaque carte : nom, catégorie, version.', 'Activez ou désactivez avec le switch.', 'Appuyez sur Configurer.'], caption: 'Liste des fournisseurs.' },
      configuration: { title: 'Configuration', intro: 'Secrets et options de mapping du fournisseur.', steps: ['Sélectionnez un fournisseur.', 'Remplissez les champs requis.', 'Connectez ou lancez la synchro initiale.'], caption: 'Panneau de configuration.' },
      health: { title: 'Santé', steps: ['Ouvrez Santé pour les statuts.', 'Les fournisseurs sains envoient des événements.', 'Actualisé à l\'ouverture ou au bascule.'], caption: 'Panneau santé.' },
      queue: { title: 'File', intro: 'Jobs sortants vers systèmes externes.', steps: ['Ouvrez File pour voir en attente ou échecs.', 'Les jobs se mettent à jour onglet ouvert.', 'Les échecs se résolvent après correction.'], caption: 'Panneau file.' },
    },
  },
  nl: {
    title: 'Integraties',
    intro: 'Integraties verbinden POSR met externe boekhoud-, fiscale, logging- en voorraadproviders. Schakel in, configureer en monitor gezondheid en wachtrij.',
    sections: {
      open: { title: 'Integraties openen', steps: ['Log in met integratietoegang.', 'Tik op Integraties.', 'Opent op Providers.'], caption: 'Integratiescherm.' },
      tabs: { title: 'Tabnavigatie', intro: 'Tabs: lijst, configuratie, gezondheid en wachtrij.', steps: ['Providers toont connectors.', 'Configuratie bewaart credentials.', 'Gezondheid en Wachtrij tonen status en jobs.'], caption: 'Integraties tabbalk.' },
      providers: { title: 'Providers', steps: ['Bekijk elke kaart: naam, categorie, versie.', 'Schakel in of uit.', 'Tik op Configureren.'], caption: 'Providerslijst.' },
      configuration: { title: 'Configuratie', intro: 'Geheimhouding en mapping van de provider.', steps: ['Selecteer een provider.', 'Vul verplichte velden in.', 'Verbind of start initiële sync.'], caption: 'Configuratiepaneel.' },
      health: { title: 'Gezondheid', steps: ['Open Gezondheid voor status.', 'Gezonde providers sturen events.', 'Vernieuwt bij openen of inschakelen.'], caption: 'Gezondheidspaneel.' },
      queue: { title: 'Wachtrij', intro: 'Uitgaande jobs naar externe systemen.', steps: ['Open Wachtrij voor openstaande of mislukte jobs.', 'Jobs updaten met tab open.', 'Mislukte jobs lossen op na config-fix.'], caption: 'Wachtrijpaneel.' },
    },
  },
  de: {
    title: 'Integrationen',
    intro: 'Integrationen verbinden POSR mit externen Buchhaltungs-, Fiskal-, Logging- und Inventaranbietern. Aktivieren, konfigurieren und Gesundheit sowie Warteschlange überwachen.',
    sections: {
      open: { title: 'Integrationen öffnen', steps: ['Mit Integrationszugriff anmelden.', 'Integrationen tippen.', 'Öffnet Anbieter.'], caption: 'Integrationen-Bildschirm.' },
      tabs: { title: 'Tab-Navigation', intro: 'Tabs: Liste, Konfiguration, Gesundheit und Warteschlange.', steps: ['Anbieter listet Konnektoren.', 'Konfiguration speichert Zugangsdaten.', 'Gesundheit und Warteschlange zeigen Status und Jobs.'], caption: 'Integrationen-Tableiste.' },
      providers: { title: 'Anbieter', steps: ['Jede Karte prüfen: Name, Kategorie, Version.', 'Mit Schalter aktivieren oder deaktivieren.', 'Konfigurieren tippen.'], caption: 'Anbieterliste.' },
      configuration: { title: 'Konfiguration', intro: 'Geheimnisse und Mapping des Anbieters.', steps: ['Anbieter wählen.', 'Pflichtfelder ausfüllen.', 'Verbinden oder Erstsync starten.'], caption: 'Konfigurationspanel.' },
      health: { title: 'Gesundheit', steps: ['Gesundheit öffnen für Status.', 'Gesunde Anbieter senden Events.', 'Aktualisiert beim Öffnen oder Umschalten.'], caption: 'Gesundheitspanel.' },
      queue: { title: 'Warteschlange', intro: 'Ausgehende Jobs zu externen Systemen.', steps: ['Warteschlange öffnen.', 'Jobs aktualisieren bei offenem Tab.', 'Fehlgeschlagene Jobs nach Config-Fix.'], caption: 'Warteschlangenpanel.' },
    },
  },
  it: {
    title: 'Integrazioni',
    intro: 'Le integrazioni collegano POSR a provider esterni di contabilità, fiscale, logging e inventario. Abilita, configura e monitora salute e coda.',
    sections: {
      open: { title: 'Apri Integrazioni', steps: ['Accedi con accesso integrazioni.', 'Tocca Integrazioni.', 'Si apre su Provider.'], caption: 'Schermata Integrazioni.' },
      tabs: { title: 'Navigazione schede', intro: 'Schede: elenco, configurazione, salute e coda.', steps: ['Provider elenca i connettori.', 'Configurazione conserva le credenziali.', 'Salute e Coda mostrano stato e job.'], caption: 'Barra schede Integrazioni.' },
      providers: { title: 'Provider', steps: ['Rivedi ogni card: nome, categoria, versione.', 'Usa lo switch per abilitare o disabilitare.', 'Tocca Configura.'], caption: 'Elenco provider.' },
      configuration: { title: 'Configurazione', intro: 'Segreti e mapping del provider selezionato.', steps: ['Seleziona un provider.', 'Compila i campi obbligatori.', 'Connetti o avvia la sync iniziale.'], caption: 'Pannello configurazione.' },
      health: { title: 'Salute', steps: ['Apri Salute per gli stati.', 'I provider sani inviano eventi.', 'Si aggiorna all\'apertura o al toggle.'], caption: 'Pannello salute.' },
      queue: { title: 'Coda', intro: 'Job in uscita verso sistemi esterni.', steps: ['Apri Coda per pending o falliti.', 'I job si aggiornano con la scheda aperta.', 'I falliti si risolvono dopo la fix.'], caption: 'Pannello coda.' },
    },
  },
  ar: {
    title: 'التكاملات',
    intro: 'تربط التكاملات POSR بمزوّدين خارجيين للمحاسبة والضرائب والسجلات والمخزون. فعّل المزوّدين واضبط الاعتمادات وراقب الصحة والطابور.',
    sections: {
      open: { title: 'فتح التكاملات', steps: ['سجّل الدخول بصلاحية التكاملات.', 'اضغط التكاملات في الشريط الجانبي.', 'تفتح على تبويب المزوّدين افتراضياً.'], caption: 'شاشة التكاملات.' },
      tabs: { title: 'التنقل بين التبويبات', intro: 'التبويبات: القائمة والإعداد والصحة والطابور.', steps: ['المزوّدون يعرضون الموصلات.', 'الإعداد يحفظ الاعتمادات.', 'الصحة والطابور يعرضان الحالة والمهام.'], caption: 'شريط تبويبات التكاملات.' },
      providers: { title: 'المزوّدون', steps: ['راجع كل بطاقة: الاسم والفئة والإصدار.', 'استخدم المفتاح للتفعيل أو التعطيل.', 'اضغط إعداد لفتح تبويب الإعداد.'], caption: 'قائمة المزوّدين.' },
      configuration: { title: 'الإعداد', intro: 'يخزّن الأسرار وخيارات الربط للمزوّد.', steps: ['اختر مزوّداً.', 'املأ الحقول المطلوبة.', 'اربط أو شغّل المزامنة الأولية.'], caption: 'لوحة إعداد المزوّد.' },
      health: { title: 'الصحة', steps: ['افتح الصحة لعرض الحالات.', 'المزوّدون السليمون يرسلون الأحداث.', 'تُحدَّث عند الفتح أو التفعيل.'], caption: 'لوحة الصحة.' },
      queue: { title: 'الطابور', intro: 'يحفظ المهام الصادرة إلى الأنظمة الخارجية.', steps: ['افتح الطابور لعرض المعلّق أو الفاشل.', 'تتحدّث المهام والتبويب مفتوح.', 'الفشل يُصلح بعد تصحيح الإعداد.'], caption: 'لوحة الطابور.' },
    },
  },
  ru: {
    title: 'Интеграции',
    intro: 'Интеграции связывают POSR с внешними провайдерами учёта, фискальности, логирования и склада. Включайте провайдеров, настраивайте доступ и следите за здоровьем и очередью.',
    sections: {
      open: { title: 'Открыть Интеграции', steps: ['Войдите с доступом к интеграциям.', 'Нажмите Интеграции.', 'Открывается вкладка Провайдеры.'], caption: 'Экран Интеграции.' },
      tabs: { title: 'Навигация по вкладкам', intro: 'Вкладки: список, конфигурация, здоровье и очередь.', steps: ['Провайдеры показывают коннекторы.', 'Конфигурация хранит учётные данные.', 'Здоровье и Очередь — статус и задания.'], caption: 'Панель вкладок Интеграции.' },
      providers: { title: 'Провайдеры', steps: ['Просмотрите карточку: имя, категория, версия.', 'Включите или отключите переключателем.', 'Нажмите Настроить.'], caption: 'Список провайдеров.' },
      configuration: { title: 'Конфигурация', intro: 'Секреты и сопоставления выбранного провайдера.', steps: ['Выберите провайдера.', 'Заполните обязательные поля.', 'Подключите или запустите первичную синхронизацию.'], caption: 'Панель конфигурации.' },
      health: { title: 'Здоровье', steps: ['Откройте Здоровье для статусов.', 'Здоровые провайдеры отправляют события.', 'Обновляется при открытии или переключении.'], caption: 'Панель здоровья.' },
      queue: { title: 'Очередь', intro: 'Исходящие задания во внешние системы.', steps: ['Откройте Очередь для ожидающих или сбойных.', 'Задания обновляются при открытой вкладке.', 'Сбои обычно снимаются после исправления конфигурации.'], caption: 'Панель очереди.' },
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
  }
  return out;
}

const en = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en', `${KEY}.json`), 'utf8'));
for (const lang of LANGS) {
  const out = applyTranslations(en, T[lang]);
  fs.writeFileSync(path.join(LOCALES, lang, `${KEY}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log('generated', lang);
}
