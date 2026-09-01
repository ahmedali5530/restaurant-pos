#!/usr/bin/env node
/**
 * Generate remaining planned-chapter locales (tables, security-auth, settings-advanced).
 * Run: node docs-automation/generate-remaining-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');
const CHAPTER_KEYS = ['tables', 'security-auth', 'settings-advanced'];
const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>>} */
const T = {
  es: {
    tables: {
      title: 'Mesas y comedor',
      intro: 'El servicio en salón empieza en el plano: elija piso, mesa, cubiertos si aplica y luego tome el pedido.',
      sections: {
        floor: { title: 'Plano de piso', steps: ['Abra Menú (modo piso activo en Ajustes → Selección de mesa).', 'El plano muestra mesas del piso activo.', 'Las ocupadas o bloqueadas pueden verse distintas.'], caption: 'Plano con mesas.' },
        switcher: { title: 'Cambiar piso', intro: 'Varias áreas usan botones abajo del plano.', steps: ['Pulse un piso para ver sus mesas.', 'El piso activo se resalta.', 'Cada piso puede tener fondo y layout propios.'], caption: 'Botones de piso.' },
        table: { title: 'Seleccionar mesa', steps: ['Pulse una mesa libre para iniciar o reanudar.', 'Si está bloqueada, puede requerir aprobación.', 'Luego pasa a cubiertos y pedidos.'], caption: 'Baldosa de mesa.' },
        covers: { title: 'Cubiertos (comensales)', intro: 'Cuando se exigen, indique cuántos comensales.', steps: ['Use el teclado numérico.', 'Pulse OK para ir al menú.', 'Los cubiertos pueden aparecer en cuentas y cocina.'], caption: 'Pantalla de comensales.' },
        active: { title: 'Mesa activa en el menú', steps: ['El encabezado muestra la mesa activa.', 'Use controles de mesa o cubiertos si se permiten.', 'Pedidos y cocina quedan ligados a la mesa.'], caption: 'Indicador de mesa activa.' },
        back: { title: 'Volver al plano', steps: ['Pulse el control de piso / atrás en el encabezado.', 'Vuelve al plano para otra mesa.', 'Cuentas abiertas siguen en Órdenes.'], caption: 'Control volver al piso.' },
      },
    },
    'security-auth': {
      title: 'Reautenticación de seguridad',
      intro: 'Acciones protegidas pueden exigir que un gerente se reautentique con PIN, contraseña o QR aunque ya haya sesión abierta.',
      sections: {
        when: { title: 'Cuándo aparece', steps: ['Intenta una acción no autoautorizada o que siempre pide aprobación.', 'Se abre un modal con la descripción.', 'La seguridad de sesión (bloqueo idle) es distinta.'], caption: 'Tarjeta de seguridad de sesión (relacionada).' },
        modal: { title: 'Modal de aprobación', steps: ['Lea la descripción en el título.', 'Elija PIN, contraseña o QR si hay varias.', 'Autentíquese o cancele.'], caption: 'Modal de aprobación.' },
        methods: { title: 'Métodos de autenticación', intro: 'El local puede permitir varios métodos.', steps: ['PIN para el teclado numérico.', 'Contraseña si está habilitada.', 'QR si hay insignia escaneable.'], caption: 'Selector PIN / contraseña / QR.' },
        pin: { title: 'Entrada de PIN', steps: ['Ingrese el PIN de 4 dígitos del gerente.', 'Los puntos se llenan; valida al completar.', 'PIN inválido muestra error.'], caption: 'Teclado PIN de seguridad.' },
      },
    },
    'settings-advanced': {
      title: 'Ajustes avanzados del dispositivo',
      intro: 'Los administradores usan Ajustes para controles del local: ciclo de cierre, cierre automático, seguridad de sesión, salida automática, cargos, menús, inventario e impresoras.',
      sections: {
        overview: { title: 'Ajustes para administradores', steps: ['Inicie sesión con permiso de ajustes.', 'Abra Ajustes con la llave.', 'Céntrese en tarjetas del local, no solo idioma o táctil.'], caption: 'Página de ajustes — tarjetas avanzadas.' },
        'closing-cycle': { title: 'Ciclo de cierre', intro: 'Define la ventana del día de negocio.', steps: ['Active ciclo personalizado si opera de madrugada.', 'Defina inicio y fin.', 'Guarde (puede pedir PIN).'], caption: 'Tarjeta ciclo de cierre.' },
        'auto-check-close': { title: 'Cierre automático de cuentas', steps: ['Active el asentamiento al fin del ciclo.', 'Elija impresión y tipo de pago.', 'Guarde.'], caption: 'Tarjeta cierre automático.' },
        'session-security': { title: 'Seguridad de sesión', steps: ['Active bloqueo o logout por inactividad.', 'Defina minutos y acción.', 'Guarde.'], caption: 'Tarjeta seguridad de sesión.' },
        'auto-clock-out': { title: 'Salida automática', steps: ['Active salida automática.', 'Elija fin de turno, hora fija o ambos.', 'Guarde.'], caption: 'Tarjeta salida automática.' },
        'service-charges': { title: 'Cargos por servicio', steps: ['Defina tipo y valor por defecto.', 'Se aplican en pago cuando hay servicio.', 'Guarde.'], caption: 'Tarjeta cargos.' },
        menus: { title: 'Menús activos', steps: ['Seleccione menús de este terminal.', 'Guarde para el personal.', 'Combine con Administración → Menús.'], caption: 'Tarjeta menús.' },
        inventory: { title: 'Ajustes de inventario', steps: ['Configure preferencias de stock.', 'Guarde.', 'Documentos profundos en Inventario.'], caption: 'Tarjeta inventario.' },
        printers: { title: 'Impresoras', steps: ['Asigne impresoras de este dispositivo.', 'Guarde.', 'Opciones de impresión en tarjetas vecinas.'], caption: 'Tarjeta impresoras.' },
      },
    },
  },
  tr: {
    tables: {
      title: 'Masalar ve salon',
      intro: 'Salon hizmeti kat planıyla başlar: kat, masa, kişi sayısı ve sipariş.',
      sections: {
        floor: { title: 'Kat planı', steps: ['Menü\'yü açın (kat modu açık olmalı).', 'Aktif katın masaları görünür.', 'Dolu veya kilitli masalar farklı görünebilir.'], caption: 'Masa karolarıyla kat planı.' },
        switcher: { title: 'Kat değiştir', intro: 'Birden fazla alan alt düğmelerle seçilir.', steps: ['Kat düğmesine dokunun.', 'Aktif kat vurgulanır.', 'Her katın kendi düzeni olabilir.'], caption: 'Kat düğmeleri.' },
        table: { title: 'Masa seç', steps: ['Boş masaya dokunun.', 'Kilitliyse onay gerekebilir.', 'Sonra kişi ve menüye geçilir.'], caption: 'Masa karosu.' },
        covers: { title: 'Kişi sayısı', intro: 'Gerektiğinde misafir sayısını girin.', steps: ['Sayı padini kullanın.', 'OK ile menüye geçin.', 'Kişiler adisyon ve mutfakta görünebilir.'], caption: 'Kişi ekranı.' },
        active: { title: 'Menüde aktif masa', steps: ['Başlık aktif masayı gösterir.', 'İzin varsa masa/kişi kontrollerini kullanın.', 'Siparişler masaya bağlı kalır.'], caption: 'Aktif masa göstergesi.' },
        back: { title: 'Kata dön', steps: ['Başlıktaki geri/kat kontrolüne dokunun.', 'Başka masa seçmek için plana dönersiniz.', 'Açık hesaplar Siparişler\'de kalır.'], caption: 'Kata dön kontrolü.' },
      },
    },
    'security-auth': {
      title: 'Güvenlik yeniden kimlik doğrulama',
      intro: 'Korumalı işlemler yönetici PIN, şifre veya QR ile yeniden doğrulama isteyebilir.',
      sections: {
        when: { title: 'Ne zaman görünür', steps: ['Otomatik izin verilmeyen bir işlem denersiniz.', 'Açıklamalı modal açılır.', 'Oturum kilidi ayrıdır.'], caption: 'Oturum güvenlik kartı.' },
        modal: { title: 'Onay modalı', steps: ['Başlığı okuyun.', 'PIN, şifre veya QR seçin.', 'Doğrulayın veya iptal edin.'], caption: 'Yönetici onay modalı.' },
        methods: { title: 'Doğrulama yöntemleri', intro: 'Birden fazla yöntem açılabilir.', steps: ['PIN sayısal pad.', 'Şifre etkinse kullanın.', 'QR destekleniyorsa tarayın.'], caption: 'Yöntem seçici.' },
        pin: { title: 'PIN girişi', steps: ['4 haneli yönetici PIN\'ini girin.', 'Dört hane dolunca doğrulanır.', 'Hatalı PIN hata gösterir.'], caption: 'Güvenlik PIN padi.' },
      },
    },
    'settings-advanced': {
      title: 'Gelişmiş cihaz ayarları',
      intro: 'Yöneticiler Ayarlar\'da kapanış döngüsü, otomatik hesap kapatma, oturum güvenliği, otomatik çıkış, servis ücreti, menüler, stok ve yazıcıları yönetir.',
      sections: {
        overview: { title: 'Yönetici ayarları', steps: ['Ayar yetkisiyle giriş yapın.', 'Anahtar ile Ayarlar\'ı açın.', 'Mekân kartlarına odaklanın.'], caption: 'Gelişmiş ayar kartları.' },
        'closing-cycle': { title: 'Kapanış döngüsü', intro: 'İş günü penceresini tanımlar.', steps: ['Gece açık işletmelerde özel döngü açın.', 'Başlangıç ve bitiş ayarlayın.', 'Kaydedin.'], caption: 'Kapanış döngüsü kartı.' },
        'auto-check-close': { title: 'Otomatik hesap kapatma', steps: ['Döngü sonunda otomatik tahsilatı açın.', 'Yazdırma ve ödeme türünü seçin.', 'Kaydedin.'], caption: 'Otomatik kapatma kartı.' },
        'session-security': { title: 'Oturum güvenliği', steps: ['Boşta kilit veya çıkış açın.', 'Dakika ve eylemi ayarlayın.', 'Kaydedin.'], caption: 'Oturum güvenlik kartı.' },
        'auto-clock-out': { title: 'Otomatik çıkış', steps: ['Otomatik çıkışı açın.', 'Vardiya sonu, sabit saat veya ikisi.', 'Kaydedin.'], caption: 'Otomatik çıkış kartı.' },
        'service-charges': { title: 'Servis ücretleri', steps: ['Varsayılan tür ve değeri ayarlayın.', 'Ödemede servis kullanıldığında uygulanır.', 'Kaydedin.'], caption: 'Servis ücreti kartı.' },
        menus: { title: 'Aktif menüler', steps: ['Bu terminalin menülerini seçin.', 'Kaydedin.', 'Yönetim → Menüler ile birlikte kullanın.'], caption: 'Menüler kartı.' },
        inventory: { title: 'Stok ayarları', steps: ['Stok tercihlerini yapılandırın.', 'Kaydedin.', 'Derin belgeler Stok menüsünde.'], caption: 'Stok ayarları kartı.' },
        printers: { title: 'Yazıcılar', steps: ['Bu cihazın yazıcılarını atayın.', 'Kaydedin.', 'Yazdırma seçenekleri komşu kartlarda.'], caption: 'Yazıcılar kartı.' },
      },
    },
  },
  'pt-br': {
    tables: {
      title: 'Mesas e salão',
      intro: 'O atendimento no salão começa no mapa: piso, mesa, coberturas e pedido.',
      sections: {
        floor: { title: 'Mapa do piso', steps: ['Abra Menu (modo piso ativo).', 'O mapa mostra mesas do piso ativo.', 'Ocupadas ou bloqueadas podem parecer diferentes.'], caption: 'Mapa com mesas.' },
        switcher: { title: 'Trocar piso', intro: 'Várias áreas usam botões na base.', steps: ['Toque em um piso.', 'O ativo fica destacado.', 'Cada piso pode ter layout próprio.'], caption: 'Botões de piso.' },
        table: { title: 'Selecionar mesa', steps: ['Toque numa mesa livre.', 'Bloqueada pode pedir aprovação.', 'Segue para coberturas e pedido.'], caption: 'Tile da mesa.' },
        covers: { title: 'Coberturas', intro: 'Quando exigido, informe o número de convidados.', steps: ['Use o teclado numérico.', 'Toque OK.', 'Coberturas podem aparecer em contas e cozinha.'], caption: 'Tela de coberturas.' },
        active: { title: 'Mesa ativa no menu', steps: ['O cabeçalho mostra a mesa ativa.', 'Use controles se permitido.', 'Pedidos ficam ligados à mesa.'], caption: 'Indicador de mesa ativa.' },
        back: { title: 'Voltar ao mapa', steps: ['Toque no controle de voltar/piso.', 'Volta ao mapa.', 'Contas abertas ficam em Pedidos.'], caption: 'Controle voltar.' },
      },
    },
    'security-auth': {
      title: 'Reautenticação de segurança',
      intro: 'Ações protegidas podem exigir PIN, senha ou QR de gerente mesmo com sessão aberta.',
      sections: {
        when: { title: 'Quando aparece', steps: ['Você tenta ação não autoaprovada.', 'Abre modal com descrição.', 'Bloqueio por ociosidade é separado.'], caption: 'Cartão de segurança de sessão.' },
        modal: { title: 'Modal de aprovação', steps: ['Leia o título.', 'Escolha PIN, senha ou QR.', 'Autentique ou cancele.'], caption: 'Modal de aprovação.' },
        methods: { title: 'Métodos', intro: 'O local pode permitir vários métodos.', steps: ['PIN no teclado.', 'Senha se habilitada.', 'QR se suportado.'], caption: 'Seletor de método.' },
        pin: { title: 'Entrada de PIN', steps: ['Digite o PIN de 4 dígitos.', 'Valida ao completar.', 'PIN inválido mostra erro.'], caption: 'Teclado PIN.' },
      },
    },
    'settings-advanced': {
      title: 'Configurações avançadas do dispositivo',
      intro: 'Administradores usam Configurações para ciclo de fechamento, fechamento automático, segurança de sessão, saída automática, taxas, menus, estoque e impressoras.',
      sections: {
        overview: { title: 'Configurações para administradores', steps: ['Entre com permissão.', 'Abra Configurações pela chave.', 'Foque nos cartões do estabelecimento.'], caption: 'Cartões avançados.' },
        'closing-cycle': { title: 'Ciclo de fechamento', intro: 'Define a janela do dia de negócio.', steps: ['Ative ciclo custom se operar de madrugada.', 'Defina início e fim.', 'Salve.'], caption: 'Cartão ciclo de fechamento.' },
        'auto-check-close': { title: 'Fechamento automático de contas', steps: ['Ative liquidação no fim do ciclo.', 'Escolha impressão e tipo de pagamento.', 'Salve.'], caption: 'Cartão fechamento automático.' },
        'session-security': { title: 'Segurança de sessão', steps: ['Ative bloqueio ou logout ocioso.', 'Defina minutos e ação.', 'Salve.'], caption: 'Cartão segurança de sessão.' },
        'auto-clock-out': { title: 'Saída automática', steps: ['Ative saída automática.', 'Escolha fim de turno, horário ou ambos.', 'Salve.'], caption: 'Cartão saída automática.' },
        'service-charges': { title: 'Taxas de serviço', steps: ['Defina tipo e valor padrão.', 'Aplicam-se no pagamento.', 'Salve.'], caption: 'Cartão taxas.' },
        menus: { title: 'Menus ativos', steps: ['Selecione menus deste terminal.', 'Salve.', 'Combine com Gerenciar → Menus.'], caption: 'Cartão menus.' },
        inventory: { title: 'Configurações de estoque', steps: ['Configure preferências de estoque.', 'Salve.', 'Documentos em Estoque.'], caption: 'Cartão estoque.' },
        printers: { title: 'Impressoras', steps: ['Atribua impressoras do dispositivo.', 'Salve.', 'Opções de impressão em cartões vizinhos.'], caption: 'Cartão impressoras.' },
      },
    },
  },
  fr: {
    tables: {
      title: 'Tables et salle',
      intro: 'Le service en salle commence sur le plan : étage, table, couverts, puis commande.',
      sections: {
        floor: { title: 'Plan de salle', steps: ['Ouvrez Menu (mode étage activé).', 'Le plan montre les tables de l\'étage actif.', 'Occupées ou verrouillées peuvent différer.'], caption: 'Plan avec tables.' },
        switcher: { title: 'Changer d\'étage', intro: 'Plusieurs zones via boutons en bas.', steps: ['Appuyez sur un étage.', 'L\'actif est mis en surbrillance.', 'Chaque étage a son layout.'], caption: 'Boutons d\'étage.' },
        table: { title: 'Sélectionner une table', steps: ['Appuyez sur une table libre.', 'Verrouillée peut exiger une approbation.', 'Puis couverts et commande.'], caption: 'Tuile de table.' },
        covers: { title: 'Couverts', intro: 'Saisissez le nombre de convives si requis.', steps: ['Utilisez le pavé.', 'OK pour le menu.', 'Les couverts apparaissent sur tickets.'], caption: 'Écran couverts.' },
        active: { title: 'Table active sur le menu', steps: ['L\'en-tête montre la table.', 'Utilisez les contrôles si autorisé.', 'Commandes liées à la table.'], caption: 'Indicateur table active.' },
        back: { title: 'Retour au plan', steps: ['Appuyez sur retour / étage.', 'Revenez au plan.', 'Les notes ouvertes restent dans Commandes.'], caption: 'Contrôle retour.' },
      },
    },
    'security-auth': {
      title: 'Réauthentification sécurité',
      intro: 'Les actions protégées peuvent exiger PIN, mot de passe ou QR manager.',
      sections: {
        when: { title: 'Quand ça apparaît', steps: ['Action non auto-autorisée.', 'Modal avec description.', 'Verrouillage idle est séparé.'], caption: 'Carte sécurité session.' },
        modal: { title: 'Modal d\'approbation', steps: ['Lisez le titre.', 'Choisissez PIN, MDP ou QR.', 'Authentifiez ou annulez.'], caption: 'Modal d\'approbation.' },
        methods: { title: 'Méthodes', intro: 'Plusieurs méthodes possibles.', steps: ['PIN pavé numérique.', 'Mot de passe si activé.', 'QR si supporté.'], caption: 'Sélecteur de méthode.' },
        pin: { title: 'Saisie PIN', steps: ['Entrez le PIN 4 chiffres.', 'Validation à 4 chiffres.', 'PIN invalide = erreur.'], caption: 'Pavé PIN sécurité.' },
      },
    },
    'settings-advanced': {
      title: 'Paramètres appareil avancés',
      intro: 'Les administrateurs gèrent cycle de clôture, clôture auto, sécurité session, pointage auto, service, menus, inventaire et imprimantes.',
      sections: {
        overview: { title: 'Paramètres administrateur', steps: ['Connexion avec droits.', 'Ouvrez Paramètres (clé).', 'Cartes du site, pas seulement langue.'], caption: 'Cartes avancées.' },
        'closing-cycle': { title: 'Cycle de clôture', intro: 'Fenêtre du jour d\'exploitation.', steps: ['Activez un cycle custom si nuit.', 'Définissez début/fin.', 'Enregistrez.'], caption: 'Carte cycle de clôture.' },
        'auto-check-close': { title: 'Clôture auto des notes', steps: ['Activez le règlement en fin de cycle.', 'Impression et type de paiement.', 'Enregistrez.'], caption: 'Carte clôture auto.' },
        'session-security': { title: 'Sécurité de session', steps: ['Verrou ou déconnexion idle.', 'Minutes et action.', 'Enregistrez.'], caption: 'Carte sécurité session.' },
        'auto-clock-out': { title: 'Pointage sortie auto', steps: ['Activez la sortie auto.', 'Fin de shift, heure fixe ou les deux.', 'Enregistrez.'], caption: 'Carte sortie auto.' },
        'service-charges': { title: 'Frais de service', steps: ['Type et valeur par défaut.', 'Appliqués au paiement.', 'Enregistrez.'], caption: 'Carte frais de service.' },
        menus: { title: 'Menus actifs', steps: ['Sélectionnez les menus du terminal.', 'Enregistrez.', 'Avec Gérer → Menus.'], caption: 'Carte menus.' },
        inventory: { title: 'Paramètres inventaire', steps: ['Préférences stock.', 'Enregistrez.', 'Docs sous Inventaire.'], caption: 'Carte inventaire.' },
        printers: { title: 'Imprimantes', steps: ['Assignez les imprimantes.', 'Enregistrez.', 'Options d\'impression à côté.'], caption: 'Carte imprimantes.' },
      },
    },
  },
  nl: {
    tables: {
      title: 'Tafels en zaal',
      intro: 'Zaalservice begint op de plattegrond: verdieping, tafel, covers, bestelling.',
      sections: {
        floor: { title: 'Plattegrond', steps: ['Open Menu (vloermodus aan).', 'Toont tafels van actieve verdieping.', 'Bezet of vergrendeld kan anders ogen.'], caption: 'Plattegrond met tafels.' },
        switcher: { title: 'Verdieping wisselen', intro: 'Meerdere zones via knoppen onderaan.', steps: ['Tik op een verdieping.', 'Actieve is gemarkeerd.', 'Elke verdieping heeft eigen layout.'], caption: 'Verdiepingsknoppen.' },
        table: { title: 'Tafel kiezen', steps: ['Tik op vrije tafel.', 'Vergrendeld kan goedkeuring vragen.', 'Daarna covers en menu.'], caption: 'Tafeltegel.' },
        covers: { title: 'Covers (gasten)', intro: 'Voer aantal gasten in indien vereist.', steps: ['Gebruik cijferpad.', 'OK naar menu.', 'Covers op rekeningen/keuken.'], caption: 'Coversscherm.' },
        active: { title: 'Actieve tafel op menu', steps: ['Header toont actieve tafel.', 'Gebruik controles indien toegestaan.', 'Orders blijven gekoppeld.'], caption: 'Actieve-tafelindicator.' },
        back: { title: 'Terug naar plattegrond', steps: ['Tik terug/verdieping.', 'Kies andere tafel.', 'Open checks in Orders.'], caption: 'Terug-controle.' },
      },
    },
    'security-auth': {
      title: 'Beveiliging herauthenticatie',
      intro: 'Beschermde acties kunnen manager-PIN, wachtwoord of QR vragen.',
      sections: {
        when: { title: 'Wanneer zichtbaar', steps: ['Actie zonder auto-toestemming.', 'Modal met beschrijving.', 'Idle-vergrendeling is apart.'], caption: 'Sessiebeveiligingskaart.' },
        modal: { title: 'Goedkeuringsmodal', steps: ['Lees titel.', 'Kies PIN, wachtwoord of QR.', 'Auth of annuleer.'], caption: 'Goedkeuringsmodal.' },
        methods: { title: 'Methoden', intro: 'Meerdere methoden mogelijk.', steps: ['PIN-pad.', 'Wachtwoord indien aan.', 'QR indien ondersteund.'], caption: 'Methodeselector.' },
        pin: { title: 'PIN-invoer', steps: ['4-cijferige PIN.', 'Validatie bij vier cijfers.', 'Ongeldig = fout.'], caption: 'Beveiligings-PIN-pad.' },
      },
    },
    'settings-advanced': {
      title: 'Geavanceerde apparaatinstellingen',
      intro: 'Beheerders gebruiken Instellingen voor sluitcyclus, auto-check, sessiebeveiliging, auto-uitklokken, servicekosten, menu\'s, voorraad en printers.',
      sections: {
        overview: { title: 'Instellingen voor beheerders', steps: ['Log in met rechten.', 'Open Instellingen (sleutel).', 'Focus op locatiekaarten.'], caption: 'Geavanceerde kaarten.' },
        'closing-cycle': { title: 'Sluitcyclus', intro: 'Definieert de bedrijfsdag.', steps: ['Custom cyclus bij nachtwerk.', 'Start en eind.', 'Opslaan.'], caption: 'Sluitcycluskaart.' },
        'auto-check-close': { title: 'Auto check sluiten', steps: ['Automatische afrekening aan.', 'Print en betaaltype.', 'Opslaan.'], caption: 'Auto-sluitkaart.' },
        'session-security': { title: 'Sessiebeveiliging', steps: ['Idle-vergrendeling of logout.', 'Minuten en actie.', 'Opslaan.'], caption: 'Sessiebeveiligingskaart.' },
        'auto-clock-out': { title: 'Auto uitklokken', steps: ['Auto uitklokken aan.', 'Shift-einde, tijd of beide.', 'Opslaan.'], caption: 'Auto-uitklokkaart.' },
        'service-charges': { title: 'Servicekosten', steps: ['Standaard type en waarde.', 'Bij betaling.', 'Opslaan.'], caption: 'Servicekostenkaart.' },
        menus: { title: 'Actieve menu\'s', steps: ['Selecteer menu\'s van terminal.', 'Opslaan.', 'Met Beheer → Menu\'s.'], caption: 'Menu\'s-kaart.' },
        inventory: { title: 'Voorraadinstellingen', steps: ['Voorraadvoorkeuren.', 'Opslaan.', 'Docs onder Voorraad.'], caption: 'Voorraadkaart.' },
        printers: { title: 'Printers', steps: ['Wijs printers toe.', 'Opslaan.', 'Printopties ernaast.'], caption: 'Printerskaart.' },
      },
    },
  },
  de: {
    tables: {
      title: 'Tische und Gastraum',
      intro: 'Gastraumservice beginnt am Grundriss: Etage, Tisch, Couverts, Bestellung.',
      sections: {
        floor: { title: 'Grundriss', steps: ['Menü öffnen (Etagenmodus an).', 'Zeigt Tische der aktiven Etage.', 'Belegt/gesperrt kann anders aussehen.'], caption: 'Grundriss mit Tischen.' },
        switcher: { title: 'Etage wechseln', intro: 'Mehrere Bereiche über untere Buttons.', steps: ['Etage tippen.', 'Aktive hervorgehoben.', 'Jede Etage eigenes Layout.'], caption: 'Etagen-Buttons.' },
        table: { title: 'Tisch wählen', steps: ['Freien Tisch tippen.', 'Gesperrt kann Freigabe brauchen.', 'Dann Couverts und Menü.'], caption: 'Tischkachel.' },
        covers: { title: 'Couverts', intro: 'Gastanzahl eingeben wenn nötig.', steps: ['Ziffernblock nutzen.', 'OK zum Menü.', 'Couverts auf Tickets.'], caption: 'Couvert-Screen.' },
        active: { title: 'Aktiver Tisch im Menü', steps: ['Header zeigt Tisch.', 'Kontrollen nutzen wenn erlaubt.', 'Bestellungen bleiben verknüpft.'], caption: 'Aktiver-Tisch-Anzeige.' },
        back: { title: 'Zurück zum Grundriss', steps: ['Zurück/Etage tippen.', 'Anderen Tisch wählen.', 'Offene Checks in Bestellungen.'], caption: 'Zurück-Steuerung.' },
      },
    },
    'security-auth': {
      title: 'Sicherheits-Reauthentifizierung',
      intro: 'Geschützte Aktionen können Manager-PIN, Passwort oder QR verlangen.',
      sections: {
        when: { title: 'Wann sichtbar', steps: ['Aktion ohne Auto-Freigabe.', 'Modal mit Beschreibung.', 'Idle-Sperre ist getrennt.'], caption: 'Session-Sicherheitskarte.' },
        modal: { title: 'Freigabe-Modal', steps: ['Titel lesen.', 'PIN, Passwort oder QR.', 'Auth oder Abbruch.'], caption: 'Freigabe-Modal.' },
        methods: { title: 'Methoden', intro: 'Mehrere Methoden möglich.', steps: ['PIN-Pad.', 'Passwort wenn an.', 'QR wenn unterstützt.'], caption: 'Methodenwahl.' },
        pin: { title: 'PIN-Eingabe', steps: ['4-stellige PIN.', 'Validierung bei vier Ziffern.', 'Ungültig = Fehler.'], caption: 'Sicherheits-PIN-Pad.' },
      },
    },
    'settings-advanced': {
      title: 'Erweiterte Geräteeinstellungen',
      intro: 'Administratoren steuern Abschlusszyklus, Auto-Check, Session-Sicherheit, Auto-Ausstempeln, Service, Menüs, Inventar und Drucker.',
      sections: {
        overview: { title: 'Einstellungen für Admins', steps: ['Mit Rechten anmelden.', 'Einstellungen (Schlüssel) öffnen.', 'Standort-Karten fokussieren.'], caption: 'Erweiterte Karten.' },
        'closing-cycle': { title: 'Abschlusszyklus', intro: 'Geschäftsfenster.', steps: ['Custom-Zyklus bei Nachtbetrieb.', 'Start/Ende setzen.', 'Speichern.'], caption: 'Abschlusszyklus-Karte.' },
        'auto-check-close': { title: 'Auto-Check schließen', steps: ['Auto-Abrechnung am Zyklusende.', 'Druck und Zahlungsart.', 'Speichern.'], caption: 'Auto-Check-Karte.' },
        'session-security': { title: 'Session-Sicherheit', steps: ['Idle-Sperre oder Logout.', 'Minuten und Aktion.', 'Speichern.'], caption: 'Session-Sicherheitskarte.' },
        'auto-clock-out': { title: 'Auto-Ausstempeln', steps: ['Auto-Ausstempeln an.', 'Schichtende, Uhrzeit oder beides.', 'Speichern.'], caption: 'Auto-Ausstempel-Karte.' },
        'service-charges': { title: 'Servicegebühren', steps: ['Standardtyp und Wert.', 'Bei Zahlung.', 'Speichern.'], caption: 'Servicegebühren-Karte.' },
        menus: { title: 'Aktive Menüs', steps: ['Menüs des Terminals wählen.', 'Speichern.', 'Mit Verwalten → Menüs.'], caption: 'Menü-Karte.' },
        inventory: { title: 'Inventareinstellungen', steps: ['Bestandspräferenzen.', 'Speichern.', 'Docs unter Inventar.'], caption: 'Inventar-Karte.' },
        printers: { title: 'Drucker', steps: ['Drucker zuweisen.', 'Speichern.', 'Druckoptionen daneben.'], caption: 'Drucker-Karte.' },
      },
    },
  },
  it: {
    tables: {
      title: 'Tavoli e sala',
      intro: 'Il servizio in sala inizia dalla planimetria: piano, tavolo, coperti, ordine.',
      sections: {
        floor: { title: 'Planimetria', steps: ['Apri Menu (modalità piano attiva).', 'Mostra i tavoli del piano attivo.', 'Occupati o bloccati possono differire.'], caption: 'Planimetria con tavoli.' },
        switcher: { title: 'Cambia piano', intro: 'Più aree con pulsanti in basso.', steps: ['Tocca un piano.', 'L\'attivo è evidenziato.', 'Ogni piano ha il proprio layout.'], caption: 'Pulsanti piano.' },
        table: { title: 'Seleziona tavolo', steps: ['Tocca un tavolo libero.', 'Bloccato può richiedere approvazione.', 'Poi coperti e menu.'], caption: 'Tile tavolo.' },
        covers: { title: 'Coperti', intro: 'Inserisci il numero di ospiti se richiesto.', steps: ['Usa il tastierino.', 'OK per il menu.', 'I coperti compaiono su conti e cucina.'], caption: 'Schermata coperti.' },
        active: { title: 'Tavolo attivo nel menu', steps: ['L\'header mostra il tavolo.', 'Usa i controlli se consentito.', 'Gli ordini restano collegati.'], caption: 'Indicatore tavolo attivo.' },
        back: { title: 'Torna alla planimetria', steps: ['Tocca indietro/piano.', 'Scegli un altro tavolo.', 'I conti aperti restano in Ordini.'], caption: 'Controllo indietro.' },
      },
    },
    'security-auth': {
      title: 'Riautenticazione di sicurezza',
      intro: 'Le azioni protette possono richiedere PIN, password o QR del manager.',
      sections: {
        when: { title: 'Quando appare', steps: ['Azione non auto-consentita.', 'Modal con descrizione.', 'Blocco idle è separato.'], caption: 'Scheda sicurezza sessione.' },
        modal: { title: 'Modal di approvazione', steps: ['Leggi il titolo.', 'Scegli PIN, password o QR.', 'Autentica o annulla.'], caption: 'Modal di approvazione.' },
        methods: { title: 'Metodi', intro: 'Più metodi possibili.', steps: ['PIN sul pad.', 'Password se attiva.', 'QR se supportato.'], caption: 'Selettore metodo.' },
        pin: { title: 'Inserimento PIN', steps: ['PIN a 4 cifre.', 'Validazione a quattro cifre.', 'PIN non valido = errore.'], caption: 'Pad PIN sicurezza.' },
      },
    },
    'settings-advanced': {
      title: 'Impostazioni dispositivo avanzate',
      intro: 'Gli amministratori gestiscono ciclo di chiusura, auto-chiusura, sicurezza sessione, uscita automatica, servizio, menu, inventario e stampanti.',
      sections: {
        overview: { title: 'Impostazioni per amministratori', steps: ['Accedi con diritti.', 'Apri Impostazioni (chiave).', 'Concentrati sulle card della sede.'], caption: 'Card avanzate.' },
        'closing-cycle': { title: 'Ciclo di chiusura', intro: 'Finestra del giorno operativo.', steps: ['Ciclo custom se notturno.', 'Inizio e fine.', 'Salva.'], caption: 'Card ciclo di chiusura.' },
        'auto-check-close': { title: 'Chiusura automatica conti', steps: ['Liquidazione a fine ciclo.', 'Stampa e tipo pagamento.', 'Salva.'], caption: 'Card chiusura automatica.' },
        'session-security': { title: 'Sicurezza sessione', steps: ['Blocco o logout idle.', 'Minuti e azione.', 'Salva.'], caption: 'Card sicurezza sessione.' },
        'auto-clock-out': { title: 'Uscita automatica', steps: ['Attiva uscita automatica.', 'Fine turno, orario o entrambi.', 'Salva.'], caption: 'Card uscita automatica.' },
        'service-charges': { title: 'Costi di servizio', steps: ['Tipo e valore predefiniti.', 'In pagamento.', 'Salva.'], caption: 'Card servizio.' },
        menus: { title: 'Menu attivi', steps: ['Seleziona i menu del terminale.', 'Salva.', 'Con Gestione → Menu.'], caption: 'Card menu.' },
        inventory: { title: 'Impostazioni inventario', steps: ['Preferenze stock.', 'Salva.', 'Doc in Magazzino.'], caption: 'Card inventario.' },
        printers: { title: 'Stampanti', steps: ['Assegna stampanti.', 'Salva.', 'Opzioni stampa accanto.'], caption: 'Card stampanti.' },
      },
    },
  },
  ar: {
    tables: {
      title: 'الطاولات والصالة',
      intro: 'خدمة الصالة تبدأ من المخطط: الطابق والطاولة وعدد الضيوف ثم الطلب.',
      sections: {
        floor: { title: 'مخطط الطابق', steps: ['افتح القائمة (وضع الطابق مفعّل).', 'يعرض طاولات الطابق النشط.', 'المشغولة أو المقفلة قد تبدو مختلفة.'], caption: 'مخطط مع طاولات.' },
        switcher: { title: 'تبديل الطابق', intro: 'مناطق متعددة عبر أزرار أسفل المخطط.', steps: ['اضغط طابقاً.', 'النشط مميّز.', 'لكل طابق تخطيطه.'], caption: 'أزرار الطابق.' },
        table: { title: 'اختيار طاولة', steps: ['اضغط طاولة فارغة.', 'المقفلة قد تتطلب موافقة.', 'ثم الضيوف والقائمة.'], caption: 'بلاطة الطاولة.' },
        covers: { title: 'عدد الضيوف', intro: 'أدخل عدد الضيوف عند الطلب.', steps: ['استخدم لوحة الأرقام.', 'موافق للقائمة.', 'قد يظهر العدد على الحسابات والمطبخ.'], caption: 'شاشة الضيوف.' },
        active: { title: 'الطاولة النشطة في القائمة', steps: ['العنوان يعرض الطاولة النشطة.', 'استخدم عناصر التحكم عند السماح.', 'الطلبات مرتبطة بالطاولة.'], caption: 'مؤشر الطاولة النشطة.' },
        back: { title: 'العودة للمخطط', steps: ['اضغط الرجوع/الطابق.', 'اختر طاولة أخرى.', 'الحسابات المفتوحة في الطلبات.'], caption: 'زر الرجوع.' },
      },
    },
    'security-auth': {
      title: 'إعادة مصادقة الأمان',
      intro: 'الإجراءات المحمية قد تتطلب PIN أو كلمة مرور أو QR للمدير.',
      sections: {
        when: { title: 'متى تظهر', steps: ['تحاول إجراءً غير مسموح تلقائياً.', 'تفتح نافذة بالوصف.', 'قفل الجلسة منفصل.'], caption: 'بطاقة أمان الجلسة.' },
        modal: { title: 'نافذة الموافقة', steps: ['اقرأ العنوان.', 'اختر PIN أو كلمة مرور أو QR.', 'صادِق أو ألغِ.'], caption: 'نافذة موافقة المدير.' },
        methods: { title: 'طرق المصادقة', intro: 'يمكن تفعيل عدة طرق.', steps: ['PIN للوحة الأرقام.', 'كلمة المرور إن فُعّلت.', 'QR إن دُعم.'], caption: 'محدد الطريقة.' },
        pin: { title: 'إدخال PIN', steps: ['أدخل PIN من 4 أرقام.', 'يتحقق عند اكتمال الأرقام.', 'PIN خاطئ يظهر خطأ.'], caption: 'لوحة PIN للأمان.' },
      },
    },
    'settings-advanced': {
      title: 'إعدادات الجهاز المتقدمة',
      intro: 'يدير المسؤولون دورة الإغلاق والإغلاق التلقائي وأمان الجلسة والخروج التلقائي ورسوم الخدمة والقوائم والمخزون والطابعات.',
      sections: {
        overview: { title: 'إعدادات للمسؤولين', steps: ['سجّل الدخول بصلاحية.', 'افتح الإعدادات بالمفتاح.', 'ركّز على بطاقات المكان.'], caption: 'البطاقات المتقدمة.' },
        'closing-cycle': { title: 'دورة الإغلاق', intro: 'تحدد نافذة يوم العمل.', steps: ['فعّل دورة مخصصة للعمل الليلي.', 'اضبط البداية والنهاية.', 'احفظ.'], caption: 'بطاقة دورة الإغلاق.' },
        'auto-check-close': { title: 'إغلاق الحسابات تلقائياً', steps: ['فعّل التسوية في نهاية الدورة.', 'اختر الطباعة ونوع الدفع.', 'احفظ.'], caption: 'بطاقة الإغلاق التلقائي.' },
        'session-security': { title: 'أمان الجلسة', steps: ['فعّل القفل أو تسجيل الخروج عند الخمول.', 'اضبط الدقائق والإجراء.', 'احفظ.'], caption: 'بطاقة أمان الجلسة.' },
        'auto-clock-out': { title: 'الخروج التلقائي', steps: ['فعّل الخروج التلقائي.', 'نهاية الوردية أو وقت محدد أو كلاهما.', 'احفظ.'], caption: 'بطاقة الخروج التلقائي.' },
        'service-charges': { title: 'رسوم الخدمة', steps: ['اضبط النوع والقيمة الافتراضية.', 'تُطبَّق عند الدفع.', 'احفظ.'], caption: 'بطاقة رسوم الخدمة.' },
        menus: { title: 'القوائم النشطة', steps: ['اختر قوائم هذا الجهاز.', 'احفظ.', 'مع الإدارة ← القوائم.'], caption: 'بطاقة القوائم.' },
        inventory: { title: 'إعدادات المخزون', steps: ['اضبط تفضيلات المخزون.', 'احفظ.', 'المستندات تحت المخزون.'], caption: 'بطاقة المخزون.' },
        printers: { title: 'الطابعات', steps: ['عيّن طابعات الجهاز.', 'احفظ.', 'خيارات الطباعة في بطاقات مجاورة.'], caption: 'بطاقة الطابعات.' },
      },
    },
  },
  ru: {
    tables: {
      title: 'Столы и зал',
      intro: 'Обслуживание в зале начинается с плана: этаж, стол, гости, заказ.',
      sections: {
        floor: { title: 'План этажа', steps: ['Откройте Меню (режим этажа включён).', 'Показаны столы активного этажа.', 'Занятые или заблокированные могут отличаться.'], caption: 'План со столами.' },
        switcher: { title: 'Смена этажа', intro: 'Несколько зон — кнопки внизу.', steps: ['Нажмите этаж.', 'Активный выделен.', 'У каждого этажа свой layout.'], caption: 'Кнопки этажей.' },
        table: { title: 'Выбор стола', steps: ['Нажмите свободный стол.', 'Заблокированный может требовать одобрения.', 'Далее гости и меню.'], caption: 'Плитка стола.' },
        covers: { title: 'Гости', intro: 'Укажите число гостей при необходимости.', steps: ['Используйте цифровую панель.', 'OK к меню.', 'Гости на чеках и кухне.'], caption: 'Экран гостей.' },
        active: { title: 'Активный стол в меню', steps: ['Заголовок показывает стол.', 'Используйте элементы управления при разрешении.', 'Заказы привязаны к столу.'], caption: 'Индикатор активного стола.' },
        back: { title: 'Назад к плану', steps: ['Нажмите назад/этаж.', 'Выберите другой стол.', 'Открытые счета в Заказах.'], caption: 'Кнопка назад.' },
      },
    },
    'security-auth': {
      title: 'Повторная аутентификация',
      intro: 'Защищённые действия могут требовать PIN, пароль или QR менеджера.',
      sections: {
        when: { title: 'Когда появляется', steps: ['Действие без авто-разрешения.', 'Модал с описанием.', 'Блокировка простоя — отдельно.'], caption: 'Карточка безопасности сессии.' },
        modal: { title: 'Модал одобрения', steps: ['Прочитайте заголовок.', 'Выберите PIN, пароль или QR.', 'Подтвердите или отмените.'], caption: 'Модал одобрения.' },
        methods: { title: 'Методы', intro: 'Можно несколько методов.', steps: ['PIN на панели.', 'Пароль если включён.', 'QR если поддерживается.'], caption: 'Выбор метода.' },
        pin: { title: 'Ввод PIN', steps: ['4-значный PIN.', 'Проверка при четырёх цифрах.', 'Неверный PIN — ошибка.'], caption: 'PIN-панель безопасности.' },
      },
    },
    'settings-advanced': {
      title: 'Расширенные настройки устройства',
      intro: 'Администраторы управляют циклом закрытия, авто-закрытием, безопасностью сессии, авто-выходом, сервисом, меню, складом и принтерами.',
      sections: {
        overview: { title: 'Настройки для администраторов', steps: ['Войдите с правами.', 'Откройте Настройки (ключ).', 'Фокус на карточках площадки.'], caption: 'Расширенные карточки.' },
        'closing-cycle': { title: 'Цикл закрытия', intro: 'Окно операционного дня.', steps: ['Свой цикл при ночной работе.', 'Начало и конец.', 'Сохраните.'], caption: 'Карточка цикла закрытия.' },
        'auto-check-close': { title: 'Авто-закрытие счетов', steps: ['Включите расчёт в конце цикла.', 'Печать и тип оплаты.', 'Сохраните.'], caption: 'Карточка авто-закрытия.' },
        'session-security': { title: 'Безопасность сессии', steps: ['Блокировка или выход при простое.', 'Минуты и действие.', 'Сохраните.'], caption: 'Карточка безопасности сессии.' },
        'auto-clock-out': { title: 'Авто-выход', steps: ['Включите авто-выход.', 'Конец смены, время или оба.', 'Сохраните.'], caption: 'Карточка авто-выхода.' },
        'service-charges': { title: 'Сервисный сбор', steps: ['Тип и значение по умолчанию.', 'При оплате.', 'Сохраните.'], caption: 'Карточка сервиса.' },
        menus: { title: 'Активные меню', steps: ['Выберите меню терминала.', 'Сохраните.', 'С Управление → Меню.'], caption: 'Карточка меню.' },
        inventory: { title: 'Настройки склада', steps: ['Предпочтения склада.', 'Сохраните.', 'Документы в Склад.'], caption: 'Карточка склада.' },
        printers: { title: 'Принтеры', steps: ['Назначьте принтеры.', 'Сохраните.', 'Опции печати рядом.'], caption: 'Карточка принтеров.' },
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
    const en = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en', `${key}.json`), 'utf8'));
    const out = applyTranslations(en, pack[key]);
    fs.writeFileSync(path.join(LOCALES, lang, `${key}.json`), JSON.stringify(out, null, 2) + '\n');
  }
  console.log('generated', lang);
}
