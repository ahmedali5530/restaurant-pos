#!/usr/bin/env node
/**
 * Generate inventory-guide locale JSON from English masters.
 * Run: node docs-automation/generate-inventory-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');

const CHAPTER_KEYS = [
  'inventory-overview',
  'inventory-items',
  'inventory-purchases',
  'inventory-issues',
  'inventory-wastes',
  'inventory-counts',
];

const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>>} */
const T = {
  es: {
    'inventory-overview': {
      title: 'Resumen de Inventario',
      intro: 'Inventario es el centro de almacén para existencias, artículos, compras, salidas, mermas y conteos. Ábralo desde la barra lateral si su rol incluye acceso de inventario.',
      sections: {
        open: {
          title: 'Abrir Inventario',
          steps: [
            'Inicie sesión con un usuario con acceso de inventario (almacén).',
            'Pulse Inventario en la barra lateral.',
            'La pantalla se abre en el resumen de existencias actuales por defecto.',
          ],
          caption: 'Pantalla Inventario con pestañas y panel de resumen.',
        },
        tabs: {
          title: 'Navegación por pestañas',
          intro: 'Las pestañas agrupan datos maestros y documentos de stock. Cambiar de pestaña puede requerir PIN de gerente.',
          steps: [
            'Desplace la barra de pestañas horizontalmente cuando hay muchas.',
            'Cada pestaña abre su lista o formulario.',
            'La pestaña seleccionada se resalta con el degradado principal.',
          ],
          caption: 'Barra de pestañas de Inventario.',
        },
        summary: {
          title: 'Resumen de inventario actual',
          steps: [
            'La pestaña Inventario muestra cantidades en mano por artículo y ubicación.',
            'Use búsqueda y filtros para stock bajo o artículos concretos.',
            'Otras pestañas gestionan compras, salidas, mermas y ajustes.',
          ],
          caption: 'Tabla de resumen de inventario actual.',
        },
      },
    },
    'inventory-items': {
      title: 'Artículos y datos maestros',
      intro: 'Mantenga artículos, categorías y ubicaciones que impulsan valoración y documentos.',
      sections: {
        items: {
          title: 'Artículos',
          steps: [
            'Abra la pestaña Artículos.',
            'Cree o edite artículos con código, unidad, niveles de reorden y proveedores.',
            'Los artículos aparecen en compras, salidas, recetas y el resumen.',
          ],
          caption: 'Tabla de mantenimiento de artículos.',
        },
        categories: {
          title: 'Categorías de artículos',
          intro: 'Las categorías agrupan artículos para filtros e informes.',
          steps: [
            'Abra la pestaña Categorías de artículos.',
            'Agregue categorías según cocina y almacén.',
            'Asigne categorías en el formulario de cada artículo.',
          ],
          caption: 'Pestaña Categorías de artículos.',
        },
        locations: {
          title: 'Ubicaciones',
          steps: [
            'Abra la pestaña Ubicaciones.',
            'Defina almacenes, neveras o cocinas donde se guarda stock.',
            'Los documentos siempre referencian una ubicación.',
          ],
          caption: 'Pestaña Ubicaciones.',
        },
      },
    },
    'inventory-purchases': {
      title: 'Compras',
      intro: 'Ingrese stock con órdenes de compra, recepciones y devoluciones a proveedores.',
      sections: {
        orders: {
          title: 'Órdenes de compra',
          steps: [
            'Abra la pestaña Órdenes de compra.',
            'Cree una OC contra un proveedor con líneas y cantidades.',
            'Envíe y apruebe según su rol antes de recibir mercancía.',
          ],
          caption: 'Lista de órdenes de compra.',
        },
        purchases: {
          title: 'Compras (recepción)',
          intro: 'Las compras registran stock en una ubicación y actualizan el costo promedio.',
          steps: [
            'Abra la pestaña Compras.',
            'Registre la factura del proveedor y las líneas recibidas.',
            'Vincule a una OC si existe y guarde para actualizar inventario.',
          ],
          caption: 'Lista de compras.',
        },
        returns: {
          title: 'Devoluciones de compra',
          steps: [
            'Abra la pestaña Devoluciones de compra.',
            'Devuelva mercancía dañada o incorrecta al proveedor.',
            'Guardar reduce la cantidad en la ubicación.',
          ],
          caption: 'Pestaña Devoluciones de compra.',
        },
      },
    },
    'inventory-issues': {
      title: 'Salidas y devoluciones',
      intro: 'Salga stock del almacén a cocinas o centros de costo, y devuelva stock no usado.',
      sections: {
        issues: {
          title: 'Salidas',
          steps: [
            'Abra la pestaña Salidas.',
            'Cree un documento con destino (cocina o departamento) y líneas.',
            'Guardar resta cantidad de la ubicación origen.',
          ],
          caption: 'Lista de salidas.',
        },
        returns: {
          title: 'Devoluciones de salida',
          intro: 'Devuelva artículos emitidos no usados para que vuelvan al inventario.',
          steps: [
            'Abra la pestaña Devoluciones de salida.',
            'Seleccione la salida original o ingrese líneas de devolución.',
            'Guardar suma cantidad de nuevo a la ubicación.',
          ],
          caption: 'Pestaña Devoluciones de salida.',
        },
      },
    },
    'inventory-wastes': {
      title: 'Mermas',
      intro: 'Registre deterioro, roturas y otras pérdidas para mantener informes precisos.',
      sections: {
        list: {
          title: 'Documentos de merma',
          steps: [
            'Abra la pestaña Mermas.',
            'Cree un documento con ubicación, motivo y cantidades.',
            'Guardar reduce stock y registra el costo de merma.',
          ],
          caption: 'Lista de mermas.',
        },
      },
    },
    'inventory-counts': {
      title: 'Conteos y transferencias',
      intro: 'Conciliar conteos físicos con el sistema mediante ajustes, y mover stock entre ubicaciones.',
      sections: {
        adjustments: {
          title: 'Ajustes (conteos)',
          steps: [
            'Abra la pestaña Ajustes.',
            'Ingrese cantidades contadas por artículo y ubicación.',
            'Envíe, apruebe y publique según su rol para actualizar inventario.',
          ],
          caption: 'Lista de ajustes (conteo).',
        },
        transfers: {
          title: 'Transferencias de stock',
          intro: 'Mueva stock entre ubicaciones sin cambiar el total de la empresa.',
          steps: [
            'Abra la pestaña Transferencias de stock.',
            'Elija origen, destino y líneas.',
            'Guarde para disminuir origen y aumentar destino.',
          ],
          caption: 'Pestaña Transferencias de stock.',
        },
      },
    },
  },
  tr: {
    'inventory-overview': {
      title: 'Stok genel bakış',
      intro: 'Stok, depo merkezi: mevcut miktarlar, ürünler, satın almalar, çıkışlar, fireler ve sayımlar. Stok erişimi olan roller yan menüden açar.',
      sections: {
        open: { title: 'Stoku aç', steps: ['Stok (depo) erişimi olan kullanıcıyla giriş yapın.', 'Yan menüde Stok\'a dokunun.', 'Ekran varsayılan olarak mevcut stok özetinde açılır.'], caption: 'Sekme çubuğu ve özet paneliyle Stok ekranı.' },
        tabs: { title: 'Sekme gezinmesi', intro: 'Sekmeler ana verileri ve stok belgelerini gruplar. Değiştirmek yönetici PIN\'i gerektirebilir.', steps: ['Çok sekme varken yatay kaydırın.', 'Her sekme kendi listesini açar.', 'Seçili sekme birincil gradyanla vurgulanır.'], caption: 'Stok sekme çubuğu.' },
        summary: { title: 'Mevcut stok özeti', steps: ['Stok sekmesi ürün ve lokasyona göre eldeki miktarları gösterir.', 'Düşük stok veya belirli ürünler için arama kullanın.', 'Diğer sekmeler satın alma, çıkış, fire ve düzeltmeleri yönetir.'], caption: 'Mevcut stok özet tablosu.' },
      },
    },
    'inventory-items': {
      title: 'Ürünler ve ana veri',
      intro: 'Stok değerlemesi ve belgeleri için ürünler, kategoriler ve lokasyonları yönetin.',
      sections: {
        items: { title: 'Ürünler', steps: ['Ürünler sekmesini açın.', 'Kod, birim, yeniden sipariş seviyesi ve tedarikçilerle ürün oluşturun.', 'Ürünler satın alma, çıkış, reçete ve özette görünür.'], caption: 'Ürün bakım tablosu.' },
        categories: { title: 'Ürün kategorileri', intro: 'Kategoriler filtre ve raporlar için ürünleri gruplar.', steps: ['Ürün Kategorileri sekmesini açın.', 'Mutfak ve depoya uygun kategoriler ekleyin.', 'Her ürün formunda kategori atayın.'], caption: 'Ürün kategorileri sekmesi.' },
        locations: { title: 'Lokasyonlar', steps: ['Lokasyonlar sekmesini açın.', 'Depo, buzdolabı veya mutfakları tanımlayın.', 'Belgeler her zaman bir lokasyona bağlıdır.'], caption: 'Lokasyonlar sekmesi.' },
      },
    },
    'inventory-purchases': {
      title: 'Satın almalar',
      intro: 'Satın alma siparişleri, girişler ve tedarikçi iadeleriyle stok girin.',
      sections: {
        orders: { title: 'Satın alma siparişleri', steps: ['Satın Alma Siparişleri sekmesini açın.', 'Tedarikçiye karşı satırlar ve miktarlarla sipariş oluşturun.', 'Mal kabulünden önce rolünüze göre gönderin ve onaylayın.'], caption: 'Satın alma siparişleri listesi.' },
        purchases: { title: 'Satın almalar (giriş)', intro: 'Satın almalar lokasyona stok yazar ve ortalama maliyeti günceller.', steps: ['Satın Almalar sekmesini açın.', 'Tedarikçi faturası ve alınan satırları kaydedin.', 'Varsa siparişe bağlayıp kaydedin.'], caption: 'Satın almalar listesi.' },
        returns: { title: 'Satın alma iadeleri', steps: ['Satın Alma İadeleri sekmesini açın.', 'Hasarlı veya hatalı malları tedarikçiye iade edin.', 'Kaydetmek lokasyondaki miktarı azaltır.'], caption: 'Satın alma iadeleri sekmesi.' },
      },
    },
    'inventory-issues': {
      title: 'Çıkışlar ve iadeler',
      intro: 'Depodan mutfaklara stok çıkarın ve kullanılmayan stoğu iade edin.',
      sections: {
        issues: { title: 'Çıkışlar', steps: ['Çıkışlar sekmesini açın.', 'Hedef (mutfak veya departman) ve satırlarla belge oluşturun.', 'Kaydetmek kaynak lokasyondan miktar düşer.'], caption: 'Çıkışlar listesi.' },
        returns: { title: 'Çıkış iadeleri', intro: 'Kullanılmayan çıkışları stoğa geri alın.', steps: ['Çıkış İadeleri sekmesini açın.', 'Orijinal çıkışı seçin veya iade satırları girin.', 'Kaydetmek miktarı lokasyona ekler.'], caption: 'Çıkış iadeleri sekmesi.' },
      },
    },
    'inventory-wastes': {
      title: 'Fireler',
      intro: 'Bozulma, kırılma ve diğer kayıpları kaydedin.',
      sections: {
        list: { title: 'Fire belgeleri', steps: ['Fireler sekmesini açın.', 'Lokasyon, neden ve miktarlarla belge oluşturun.', 'Kaydetmek stoğu azaltır ve fire maliyetini yazar.'], caption: 'Fireler listesi.' },
      },
    },
    'inventory-counts': {
      title: 'Sayımlar ve transferler',
      intro: 'Fiziksel sayımları düzeltmelerle sisteme işleyin; lokasyonlar arası transfer yapın.',
      sections: {
        adjustments: { title: 'Düzeltmeler (sayımlar)', steps: ['Düzeltmeler sekmesini açın.', 'Ürün ve lokasyona göre sayılan miktarları girin.', 'Rolünüze göre gönderin, onaylayın ve kaydedin.'], caption: 'Düzeltmeler (sayım) listesi.' },
        transfers: { title: 'Stok transferleri', intro: 'Toplam şirket miktarını değiştirmeden lokasyonlar arası taşıyın.', steps: ['Stok Transferleri sekmesini açın.', 'Kaynak, hedef ve satırları seçin.', 'Kaydetmek kaynağı azaltır, hedefi artırır.'], caption: 'Stok transferleri sekmesi.' },
      },
    },
  },
  'pt-br': {
    'inventory-overview': {
      title: 'Visão geral do Estoque',
      intro: 'Estoque é o hub do depósito: saldos, itens, compras, saídas, perdas e contagens. Abra pela barra lateral com acesso de estoque.',
      sections: {
        open: { title: 'Abrir Estoque', steps: ['Entre com usuário de acesso a estoque.', 'Toque em Estoque na barra lateral.', 'A tela abre no resumo de estoque atual.'], caption: 'Tela Estoque com abas e painel.' },
        tabs: { title: 'Navegação por abas', intro: 'Abas agrupam cadastros e documentos. Trocar pode exigir PIN de gerente.', steps: ['Role a barra horizontalmente.', 'Cada aba abre sua lista.', 'A aba selecionada fica destacada.'], caption: 'Barra de abas do Estoque.' },
        summary: { title: 'Resumo do estoque atual', steps: ['A aba Estoque mostra quantidades por item e local.', 'Use busca e filtros para estoque baixo.', 'Outras abas tratam compras, saídas, perdas e ajustes.'], caption: 'Tabela de resumo do estoque.' },
      },
    },
    'inventory-items': {
      title: 'Itens e cadastros',
      intro: 'Mantenha itens, categorias e locais que alimentam valorização e documentos.',
      sections: {
        items: { title: 'Itens', steps: ['Abra a aba Itens.', 'Crie ou edite itens com código, unidade e fornecedores.', 'Itens aparecem em compras, saídas e no resumo.'], caption: 'Tabela de itens.' },
        categories: { title: 'Categorias de itens', intro: 'Categorias agrupam itens para filtros e relatórios.', steps: ['Abra Categorias de itens.', 'Adicione categorias alinhadas à cozinha e ao depósito.', 'Atribua no formulário do item.'], caption: 'Aba Categorias de itens.' },
        locations: { title: 'Locais', steps: ['Abra a aba Locais.', 'Defina depósitos, geladeiras ou cozinhas.', 'Documentos sempre referenciam um local.'], caption: 'Aba Locais.' },
      },
    },
    'inventory-purchases': {
      title: 'Compras',
      intro: 'Entre estoque com pedidos de compra, recebimentos e devoluções.',
      sections: {
        orders: { title: 'Pedidos de compra', steps: ['Abra Pedidos de compra.', 'Crie um PC para o fornecedor com linhas.', 'Envie e aprove conforme seu papel antes de receber.'], caption: 'Lista de pedidos de compra.' },
        purchases: { title: 'Compras (recebimento)', intro: 'Compras lançam estoque no local e atualizam custo médio.', steps: ['Abra Compras.', 'Registre a nota e as linhas recebidas.', 'Vincule a um PC se existir e salve.'], caption: 'Lista de compras.' },
        returns: { title: 'Devoluções de compra', steps: ['Abra Devoluções de compra.', 'Devolva mercadoria danificada ou incorreta.', 'Salvar reduz a quantidade no local.'], caption: 'Aba Devoluções de compra.' },
      },
    },
    'inventory-issues': {
      title: 'Saídas e devoluções',
      intro: 'Saia estoque para cozinhas e devolva o não utilizado.',
      sections: {
        issues: { title: 'Saídas', steps: ['Abra Saídas.', 'Crie documento com destino e linhas.', 'Salvar reduz a quantidade na origem.'], caption: 'Lista de saídas.' },
        returns: { title: 'Devoluções de saída', intro: 'Devolva itens emitidos não usados.', steps: ['Abra Devoluções de saída.', 'Selecione a saída original ou informe linhas.', 'Salvar devolve quantidade ao local.'], caption: 'Aba Devoluções de saída.' },
      },
    },
    'inventory-wastes': {
      title: 'Perdas',
      intro: 'Registre estragos e outras perdas para relatórios precisos.',
      sections: {
        list: { title: 'Documentos de perda', steps: ['Abra Perdas.', 'Crie documento com local, motivo e quantidades.', 'Salvar reduz estoque e registra custo.'], caption: 'Lista de perdas.' },
      },
    },
    'inventory-counts': {
      title: 'Contagens e transferências',
      intro: 'Concilie contagens físicas com ajustes e mova estoque entre locais.',
      sections: {
        adjustments: { title: 'Ajustes (contagens)', steps: ['Abra Ajustes.', 'Informe quantidades contadas por item e local.', 'Envie, aprove e poste conforme seu papel.'], caption: 'Lista de ajustes.' },
        transfers: { title: 'Transferências de estoque', intro: 'Mova estoque entre locais sem alterar o total da empresa.', steps: ['Abra Transferências.', 'Escolha origem, destino e linhas.', 'Salve para atualizar as quantidades.'], caption: 'Aba Transferências.' },
      },
    },
  },
  fr: {
    'inventory-overview': {
      title: 'Vue d\'ensemble Inventaire',
      intro: 'Inventaire est le hub entrepôt : stocks, articles, achats, sorties, pertes et inventaires. Ouvrez-le depuis la barre latérale avec accès inventaire.',
      sections: {
        open: { title: 'Ouvrir Inventaire', steps: ['Connectez-vous avec accès inventaire.', 'Appuyez sur Inventaire dans la barre latérale.', 'L\'écran s\'ouvre sur le résumé des stocks.'], caption: 'Écran Inventaire avec onglets.' },
        tabs: { title: 'Navigation par onglets', intro: 'Les onglets regroupent données et documents. Changer peut exiger un PIN manager.', steps: ['Faites défiler la barre horizontalement.', 'Chaque onglet ouvre sa liste.', 'L\'onglet actif est mis en surbrillance.'], caption: 'Barre d\'onglets Inventaire.' },
        summary: { title: 'Résumé du stock actuel', steps: ['L\'onglet Inventaire montre les quantités par article et emplacement.', 'Utilisez recherche et filtres.', 'Les autres onglets gèrent achats, sorties, pertes et ajustements.'], caption: 'Tableau résumé du stock.' },
      },
    },
    'inventory-items': {
      title: 'Articles et données de base',
      intro: 'Maintenez articles, catégories et emplacements pour la valorisation et les documents.',
      sections: {
        items: { title: 'Articles', steps: ['Ouvrez l\'onglet Articles.', 'Créez ou modifiez articles avec code, unité et fournisseurs.', 'Les articles apparaissent dans achats, sorties et résumé.'], caption: 'Table des articles.' },
        categories: { title: 'Catégories d\'articles', intro: 'Les catégories regroupent les articles pour filtres et rapports.', steps: ['Ouvrez Catégories d\'articles.', 'Ajoutez des catégories adaptées cuisine et entrepôt.', 'Assignez-les sur chaque fiche article.'], caption: 'Onglet Catégories.' },
        locations: { title: 'Emplacements', steps: ['Ouvrez Emplacements.', 'Définissez magasins, frigos ou cuisines.', 'Les documents référencent toujours un emplacement.'], caption: 'Onglet Emplacements.' },
      },
    },
    'inventory-purchases': {
      title: 'Achats',
      intro: 'Entrez du stock via commandes d\'achat, réceptions et retours fournisseurs.',
      sections: {
        orders: { title: 'Commandes d\'achat', steps: ['Ouvrez Commandes d\'achat.', 'Créez une CA fournisseur avec lignes.', 'Soumettez et approuvez avant réception.'], caption: 'Liste des commandes d\'achat.' },
        purchases: { title: 'Achats (réception)', intro: 'Les achats enregistrent le stock et mettent à jour le coût moyen.', steps: ['Ouvrez Achats.', 'Saisissez facture et lignes reçues.', 'Liez à une CA si besoin et enregistrez.'], caption: 'Liste des achats.' },
        returns: { title: 'Retours d\'achat', steps: ['Ouvrez Retours d\'achat.', 'Retournez marchandises endommagées ou incorrectes.', 'Enregistrer réduit la quantité.'], caption: 'Onglet Retours d\'achat.' },
      },
    },
    'inventory-issues': {
      title: 'Sorties et retours',
      intro: 'Sortez du stock vers les cuisines et retournez le non utilisé.',
      sections: {
        issues: { title: 'Sorties', steps: ['Ouvrez Sorties.', 'Créez un document avec destination et lignes.', 'Enregistrer diminue la quantité source.'], caption: 'Liste des sorties.' },
        returns: { title: 'Retours de sortie', intro: 'Retournez les articles sortis non utilisés.', steps: ['Ouvrez Retours de sortie.', 'Sélectionnez la sortie ou saisissez les lignes.', 'Enregistrer remet la quantité en stock.'], caption: 'Onglet Retours de sortie.' },
      },
    },
    'inventory-wastes': {
      title: 'Pertes',
      intro: 'Enregistrez détérioration et autres pertes pour des rapports exacts.',
      sections: {
        list: { title: 'Documents de perte', steps: ['Ouvrez Pertes.', 'Créez un document avec emplacement, motif et quantités.', 'Enregistrer réduit le stock et poste le coût.'], caption: 'Liste des pertes.' },
      },
    },
    'inventory-counts': {
      title: 'Inventaires et transferts',
      intro: 'Réconciliez les comptages physiques via ajustements et déplacez le stock entre emplacements.',
      sections: {
        adjustments: { title: 'Ajustements (comptages)', steps: ['Ouvrez Ajustements.', 'Saisissez les quantités comptées.', 'Soumettez, approuvez et postez selon votre rôle.'], caption: 'Liste des ajustements.' },
        transfers: { title: 'Transferts de stock', intro: 'Déplacez le stock sans changer le total entreprise.', steps: ['Ouvrez Transferts.', 'Choisissez source, destination et lignes.', 'Enregistrez pour mettre à jour les quantités.'], caption: 'Onglet Transferts.' },
      },
    },
  },
  nl: {
    'inventory-overview': {
      title: 'Voorraad overzicht',
      intro: 'Voorraad is het magazijnhub: saldi, artikelen, inkopen, uitgiftes, afval en tellingen. Open via de zijbalk met voorraadtoegang.',
      sections: {
        open: { title: 'Voorraad openen', steps: ['Log in met voorraadtoegang.', 'Tik op Voorraad in de zijbalk.', 'Het scherm opent op de huidige voorraadsamenvatting.'], caption: 'Voorraadscherm met tabbladen.' },
        tabs: { title: 'Tabnavigatie', intro: 'Tabbladen groeperen stamgegevens en documenten. Wisselen kan manager-PIN vereisen.', steps: ['Scroll horizontaal bij veel tabs.', 'Elk tabblad opent zijn lijst.', 'Het geselecteerde tabblad is gemarkeerd.'], caption: 'Voorraad tabbalk.' },
        summary: { title: 'Huidige voorraadsamenvatting', steps: ['Tabblad Voorraad toont hoeveelheden per artikel en locatie.', 'Gebruik zoeken en filters.', 'Andere tabs beheren inkopen, uitgiftes, afval en correcties.'], caption: 'Voorraad samenvattingstabel.' },
      },
    },
    'inventory-items': {
      title: 'Artikelen en stamgegevens',
      intro: 'Beheer artikelen, categorieën en locaties voor waardering en documenten.',
      sections: {
        items: { title: 'Artikelen', steps: ['Open tabblad Artikelen.', 'Maak of bewerk artikelen met code, eenheid en leveranciers.', 'Artikelen verschijnen in inkopen, uitgiftes en samenvatting.'], caption: 'Artikelen onderhoudstabel.' },
        categories: { title: 'Artikelcategorieën', intro: 'Categorieën groeperen artikelen voor filters en rapporten.', steps: ['Open Artikelcategorieën.', 'Voeg categorieën toe voor keuken en magazijn.', 'Wijs toe op het artikelformulier.'], caption: 'Tabblad Artikelcategorieën.' },
        locations: { title: 'Locaties', steps: ['Open Locaties.', 'Definieer magazijnen, koelkasten of keukens.', 'Documenten verwijzen altijd naar een locatie.'], caption: 'Tabblad Locaties.' },
      },
    },
    'inventory-purchases': {
      title: 'Inkopen',
      intro: 'Breng voorraad binnen met inkooporders, ontvangsten en retouren.',
      sections: {
        orders: { title: 'Inkooporders', steps: ['Open Inkooporders.', 'Maak een IO voor een leverancier met regels.', 'Dien in en keur goed vóór ontvangst.'], caption: 'Lijst inkooporders.' },
        purchases: { title: 'Inkopen (ontvangst)', intro: 'Inkopen boeken voorraad en werken gemiddelde kost bij.', steps: ['Open Inkopen.', 'Registreer factuur en ontvangen regels.', 'Koppel aan IO indien aanwezig en sla op.'], caption: 'Lijst inkopen.' },
        returns: { title: 'Inkoopretouren', steps: ['Open Inkoopretouren.', 'Retourneer beschadigde of verkeerde goederen.', 'Opslaan verlaagt de hoeveelheid.'], caption: 'Tabblad Inkoopretouren.' },
      },
    },
    'inventory-issues': {
      title: 'Uitgiftes en retouren',
      intro: 'Geef voorraad uit naar keukens en retourneer ongebruikte voorraad.',
      sections: {
        issues: { title: 'Uitgiftes', steps: ['Open Uitgiftes.', 'Maak document met bestemming en regels.', 'Opslaan vermindert bronlocatie.'], caption: 'Lijst uitgiftes.' },
        returns: { title: 'Uitgifteretouren', intro: 'Retourneer ongebruikte uitgegeven artikelen.', steps: ['Open Uitgifteretouren.', 'Selecteer oorspronkelijke uitgifte of voer regels in.', 'Opslaan voegt hoeveelheid terug toe.'], caption: 'Tabblad Uitgifteretouren.' },
      },
    },
    'inventory-wastes': {
      title: 'Afval',
      intro: 'Registreer bederf en andere verliezen voor accurate rapporten.',
      sections: {
        list: { title: 'Afvaldocumenten', steps: ['Open Afval.', 'Maak document met locatie, reden en hoeveelheden.', 'Opslaan vermindert voorraad en boekt kosten.'], caption: 'Lijst afval.' },
      },
    },
    'inventory-counts': {
      title: 'Tellingen en transfers',
      intro: 'Stem fysieke tellingen af via correcties en verplaats voorraad tussen locaties.',
      sections: {
        adjustments: { title: 'Correcties (tellingen)', steps: ['Open Correcties.', 'Voer getelde hoeveelheden in.', 'Dien in, keur goed en boek volgens rol.'], caption: 'Lijst correcties.' },
        transfers: { title: 'Voorraadtransfers', intro: 'Verplaats voorraad zonder het bedrijfstotaal te wijzigen.', steps: ['Open Voorraadtransfers.', 'Kies bron, bestemming en regels.', 'Sla op om hoeveelheden bij te werken.'], caption: 'Tabblad Transfers.' },
      },
    },
  },
  de: {
    'inventory-overview': {
      title: 'Inventar Übersicht',
      intro: 'Inventar ist das Lager-Hub: Bestände, Artikel, Einkäufe, Ausgaben, Verluste und Zählungen. Öffnen Sie es über die Seitenleiste mit Inventarzugriff.',
      sections: {
        open: { title: 'Inventar öffnen', steps: ['Mit Inventarzugriff anmelden.', 'Inventar in der Seitenleiste tippen.', 'Standardmäßig öffnet sich die Bestandsübersicht.'], caption: 'Inventar-Bildschirm mit Tabs.' },
        tabs: { title: 'Tab-Navigation', intro: 'Tabs gruppieren Stammdaten und Belege. Wechsel kann Manager-PIN erfordern.', steps: ['Bei vielen Tabs horizontal scrollen.', 'Jeder Tab öffnet seine Liste.', 'Aktiver Tab ist hervorgehoben.'], caption: 'Inventar-Tableiste.' },
        summary: { title: 'Aktuelle Bestandsübersicht', steps: ['Tab Inventar zeigt Mengen nach Artikel und Standort.', 'Suche und Filter nutzen.', 'Andere Tabs: Einkäufe, Ausgaben, Verluste, Anpassungen.'], caption: 'Bestandsübersichtstabelle.' },
      },
    },
    'inventory-items': {
      title: 'Artikel und Stammdaten',
      intro: 'Artikel, Kategorien und Standorte für Bewertung und Belege pflegen.',
      sections: {
        items: { title: 'Artikel', steps: ['Tab Artikel öffnen.', 'Artikel mit Code, Einheit und Lieferanten anlegen.', 'Artikel erscheinen in Einkäufen, Ausgaben und Übersicht.'], caption: 'Artikel-Wartungstabelle.' },
        categories: { title: 'Artikelkategorien', intro: 'Kategorien gruppieren Artikel für Filter und Berichte.', steps: ['Tab Artikelkategorien öffnen.', 'Kategorien für Küche und Lager anlegen.', 'Im Artikelformular zuweisen.'], caption: 'Tab Artikelkategorien.' },
        locations: { title: 'Standorte', steps: ['Tab Standorte öffnen.', 'Lager, Kühlschränke oder Küchen definieren.', 'Belege referenzieren immer einen Standort.'], caption: 'Tab Standorte.' },
      },
    },
    'inventory-purchases': {
      title: 'Einkäufe',
      intro: 'Bestand einbuchen über Bestellungen, Wareneingänge und Retouren.',
      sections: {
        orders: { title: 'Bestellungen', steps: ['Tab Bestellungen öffnen.', 'Bestellung beim Lieferanten mit Positionen anlegen.', 'Vor Wareneingang einreichen und genehmigen.'], caption: 'Bestellungsliste.' },
        purchases: { title: 'Einkäufe (Wareneingang)', intro: 'Einkäufe buchen Bestand und aktualisieren Durchschnittskosten.', steps: ['Tab Einkäufe öffnen.', 'Lieferantenrechnung und Positionen erfassen.', 'Mit Bestellung verknüpfen und speichern.'], caption: 'Einkaufsliste.' },
        returns: { title: 'Einkaufsretouren', steps: ['Tab Einkaufsretouren öffnen.', 'Beschädigte oder falsche Ware zurückgeben.', 'Speichern mindert die Menge.'], caption: 'Tab Einkaufsretouren.' },
      },
    },
    'inventory-issues': {
      title: 'Ausgaben und Rückgaben',
      intro: 'Bestand an Küchen ausgeben und ungenutzten Bestand zurückbuchen.',
      sections: {
        issues: { title: 'Ausgaben', steps: ['Tab Ausgaben öffnen.', 'Beleg mit Ziel und Positionen erstellen.', 'Speichern mindert Quellstandort.'], caption: 'Ausgabenliste.' },
        returns: { title: 'Ausgabenrückgaben', intro: 'Ungenutzte ausgegebene Artikel zurückgeben.', steps: ['Tab Ausgabenrückgaben öffnen.', 'Originalausgabe wählen oder Positionen eingeben.', 'Speichern erhöht wieder den Bestand.'], caption: 'Tab Ausgabenrückgaben.' },
      },
    },
    'inventory-wastes': {
      title: 'Verluste',
      intro: 'Verderb und andere Verluste für genaue Berichte erfassen.',
      sections: {
        list: { title: 'Verlustbelege', steps: ['Tab Verluste öffnen.', 'Beleg mit Standort, Grund und Mengen erstellen.', 'Speichern mindert Bestand und bucht Kosten.'], caption: 'Verlustliste.' },
      },
    },
    'inventory-counts': {
      title: 'Zählungen und Transfers',
      intro: 'Physische Zählungen per Anpassungen abstimmen und Bestand zwischen Standorten bewegen.',
      sections: {
        adjustments: { title: 'Anpassungen (Zählungen)', steps: ['Tab Anpassungen öffnen.', 'Gezählte Mengen eingeben.', 'Einreichen, genehmigen und buchen laut Rolle.'], caption: 'Anpassungsliste.' },
        transfers: { title: 'Bestandstransfers', intro: 'Bestand verschieben ohne Unternehmensgesamtmenge zu ändern.', steps: ['Tab Bestandstransfers öffnen.', 'Quelle, Ziel und Positionen wählen.', 'Speichern aktualisiert die Mengen.'], caption: 'Tab Transfers.' },
      },
    },
  },
  it: {
    'inventory-overview': {
      title: 'Panoramica Magazzino',
      intro: 'Magazzino è l\'hub scorte: saldi, articoli, acquisti, uscite, scarti e conteggi. Aprilo dalla barra laterale con accesso magazzino.',
      sections: {
        open: { title: 'Apri Magazzino', steps: ['Accedi con accesso magazzino.', 'Tocca Magazzino nella barra laterale.', 'Si apre sul riepilogo scorte attuali.'], caption: 'Schermata Magazzino con schede.' },
        tabs: { title: 'Navigazione schede', intro: 'Le schede raggruppano anagrafiche e documenti. Il cambio può richiedere PIN manager.', steps: ['Scorri orizzontalmente con molte schede.', 'Ogni scheda apre la sua lista.', 'La scheda attiva è evidenziata.'], caption: 'Barra schede Magazzino.' },
        summary: { title: 'Riepilogo inventario attuale', steps: ['La scheda Magazzino mostra quantità per articolo e ubicazione.', 'Usa ricerca e filtri.', 'Altre schede gestiscono acquisti, uscite, scarti e rettifiche.'], caption: 'Tabella riepilogo inventario.' },
      },
    },
    'inventory-items': {
      title: 'Articoli e anagrafiche',
      intro: 'Mantieni articoli, categorie e ubicazioni per valorizzazione e documenti.',
      sections: {
        items: { title: 'Articoli', steps: ['Apri scheda Articoli.', 'Crea o modifica articoli con codice, unità e fornitori.', 'Gli articoli compaiono in acquisti, uscite e riepilogo.'], caption: 'Tabella articoli.' },
        categories: { title: 'Categorie articoli', intro: 'Le categorie raggruppano articoli per filtri e report.', steps: ['Apri Categorie articoli.', 'Aggiungi categorie per cucina e magazzino.', 'Assegna nel form articolo.'], caption: 'Scheda Categorie articoli.' },
        locations: { title: 'Ubicazioni', steps: ['Apri Ubicazioni.', 'Definisci magazzini, frigoriferi o cucine.', 'I documenti referenziano sempre un\'ubicazione.'], caption: 'Scheda Ubicazioni.' },
      },
    },
    'inventory-purchases': {
      title: 'Acquisti',
      intro: 'Entra scorte con ordini d\'acquisto, ricevimenti e resi.',
      sections: {
        orders: { title: 'Ordini d\'acquisto', steps: ['Apri Ordini d\'acquisto.', 'Crea un OA verso fornitore con righe.', 'Invia e approva prima di ricevere.'], caption: 'Lista ordini d\'acquisto.' },
        purchases: { title: 'Acquisti (ricezione)', intro: 'Gli acquisti caricano scorte e aggiornano il costo medio.', steps: ['Apri Acquisti.', 'Registra fattura e righe ricevute.', 'Collega a un OA se esiste e salva.'], caption: 'Lista acquisti.' },
        returns: { title: 'Resi acquisto', steps: ['Apri Resi acquisto.', 'Restituisci merce danneggiata o errata.', 'Salvare riduce la quantità.'], caption: 'Scheda Resi acquisto.' },
      },
    },
    'inventory-issues': {
      title: 'Uscite e resi',
      intro: 'Emetti scorte alle cucine e restituisci quelle non usate.',
      sections: {
        issues: { title: 'Uscite', steps: ['Apri Uscite.', 'Crea documento con destinazione e righe.', 'Salvare riduce la quantità origine.'], caption: 'Lista uscite.' },
        returns: { title: 'Resi uscita', intro: 'Restituisci articoli emessi non usati.', steps: ['Apri Resi uscita.', 'Seleziona l\'uscita originale o inserisci righe.', 'Salvare aggiunge quantità all\'ubicazione.'], caption: 'Scheda Resi uscita.' },
      },
    },
    'inventory-wastes': {
      title: 'Scarti',
      intro: 'Registra deterioramento e altre perdite per report accurati.',
      sections: {
        list: { title: 'Documenti scarto', steps: ['Apri Scarti.', 'Crea documento con ubicazione, motivo e quantità.', 'Salvare riduce scorte e registra il costo.'], caption: 'Lista scarti.' },
      },
    },
    'inventory-counts': {
      title: 'Conteggi e trasferimenti',
      intro: 'Riconcilia conteggi fisici con rettifiche e sposta scorte tra ubicazioni.',
      sections: {
        adjustments: { title: 'Rettifiche (conteggi)', steps: ['Apri Rettifiche.', 'Inserisci quantità contate.', 'Invia, approva e registra secondo il ruolo.'], caption: 'Lista rettifiche.' },
        transfers: { title: 'Trasferimenti scorte', intro: 'Sposta scorte senza cambiare il totale aziendale.', steps: ['Apri Trasferimenti.', 'Scegli origine, destinazione e righe.', 'Salva per aggiornare le quantità.'], caption: 'Scheda Trasferimenti.' },
      },
    },
  },
  ar: {
    'inventory-overview': {
      title: 'نظرة عامة على المخزون',
      intro: 'المخزون هو مركز المستودع: الأرصدة والأصناف والمشتريات والصرف والهدر والجرد. افتحه من الشريط الجانبي بصلاحية المخزون.',
      sections: {
        open: { title: 'فتح المخزون', steps: ['سجّل الدخول بمستخدم له صلاحية المخزون.', 'اضغط المخزون في الشريط الجانبي.', 'تفتح الشاشة على ملخص المخزون الحالي افتراضياً.'], caption: 'شاشة المخزون مع شريط التبويب.' },
        tabs: { title: 'التنقل بين التبويبات', intro: 'التبويبات تجمع البيانات الرئيسية والمستندات. قد يتطلب التبديل PIN مدير.', steps: ['مرّر شريط التبويب أفقياً عند كثرتها.', 'كل تبويب يفتح قائمته.', 'التبويب المحدد مميّز.'], caption: 'شريط تبويبات المخزون.' },
        summary: { title: 'ملخص المخزون الحالي', steps: ['تبويب المخزون يعرض الكميات حسب الصنف والموقع.', 'استخدم البحث والفلاتر.', 'تبويبات أخرى تدير المشتريات والصرف والهدر والتسويات.'], caption: 'جدول ملخص المخزون.' },
      },
    },
    'inventory-items': {
      title: 'الأصناف والبيانات الرئيسية',
      intro: 'صيانة الأصناف والفئات والمواقع للتقييم والمستندات.',
      sections: {
        items: { title: 'الأصناف', steps: ['افتح تبويب الأصناف.', 'أنشئ أو عدّل أصنافاً بالرمز والوحدة والموردين.', 'تظهر في المشتريات والصرف والملخص.'], caption: 'جدول صيانة الأصناف.' },
        categories: { title: 'فئات الأصناف', intro: 'الفئات تجمع الأصناف للفلاتر والتقارير.', steps: ['افتح فئات الأصناف.', 'أضف فئات تناسب المطبخ والمستودع.', 'عيّن الفئة في نموذج الصنف.'], caption: 'تبويب فئات الأصناف.' },
        locations: { title: 'المواقع', steps: ['افتح المواقع.', 'عرّف مخازن أو ثلاجات أو مطابخ.', 'المستندات تشير دائماً إلى موقع.'], caption: 'تبويب المواقع.' },
      },
    },
    'inventory-purchases': {
      title: 'المشتريات',
      intro: 'أدخل المخزون عبر أوامر الشراء والاستلام ومرتجعات الموردين.',
      sections: {
        orders: { title: 'أوامر الشراء', steps: ['افتح أوامر الشراء.', 'أنشئ أمراً للمورد بأسطر وكميات.', 'أرسل ووافق حسب دورك قبل الاستلام.'], caption: 'قائمة أوامر الشراء.' },
        purchases: { title: 'المشتريات (الاستلام)', intro: 'المشتريات ترحّل المخزون وتحدّث متوسط التكلفة.', steps: ['افتح المشتريات.', 'سجّل فاتورة المورد والأسطر المستلمة.', 'اربط بأمر شراء إن وُجد واحفظ.'], caption: 'قائمة المشتريات.' },
        returns: { title: 'مرتجعات الشراء', steps: ['افتح مرتجعات الشراء.', 'أعد البضاعة التالفة أو الخاطئة للمورد.', 'الحفظ يقلل الكمية في الموقع.'], caption: 'تبويب مرتجعات الشراء.' },
      },
    },
    'inventory-issues': {
      title: 'الصرف والمرتجعات',
      intro: 'اصرف المخزون للمطابخ وأعد غير المستخدم.',
      sections: {
        issues: { title: 'الصرف', steps: ['افتح الصرف.', 'أنشئ مستنداً بالوجهة والأسطر.', 'الحفظ يخصم من موقع المصدر.'], caption: 'قائمة الصرف.' },
        returns: { title: 'مرتجعات الصرف', intro: 'أعد الأصناف المصروفة غير المستخدمة.', steps: ['افتح مرتجعات الصرف.', 'اختر الصرف الأصلي أو أدخل أسطر الإرجاع.', 'الحفظ يعيد الكمية للموقع.'], caption: 'تبويب مرتجعات الصرف.' },
      },
    },
    'inventory-wastes': {
      title: 'الهدر',
      intro: 'سجّل التلف والكسور والخسائر الأخرى لتقارير دقيقة.',
      sections: {
        list: { title: 'مستندات الهدر', steps: ['افتح الهدر.', 'أنشئ مستنداً بالموقع والسبب والكميات.', 'الحفظ يقلل المخزون ويسجّل التكلفة.'], caption: 'قائمة الهدر.' },
      },
    },
    'inventory-counts': {
      title: 'الجرد والتحويلات',
      intro: 'طابق الجرد الفعلي بالتسويات وانقل المخزون بين المواقع.',
      sections: {
        adjustments: { title: 'التسويات (الجرد)', steps: ['افتح التسويات.', 'أدخل الكميات المعدودة حسب الصنف والموقع.', 'أرسل ووافق ورحّل حسب دورك.'], caption: 'قائمة التسويات.' },
        transfers: { title: 'تحويلات المخزون', intro: 'انقل المخزون دون تغيير إجمالي الشركة.', steps: ['افتح تحويلات المخزون.', 'اختر المصدر والوجهة والأسطر.', 'احفظ لتحديث الكميات.'], caption: 'تبويب التحويلات.' },
      },
    },
  },
  ru: {
    'inventory-overview': {
      title: 'Обзор склада',
      intro: 'Склад — центр учёта: остатки, номенклатура, закупки, выдачи, списания и инвентаризации. Откройте из боковой панели при доступе к складу.',
      sections: {
        open: { title: 'Открыть склад', steps: ['Войдите с доступом к складу.', 'Нажмите Склад в боковой панели.', 'Экран открывается на сводке текущих остатков.'], caption: 'Экран Склад с вкладками.' },
        tabs: { title: 'Навигация по вкладкам', intro: 'Вкладки группируют справочники и документы. Смена может требовать PIN менеджера.', steps: ['Прокручивайте панель вкладок горизонтально.', 'Каждая вкладка открывает свой список.', 'Активная вкладка выделена.'], caption: 'Панель вкладок Склад.' },
        summary: { title: 'Сводка текущего остатка', steps: ['Вкладка Склад показывает количества по позициям и складам.', 'Используйте поиск и фильтры.', 'Другие вкладки — закупки, выдачи, списания и корректировки.'], caption: 'Таблица сводки остатков.' },
      },
    },
    'inventory-items': {
      title: 'Номенклатура и справочники',
      intro: 'Ведите позиции, категории и места хранения для оценки и документов.',
      sections: {
        items: { title: 'Позиции', steps: ['Откройте вкладку Позиции.', 'Создайте или измените позиции с кодом, ед. изм. и поставщиками.', 'Позиции используются в закупках, выдачах и сводке.'], caption: 'Таблица позиций.' },
        categories: { title: 'Категории позиций', intro: 'Категории группируют позиции для фильтров и отчётов.', steps: ['Откройте Категории позиций.', 'Добавьте категории для кухни и склада.', 'Назначьте в карточке позиции.'], caption: 'Вкладка Категории позиций.' },
        locations: { title: 'Места хранения', steps: ['Откройте Места хранения.', 'Определите склады, холодильники или кухни.', 'Документы всегда ссылаются на место.'], caption: 'Вкладка Места хранения.' },
      },
    },
    'inventory-purchases': {
      title: 'Закупки',
      intro: 'Приход через заказы поставщикам, приёмку и возвраты.',
      sections: {
        orders: { title: 'Заказы на закупку', steps: ['Откройте Заказы на закупку.', 'Создайте заказ поставщику со строками.', 'Отправьте и утвердите до приёмки.'], caption: 'Список заказов на закупку.' },
        purchases: { title: 'Закупки (приёмка)', intro: 'Закупки оприходуют остаток и обновляют среднюю стоимость.', steps: ['Откройте Закупки.', 'Введите счёт поставщика и принятые строки.', 'Привяжите к заказу при наличии и сохраните.'], caption: 'Список закупок.' },
        returns: { title: 'Возвраты закупки', steps: ['Откройте Возвраты закупки.', 'Верните повреждённый или неверный товар.', 'Сохранение уменьшает количество.'], caption: 'Вкладка Возвраты закупки.' },
      },
    },
    'inventory-issues': {
      title: 'Выдачи и возвраты',
      intro: 'Выдавайте остаток на кухни и возвращайте неиспользованное.',
      sections: {
        issues: { title: 'Выдачи', steps: ['Откройте Выдачи.', 'Создайте документ с назначением и строками.', 'Сохранение уменьшает остаток на источнике.'], caption: 'Список выдач.' },
        returns: { title: 'Возвраты выдачи', intro: 'Верните неиспользованные выданные позиции.', steps: ['Откройте Возвраты выдачи.', 'Выберите исходную выдачу или введите строки.', 'Сохранение возвращает количество на склад.'], caption: 'Вкладка Возвраты выдачи.' },
      },
    },
    'inventory-wastes': {
      title: 'Списания',
      intro: 'Фиксируйте порчу и прочие потери для точных отчётов.',
      sections: {
        list: { title: 'Документы списания', steps: ['Откройте Списания.', 'Создайте документ с местом, причиной и количествами.', 'Сохранение уменьшает остаток и учитывает стоимость.'], caption: 'Список списаний.' },
      },
    },
    'inventory-counts': {
      title: 'Инвентаризация и перемещения',
      intro: 'Сверяйте физический подсчёт корректировками и перемещайте остаток между местами.',
      sections: {
        adjustments: { title: 'Корректировки (подсчёт)', steps: ['Откройте Корректировки.', 'Введите посчитанные количества.', 'Отправьте, утвердите и проведите по роли.'], caption: 'Список корректировок.' },
        transfers: { title: 'Перемещения остатка', intro: 'Перемещайте остаток без изменения общего количества компании.', steps: ['Откройте Перемещения.', 'Выберите источник, приёмник и строки.', 'Сохраните для обновления количеств.'], caption: 'Вкладка Перемещения.' },
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
  }
  return out;
}

for (const lang of LANGS) {
  const pack = T[lang];
  for (const key of CHAPTER_KEYS) {
    const enPath = path.join(LOCALES, 'en', `${key}.json`);
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const chapterPack = pack?.[key];
    const out = chapterPack ? applyTranslations(en, chapterPack) : en;
    const dest = path.join(LOCALES, lang, `${key}.json`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  }
  console.log('generated', lang);
}
