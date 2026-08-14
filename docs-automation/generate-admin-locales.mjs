#!/usr/bin/env node
/**
 * Generate administrator-guide locale JSON from English masters.
 * Run: node docs-automation/generate-admin-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WAVE9 } from './admin-wave9-translations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');

const CHAPTER_KEYS = [
  'admin-overview',
  'admin-menus',
  'admin-floors',
  'admin-promotions',
  'admin-kitchen',
  'admin-printing',
  'admin-payments',
  'admin-users',
];

const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>>} */
const T = {
  es: {
    'admin-overview': {
      title: 'Resumen de Administración',
      intro: 'Administración es el centro de configuración del local. Ábralo desde la barra lateral para mantener platos, menús, pisos, usuarios, impuestos y más.',
      sections: {
        open: {
          title: 'Abrir Administración',
          steps: [
            'Inicie sesión con un usuario con acceso de administrador.',
            'Pulse Administración en la barra lateral.',
            'La pantalla se abre en la pestaña Platos por defecto.',
          ],
          caption: 'Pantalla Administración con pestañas y panel.',
        },
        tabs: {
          title: 'Navegación por pestañas',
          intro: 'Las pestañas agrupan ajustes relacionados. Cambiar de pestaña puede requerir PIN de gerente según su rol.',
          steps: [
            'Desplace la barra de pestañas horizontalmente cuando hay muchas.',
            'Cada pestaña abre su tabla o lista de mantenimiento.',
            'La pestaña seleccionada se resalta con el degradado principal.',
          ],
          caption: 'Barra de pestañas de Administración.',
        },
        dishes: {
          title: 'Pestaña Platos (predeterminada)',
          steps: [
            'Platos lista cada artículo vendible con número, nombre y precio.',
            'Use Agregar, Editar, Importar o acciones masivas si su rol lo permite.',
            'Búsqueda y paginación ayudan a encontrar artículos en menús grandes.',
          ],
          caption: 'Tabla de mantenimiento de platos.',
        },
      },
    },
    'admin-menus': {
      title: 'Menús, categorías y platos',
      intro: 'Configure lo que aparece en la pantalla de pedidos: platos, agrupaciones de menú y categorías.',
      sections: {
        dishes: {
          title: 'Platos',
          steps: [
            'Abra la pestaña Platos.',
            'Cree o edite platos con precio, categorías, modificadores y recetas.',
            'Importe CSV para actualizaciones masivas cuando sea necesario.',
          ],
          caption: 'Pestaña Platos.',
        },
        menus: {
          title: 'Menús',
          intro: 'Los menús controlan qué platos son visibles en cada periodo o canal.',
          steps: [
            'Abra la pestaña Menús.',
            'Asigne platos a menús y configure ventanas de disponibilidad.',
            'Guarde para que el personal vea los artículos actualizados.',
          ],
          caption: 'Pestaña Menús.',
        },
        categories: {
          title: 'Categorías',
          steps: [
            'Abra la pestaña Categorías.',
            'Agrupe platos para la navegación en pedidos.',
            'Reordene categorías según cómo el personal recorre el menú.',
          ],
          caption: 'Pestaña Categorías.',
        },
      },
    },
    'admin-floors': {
      title: 'Pisos y mesas',
      intro: 'Pisos y mesas definen el layout de comedor usado cuando el personal selecciona mesa antes de tomar pedidos.',
      sections: {
        floors: {
          title: 'Pisos',
          steps: [
            'Abra la pestaña Pisos.',
            'Cree planos para cada área (p. ej. Principal, Terraza).',
            'Los pisos aparecen al seleccionar mesa cuando el modo piso está activo.',
          ],
          caption: 'Pestaña Pisos.',
        },
        tables: {
          title: 'Mesas',
          intro: 'Cada mesa pertenece a un piso y lleva nombre o número usado en cuentas y tickets de cocina.',
          steps: [
            'Abra la pestaña Mesas.',
            'Agregue mesas con capacidad y piso asignado.',
            'Edite o desactive mesas cuando cambie el plano.',
          ],
          caption: 'Pestaña Mesas.',
        },
      },
    },
    'admin-users': {
      title: 'Usuarios y roles',
      intro: 'Gestione cuentas del personal, PINs y permisos de rol que controlan pantallas y pestañas.',
      sections: {
        list: {
          title: 'Lista de usuarios',
          steps: [
            'Abra la pestaña Usuarios.',
            'Revise usuarios activos con nombre, rol y contacto.',
            'Use Agregar usuario o Editar según necesite.',
          ],
          caption: 'Tabla de mantenimiento de usuarios.',
        },
      },
    },
    'admin-payments': {
      title: 'Tipos de pago, impuestos y tipos de orden',
      intro: 'Configure cómo se clasifican y liquidan las órdenes: métodos de pago, reglas fiscales y tipos de servicio.',
      sections: {
        'payment-types': {
          title: 'Tipos de pago',
          steps: [
            'Abra la pestaña Tipos de pago.',
            'Defina Efectivo, Tarjeta y medios personalizados en pago.',
            'Configure orden y si requiere referencia o cambio.',
          ],
          caption: 'Pestaña Tipos de pago.',
        },
        taxes: {
          title: 'Impuestos',
          intro: 'Los impuestos se aplican a platos y aparecen en recibos e informes.',
          steps: [
            'Abra la pestaña Impuestos.',
            'Cree tasas y vincúlelas a artículos o tipos de orden.',
            'Guarde para que las nuevas órdenes calculen impuestos correctamente.',
          ],
          caption: 'Pestaña Impuestos.',
        },
        'order-types': {
          title: 'Tipos de orden',
          steps: [
            'Abra la pestaña Tipos de orden.',
            'Configure comedor, para llevar, delivery y otros modos.',
            'Los tipos de orden afectan cocina, informes y comportamiento predeterminado.',
          ],
          caption: 'Pestaña Tipos de orden.',
        },
      },
    },
  },
  tr: {
    'admin-overview': {
      title: 'Yönetim genel bakış',
      intro: 'Yönetim, mekan yapılandırması için yönetici merkezidir. Yan menüden açarak yemekler, menüler, katlar, kullanıcılar ve vergileri yönetin.',
      sections: {
        open: { title: 'Yönetimi aç', steps: ['Yönetici erişimi olan bir kullanıcıyla giriş yapın.', 'Yan menüde Yönetim\'e dokunun.', 'Ekran varsayılan olarak Yemekler sekmesinde açılır.'], caption: 'Sekme çubuğu ve içerik paneliyle Yönetim ekranı.' },
        tabs: { title: 'Sekme gezinmesi', intro: 'Sekmeler ilgili ayarları gruplar. Sekme değiştirmek rolünüze göre yönetici PIN\'i gerektirebilir.', steps: ['Çok sekme varken yatay kaydırın.', 'Her sekme kendi bakım tablosunu açar.', 'Seçili sekme birincil gradyanla vurgulanır.'], caption: 'Yönetim sekme çubuğu.' },
        dishes: { title: 'Yemekler sekmesi (varsayılan)', steps: ['Yemekler satılabilir tüm ürünleri numara, ad ve fiyatla listeler.', 'Rolünüz izin veriyorsa Ekle, Düzenle, İçe aktar kullanın.', 'Arama ve sayfalama büyük menülerde yardımcı olur.'], caption: 'Yemek bakım tablosu.' },
      },
    },
    'admin-menus': {
      title: 'Menüler, kategoriler ve yemekler',
      intro: 'Sipariş ekranında görünenleri yapılandırın: yemekler, menü grupları ve kategoriler.',
      sections: {
        dishes: { title: 'Yemekler', steps: ['Yemekler sekmesini açın.', 'Fiyat, kategori, modifier ve tariflerle yemek oluşturun veya düzenleyin.', 'Toplu güncellemeler için CSV içe aktarın.'], caption: 'Yemekler sekmesi.' },
        menus: { title: 'Menüler', intro: 'Menüler hangi yemeklerin hangi servis döneminde görüneceğini belirler.', steps: ['Menüler sekmesini açın.', 'Yemekleri menülere atayın ve saatleri ayarlayın.', 'Personelin güncel ürünleri görmesi için kaydedin.'], caption: 'Menüler sekmesi.' },
        categories: { title: 'Kategoriler', steps: ['Kategoriler sekmesini açın.', 'Sipariş ekranında gezinme için yemekleri gruplayın.', 'Personelin menüyü gezdiği sıraya göre sıralayın.'], caption: 'Kategoriler sekmesi.' },
      },
    },
    'admin-floors': {
      title: 'Katlar ve masalar',
      intro: 'Katlar ve masalar, personelin sipariş öncesi masa seçtiği yerleşimi tanımlar.',
      sections: {
        floors: { title: 'Katlar', steps: ['Katlar sekmesini açın.', 'Her yemek alanı için kat planı oluşturun.', 'Kat modu açıkken masa seçiminde görünürler.'], caption: 'Katlar sekmesi.' },
        tables: { title: 'Masalar', intro: 'Her masa bir kata aittir ve adisyon ve mutfak fişlerinde kullanılır.', steps: ['Masalar sekmesini açın.', 'Kapasite ve kat atamasıyla masa ekleyin.', 'Plan değişince düzenleyin veya devre dışı bırakın.'], caption: 'Masalar sekmesi.' },
      },
    },
    'admin-users': {
      title: 'Kullanıcılar ve roller',
      intro: 'Personel hesapları, PIN\'ler ve ekran erişimini kontrol eden rol izinlerini yönetin.',
      sections: {
        list: { title: 'Kullanıcı listesi', steps: ['Kullanıcılar sekmesini açın.', 'Ad, rol ve iletişim alanlarıyla aktif kullanıcıları görün.', 'Yeni hesap için Ekle veya güncelleme için Düzenle kullanın.'], caption: 'Kullanıcı bakım tablosu.' },
      },
    },
    'admin-payments': {
      title: 'Ödeme türleri, vergiler ve sipariş türleri',
      intro: 'Siparişlerin sınıflandırılması ve tahsilatı: ödeme yöntemleri, vergi kuralları ve servis türleri.',
      sections: {
        'payment-types': { title: 'Ödeme türleri', steps: ['Ödeme türleri sekmesini açın.', 'Nakit, kart ve özel ödeme yöntemlerini tanımlayın.', 'Sıra ve referans veya para üstü gereksinimlerini ayarlayın.'], caption: 'Ödeme türleri sekmesi.' },
        taxes: { title: 'Vergiler', intro: 'Vergiler yemeklere uygulanır ve fişlerde görünür.', steps: ['Vergiler sekmesini açın.', 'Oran oluşturun ve ürünlere veya sipariş türlerine bağlayın.', 'Yeni siparişlerin doğru hesaplaması için kaydedin.'], caption: 'Vergiler sekmesi.' },
        'order-types': { title: 'Sipariş türleri', steps: ['Sipariş türleri sekmesini açın.', 'Yerinde, paket ve teslimat modlarını yapılandırın.', 'Sipariş türleri mutfak yönlendirme ve raporları etkiler.'], caption: 'Sipariş türleri sekmesi.' },
      },
    },
  },
  'pt-br': {
    'admin-overview': {
      title: 'Visão geral do Gerenciar',
      intro: 'Gerenciar é o hub de configuração do estabelecimento. Abra pela barra lateral para manter pratos, cardápios, andares, usuários e impostos.',
      sections: {
        open: { title: 'Abrir Gerenciar', steps: ['Entre com um usuário com acesso de administrador.', 'Toque em Gerenciar na barra lateral.', 'A tela abre na aba Pratos por padrão.'], caption: 'Tela Gerenciar com abas e painel.' },
        tabs: { title: 'Navegação por abas', intro: 'As abas agrupam configurações relacionadas. Trocar de aba pode exigir PIN de gerente.', steps: ['Role a barra de abas horizontalmente quando houver muitas.', 'Cada aba abre sua tabela de manutenção.', 'A aba selecionada usa o gradiente principal.'], caption: 'Barra de abas do Gerenciar.' },
        dishes: { title: 'Aba Pratos (padrão)', steps: ['Pratos lista itens vendáveis com número, nome e preço.', 'Use Adicionar, Editar, Importar ou ações em lote se permitido.', 'Busca e paginação ajudam em cardápios grandes.'], caption: 'Tabela de manutenção de pratos.' },
      },
    },
    'admin-menus': {
      title: 'Cardápios, categorias e pratos',
      intro: 'Configure o que aparece na tela de pedidos: pratos, agrupamentos e categorias.',
      sections: {
        dishes: { title: 'Pratos', steps: ['Abra a aba Pratos.', 'Crie ou edite pratos com preço, categorias e modificadores.', 'Importe CSV para atualizações em massa.'], caption: 'Aba Pratos.' },
        menus: { title: 'Cardápios', intro: 'Cardápios controlam quais pratos aparecem em cada período ou canal.', steps: ['Abra a aba Cardápios.', 'Atribua pratos e defina disponibilidade.', 'Salve para o staff ver itens atualizados.'], caption: 'Aba Cardápios.' },
        categories: { title: 'Categorias', steps: ['Abra a aba Categorias.', 'Agrupe pratos para navegação no pedido.', 'Reordene conforme o fluxo do cardápio.'], caption: 'Aba Categorias.' },
      },
    },
    'admin-floors': {
      title: 'Andares e mesas',
      intro: 'Andares e mesas definem o layout usado quando o staff seleciona mesa antes do pedido.',
      sections: {
        floors: { title: 'Andares', steps: ['Abra a aba Andares.', 'Crie plantas para cada área.', 'Andares aparecem na seleção de mesa no modo andar.'], caption: 'Aba Andares.' },
        tables: { title: 'Mesas', intro: 'Cada mesa pertence a um andar e aparece em contas e cozinha.', steps: ['Abra a aba Mesas.', 'Adicione mesas com capacidade e andar.', 'Edite ou desative quando o layout mudar.'], caption: 'Aba Mesas.' },
      },
    },
    'admin-users': {
      title: 'Usuários e funções',
      intro: 'Gerencie contas, PINs e permissões que controlam telas e abas.',
      sections: {
        list: { title: 'Lista de usuários', steps: ['Abra a aba Usuários.', 'Veja usuários ativos com nome, função e contato.', 'Use Adicionar ou Editar conforme necessário.'], caption: 'Tabela de usuários.' },
      },
    },
    'admin-payments': {
      title: 'Tipos de pagamento, impostos e tipos de pedido',
      intro: 'Configure classificação e liquidação: pagamentos, impostos e tipos de serviço.',
      sections: {
        'payment-types': { title: 'Tipos de pagamento', steps: ['Abra Tipos de pagamento.', 'Defina Dinheiro, Cartão e formas personalizadas.', 'Configure ordem e requisitos de referência ou troco.'], caption: 'Aba Tipos de pagamento.' },
        taxes: { title: 'Impostos', intro: 'Impostos aplicam-se a pratos e aparecem em recibos.', steps: ['Abra Impostos.', 'Crie alíquotas e vincule a itens ou tipos de pedido.', 'Salve para cálculo correto em novos pedidos.'], caption: 'Aba Impostos.' },
        'order-types': { title: 'Tipos de pedido', steps: ['Abra Tipos de pedido.', 'Configure salão, retirada e entrega.', 'Tipos afetam cozinha, relatórios e comportamento padrão.'], caption: 'Aba Tipos de pedido.' },
      },
    },
  },
  fr: {
    'admin-overview': {
      title: 'Vue d\'ensemble Gérer',
      intro: 'Gérer est le hub de configuration du site. Ouvrez-le depuis la barre latérale pour maintenir plats, menus, étages, utilisateurs et taxes.',
      sections: {
        open: { title: 'Ouvrir Gérer', steps: ['Connectez-vous avec un accès administrateur.', 'Appuyez sur Gérer dans la barre latérale.', 'L\'écran s\'ouvre sur l\'onglet Plats par défaut.'], caption: 'Écran Gérer avec onglets et panneau.' },
        tabs: { title: 'Navigation par onglets', intro: 'Les onglets regroupent les réglages. Changer d\'onglet peut exiger un PIN manager.', steps: ['Faites défiler la barre d\'onglets horizontalement.', 'Chaque onglet ouvre sa table de maintenance.', 'L\'onglet actif est mis en surbrillance.'], caption: 'Barre d\'onglets Gérer.' },
        dishes: { title: 'Onglet Plats (par défaut)', steps: ['Plats liste chaque article vendable.', 'Utilisez Ajouter, Modifier, Importer si autorisé.', 'Recherche et pagination pour grands menus.'], caption: 'Table de maintenance des plats.' },
      },
    },
    'admin-menus': {
      title: 'Menus, catégories et plats',
      intro: 'Configurez ce qui apparaît à la prise de commande : plats, regroupements et catégories.',
      sections: {
        dishes: { title: 'Plats', steps: ['Ouvrez l\'onglet Plats.', 'Créez ou modifiez plats, prix, catégories et modificateurs.', 'Importez CSV pour mises à jour en masse.'], caption: 'Onglet Plats.' },
        menus: { title: 'Menus', intro: 'Les menus contrôlent la visibilité des plats par période ou canal.', steps: ['Ouvrez l\'onglet Menus.', 'Assignez plats et disponibilités.', 'Enregistrez pour mettre à jour l\'écran Menu.'], caption: 'Onglet Menus.' },
        categories: { title: 'Catégories', steps: ['Ouvrez l\'onglet Catégories.', 'Regroupez les plats pour la navigation.', 'Réordonnez selon le parcours du personnel.'], caption: 'Onglet Catégories.' },
      },
    },
    'admin-floors': {
      title: 'Étages et tables',
      intro: 'Étages et tables définissent le plan utilisé quand le personnel choisit une table.',
      sections: {
        floors: { title: 'Étages', steps: ['Ouvrez l\'onglet Étages.', 'Créez des plans par zone.', 'Les étages apparaissent en sélection de table.'], caption: 'Onglet Étages.' },
        tables: { title: 'Tables', intro: 'Chaque table appartient à un étage et porte un nom ou numéro.', steps: ['Ouvrez l\'onglet Tables.', 'Ajoutez tables avec capacité et étage.', 'Modifiez ou désactivez si le plan change.'], caption: 'Onglet Tables.' },
      },
    },
    'admin-users': {
      title: 'Utilisateurs et rôles',
      intro: 'Gérez comptes staff, PINs et permissions d\'accès aux écrans.',
      sections: {
        list: { title: 'Liste utilisateurs', steps: ['Ouvrez l\'onglet Utilisateurs.', 'Parcourez les utilisateurs actifs.', 'Ajoutez ou modifiez selon les besoins.'], caption: 'Table de maintenance utilisateurs.' },
      },
    },
    'admin-payments': {
      title: 'Types de paiement, taxes et types de commande',
      intro: 'Configurez classification et règlement : paiements, taxes et modes de service.',
      sections: {
        'payment-types': { title: 'Types de paiement', steps: ['Ouvrez Types de paiement.', 'Définissez Espèces, Carte et moyens personnalisés.', 'Configurez ordre et exigences de référence ou monnaie.'], caption: 'Onglet Types de paiement.' },
        taxes: { title: 'Taxes', intro: 'Les taxes s\'appliquent aux plats et figurent sur les reçus.', steps: ['Ouvrez Taxes.', 'Créez taux et liez aux articles ou types de commande.', 'Enregistrez pour un calcul correct.'], caption: 'Onglet Taxes.' },
        'order-types': { title: 'Types de commande', steps: ['Ouvrez Types de commande.', 'Configurez sur place, à emporter et livraison.', 'Les types influencent cuisine et rapports.'], caption: 'Onglet Types de commande.' },
      },
    },
  },
  nl: {
    'admin-overview': {
      title: 'Beheer overzicht',
      intro: 'Beheer is het configuratiehub voor de locatie. Open het via de zijbalk voor gerechten, menu\'s, verdiepingen, gebruikers en belastingen.',
      sections: {
        open: { title: 'Beheer openen', steps: ['Log in met beheerderstoegang.', 'Tik op Beheer in de zijbalk.', 'Het scherm opent standaard op het tabblad Gerechten.'], caption: 'Beheerscherm met tabbladen.' },
        tabs: { title: 'Tabnavigatie', intro: 'Tabbladen groeperen gerelateerde instellingen. Wisselen kan een manager-PIN vereisen.', steps: ['Scroll horizontaal bij veel tabbladen.', 'Elk tabblad opent zijn onderhoudstabel.', 'Het geselecteerde tabblad is gemarkeerd.'], caption: 'Beheer tabbalk.' },
        dishes: { title: 'Tabblad Gerechten (standaard)', steps: ['Gerechten toont verkoopbare items met nummer, naam en prijs.', 'Gebruik Toevoegen, Bewerken, Importeren indien toegestaan.', 'Zoeken en paginering helpen bij grote menu\'s.'], caption: 'Gerechten onderhoudstabel.' },
      },
    },
    'admin-menus': {
      title: 'Menu\'s, categorieën en gerechten',
      intro: 'Configureer wat op het bestelscherm verschijnt.',
      sections: {
        dishes: { title: 'Gerechten', steps: ['Open tabblad Gerechten.', 'Maak of bewerk gerechten met prijs en categorieën.', 'Importeer CSV voor bulkupdates.'], caption: 'Tabblad Gerechten.' },
        menus: { title: 'Menu\'s', intro: 'Menu\'s bepalen welke gerechten zichtbaar zijn per periode.', steps: ['Open tabblad Menu\'s.', 'Wijs gerechten toe en stel beschikbaarheid in.', 'Sla op zodat personeel updates ziet.'], caption: 'Tabblad Menu\'s.' },
        categories: { title: 'Categorieën', steps: ['Open tabblad Categorieën.', 'Groepeer gerechten voor navigatie.', 'Sorteer volgens menuflow.'], caption: 'Tabblad Categorieën.' },
      },
    },
    'admin-floors': {
      title: 'Verdiepingen en tafels',
      intro: 'Verdiepingen en tafels definiëren de indeling bij tafelkeuze.',
      sections: {
        floors: { title: 'Verdiepingen', steps: ['Open tabblad Verdiepingen.', 'Maak plattegronden per zone.', 'Verschijnen bij tafelkeuze in vloermodus.'], caption: 'Tabblad Verdiepingen.' },
        tables: { title: 'Tafels', intro: 'Elke tafel hoort bij een verdieping.', steps: ['Open tabblad Tafels.', 'Voeg tafels toe met capaciteit.', 'Bewerk of deactiveer bij wijzigingen.'], caption: 'Tabblad Tafels.' },
      },
    },
    'admin-users': {
      title: 'Gebruikers en rollen',
      intro: 'Beheer personeelsaccounts, PINs en rolrechten.',
      sections: {
        list: { title: 'Gebruikerslijst', steps: ['Open tabblad Gebruikers.', 'Bekijk actieve gebruikers.', 'Voeg toe of bewerk indien nodig.'], caption: 'Gebruikers onderhoudstabel.' },
      },
    },
    'admin-payments': {
      title: 'Betaaltypes, belastingen en ordertypes',
      intro: 'Configureer classificatie en afrekenen van orders.',
      sections: {
        'payment-types': { title: 'Betaaltypes', steps: ['Open Betaaltypes.', 'Definieer Contant, Kaart en custom types.', 'Stel volgorde en referentie in.'], caption: 'Tabblad Betaaltypes.' },
        taxes: { title: 'Belastingen', intro: 'Belastingen gelden voor gerechten en bonnen.', steps: ['Open Belastingen.', 'Maak tarieven en koppel aan items.', 'Sla op voor correcte berekening.'], caption: 'Tabblad Belastingen.' },
        'order-types': { title: 'Ordertypes', steps: ['Open Ordertypes.', 'Configureer dine-in, afhalen en bezorgen.', 'Beïnvloedt keuken en rapporten.'], caption: 'Tabblad Ordertypes.' },
      },
    },
  },
  de: {
    'admin-overview': {
      title: 'Verwalten Übersicht',
      intro: 'Verwalten ist das Konfigurationszentrum. Öffnen Sie es über die Seitenleiste für Gerichte, Menüs, Etagen, Benutzer und Steuern.',
      sections: {
        open: { title: 'Verwalten öffnen', steps: ['Mit Administratorzugang anmelden.', 'Verwalten in der Seitenleiste tippen.', 'Standardmäßig öffnet sich der Tab Gerichte.'], caption: 'Verwalten-Bildschirm mit Tabs.' },
        tabs: { title: 'Tab-Navigation', intro: 'Tabs gruppieren Einstellungen. Wechsel kann Manager-PIN erfordern.', steps: ['Bei vielen Tabs horizontal scrollen.', 'Jeder Tab öffnet seine Wartungstabelle.', 'Aktiver Tab ist hervorgehoben.'], caption: 'Verwalten-Tableiste.' },
        dishes: { title: 'Tab Gerichte (Standard)', steps: ['Gerichte listet verkaufbare Artikel.', 'Hinzufügen, Bearbeiten, Import bei Berechtigung.', 'Suche und Paginierung für große Menüs.'], caption: 'Gerichte-Wartungstabelle.' },
      },
    },
    'admin-menus': {
      title: 'Menüs, Kategorien und Gerichte',
      intro: 'Konfigurieren Sie die Bestelloberfläche.',
      sections: {
        dishes: { title: 'Gerichte', steps: ['Tab Gerichte öffnen.', 'Gerichte mit Preis und Kategorien pflegen.', 'CSV für Massenupdates importieren.'], caption: 'Tab Gerichte.' },
        menus: { title: 'Menüs', intro: 'Menüs steuern Sichtbarkeit je Servicezeit.', steps: ['Tab Menüs öffnen.', 'Gerichte zuweisen und Verfügbarkeit setzen.', 'Speichern für aktualisierte Anzeige.'], caption: 'Tab Menüs.' },
        categories: { title: 'Kategorien', steps: ['Tab Kategorien öffnen.', 'Gerichte für Navigation gruppieren.', 'Reihenfolge anpassen.'], caption: 'Tab Kategorien.' },
      },
    },
    'admin-floors': {
      title: 'Etagen und Tische',
      intro: 'Etagen und Tische definieren den Grundriss bei Tischauswahl.',
      sections: {
        floors: { title: 'Etagen', steps: ['Tab Etagen öffnen.', 'Grundrisse pro Bereich anlegen.', 'Erscheinen bei Tischauswahl.'], caption: 'Tab Etagen.' },
        tables: { title: 'Tische', intro: 'Jeder Tisch gehört zu einer Etage.', steps: ['Tab Tische öffnen.', 'Tische mit Kapazität hinzufügen.', 'Bei Planänderung bearbeiten.'], caption: 'Tab Tische.' },
      },
    },
    'admin-users': {
      title: 'Benutzer und Rollen',
      intro: 'Personal-Konten, PINs und Rollenberechtigungen verwalten.',
      sections: {
        list: { title: 'Benutzerliste', steps: ['Tab Benutzer öffnen.', 'Aktive Benutzer anzeigen.', 'Hinzufügen oder Bearbeiten.'], caption: 'Benutzer-Wartungstabelle.' },
      },
    },
    'admin-payments': {
      title: 'Zahlungsarten, Steuern und Bestelltypen',
      intro: 'Klassifikation und Abrechnung von Bestellungen konfigurieren.',
      sections: {
        'payment-types': { title: 'Zahlungsarten', steps: ['Tab Zahlungsarten öffnen.', 'Bar, Karte und eigene Arten definieren.', 'Reihenfolge und Referenz einstellen.'], caption: 'Tab Zahlungsarten.' },
        taxes: { title: 'Steuern', intro: 'Steuern gelten für Gerichte und Belege.', steps: ['Tab Steuern öffnen.', 'Sätze anlegen und verknüpfen.', 'Speichern für korrekte Berechnung.'], caption: 'Tab Steuern.' },
        'order-types': { title: 'Bestelltypen', steps: ['Tab Bestelltypen öffnen.', 'Vor Ort, Mitnahme, Lieferung konfigurieren.', 'Beeinflusst Küche und Berichte.'], caption: 'Tab Bestelltypen.' },
      },
    },
  },
  it: {
    'admin-overview': {
      title: 'Panoramica Gestione',
      intro: 'Gestione è l\'hub di configurazione della sede. Aprilo dalla barra laterale per piatti, menu, piani, utenti e tasse.',
      sections: {
        open: { title: 'Apri Gestione', steps: ['Accedi con accesso amministratore.', 'Tocca Gestione nella barra laterale.', 'Si apre sulla scheda Piatti.'], caption: 'Schermata Gestione con schede.' },
        tabs: { title: 'Navigazione schede', intro: 'Le schede raggruppano impostazioni correlate. Il cambio può richiedere PIN manager.', steps: ['Scorri orizzontalmente con molte schede.', 'Ogni scheda apre la sua tabella.', 'La scheda attiva è evidenziata.'], caption: 'Barra schede Gestione.' },
        dishes: { title: 'Scheda Piatti (predefinita)', steps: ['Piatti elenca articoli vendibili.', 'Usa Aggiungi, Modifica, Importa se consentito.', 'Ricerca e paginazione per menu grandi.'], caption: 'Tabella manutenzione piatti.' },
      },
    },
    'admin-menus': {
      title: 'Menu, categorie e piatti',
      intro: 'Configura cosa appare nella presa ordini.',
      sections: {
        dishes: { title: 'Piatti', steps: ['Apri scheda Piatti.', 'Crea o modifica piatti con prezzo e categorie.', 'Importa CSV per aggiornamenti massivi.'], caption: 'Scheda Piatti.' },
        menus: { title: 'Menu', intro: 'I menu controllano la visibilità per periodo o canale.', steps: ['Apri scheda Menu.', 'Assegna piatti e disponibilità.', 'Salva per aggiornare lo schermo Menu.'], caption: 'Scheda Menu.' },
        categories: { title: 'Categorie', steps: ['Apri scheda Categorie.', 'Raggruppa piatti per navigazione.', 'Riordina secondo il flusso del menu.'], caption: 'Scheda Categorie.' },
      },
    },
    'admin-floors': {
      title: 'Piani e tavoli',
      intro: 'Piani e tavoli definiscono il layout per la selezione tavolo.',
      sections: {
        floors: { title: 'Piani', steps: ['Apri scheda Piani.', 'Crea planimetrie per area.', 'Appaiono nella selezione tavolo.'], caption: 'Scheda Piani.' },
        tables: { title: 'Tavoli', intro: 'Ogni tavolo appartiene a un piano.', steps: ['Apri scheda Tavoli.', 'Aggiungi tavoli con capacità.', 'Modifica o disattiva se cambia il layout.'], caption: 'Scheda Tavoli.' },
      },
    },
    'admin-users': {
      title: 'Utenti e ruoli',
      intro: 'Gestisci account staff, PIN e permessi di accesso.',
      sections: {
        list: { title: 'Elenco utenti', steps: ['Apri scheda Utenti.', 'Visualizza utenti attivi.', 'Aggiungi o modifica secondo necessità.'], caption: 'Tabella manutenzione utenti.' },
      },
    },
    'admin-payments': {
      title: 'Tipi pagamento, tasse e tipi ordine',
      intro: 'Configura classificazione e saldo ordini.',
      sections: {
        'payment-types': { title: 'Tipi pagamento', steps: ['Apri Tipi pagamento.', 'Definisci Contanti, Carta e custom.', 'Imposta ordine e requisiti.'], caption: 'Scheda Tipi pagamento.' },
        taxes: { title: 'Tasse', intro: 'Le tasse si applicano ai piatti e agli scontrini.', steps: ['Apri Tasse.', 'Crea aliquote e collega agli articoli.', 'Salva per calcolo corretto.'], caption: 'Scheda Tasse.' },
        'order-types': { title: 'Tipi ordine', steps: ['Apri Tipi ordine.', 'Configura sala, asporto e consegna.', 'Influisce su cucina e report.'], caption: 'Scheda Tipi ordine.' },
      },
    },
  },
  ar: {
    'admin-overview': {
      title: 'نظرة عامة على الإدارة',
      intro: 'الإدارة هي مركز إعداد المكان. افتحها من الشريط الجانبي لصيانة الأطباق والقوائم والطوابق والمستخدمين والضرائب.',
      sections: {
        open: { title: 'فتح الإدارة', steps: ['سجّل الدخول بمستخدم له صلاحية مدير.', 'اضغط الإدارة في الشريط الجانبي.', 'تفتح الشاشة على تبويب الأطباق افتراضياً.'], caption: 'شاشة الإدارة مع شريط التبويب.' },
        tabs: { title: 'التنقل بين التبويبات', intro: 'التبويبات تجمع الإعدادات ذات الصلة. قد يتطلب التبديل PIN مدير.', steps: ['مرّر شريط التبويب أفقياً عند كثرة التبويبات.', 'كل تبويب يفتح جدول صيانته.', 'التبويب المحدد مميّز بالتدرج الأساسي.'], caption: 'شريط تبويبات الإدارة.' },
        dishes: { title: 'تبويب الأطباق (افتراضي)', steps: ['الأطباق يعرض كل صنف قابل للبيع.', 'استخدم إضافة أو تعديل أو استيراد عند السماح.', 'البحث والترقيم يساعدان في القوائم الكبيرة.'], caption: 'جدول صيانة الأطباق.' },
      },
    },
    'admin-menus': {
      title: 'القوائم والفئات والأطباق',
      intro: 'اضبط ما يظهر في شاشة الطلب: الأطباق وتجميعات القائمة والفئات.',
      sections: {
        dishes: { title: 'الأطباق', steps: ['افتح تبويب الأطباق.', 'أنشئ أو عدّل الأطباق بالسعر والفئات والمعدّلات.', 'استورد CSV للتحديثات الجماعية.'], caption: 'تبويب الأطباق.' },
        menus: { title: 'القوائم', intro: 'القوائم تتحكم في ظهور الأطباق لكل فترة أو قناة.', steps: ['افتح تبويب القوائم.', 'عيّن الأطباق وحدد أوقات التوفر.', 'احفظ ليرى الموظفون التحديثات.'], caption: 'تبويب القوائم.' },
        categories: { title: 'الفئات', steps: ['افتح تبويب الفئات.', 'جمّع الأطباق للتصفح.', 'أعد الترتيب حسب سير القائمة.'], caption: 'تبويب الفئات.' },
      },
    },
    'admin-floors': {
      title: 'الطوابق والطاولات',
      intro: 'الطوابق والطاولات تحدد مخطط الصالة عند اختيار الطاولة.',
      sections: {
        floors: { title: 'الطوابق', steps: ['افتح تبويب الطوابق.', 'أنشئ مخططات لكل منطقة.', 'تظهر عند اختيار الطاولة في وضع الطابق.'], caption: 'تبويب الطوابق.' },
        tables: { title: 'الطاولات', intro: 'كل طاولة تنتمي لطابق وتحمل اسمًا أو رقمًا.', steps: ['افتح تبويب الطاولات.', 'أضف طاولات بالسعة والطابق.', 'عدّل أو عطّل عند تغيير المخطط.'], caption: 'تبويب الطاولات.' },
      },
    },
    'admin-users': {
      title: 'المستخدمون والأدوار',
      intro: 'إدارة حسابات الموظفين وPINs وصلاحيات الأدوار.',
      sections: {
        list: { title: 'قائمة المستخدمين', steps: ['افتح تبويب المستخدمين.', 'تصفّح المستخدمين النشطين.', 'استخدم إضافة أو تعديل حسب الحاجة.'], caption: 'جدول صيانة المستخدمين.' },
      },
    },
    'admin-payments': {
      title: 'أنواع الدفع والضرائب وأنواع الطلب',
      intro: 'اضبط تصنيف وتسوية الطلبات: طرق الدفع والضرائب وأنواع الخدمة.',
      sections: {
        'payment-types': { title: 'أنواع الدفع', steps: ['افتح أنواع الدفع.', 'عرّف نقداً وبطاقة وطرقاً مخصصة.', 'اضبط الترتيب ومتطلبات المرجع أو الباقي.'], caption: 'تبويب أنواع الدفع.' },
        taxes: { title: 'الضرائب', intro: 'الضرائب تُطبّق على الأطباق وتظهر في الإيصالات.', steps: ['افتح الضرائب.', 'أنشئ معدلات واربطها بالأصناف.', 'احفظ للحساب الصحيح.'], caption: 'تبويب الضرائب.' },
        'order-types': { title: 'أنواع الطلب', steps: ['افتح أنواع الطلب.', 'اضبط الصالة والتيك أواي والتوصيل.', 'تؤثر على المطبخ والتقارير.'], caption: 'تبويب أنواع الطلب.' },
      },
    },
  },
  ru: {
    'admin-overview': {
      title: 'Обзор раздела Управление',
      intro: 'Управление — центр настройки заведения. Откройте из боковой панели для блюд, меню, этажей, пользователей и налогов.',
      sections: {
        open: { title: 'Открыть Управление', steps: ['Войдите с правами администратора.', 'Нажмите Управление в боковой панели.', 'Экран открывается на вкладке Блюда.'], caption: 'Экран Управление с вкладками.' },
        tabs: { title: 'Навигация по вкладкам', intro: 'Вкладки группируют настройки. Смена может требовать PIN менеджера.', steps: ['Прокручивайте панель вкладок горизонтально.', 'Каждая вкладка открывает таблицу обслуживания.', 'Активная вкладка выделена.'], caption: 'Панель вкладок Управление.' },
        dishes: { title: 'Вкладка Блюда (по умолчанию)', steps: ['Блюда показывает все позиции с номером и ценой.', 'Добавление, правка, импорт при наличии прав.', 'Поиск и пагинация для больших меню.'], caption: 'Таблица обслуживания блюд.' },
      },
    },
    'admin-menus': {
      title: 'Меню, категории и блюда',
      intro: 'Настройте, что видно на экране заказа.',
      sections: {
        dishes: { title: 'Блюда', steps: ['Откройте вкладку Блюда.', 'Создайте или измените блюда с ценой и категориями.', 'Импортируйте CSV для массовых обновлений.'], caption: 'Вкладка Блюда.' },
        menus: { title: 'Меню', intro: 'Меню определяют видимость блюд по периодам.', steps: ['Откройте вкладку Меню.', 'Назначьте блюда и доступность.', 'Сохраните для обновления экрана Menu.'], caption: 'Вкладка Меню.' },
        categories: { title: 'Категории', steps: ['Откройте вкладку Категории.', 'Группируйте блюда для навигации.', 'Упорядочьте по логике меню.'], caption: 'Вкладка Категории.' },
      },
    },
    'admin-floors': {
      title: 'Этажи и столы',
      intro: 'Этажи и столы задают план зала при выборе стола.',
      sections: {
        floors: { title: 'Этажи', steps: ['Откройте вкладку Этажи.', 'Создайте планы зон.', 'Появляются при выборе стола.'], caption: 'Вкладка Этажи.' },
        tables: { title: 'Столы', intro: 'Каждый стол принадлежит этажу.', steps: ['Откройте вкладку Столы.', 'Добавьте столы с вместимостью.', 'Измените или отключите при смене плана.'], caption: 'Вкладка Столы.' },
      },
    },
    'admin-users': {
      title: 'Пользователи и роли',
      intro: 'Управление учётными записями, PIN и правами доступа.',
      sections: {
        list: { title: 'Список пользователей', steps: ['Откройте вкладку Пользователи.', 'Просмотрите активных пользователей.', 'Добавьте или измените при необходимости.'], caption: 'Таблица пользователей.' },
      },
    },
    'admin-payments': {
      title: 'Типы оплаты, налоги и типы заказов',
      intro: 'Настройка классификации и расчёта заказов.',
      sections: {
        'payment-types': { title: 'Типы оплаты', steps: ['Откройте Типы оплаты.', 'Определите наличные, карту и свои типы.', 'Настройте порядок и требования.'], caption: 'Вкладка Типы оплаты.' },
        taxes: { title: 'Налоги', intro: 'Налоги применяются к блюдам и чекам.', steps: ['Откройте Налоги.', 'Создайте ставки и привяжите к позициям.', 'Сохраните для корректного расчёта.'], caption: 'Вкладка Налоги.' },
        'order-types': { title: 'Типы заказов', steps: ['Откройте Типы заказов.', 'Настройте зал, навынос и доставку.', 'Влияет на кухню и отчёты.'], caption: 'Вкладка Типы заказов.' },
      },
    },
  },
};

function applyTranslations(en, langPack) {
  const out = structuredClone(en);
  if (langPack.title) out.title = langPack.title;
  if (langPack.intro) out.intro = langPack.intro;
  for (const sec of out.sections) {
    const t = langPack.sections?.[sec.id];
    if (!t) continue;
    if (t.title) sec.title = t.title;
    if (t.intro) sec.intro = t.intro;
    else delete sec.intro;
    if (t.steps) sec.steps = t.steps;
    if (t.caption) sec.caption = t.caption;
  }
  return out;
}

function mergeLangPack(base, wave9) {
  if (!wave9) return base;
  const merged = base ? structuredClone(base) : { sections: {} };
  if (wave9.title) merged.title = wave9.title;
  if (wave9.intro) merged.intro = wave9.intro;
  merged.sections = merged.sections || {};
  for (const [id, sec] of Object.entries(wave9.sections || {})) {
    merged.sections[id] = { ...(merged.sections[id] || {}), ...sec };
  }
  return merged;
}

for (const lang of LANGS) {
  const pack = T[lang];
  const wave9 = WAVE9[lang];
  for (const key of CHAPTER_KEYS) {
    const enPath = path.join(LOCALES, 'en', `${key}.json`);
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const chapterPack = mergeLangPack(pack?.[key], wave9?.[key]);
    const out = chapterPack?.title || chapterPack?.intro || chapterPack?.sections
      ? applyTranslations(en, chapterPack)
      : en;
    const dest = path.join(LOCALES, lang, `${key}.json`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  }
  console.log('generated', lang);
}
