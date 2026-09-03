/**
 * Wave 9 Manage documentation — translations merged into generate-admin-locales.mjs
 * @type {Record<string, Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>>}
 */
export const WAVE9 = {
  es: {
    'admin-overview': {
      intro: 'Administración es el centro de configuración del local. Ábralo desde la barra lateral para mantener platos, menús, pisos, usuarios, impuestos, descuentos, cocinas, impresoras y más.',
      sections: {
        tabs: {
          steps: [
            'Desplace la barra de pestañas horizontalmente cuando hay muchas.',
            'Las pestañas cubren menús, plano de sala, promociones, cocina, impresión, pagos y usuarios.',
            'Cada pestaña abre su tabla o lista de mantenimiento.',
            'La pestaña seleccionada se resalta con el degradado principal.',
          ],
        },
      },
    },
    'admin-menus': {
      sections: {
        'modifier-groups': {
          title: 'Grupos de modificadores',
          intro: 'Los grupos de modificadores definen complementos, tamaños y opciones anidadas al personalizar un plato.',
          steps: [
            'Abra la pestaña Grupos de modificadores.',
            'Cree grupos con modificadores, precios y reglas de siguiente grupo.',
            'Asigne grupos a platos para el flujo correcto en el carrito.',
          ],
          caption: 'Pestaña Grupos de modificadores.',
        },
      },
    },
    'admin-promotions': {
      title: 'Descuentos y cupones',
      intro: 'Configure precios promocionales: reglas de descuento con motivos y permisos, más códigos de cupón en el pago.',
      sections: {
        'discount-rules': {
          title: 'Reglas de descuento',
          intro: 'Las reglas definen reducciones automáticas o manuales por categoría, alcance y elegibilidad.',
          steps: ['Abra la pestaña Descuentos.', 'Seleccione la subpestaña Reglas.', 'Agregue o edite reglas con tipo, valor y alcance.'],
          caption: 'Lista de reglas de descuento.',
        },
        'discount-reasons': {
          title: 'Motivos de descuento',
          intro: 'Los motivos aparecen cuando el personal aplica descuentos manuales para informes.',
          steps: ['Abra Descuentos y la subpestaña Motivos.', 'Cree motivos seleccionables en pago o carrito.', 'Desactive motivos que ya no ofrezca.'],
          caption: 'Mantenimiento de motivos de descuento.',
        },
        'discount-permissions': {
          title: 'Permisos de descuento',
          intro: 'Controle qué roles pueden aplicar cada tipo de descuento o superar límites.',
          steps: ['Abra Descuentos y la subpestaña Permisos.', 'Revise la matriz de roles versus capacidades.', 'Ajuste permisos para descuentos sensibles.'],
          caption: 'Matriz de permisos de descuento.',
        },
        coupons: {
          title: 'Cupones',
          steps: ['Abra la pestaña Cupones.', 'Cree códigos con valor, validez y límites de uso.', 'El personal los ingresa en el pago cuando aplique.'],
          caption: 'Pestaña Cupones.',
        },
      },
    },
    'admin-kitchen': {
      title: 'Cocinas y flujos de trabajo',
      intro: 'Dirija ítems a estaciones de cocina y defina etapas de preparación.',
      sections: {
        kitchens: {
          title: 'Cocinas',
          intro: 'Las cocinas agrupan platos y se vinculan a impresoras de tickets.',
          steps: ['Abra la pestaña Cocinas.', 'Cree estaciones (p. ej. Parrilla, Bar).', 'Asigne platos e impresoras para enrutar tickets.'],
          caption: 'Tabla de mantenimiento de cocinas.',
        },
        workflows: {
          title: 'Flujos de trabajo',
          intro: 'Los flujos definen pasos de estado usados en cocina y pantallas de pedidos.',
          steps: ['Abra la pestaña Flujos de trabajo.', 'Cree o edite pasos y transiciones.', 'Vincule flujos a tipos de orden o cocinas según necesite.'],
          caption: 'Pestaña Flujos de trabajo.',
        },
      },
    },
    'admin-printing': {
      title: 'Impresoras y ajustes de impresión',
      intro: 'Defina impresoras en Administración, configure cada trabajo de impresión y asígnelas en Ajustes.',
      sections: {
        printers: {
          title: 'Impresoras',
          intro: 'Los registros de impresora guardan datos de conexión para recibos, cocina e informes.',
          steps: ['Abra la pestaña Impresoras.', 'Agregue impresoras con nombre, tipo y conexión.', 'Vincúlelas a cocinas y Ajustes del dispositivo.'],
          caption: 'Lista maestra de impresoras.',
        },
        'print-settings': {
          title: 'Ajustes de impresión',
          intro: 'Controlan plantillas para cuenta provisional, recibo final, cocina, resumen y delivery.',
          steps: ['Abra Ajustes de impresión.', 'Edite cada tipo (Provisional, Final, Cocina, Resumen, Delivery).', 'Guarde para que los nuevos pedidos usen el diseño actualizado.'],
          caption: 'Pestaña Ajustes de impresión.',
        },
      },
    },
    'admin-payments': {
      sections: {
        extras: {
          title: 'Extras',
          intro: 'Los extras son recargos automáticos ligados a tipos de pago, orden o mesas.',
          steps: ['Abra la pestaña Extras.', 'Cree extras con nombre, importe y reglas.', 'Guarde para que pedidos calificados incluyan el recargo.'],
          caption: 'Pestaña Extras.',
        },
      },
    },
    'admin-users': {
      intro: 'Gestione cuentas, PINs, permisos de rol, turnos y definición de propinas.',
      sections: {
        roles: {
          title: 'Roles',
          intro: 'Los roles agrupan módulos de permiso que controlan pantallas y pestañas.',
          steps: ['Cambie a la subpestaña Roles.', 'Cree roles y abra la lista de módulos.', 'Asigne roles a usuarios para permisos consistentes.'],
          caption: 'Subpestaña Roles.',
        },
        shifts: {
          title: 'Turnos',
          intro: 'Los turnos definen ventanas de trabajo para informes laborales y cierre automático.',
          steps: ['Cambie a la subpestaña Turnos.', 'Agregue turnos con hora de inicio y fin.', 'Asigne turnos a usuarios para contexto de propinas.'],
          caption: 'Subpestaña Turnos.',
        },
        'tips-definition': {
          title: 'Definición de propinas',
          intro: 'Define pesos y reglas del fondo usados al distribuir propinas (véase Guía RR. HH.).',
          steps: ['Cambie a la subpestaña Definición de propinas.', 'Configure cómo se agrupan y ponderan las propinas.', 'Guarde para cálculos de distribución actualizados.'],
          caption: 'Subpestaña Definición de propinas.',
        },
      },
    },
  },
  tr: {
    'admin-overview': {
      intro: 'Yönetim, mekan yapılandırması için yönetici merkezidir. Yemekler, menüler, katlar, kullanıcılar, vergiler, indirimler, mutfaklar ve yazıcıları yönetin.',
      sections: { tabs: { steps: ['Çok sekme varken yatay kaydırın.', 'Sekmeler menü, salon planı, promosyon, mutfak, yazdırma, ödeme ve kullanıcıları kapsar.', 'Her sekme kendi bakım tablosunu açar.', 'Seçili sekme birincil gradyanla vurgulanır.'] } },
    },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Modifier grupları', intro: 'Modifier grupları yemek özelleştirmede ek seçenekleri tanımlar.', steps: ['Modifier grupları sekmesini açın.', 'Modifier, fiyat ve sonraki grup kuralları oluşturun.', 'Grupları yemeklere atayın.'], caption: 'Modifier grupları sekmesi.' } } },
    'admin-promotions': {
      title: 'İndirimler ve kuponlar',
      intro: 'Promosyon fiyatlandırması: indirim kuralları, nedenler, izinler ve kupon kodları.',
      sections: {
        'discount-rules': { title: 'İndirim kuralları', intro: 'Otomatik veya manuel indirimleri tanımlar.', steps: ['İndirimler sekmesini açın.', 'Kurallar alt sekmesini seçin.', 'Kural ekleyin veya düzenleyin.'], caption: 'İndirim kuralları listesi.' },
        'discount-reasons': { title: 'İndirim nedenleri', intro: 'Manuel indirimlerde seçilen nedenler.', steps: ['Nedenler alt sekmesine geçin.', 'Neden oluşturun.', 'Artık kullanılmayanları devre dışı bırakın.'], caption: 'İndirim nedenleri.' },
        'discount-permissions': { title: 'İndirim izinleri', intro: 'Hangi rollerin indirim uygulayabileceğini kontrol eder.', steps: ['İzinler alt sekmesini açın.', 'Rol matrisini inceleyin.', 'Hassas indirimler için ayarlayın.'], caption: 'İndirim izin matrisi.' },
        coupons: { title: 'Kuponlar', steps: ['Kuponlar sekmesini açın.', 'Kod, değer ve geçerlilik oluşturun.', 'Personel ödemede girer.'], caption: 'Kuponlar sekmesi.' },
      },
    },
    'admin-kitchen': {
      title: 'Mutfaklar ve iş akışları',
      intro: 'Ürünleri mutfak istasyonlarına yönlendirin ve hazırlık aşamalarını tanımlayın.',
      sections: {
        kitchens: { title: 'Mutfaklar', intro: 'Mutfaklar yemekleri gruplar ve yazıcılara bağlanır.', steps: ['Mutfaklar sekmesini açın.', 'İstasyon oluşturun.', 'Yemek ve yazıcı atayın.'], caption: 'Mutfaklar tablosu.' },
        workflows: { title: 'İş akışları', intro: 'Mutfak ve sipariş ekranı durum adımları.', steps: ['İş akışları sekmesini açın.', 'Adımları düzenleyin.', 'Sipariş türlerine bağlayın.'], caption: 'İş akışları sekmesi.' },
      },
    },
    'admin-printing': {
      title: 'Yazıcılar ve yazdırma ayarları',
      intro: 'Yazıcı kayıtlarını Yönetimde tanımlayın, iş ayarlarını yapın, Ayarlardan cihaza atayın.',
      sections: {
        printers: { title: 'Yazıcılar', intro: 'Bağlantı bilgilerini saklar.', steps: ['Yazıcılar sekmesini açın.', 'Yazıcı ekleyin.', 'Mutfak ve cihaz Ayarlarına bağlayın.'], caption: 'Yazıcı listesi.' },
        'print-settings': { title: 'Yazdırma ayarları', intro: 'Geçici fiş, final, mutfak ve özet şablonları.', steps: ['Yazdırma ayarları sekmesini açın.', 'Her türü düzenleyin.', 'Kaydedin.'], caption: 'Yazdırma ayarları sekmesi.' },
      },
    },
    'admin-payments': { sections: { extras: { title: 'Ekstralar', intro: 'Otomatik ek ücretler.', steps: ['Ekstralar sekmesini açın.', 'Kural ve tutar tanımlayın.', 'Kaydedin.'], caption: 'Ekstralar sekmesi.' } } },
    'admin-users': {
      intro: 'Personel hesapları, PIN, rol izinleri, vardiyalar ve bahşiş tanımı.',
      sections: {
        roles: { title: 'Roller', intro: 'Ekran ve sekme erişimini kontrol eder.', steps: ['Roller alt sekmesine geçin.', 'Rol oluşturun.', 'Modül listesini ayarlayın.'], caption: 'Roller alt sekmesi.' },
        shifts: { title: 'Vardiyalar', intro: 'Çalışma pencereleri.', steps: ['Vardiyalar alt sekmesine geçin.', 'Başlangıç/bitiş ekleyin.', 'Kullanıcılara atayın.'], caption: 'Vardiyalar alt sekmesi.' },
        'tips-definition': { title: 'Bahşiş tanımı', intro: 'Dağıtım kuralları ve ağırlıklar.', steps: ['Bahşiş tanımı alt sekmesine geçin.', 'Havuz kurallarını yapılandırın.', 'Kaydedin.'], caption: 'Bahşiş tanımı alt sekmesi.' },
      },
    },
  },
  'pt-br': {
    'admin-overview': { intro: 'Gerenciar é o hub de configuração. Mantenha pratos, cardápios, andares, usuários, impostos, descontos, cozinhas e impressoras.', sections: { tabs: { steps: ['Role a barra de abas.', 'Abas cobrem menus, salão, promoções, cozinha, impressão, pagamentos e usuários.', 'Cada aba abre sua tabela.', 'A aba selecionada usa o gradiente principal.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Grupos de modificadores', intro: 'Definem complementos e opções ao personalizar pratos.', steps: ['Abra Grupos de modificadores.', 'Crie grupos com preços e regras.', 'Atribua aos pratos.'], caption: 'Aba Grupos de modificadores.' } } },
    'admin-promotions': { title: 'Descontos e cupons', intro: 'Configure regras de desconto, motivos, permissões e cupons.', sections: { 'discount-rules': { title: 'Regras de desconto', intro: 'Reduções automáticas ou manuais.', steps: ['Abra Descontos.', 'Subaba Regras.', 'Crie ou edite regras.'], caption: 'Lista de regras.' }, 'discount-reasons': { title: 'Motivos de desconto', intro: 'Motivos para descontos manuais.', steps: ['Subaba Motivos.', 'Crie motivos.', 'Desative os obsoletos.'], caption: 'Motivos de desconto.' }, 'discount-permissions': { title: 'Permissões de desconto', intro: 'Controle por função.', steps: ['Subaba Permissões.', 'Revise a matriz.', 'Ajuste conforme necessário.'], caption: 'Matriz de permissões.' }, coupons: { title: 'Cupons', steps: ['Abra Cupons.', 'Crie códigos com validade.', 'Staff usa no pagamento.'], caption: 'Aba Cupons.' } } },
    'admin-kitchen': { title: 'Cozinhas e fluxos', intro: 'Roteie itens e defina etapas de preparo.', sections: { kitchens: { title: 'Cozinhas', intro: 'Agrupam pratos e impressoras.', steps: ['Abra Cozinhas.', 'Crie estações.', 'Atribua pratos e impressoras.'], caption: 'Tabela de cozinhas.' }, workflows: { title: 'Fluxos', intro: 'Passos de status na cozinha.', steps: ['Abra Fluxos.', 'Edite passos.', 'Vincule a tipos de pedido.'], caption: 'Aba Fluxos.' } } },
    'admin-printing': { title: 'Impressoras e configurações de impressão', intro: 'Defina impressoras no Gerenciar e atribua em Configurações.', sections: { printers: { title: 'Impressoras', intro: 'Registros de conexão.', steps: ['Abra Impressoras.', 'Adicione impressoras.', 'Vincule a cozinhas e dispositivo.'], caption: 'Lista de impressoras.' }, 'print-settings': { title: 'Configurações de impressão', intro: 'Modelos de conta, recibo e cozinha.', steps: ['Abra Configurações de impressão.', 'Edite cada tipo.', 'Salve.'], caption: 'Aba configurações de impressão.' } } },
    'admin-payments': { sections: { extras: { title: 'Extras', intro: 'Sobretaxas automáticas.', steps: ['Abra Extras.', 'Crie com valor e regras.', 'Salve.'], caption: 'Aba Extras.' } } },
    'admin-users': { intro: 'Contas, PINs, funções, turnos e definição de gorjetas.', sections: { roles: { title: 'Funções', intro: 'Permissões de acesso.', steps: ['Subaba Funções.', 'Crie funções.', 'Configure módulos.'], caption: 'Subaba Funções.' }, shifts: { title: 'Turnos', intro: 'Janelas de trabalho.', steps: ['Subaba Turnos.', 'Adicione horários.', 'Atribua a usuários.'], caption: 'Subaba Turnos.' }, 'tips-definition': { title: 'Definição de gorjetas', intro: 'Regras do pool de gorjetas.', steps: ['Subaba Definição de gorjetas.', 'Configure pesos.', 'Salve.'], caption: 'Subaba Definição de gorjetas.' } } },
  },
  fr: {
    'admin-overview': { intro: 'Gérer est le hub de configuration : plats, menus, étages, utilisateurs, taxes, remises, cuisines et imprimantes.', sections: { tabs: { steps: ['Faites défiler la barre d\'onglets.', 'Les onglets couvrent menus, salle, promotions, cuisine, impression, paiements et utilisateurs.', 'Chaque onglet ouvre sa table.', 'L\'onglet actif est mis en surbrillance.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Groupes de modificateurs', intro: 'Options et choix imbriqués à la personnalisation.', steps: ['Ouvrez Groupes de modificateurs.', 'Créez groupes et prix.', 'Assignez aux plats.'], caption: 'Onglet Groupes de modificateurs.' } } },
    'admin-promotions': { title: 'Remises et coupons', intro: 'Règles de remise, motifs, permissions et codes coupon.', sections: { 'discount-rules': { title: 'Règles de remise', intro: 'Réductions automatiques ou manuelles.', steps: ['Ouvrez Remises.', 'Sous-onglet Règles.', 'Ajoutez ou modifiez.'], caption: 'Liste des règles.' }, 'discount-reasons': { title: 'Motifs de remise', intro: 'Motifs pour remises manuelles.', steps: ['Sous-onglet Motifs.', 'Créez des motifs.', 'Désactivez les obsolètes.'], caption: 'Motifs de remise.' }, 'discount-permissions': { title: 'Permissions de remise', intro: 'Contrôle par rôle.', steps: ['Sous-onglet Permissions.', 'Revoyez la matrice.', 'Ajustez les droits.'], caption: 'Matrice permissions.' }, coupons: { title: 'Coupons', steps: ['Ouvrez Coupons.', 'Créez codes et validité.', 'Saisie au paiement.'], caption: 'Onglet Coupons.' } } },
    'admin-kitchen': { title: 'Cuisines et workflows', intro: 'Routage vers stations et étapes de préparation.', sections: { kitchens: { title: 'Cuisines', intro: 'Regroupent plats et imprimantes.', steps: ['Ouvrez Cuisines.', 'Créez stations.', 'Assignez plats et imprimantes.'], caption: 'Table cuisines.' }, workflows: { title: 'Workflows', intro: 'Étapes de statut commande.', steps: ['Ouvrez Workflows.', 'Modifiez étapes.', 'Liez aux types de commande.'], caption: 'Onglet Workflows.' } } },
    'admin-printing': { title: 'Imprimantes et paramètres d\'impression', intro: 'Définissez imprimantes dans Gérer, assignez dans Paramètres.', sections: { printers: { title: 'Imprimantes', intro: 'Enregistrements de connexion.', steps: ['Ouvrez Imprimantes.', 'Ajoutez imprimantes.', 'Liez cuisines et appareil.'], caption: 'Liste imprimantes.' }, 'print-settings': { title: 'Paramètres d\'impression', intro: 'Modèles addition, reçu, cuisine.', steps: ['Ouvrez Paramètres d\'impression.', 'Modifiez chaque type.', 'Enregistrez.'], caption: 'Onglet paramètres impression.' } } },
    'admin-payments': { sections: { extras: { title: 'Extras', intro: 'Suppléments automatiques.', steps: ['Ouvrez Extras.', 'Créez montant et règles.', 'Enregistrez.'], caption: 'Onglet Extras.' } } },
    'admin-users': { intro: 'Comptes, PINs, rôles, shifts et définition pourboires.', sections: { roles: { title: 'Rôles', intro: 'Modules de permission.', steps: ['Sous-onglet Rôles.', 'Créez rôles.', 'Configurez modules.'], caption: 'Sous-onglet Rôles.' }, shifts: { title: 'Shifts', intro: 'Plages horaires.', steps: ['Sous-onglet Shifts.', 'Ajoutez horaires.', 'Assignez aux utilisateurs.'], caption: 'Sous-onglet Shifts.' }, 'tips-definition': { title: 'Définition pourboires', intro: 'Règles de pool.', steps: ['Sous-onglet Définition pourboires.', 'Configurez poids.', 'Enregistrez.'], caption: 'Sous-onglet Définition pourboires.' } } },
  },
  nl: {
    'admin-overview': { intro: 'Beheer is het configuratiehub voor menu\'s, vloeren, gebruikers, belastingen, kortingen, keukens en printers.', sections: { tabs: { steps: ['Scroll horizontaal bij veel tabbladen.', 'Tabbladen dekken menu, zaal, promoties, keuken, printen, betalingen en gebruikers.', 'Elk tabblad opent zijn tabel.', 'Geselecteerd tabblad is gemarkeerd.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Modifiergroepen', intro: 'Extra\'s en geneste keuzes bij aanpassen.', steps: ['Open Modifiergroepen.', 'Maak groepen met prijzen.', 'Wijs toe aan gerechten.'], caption: 'Tabblad Modifiergroepen.' } } },
    'admin-promotions': { title: 'Kortingen en coupons', intro: 'Kortingsregels, redenen, rechten en couponcodes.', sections: { 'discount-rules': { title: 'Kortingsregels', intro: 'Automatische of handmatige kortingen.', steps: ['Open Kortingen.', 'Subtabblad Regels.', 'Voeg regels toe.'], caption: 'Kortingsregels.' }, 'discount-reasons': { title: 'Kortingsredenen', intro: 'Redenen bij handmatige korting.', steps: ['Subtabblad Redenen.', 'Maak redenen.', 'Deactiveer oude.'], caption: 'Kortingsredenen.' }, 'discount-permissions': { title: 'Kortingsrechten', intro: 'Controle per rol.', steps: ['Subtabblad Rechten.', 'Bekijk matrix.', 'Pas aan.'], caption: 'Rechtenmatrix.' }, coupons: { title: 'Coupons', steps: ['Open Coupons.', 'Maak codes.', 'Invoer bij betaling.'], caption: 'Tabblad Coupons.' } } },
    'admin-kitchen': { title: 'Keukens en workflows', intro: 'Routeer items en definieer bereidingsstappen.', sections: { kitchens: { title: 'Keukens', intro: 'Groeperen gerechten en printers.', steps: ['Open Keukens.', 'Maak stations.', 'Wijs gerechten toe.'], caption: 'Keukens tabel.' }, workflows: { title: 'Workflows', intro: 'Statusstappen keuken.', steps: ['Open Workflows.', 'Bewerk stappen.', 'Koppel aan ordertypes.'], caption: 'Tabblad Workflows.' } } },
    'admin-printing': { title: 'Printers en printinstellingen', intro: 'Definieer printers in Beheer, wijs toe in Instellingen.', sections: { printers: { title: 'Printers', intro: 'Verbindingsgegevens.', steps: ['Open Printers.', 'Voeg printers toe.', 'Koppel aan keukens.'], caption: 'Printerlijst.' }, 'print-settings': { title: 'Printinstellingen', intro: 'Sjablonen voor bon en keuken.', steps: ['Open Printinstellingen.', 'Bewerk elk type.', 'Sla op.'], caption: 'Tabblad printinstellingen.' } } },
    'admin-payments': { sections: { extras: { title: 'Extras', intro: 'Automatische toeslagen.', steps: ['Open Extras.', 'Maak met bedrag en regels.', 'Sla op.'], caption: 'Tabblad Extras.' } } },
    'admin-users': { intro: 'Accounts, PINs, rollen, diensten en fooidefinitie.', sections: { roles: { title: 'Rollen', intro: 'Toegangsrechten.', steps: ['Subtabblad Rollen.', 'Maak rollen.', 'Stel modules in.'], caption: 'Subtabblad Rollen.' }, shifts: { title: 'Diensten', intro: 'Werkvensters.', steps: ['Subtabblad Diensten.', 'Voeg tijden toe.', 'Wijs toe.'], caption: 'Subtabblad Diensten.' }, 'tips-definition': { title: 'Fooidefinitie', intro: 'Poolregels voor fooien.', steps: ['Subtabblad Fooidefinitie.', 'Configureer gewichten.', 'Sla op.'], caption: 'Subtabblad Fooidefinitie.' } } },
  },
  de: {
    'admin-overview': { intro: 'Verwalten ist das Konfigurationszentrum für Gerichte, Menüs, Etagen, Benutzer, Steuern, Rabatte, Küchen und Drucker.', sections: { tabs: { steps: ['Bei vielen Tabs horizontal scrollen.', 'Tabs decken Menüs, Saal, Aktionen, Küche, Druck, Zahlung und Benutzer ab.', 'Jeder Tab öffnet seine Tabelle.', 'Aktiver Tab ist hervorgehoben.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Modifikatorgruppen', intro: 'Extras und verschachtelte Auswahl.', steps: ['Tab Modifikatorgruppen öffnen.', 'Gruppen mit Preisen anlegen.', 'Gerichten zuweisen.'], caption: 'Tab Modifikatorgruppen.' } } },
    'admin-promotions': { title: 'Rabatte und Gutscheine', intro: 'Rabattregeln, Gründe, Berechtigungen und Gutscheincodes.', sections: { 'discount-rules': { title: 'Rabattregeln', intro: 'Automatische oder manuelle Rabatte.', steps: ['Tab Rabatte öffnen.', 'Untertab Regeln.', 'Regeln pflegen.'], caption: 'Rabattregeln.' }, 'discount-reasons': { title: 'Rabattgründe', intro: 'Gründe für manuelle Rabatte.', steps: ['Untertab Gründe.', 'Gründe anlegen.', 'Alte deaktivieren.'], caption: 'Rabattgründe.' }, 'discount-permissions': { title: 'Rabattberechtigungen', intro: 'Kontrolle pro Rolle.', steps: ['Untertab Berechtigungen.', 'Matrix prüfen.', 'Anpassen.'], caption: 'Berechtigungsmatrix.' }, coupons: { title: 'Gutscheine', steps: ['Tab Gutscheine.', 'Codes mit Gültigkeit anlegen.', 'Eingabe an der Kasse.'], caption: 'Tab Gutscheine.' } } },
    'admin-kitchen': { title: 'Küchen und Workflows', intro: 'Routing zu Stationen und Zubereitungsschritte.', sections: { kitchens: { title: 'Küchen', intro: 'Gruppieren Gerichte und Drucker.', steps: ['Tab Küchen.', 'Stationen anlegen.', 'Gerichte zuweisen.'], caption: 'Küchentabelle.' }, workflows: { title: 'Workflows', intro: 'Statusschritte für Küche.', steps: ['Tab Workflows.', 'Schritte bearbeiten.', 'Mit Bestelltypen verknüpfen.'], caption: 'Tab Workflows.' } } },
    'admin-printing': { title: 'Drucker und Druckeinstellungen', intro: 'Drucker in Verwalten definieren, in Einstellungen zuweisen.', sections: { printers: { title: 'Drucker', intro: 'Verbindungsdaten.', steps: ['Tab Drucker.', 'Drucker hinzufügen.', 'Mit Küchen verknüpfen.'], caption: 'Druckerliste.' }, 'print-settings': { title: 'Druckeinstellungen', intro: 'Vorlagen für Bon und Küche.', steps: ['Tab Druckeinstellungen.', 'Jeden Typ bearbeiten.', 'Speichern.'], caption: 'Tab Druckeinstellungen.' } } },
    'admin-payments': { sections: { extras: { title: 'Extras', intro: 'Automatische Zuschläge.', steps: ['Tab Extras.', 'Betrag und Regeln definieren.', 'Speichern.'], caption: 'Tab Extras.' } } },
    'admin-users': { intro: 'Konten, PINs, Rollen, Schichten und Trinkgelddefinition.', sections: { roles: { title: 'Rollen', intro: 'Berechtigungsmodule.', steps: ['Untertab Rollen.', 'Rollen anlegen.', 'Module konfigurieren.'], caption: 'Untertab Rollen.' }, shifts: { title: 'Schichten', intro: 'Arbeitszeitfenster.', steps: ['Untertab Schichten.', 'Zeiten hinzufügen.', 'Benutzern zuweisen.'], caption: 'Untertab Schichten.' }, 'tips-definition': { title: 'Trinkgelddefinition', intro: 'Poolregeln.', steps: ['Untertab Trinkgelddefinition.', 'Gewichtung einstellen.', 'Speichern.'], caption: 'Untertab Trinkgelddefinition.' } } },
  },
  it: {
    'admin-overview': { intro: 'Gestione è l\'hub per piatti, menu, piani, utenti, tasse, sconti, cucine e stampanti.', sections: { tabs: { steps: ['Scorri orizzontalmente con molte schede.', 'Le schede coprono menu, sala, promozioni, cucina, stampa, pagamenti e utenti.', 'Ogni scheda apre la sua tabella.', 'La scheda attiva è evidenziata.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Gruppi modificatori', intro: 'Extra e scelte annidate nella personalizzazione.', steps: ['Apri Gruppi modificatori.', 'Crea gruppi con prezzi.', 'Assegna ai piatti.'], caption: 'Scheda Gruppi modificatori.' } } },
    'admin-promotions': { title: 'Sconti e coupon', intro: 'Regole sconto, motivi, permessi e codici coupon.', sections: { 'discount-rules': { title: 'Regole sconto', intro: 'Riduzioni automatiche o manuali.', steps: ['Apri Sconti.', 'Sottoscheda Regole.', 'Crea o modifica regole.'], caption: 'Elenco regole.' }, 'discount-reasons': { title: 'Motivi sconto', intro: 'Motivi per sconti manuali.', steps: ['Sottoscheda Motivi.', 'Crea motivi.', 'Disattiva obsoleti.'], caption: 'Motivi sconto.' }, 'discount-permissions': { title: 'Permessi sconto', intro: 'Controllo per ruolo.', steps: ['Sottoscheda Permessi.', 'Rivedi matrice.', 'Regola accessi.'], caption: 'Matrice permessi.' }, coupons: { title: 'Coupon', steps: ['Apri Coupon.', 'Crea codici e validità.', 'Inserimento al pagamento.'], caption: 'Scheda Coupon.' } } },
    'admin-kitchen': { title: 'Cucine e workflow', intro: 'Instrada articoli e definisci fasi di preparazione.', sections: { kitchens: { title: 'Cucine', intro: 'Raggruppano piatti e stampanti.', steps: ['Apri Cucine.', 'Crea stazioni.', 'Assegna piatti e stampanti.'], caption: 'Tabella cucine.' }, workflows: { title: 'Workflow', intro: 'Passi di stato ordine.', steps: ['Apri Workflow.', 'Modifica passi.', 'Collega ai tipi ordine.'], caption: 'Scheda Workflow.' } } },
    'admin-printing': { title: 'Stampanti e impostazioni stampa', intro: 'Definisci stampanti in Gestione, assegna in Impostazioni.', sections: { printers: { title: 'Stampanti', intro: 'Record di connessione.', steps: ['Apri Stampanti.', 'Aggiungi stampanti.', 'Collega a cucine.'], caption: 'Elenco stampanti.' }, 'print-settings': { title: 'Impostazioni stampa', intro: 'Modelli per conto e cucina.', steps: ['Apri Impostazioni stampa.', 'Modifica ogni tipo.', 'Salva.'], caption: 'Scheda impostazioni stampa.' } } },
    'admin-payments': { sections: { extras: { title: 'Extra', intro: 'Supplementi automatici.', steps: ['Apri Extra.', 'Crea importo e regole.', 'Salva.'], caption: 'Scheda Extra.' } } },
    'admin-users': { intro: 'Account, PIN, ruoli, turni e definizione mance.', sections: { roles: { title: 'Ruoli', intro: 'Moduli permesso.', steps: ['Sottoscheda Ruoli.', 'Crea ruoli.', 'Configura moduli.'], caption: 'Sottoscheda Ruoli.' }, shifts: { title: 'Turni', intro: 'Finestre lavoro.', steps: ['Sottoscheda Turni.', 'Aggiungi orari.', 'Assegna agli utenti.'], caption: 'Sottoscheda Turni.' }, 'tips-definition': { title: 'Definizione mance', intro: 'Regole del pool.', steps: ['Sottoscheda Definizione mance.', 'Configura pesi.', 'Salva.'], caption: 'Sottoscheda Definizione mance.' } } },
  },
  ar: {
    'admin-overview': { intro: 'الإدارة هي مركز إعداد المكان: أطباق وقوائم وطوابق ومستخدمين وضرائب وخصومات ومطابخ وطابعات.', sections: { tabs: { steps: ['مرّر شريط التبويب أفقياً.', 'التبويبات تشمل القوائم والصالة والعروض والمطبخ والطباعة والدفع والمستخدمين.', 'كل تبويب يفتح جدول صيانته.', 'التبويب المحدد مميّز.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'مجموعات المعدّلات', intro: 'إضافات وخيارات متداخلة عند تخصيص الطبق.', steps: ['افتح مجموعات المعدّلات.', 'أنشئ مجموعات بالأسعار.', 'عيّن للأطباق.'], caption: 'تبويب مجموعات المعدّلات.' } } },
    'admin-promotions': { title: 'الخصومات والكوبونات', intro: 'قواعد الخصم والأسباب والصلاحيات وأكواد الكوبون.', sections: { 'discount-rules': { title: 'قواعد الخصم', intro: 'تخفيضات تلقائية أو يدوية.', steps: ['افتح الخصومات.', 'تبويب القواعد.', 'أضف أو عدّل القواعد.'], caption: 'قائمة قواعد الخصم.' }, 'discount-reasons': { title: 'أسباب الخصم', intro: 'أسباب الخصم اليدوي.', steps: ['تبويب الأسباب.', 'أنشئ أسباباً.', 'عطّل القديم.'], caption: 'أسباب الخصم.' }, 'discount-permissions': { title: 'صلاحيات الخصم', intro: 'تحكم حسب الدور.', steps: ['تبويب الصلاحيات.', 'راجع المصفوفة.', 'عدّل الصلاحيات.'], caption: 'مصفوفة صلاحيات الخصم.' }, coupons: { title: 'الكوبونات', steps: ['افتح الكوبونات.', 'أنشئ أكواداً.', 'يُدخل عند الدفع.'], caption: 'تبويب الكوبونات.' } } },
    'admin-kitchen': { title: 'المطابخ وسير العمل', intro: 'توجيه الأصناف ومراحل التحضير.', sections: { kitchens: { title: 'المطابخ', intro: 'تجميع الأطباق والطابعات.', steps: ['افتح المطابخ.', 'أنشئ محطات.', 'عيّن الأطباق والطابعات.'], caption: 'جدول المطابخ.' }, workflows: { title: 'سير العمل', intro: 'خطوات حالة الطلب.', steps: ['افتح سير العمل.', 'عدّل الخطوات.', 'اربط بأنواع الطلب.'], caption: 'تبويب سير العمل.' } } },
    'admin-printing': { title: 'الطابعات وإعدادات الطباعة', intro: 'عرّف الطابعات في الإدارة وعيّنها في الإعدادات.', sections: { printers: { title: 'الطابعات', intro: 'سجلات الاتصال.', steps: ['افتح الطابعات.', 'أضف طابعات.', 'اربط بالمطابخ.'], caption: 'قائمة الطابعات.' }, 'print-settings': { title: 'إعدادات الطباعة', intro: 'قوالب الفاتورة والمطبخ.', steps: ['افتح إعدادات الطباعة.', 'عدّل كل نوع.', 'احفظ.'], caption: 'تبويب إعدادات الطباعة.' } } },
    'admin-payments': { sections: { extras: { title: 'الإضافات', intro: 'رسوم تلقائية.', steps: ['افتح الإضافات.', 'أنشئ بالمبلغ والقواعد.', 'احفظ.'], caption: 'تبويب الإضافات.' } } },
    'admin-users': { intro: 'حسابات الموظفين وPINs والأدوار والورديات وتعريف البقشيش.', sections: { roles: { title: 'الأدوار', intro: 'وحدات الصلاحيات.', steps: ['تبويب الأدوار.', 'أنشئ أدواراً.', 'اضبط الوحدات.'], caption: 'تبويب الأدوار.' }, shifts: { title: 'الورديات', intro: 'نوافذ العمل.', steps: ['تبويب الورديات.', 'أضف أوقاتاً.', 'عيّن للمستخدمين.'], caption: 'تبويب الورديات.' }, 'tips-definition': { title: 'تعريف البقشيش', intro: 'قواعد التجميع.', steps: ['تبويب تعريف البقشيش.', 'اضبط الأوزان.', 'احفظ.'], caption: 'تبويب تعريف البقشيش.' } } },
  },
  ru: {
    'admin-overview': { intro: 'Управление — центр настройки: блюда, меню, этажи, пользователи, налоги, скидки, кухни и принтеры.', sections: { tabs: { steps: ['Прокручивайте панель вкладок.', 'Вкладки охватывают меню, зал, акции, кухню, печать, оплату и пользователей.', 'Каждая вкладка открывает таблицу.', 'Активная вкладка выделена.'] } } },
    'admin-menus': { sections: { 'modifier-groups': { title: 'Группы модификаторов', intro: 'Дополнения и вложенный выбор при настройке блюда.', steps: ['Откройте Группы модификаторов.', 'Создайте группы с ценами.', 'Назначьте блюдам.'], caption: 'Вкладка Группы модификаторов.' } } },
    'admin-promotions': { title: 'Скидки и купоны', intro: 'Правила скидок, причины, права и коды купонов.', sections: { 'discount-rules': { title: 'Правила скидок', intro: 'Автоматические или ручные скидки.', steps: ['Откройте Скидки.', 'Подвкладка Правила.', 'Создайте или измените правила.'], caption: 'Список правил.' }, 'discount-reasons': { title: 'Причины скидок', intro: 'Причины для ручных скидок.', steps: ['Подвкладка Причины.', 'Создайте причины.', 'Отключите старые.'], caption: 'Причины скидок.' }, 'discount-permissions': { title: 'Права на скидки', intro: 'Контроль по ролям.', steps: ['Подвкладка Права.', 'Проверьте матрицу.', 'Настройте доступ.'], caption: 'Матрица прав.' }, coupons: { title: 'Купоны', steps: ['Откройте Купоны.', 'Создайте коды.', 'Ввод на оплате.'], caption: 'Вкладка Купоны.' } } },
    'admin-kitchen': { title: 'Кухни и рабочие процессы', intro: 'Маршрутизация блюд и этапы приготовления.', sections: { kitchens: { title: 'Кухни', intro: 'Группируют блюда и принтеры.', steps: ['Откройте Кухни.', 'Создайте станции.', 'Назначьте блюда и принтеры.'], caption: 'Таблица кухонь.' }, workflows: { title: 'Рабочие процессы', intro: 'Шаги статуса заказа.', steps: ['Откройте Процессы.', 'Измените шаги.', 'Свяжите с типами заказов.'], caption: 'Вкладка Процессы.' } } },
    'admin-printing': { title: 'Принтеры и настройки печати', intro: 'Определите принтеры в Управлении, назначьте в Настройках.', sections: { printers: { title: 'Принтеры', intro: 'Записи подключения.', steps: ['Откройте Принтеры.', 'Добавьте принтеры.', 'Свяжите с кухнями.'], caption: 'Список принтеров.' }, 'print-settings': { title: 'Настройки печати', intro: 'Шаблоны чека и кухни.', steps: ['Откройте Настройки печати.', 'Измените каждый тип.', 'Сохраните.'], caption: 'Вкладка настроек печати.' } } },
    'admin-payments': { sections: { extras: { title: 'Дополнения', intro: 'Автоматические надбавки.', steps: ['Откройте Дополнения.', 'Задайте сумму и правила.', 'Сохраните.'], caption: 'Вкладка Дополнения.' } } },
    'admin-users': { intro: 'Учётные записи, PIN, роли, смены и определение чаевых.', sections: { roles: { title: 'Роли', intro: 'Модули прав доступа.', steps: ['Подвкладка Роли.', 'Создайте роли.', 'Настройте модули.'], caption: 'Подвкладка Роли.' }, shifts: { title: 'Смены', intro: 'Рабочие окна.', steps: ['Подвкладка Смены.', 'Добавьте время.', 'Назначьте пользователям.'], caption: 'Подвкладка Смены.' }, 'tips-definition': { title: 'Определение чаевых', intro: 'Правила пула.', steps: ['Подвкладка Определение чаевых.', 'Настройте веса.', 'Сохраните.'], caption: 'Подвкладка Определение чаевых.' } } },
  },
};
