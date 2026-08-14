#!/usr/bin/env node
/**
 * Generate reports-admin locale JSON from English master.
 * Run: node docs-automation/generate-reports-admin-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');
const KEY = 'reports-admin';
const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>} */
const T = {
  es: {
    title: 'Centro de informes (paquetes de administrador)',
    intro: 'Los administradores usan el mismo centro de Informes que los gerentes, con acceso a paquetes más profundos: inventario, labor, productos e impuestos.',
    sections: {
      overview: { title: 'Diseño de informes de administrador', steps: ['Pulse Informes en la barra lateral.', 'Las categorías incluyen Inventario, Labor, Productos, Ventas y más.', 'La columna central lista reportes; el panel derecho tiene filtros.'], caption: 'Centro de informes para paquetes de administrador.' },
      inventory: { title: 'Paquete Inventario', intro: 'Cubre existencias, compras, salidas, mermas, consumo, producción y buffet.', steps: ['Seleccione Inventario.', 'Elija un reporte como Inventario actual o Compras.', 'Configure ubicación y fechas, luego ejecute.'], caption: 'Paquete de informes de inventario.' },
      'inventory-filters': { title: 'Filtros de inventario', steps: ['Tras elegir el reporte, el panel derecho muestra filtros.', 'Ajuste fechas, ubicaciones o artículos.', 'Ejecute o exporte cuando los filtros respondan su pregunta.'], caption: 'Panel de filtros de inventario.' },
      labor: { title: 'Paquete Labor', intro: 'Resume costo, horas extra, asistencia, nómina y planificado vs real.', steps: ['Seleccione Labor.', 'Abra Panel laboral o Costo diario.', 'Use Asistencia o Resumen de nómina para detalle.'], caption: 'Paquete de informes laborales.' },
      products: { title: 'Paquete Productos', steps: ['Seleccione Productos.', 'Use Mix de productos semanal o resumen.', 'Productos por hora muestra velocidad para personal y prep.'], caption: 'Paquete de informes de productos.' },
      tax: { title: 'Filtros de impuestos', intro: 'Impuestos está bajo Ventas. Sirve para conciliar impuestos cobrados.', steps: ['Abra Ventas y luego Impuestos.', 'Defina el rango de fechas.', 'Ejecute para auditoría o declaraciones.'], caption: 'Panel de filtros de impuestos.' },
    },
  },
  tr: {
    title: 'Rapor merkezi (yönetici paketleri)',
    intro: 'Yöneticiler, envanter, işgücü, ürün ve vergi paketlerine erişerek aynı Rapor merkezini kullanır.',
    sections: {
      overview: { title: 'Yönetici rapor düzeni', steps: ['Yan menüde Raporlar\'a dokunun.', 'Kategoriler Envanter, İşgücü, Ürünler, Satış içerir.', 'Orta sütun raporları listeler; sağ panel filtrelerdir.'], caption: 'Yönetici paketleri için rapor merkezi.' },
      inventory: { title: 'Envanter paketi', intro: 'Stok, satın alma, çıkış, fire, tüketim, üretim ve büfeyi kapsar.', steps: ['Envanter\'i seçin.', 'Mevcut envanter veya Satın alma gibi bir rapor seçin.', 'Lokasyon ve tarih filtrelerini ayarlayıp çalıştırın.'], caption: 'Envanter rapor paketi.' },
      'inventory-filters': { title: 'Envanter filtreleri', steps: ['Rapor seçildikten sonra sağ panel filtreleri gösterir.', 'Tarih, lokasyon veya ürün filtrelerini ayarlayın.', 'Sorunuza uygun olduğunda çalıştırın veya dışa aktarın.'], caption: 'Envanter filtre paneli.' },
      labor: { title: 'İşgücü paketi', intro: 'Maliyet, fazla mesai, devam, bordro ve planlanan vs gerçek saatleri özetler.', steps: ['İşgücü\'nü seçin.', 'İşgücü panosu veya Günlük maliyet açın.', 'Detay için Devam veya Bordro özeti kullanın.'], caption: 'İşgücü rapor paketi.' },
      products: { title: 'Ürün paketi', steps: ['Ürünler\'i seçin.', 'Ürün mix özeti veya haftalık mix kullanın.', 'Saatlik ürünler hızı gösterir.'], caption: 'Ürün rapor paketi.' },
      tax: { title: 'Vergi filtreleri', intro: 'Vergi Satış altındadır; toplanan vergiyi mutabakat için kullanın.', steps: ['Satış, ardından Vergi açın.', 'Tarih aralığını ayarlayın.', 'Denetim için çalıştırın.'], caption: 'Vergi filtre paneli.' },
    },
  },
  'pt-br': {
    title: 'Hub de relatórios (pacotes de administrador)',
    intro: 'Administradores usam o mesmo hub de Relatórios, com pacotes mais profundos: estoque, mão de obra, produtos e impostos.',
    sections: {
      overview: { title: 'Layout de relatórios do administrador', steps: ['Toque em Relatórios na barra lateral.', 'Categorias incluem Estoque, Mão de obra, Produtos e Vendas.', 'A coluna do meio lista relatórios; o painel direito tem filtros.'], caption: 'Hub de relatórios para pacotes de administrador.' },
      inventory: { title: 'Pacote Estoque', intro: 'Cobre saldo, compras, saídas, perdas, consumo, produção e buffet.', steps: ['Selecione Estoque.', 'Escolha Estoque atual ou Compras.', 'Defina local e datas e execute.'], caption: 'Pacote de relatórios de estoque.' },
      'inventory-filters': { title: 'Filtros de estoque', steps: ['Após escolher o relatório, o painel mostra filtros.', 'Ajuste datas, locais ou itens.', 'Execute ou exporte quando os filtros responderem.'], caption: 'Painel de filtros de estoque.' },
      labor: { title: 'Pacote Mão de obra', intro: 'Resume custo, hora extra, ponto, folha e planejado vs real.', steps: ['Selecione Mão de obra.', 'Abra Painel ou Custo diário.', 'Use Ponto ou Resumo da folha para detalhe.'], caption: 'Pacote de relatórios de mão de obra.' },
      products: { title: 'Pacote Produtos', steps: ['Selecione Produtos.', 'Use mix semanal ou resumo.', 'Produtos por hora mostra velocidade.'], caption: 'Pacote de relatórios de produtos.' },
      tax: { title: 'Filtros de impostos', intro: 'Impostos fica em Vendas; use para reconciliar impostos cobrados.', steps: ['Abra Vendas e depois Impostos.', 'Defina o período.', 'Execute para auditoria.'], caption: 'Painel de filtros de impostos.' },
    },
  },
  fr: {
    title: 'Hub rapports (packs administrateur)',
    intro: 'Les administrateurs utilisent le même hub Rapports, avec des packs plus profonds : inventaire, main-d\'œuvre, produits et taxes.',
    sections: {
      overview: { title: 'Mise en page rapports administrateur', steps: ['Appuyez sur Rapports.', 'Catégories : Inventaire, Main-d\'œuvre, Produits, Ventes.', 'La colonne du milieu liste les rapports ; le panneau droit les filtres.'], caption: 'Hub rapports pour packs administrateur.' },
      inventory: { title: 'Pack Inventaire', intro: 'Couvre stock, achats, sorties, pertes, consommation, production et buffet.', steps: ['Sélectionnez Inventaire.', 'Choisissez Stock actuel ou Achats.', 'Réglez lieu et dates puis lancez.'], caption: 'Pack rapports inventaire.' },
      'inventory-filters': { title: 'Filtres inventaire', steps: ['Après choix du rapport, le panneau affiche les filtres.', 'Ajustez dates, lieux ou articles.', 'Lancez ou exportez selon le besoin.'], caption: 'Panneau filtres inventaire.' },
      labor: { title: 'Pack Main-d\'œuvre', intro: 'Résume coût, heures supp., présence, paie et prévu vs réel.', steps: ['Sélectionnez Main-d\'œuvre.', 'Ouvrez Tableau de bord ou Coût journalier.', 'Utilisez Présence ou Résumé paie pour le détail.'], caption: 'Pack rapports main-d\'œuvre.' },
      products: { title: 'Pack Produits', steps: ['Sélectionnez Produits.', 'Utilisez mix hebdo ou résumé.', 'Produits horaires montre la vitesse.'], caption: 'Pack rapports produits.' },
      tax: { title: 'Filtres taxes', intro: 'Taxes est sous Ventes ; sert à réconcilier les taxes collectées.', steps: ['Ouvrez Ventes puis Taxes.', 'Définissez la période.', 'Lancez pour audit.'], caption: 'Panneau filtres taxes.' },
    },
  },
  nl: {
    title: 'Rapporteragehub (beheerderspakketten)',
    intro: 'Beheerders gebruiken dezelfde Rapporthub, met diepere pakketten: voorraad, arbeid, producten en belasting.',
    sections: {
      overview: { title: 'Beheerder rapportlayout', steps: ['Tik op Rapporten.', 'Categorieën omvatten Voorraad, Arbeid, Producten, Verkoop.', 'Middenkolom toont rapporten; rechterpaneel filters.'], caption: 'Rapporthub voor beheerderspakketten.' },
      inventory: { title: 'Voorraadpakket', intro: 'Dekt voorraad, inkopen, uitgiftes, afval, verbruik, productie en buffet.', steps: ['Selecteer Voorraad.', 'Kies Huidige voorraad of Inkopen.', 'Stel locatie en datums in en voer uit.'], caption: 'Voorraad rapportpakket.' },
      'inventory-filters': { title: 'Voorraadfilters', steps: ['Na rapportkeuze toont het paneel filters.', 'Pas datums, locaties of artikelen aan.', 'Voer uit of exporteer wanneer filters kloppen.'], caption: 'Voorraad filterpaneel.' },
      labor: { title: 'Arbeidspakket', intro: 'Vat kosten, overwerk, aanwezigheid, payroll en gepland vs werkelijk samen.', steps: ['Selecteer Arbeid.', 'Open Dashboard of Dagelijkse kosten.', 'Gebruik Aanwezigheid of Payrollsamenvatting voor detail.'], caption: 'Arbeid rapportpakket.' },
      products: { title: 'Productenpakket', steps: ['Selecteer Producten.', 'Gebruik productmix samenvatting of wekelijks.', 'Producten per uur toont snelheid.'], caption: 'Producten rapportpakket.' },
      tax: { title: 'Belastingfilters', intro: 'Belasting zit onder Verkoop; voor reconciliatie van geïnde belasting.', steps: ['Open Verkoop, dan Belasting.', 'Stel de periode in.', 'Voer uit voor audit.'], caption: 'Belasting filterpaneel.' },
    },
  },
  de: {
    title: 'Berichte-Hub (Administrator-Pakete)',
    intro: 'Administratoren nutzen denselben Berichte-Hub mit tieferen Paketen: Inventar, Personal, Produkte und Steuern.',
    sections: {
      overview: { title: 'Administrator-Berichtslayout', steps: ['Berichte in der Seitenleiste tippen.', 'Kategorien: Inventar, Personal, Produkte, Verkauf.', 'Mittlere Spalte listet Berichte; rechtes Panel Filter.'], caption: 'Berichte-Hub für Administrator-Pakete.' },
      inventory: { title: 'Inventarpaket', intro: 'Deckt Bestand, Einkäufe, Ausgaben, Verluste, Verbrauch, Produktion und Buffet ab.', steps: ['Inventar wählen.', 'Aktueller Bestand oder Einkauf wählen.', 'Standort und Datum setzen und ausführen.'], caption: 'Inventar-Berichtspaket.' },
      'inventory-filters': { title: 'Inventarfilter', steps: ['Nach Berichtswahl zeigt das Panel Filter.', 'Daten, Standorte oder Artikel anpassen.', 'Ausführen oder exportieren wenn passend.'], caption: 'Inventar-Filterpanel.' },
      labor: { title: 'Personalpaket', intro: 'Fasst Kosten, Überstunden, Anwesenheit, Lohn und Plan vs Ist zusammen.', steps: ['Personal wählen.', 'Dashboard oder Tageskosten öffnen.', 'Anwesenheit oder Lohnübersicht für Details.'], caption: 'Personal-Berichtspaket.' },
      products: { title: 'Produktpaket', steps: ['Produkte wählen.', 'Produktmix Zusammenfassung oder wöchentlich nutzen.', 'Produkte stündlich zeigt Tempo.'], caption: 'Produkt-Berichtspaket.' },
      tax: { title: 'Steuerfilter', intro: 'Steuer liegt unter Verkauf; zur Abstimmung erhobener Steuer.', steps: ['Verkauf, dann Steuer öffnen.', 'Zeitraum setzen.', 'Für Audit ausführen.'], caption: 'Steuer-Filterpanel.' },
    },
  },
  it: {
    title: 'Hub report (pacchetti amministratore)',
    intro: 'Gli amministratori usano lo stesso hub Report, con pacchetti più profondi: inventario, labor, prodotti e tasse.',
    sections: {
      overview: { title: 'Layout report amministratore', steps: ['Tocca Report.', 'Categorie: Inventario, Labor, Prodotti, Vendite.', 'La colonna centrale elenca i report; il pannello destro i filtri.'], caption: 'Hub report per pacchetti amministratore.' },
      inventory: { title: 'Pacchetto Inventario', intro: 'Copre scorte, acquisti, uscite, scarti, consumo, produzione e buffet.', steps: ['Seleziona Inventario.', 'Scegli Inventario attuale o Acquisti.', 'Imposta ubicazione e date ed esegui.'], caption: 'Pacchetto report inventario.' },
      'inventory-filters': { title: 'Filtri inventario', steps: ['Dopo la scelta del report, il pannello mostra i filtri.', 'Regola date, ubicazioni o articoli.', 'Esegui o esporta quando i filtri rispondono.'], caption: 'Pannello filtri inventario.' },
      labor: { title: 'Pacchetto Labor', intro: 'Riassume costo, straordinari, presenza, payroll e pianificato vs reale.', steps: ['Seleziona Labor.', 'Apri Dashboard o Costo giornaliero.', 'Usa Presenza o Riepilogo payroll per il dettaglio.'], caption: 'Pacchetto report labor.' },
      products: { title: 'Pacchetto Prodotti', steps: ['Seleziona Prodotti.', 'Usa mix settimanale o riepilogo.', 'Prodotti orari mostra la velocità.'], caption: 'Pacchetto report prodotti.' },
      tax: { title: 'Filtri tasse', intro: 'Tasse è sotto Vendite; serve a riconciliare le tasse riscosse.', steps: ['Apri Vendite poi Tasse.', 'Imposta l\'intervallo date.', 'Esegui per audit.'], caption: 'Pannello filtri tasse.' },
    },
  },
  ar: {
    title: 'مركز التقارير (حزم المسؤول)',
    intro: 'يستخدم المسؤولون نفس مركز التقارير مع حزم أعمق: المخزون والعمالة والمنتجات والضرائب.',
    sections: {
      overview: { title: 'تخطيط تقارير المسؤول', steps: ['اضغط التقارير في الشريط الجانبي.', 'الفئات تشمل المخزون والعمالة والمنتجات والمبيعات.', 'العمود الأوسط يعرض التقارير؛ اللوحة اليمنى للفلاتر.'], caption: 'مركز التقارير لحزم المسؤول.' },
      inventory: { title: 'حزمة المخزون', intro: 'تغطي الرصيد والمشتريات والصرف والهدر والاستهلاك والإنتاج والبوفيه.', steps: ['اختر المخزون.', 'اختر المخزون الحالي أو المشتريات.', 'اضبط الموقع والتواريخ ثم نفّذ.'], caption: 'حزمة تقارير المخزون.' },
      'inventory-filters': { title: 'فلاتر المخزون', steps: ['بعد اختيار التقرير تعرض اللوحة الفلاتر.', 'عدّل التواريخ أو المواقع أو الأصناف.', 'نفّذ أو صدّر عندما تناسب الفلاتر.'], caption: 'لوحة فلاتر المخزون.' },
      labor: { title: 'حزمة العمالة', intro: 'تلخّص التكلفة والعمل الإضافي والحضور والرواتب والمخطط مقابل الفعلي.', steps: ['اختر العمالة.', 'افتح لوحة العمالة أو التكلفة اليومية.', 'استخدم الحضور أو ملخص الرواتب للتفاصيل.'], caption: 'حزمة تقارير العمالة.' },
      products: { title: 'حزمة المنتجات', steps: ['اختر المنتجات.', 'استخدم مزيج المنتجات الأسبوعي أو الملخص.', 'المنتجات بالساعة تعرض السرعة.'], caption: 'حزمة تقارير المنتجات.' },
      tax: { title: 'فلاتر الضرائب', intro: 'الضرائب تحت المبيعات؛ للمطابقة مع الضرائب المحصّلة.', steps: ['افتح المبيعات ثم الضرائب.', 'حدد نطاق التاريخ.', 'نفّذ للمراجعة.'], caption: 'لوحة فلاتر الضرائب.' },
    },
  },
  ru: {
    title: 'Центр отчётов (пакеты администратора)',
    intro: 'Администраторы используют тот же центр Отчётов с более глубокими пакетами: склад, труд, продукты и налоги.',
    sections: {
      overview: { title: 'Макет отчётов администратора', steps: ['Нажмите Отчёты.', 'Категории: Склад, Труд, Продукты, Продажи.', 'Средняя колонка — отчёты; правая панель — фильтры.'], caption: 'Центр отчётов для пакетов администратора.' },
      inventory: { title: 'Пакет Склад', intro: 'Покрывает остатки, закупки, выдачи, списания, расход, производство и буфет.', steps: ['Выберите Склад.', 'Выберите Текущий остаток или Закупки.', 'Задайте место и даты и запустите.'], caption: 'Пакет складских отчётов.' },
      'inventory-filters': { title: 'Фильтры склада', steps: ['После выбора отчёта панель показывает фильтры.', 'Настройте даты, места или позиции.', 'Запустите или экспортируйте при нужных фильтрах.'], caption: 'Панель фильтров склада.' },
      labor: { title: 'Пакет Труд', intro: 'Сводит стоимость, сверхурочные, посещаемость, зарплату и план vs факт.', steps: ['Выберите Труд.', 'Откройте Дашборд или Дневную стоимость.', 'Используйте Посещаемость или Сводку зарплаты для деталей.'], caption: 'Пакет трудовых отчётов.' },
      products: { title: 'Пакет Продукты', steps: ['Выберите Продукты.', 'Используйте микс или недельный микс.', 'Продукты по часам показывают скорость.'], caption: 'Пакет продуктовых отчётов.' },
      tax: { title: 'Фильтры налогов', intro: 'Налоги под Продажами; для сверки собранного налога.', steps: ['Откройте Продажи, затем Налоги.', 'Задайте период.', 'Запустите для аудита.'], caption: 'Панель фильтров налогов.' },
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
  const dest = path.join(LOCALES, lang, `${KEY}.json`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log('generated', lang);
}
