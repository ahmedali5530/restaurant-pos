#!/usr/bin/env node
/**
 * Generate Accounts + HR guide locale JSON from English masters.
 * Run: node docs-automation/generate-accounts-hr-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(__dirname, '../docs/user-guide/locales');

const CHAPTER_KEYS = [
  'accounts-overview',
  'accounts-expenses',
  'accounts-ledgers',
  'hr-overview',
  'hr-employees',
  'hr-attendance',
  'hr-leave',
  'tip-distribution',
];

const LANGS = ['es', 'tr', 'pt-br', 'fr', 'nl', 'de', 'it', 'ar', 'ru'];

/** @type {Record<string, Record<string, { title: string; intro: string; sections: Record<string, { title: string; intro?: string; steps: string[]; caption: string }> }>>} */
const T = {
  es: {
    'accounts-overview': {
      title: 'Resumen de Cuentas',
      intro: 'Cuentas es el centro financiero: plan contable, diarios, mayores y estados. Ábralo desde la barra lateral con acceso de cuentas.',
      sections: {
        open: { title: 'Abrir Cuentas', steps: ['Inicie sesión con acceso de cuentas.', 'Pulse Cuentas en la barra lateral.', 'Se abre en Plan de cuentas por defecto.'], caption: 'Pantalla Cuentas con pestañas y plan contable.' },
        tabs: { title: 'Navegación por pestañas', intro: 'Las pestañas agrupan configuración, asientos e informes. Cambiar puede requerir PIN de gerente.', steps: ['Desplace la barra horizontalmente.', 'Configuración: Plan de cuentas y Grupos.', 'Informes: Mayor, Balance de comprobación, Balance general y más.'], caption: 'Barra de pestañas de Cuentas.' },
        chart: { title: 'Plan de cuentas', steps: ['Mantenga las cuentas GL usadas por diarios e informes.', 'Agregue o edite cuentas con código, nombre y tipo.', 'La estructura alimenta mayor, balance e estados.'], caption: 'Panel Plan de cuentas.' },
      },
    },
    'accounts-expenses': {
      title: 'Asientos y grupos de cuentas',
      intro: 'Registre transacciones con asientos y organice el plan con grupos. Los gastos de caja del cierre son independientes de estos diarios GL.',
      sections: {
        journal: { title: 'Asientos de diario', steps: ['Abra Asientos de diario.', 'Cree líneas débito/crédito equilibradas.', 'Guarde para contabilizar en el mayor (puede requerir aprobación).'], caption: 'Pestaña Asientos de diario.' },
        groups: { title: 'Grupos de cuentas', intro: 'Los grupos organizan cuentas para estados e informes.', steps: ['Abra Grupos de cuentas.', 'Cree grupos según su estructura de informes.', 'Asigne cuentas desde el plan o formularios de grupo.'], caption: 'Pestaña Grupos de cuentas.' },
      },
    },
    'accounts-ledgers': {
      title: 'Mayores y saldos',
      intro: 'Revise actividad contabilizada y saldos: mayor general, balance de comprobación y balance general.',
      sections: {
        ledger: { title: 'Mayor general', steps: ['Abra Mayor general.', 'Filtre por cuenta y fechas.', 'Use esta vista para detallar asientos de una cuenta.'], caption: 'Pestaña Mayor general.' },
        trial: { title: 'Balance de comprobación', intro: 'Lista totales débito y crédito por cuenta en un periodo.', steps: ['Abra Balance de comprobación.', 'Elija el periodo o fecha.', 'Confirme que débitos igualan créditos.'], caption: 'Pestaña Balance de comprobación.' },
        'balance-sheet': { title: 'Balance general', steps: ['Abra Balance general.', 'Revise activos, pasivos y patrimonio.', 'Otras pestañas (PyG, Flujo de caja) siguen el mismo patrón.'], caption: 'Pestaña Balance general.' },
      },
    },
    'hr-overview': {
      title: 'Resumen de RR. HH.',
      intro: 'RR. HH. cubre personas: empleados, asistencia, permisos, horarios y nómina. Ábralo desde la barra lateral con acceso HR.',
      sections: {
        open: { title: 'Abrir RR. HH.', steps: ['Inicie sesión con acceso HR.', 'Pulse RR. HH. en la barra lateral.', 'Se abre en Panel por defecto.'], caption: 'Pantalla RR. HH. con pestañas y panel.' },
        tabs: { title: 'Navegación por pestañas', intro: 'Las pestañas agrupan configuración y procesos de personal. Cambiar puede requerir PIN.', steps: ['Desplace la barra horizontalmente.', 'Personas: Empleados, Departamentos, Puestos.', 'Tiempo: Asistencia, Horarios, Permisos, Festivos.'], caption: 'Barra de pestañas de RR. HH.' },
        dashboard: { title: 'Panel', steps: ['El Panel resume métricas clave de RR. HH.', 'Úselo como punto de partida.', 'Otras pestañas gestionan datos y transacciones.'], caption: 'Panel de RR. HH.' },
      },
    },
    'hr-employees': {
      title: 'Empleados',
      intro: 'Mantenga empleados y la estructura: departamentos y puestos.',
      sections: {
        employees: { title: 'Lista de empleados', steps: ['Abra Empleados.', 'Agregue o edite empleados con rol y departamento.', 'Los registros alimentan asistencia, permisos y nómina.'], caption: 'Pestaña Empleados.' },
        departments: { title: 'Departamentos', intro: 'Agrupan personal para informes y costos.', steps: ['Abra Departamentos.', 'Cree departamentos según los equipos.', 'Asigne empleados en su formulario.'], caption: 'Pestaña Departamentos.' },
        positions: { title: 'Puestos', steps: ['Abra Puestos.', 'Defina cargos para registros y horarios.', 'Alinee puestos con perfiles de pago si hay nómina.'], caption: 'Pestaña Puestos.' },
      },
    },
    'hr-attendance': {
      title: 'Asistencia',
      intro: 'Controle fichajes y horarios para horas laborales precisas.',
      sections: {
        attendance: { title: 'Registros de asistencia', steps: ['Abra Asistencia.', 'Revise entradas y salidas.', 'Corrija o apruebe excepciones si su rol lo permite.'], caption: 'Pestaña Asistencia.' },
        scheduling: { title: 'Horarios', intro: 'Los horarios planifican quién trabaja cada turno.', steps: ['Abra Horarios.', 'Cree o ajuste turnos próximos.', 'Los horarios publicados guían la plantilla.'], caption: 'Pestaña Horarios.' },
      },
    },
    'hr-leave': {
      title: 'Permisos',
      intro: 'Gestione solicitudes de tiempo libre y festivos.',
      sections: {
        leave: { title: 'Solicitudes de permiso', steps: ['Abra Permisos.', 'Revise pendientes y aprobados.', 'Apruebe o rechace según su rol.'], caption: 'Pestaña Permisos.' },
        holidays: { title: 'Festivos', intro: 'Marcan días no laborables o de pago premium.', steps: ['Abra Festivos.', 'Agregue festivos del local.', 'Alimentan horarios y reglas de pago.'], caption: 'Pestaña Festivos.' },
      },
    },
    'tip-distribution': {
      title: 'Distribución de propinas',
      intro: 'Calcula cómo repartir propinas del turno según pesos y guarda el registro oficial. Los gerentes usan la misma pantalla desde la barra lateral.',
      sections: {
        overview: { title: 'Pantalla de distribución', steps: ['Pulse Distribución de propinas en la barra lateral.', 'Seleccione turno y fecha.', 'Cargar propinas calcula totales de órdenes pagadas.'], caption: 'Pantalla de distribución de propinas.' },
        filters: { title: 'Turno y fecha', steps: ['Elija el turno.', 'Elija la fecha (no futura).', 'Pulse Cargar propinas.'], caption: 'Turno, fecha y cargar.' },
        table: { title: 'Tabla de distribución', steps: ['Total de propinas muestra el monto del turno.', 'Cada fila: usuario, rol, peso y parte.', 'Enviar guarda tras revisar.'], caption: 'Totales y tabla por usuario.' },
      },
    },
  },
  tr: {
    'accounts-overview': {
      title: 'Hesaplar genel bakış',
      intro: 'Hesaplar finansal merkezdir: hesap planı, yevmiye, defterler ve tablolar. Hesap erişimiyle yan menüden açın.',
      sections: {
        open: { title: 'Hesapları aç', steps: ['Hesap erişimiyle giriş yapın.', 'Yan menüde Hesaplar\'a dokunun.', 'Varsayılan olarak Hesap planı açılır.'], caption: 'Hesaplar ekranı.' },
        tabs: { title: 'Sekme gezinmesi', intro: 'Sekmeler kurulum, kayıt ve raporları gruplar.', steps: ['Yatay kaydırın.', 'Kurulum: Hesap planı ve Gruplar.', 'Raporlar: Defter, Mizan, Bilanço.'], caption: 'Hesaplar sekme çubuğu.' },
        chart: { title: 'Hesap planı', steps: ['Yevmiye ve raporlarda kullanılan GL hesaplarını yönetin.', 'Kod, ad ve türle hesap ekleyin.', 'Yapı defter ve tabloları besler.'], caption: 'Hesap planı paneli.' },
      },
    },
    'accounts-expenses': {
      title: 'Yevmiye kayıtları ve hesap grupları',
      intro: 'Yevmiye ile işlem kaydedin; gruplarla planı düzenleyin. Kasa kapanış giderleri bu GL kayıtlarından ayrıdır.',
      sections: {
        journal: { title: 'Yevmiye kayıtları', steps: ['Yevmiye sekmesini açın.', 'Dengeli borç/alacak satırları oluşturun.', 'Deftere kaydetmek için kaydedin.'], caption: 'Yevmiye sekmesi.' },
        groups: { title: 'Hesap grupları', intro: 'Gruplar raporlama için hesapları düzenler.', steps: ['Hesap grupları sekmesini açın.', 'Rapor yapınıza uygun gruplar oluşturun.', 'Hesapları gruplara atayın.'], caption: 'Hesap grupları sekmesi.' },
      },
    },
    'accounts-ledgers': {
      title: 'Defterler ve bakiyeler',
      intro: 'Kayıtlı hareketleri ve dönem bakiyelerini inceleyin.',
      sections: {
        ledger: { title: 'Büyük defter', steps: ['Büyük defter sekmesini açın.', 'Hesap ve tarihe göre filtreleyin.', 'Hesap hareketlerini detaylandırın.'], caption: 'Büyük defter sekmesi.' },
        trial: { title: 'Mizan', intro: 'Dönem için borç/alacak toplamlarını listeler.', steps: ['Mizan sekmesini açın.', 'Dönem veya tarih seçin.', 'Borçların alacaklara eşit olduğunu doğrulayın.'], caption: 'Mizan sekmesi.' },
        'balance-sheet': { title: 'Bilanço', steps: ['Bilanço sekmesini açın.', 'Varlık, borç ve özkaynakları inceleyin.', 'Diğer tablo sekmeleri aynı kalıbı izler.'], caption: 'Bilanço sekmesi.' },
      },
    },
    'hr-overview': {
      title: 'İK genel bakış',
      intro: 'İK personel işlemlerini kapsar: çalışanlar, devam, izin, vardiya ve bordro.',
      sections: {
        open: { title: 'İK\'yı aç', steps: ['İK erişimiyle giriş yapın.', 'Yan menüde İK\'ya dokunun.', 'Varsayılan olarak Gösterge paneli açılır.'], caption: 'İK ekranı.' },
        tabs: { title: 'Sekme gezinmesi', intro: 'Sekmeler kurulum ve günlük süreçleri gruplar.', steps: ['Yatay kaydırın.', 'Kişiler: Çalışanlar, Departmanlar, Pozisyonlar.', 'Zaman: Devam, Vardiya, İzin, Tatiller.'], caption: 'İK sekme çubuğu.' },
        dashboard: { title: 'Gösterge paneli', steps: ['Önemli İK metriklerini özetler.', 'Başlangıç noktası olarak kullanın.', 'Diğer sekmeler veri ve işlemleri yönetir.'], caption: 'İK paneli.' },
      },
    },
    'hr-employees': {
      title: 'Çalışanlar',
      intro: 'Çalışan kayıtları ile departman ve pozisyon yapısını yönetin.',
      sections: {
        employees: { title: 'Çalışan listesi', steps: ['Çalışanlar sekmesini açın.', 'Rol ve departmanla ekleyin veya düzenleyin.', 'Devam, izin ve bordroyu besler.'], caption: 'Çalışanlar sekmesi.' },
        departments: { title: 'Departmanlar', intro: 'Raporlama için ekipleri gruplar.', steps: ['Departmanlar sekmesini açın.', 'Ekiplere uygun departmanlar oluşturun.', 'Çalışan formunda atayın.'], caption: 'Departmanlar sekmesi.' },
        positions: { title: 'Pozisyonlar', steps: ['Pozisyonlar sekmesini açın.', 'İş unvanlarını tanımlayın.', 'Bordro varsa ödeme profilleriyle hizalayın.'], caption: 'Pozisyonlar sekmesi.' },
      },
    },
    'hr-attendance': {
      title: 'Devam',
      intro: 'Giriş-çıkış ve vardiyaları takip edin.',
      sections: {
        attendance: { title: 'Devam kayıtları', steps: ['Devam sekmesini açın.', 'Giriş ve çıkışları inceleyin.', 'İstisnaları düzeltin veya onaylayın.'], caption: 'Devam sekmesi.' },
        scheduling: { title: 'Vardiya planı', intro: 'Kim hangi vardiyada çalışır.', steps: ['Vardiya sekmesini açın.', 'Yakın günler için plan yapın.', 'Yayımlanan planlar kadroyu yönlendirir.'], caption: 'Vardiya sekmesi.' },
      },
    },
    'hr-leave': {
      title: 'İzin',
      intro: 'İzin talepleri ve resmi tatilleri yönetin.',
      sections: {
        leave: { title: 'İzin talepleri', steps: ['İzin sekmesini açın.', 'Bekleyen ve onaylıları inceleyin.', 'Rolünüze göre onaylayın veya reddedin.'], caption: 'İzin sekmesi.' },
        holidays: { title: 'Tatiller', intro: 'Çalışılmayan veya primli günleri işaretler.', steps: ['Tatiller sekmesini açın.', 'Yıllık tatilleri ekleyin.', 'Vardiya ve ödeme kurallarını besler.'], caption: 'Tatiller sekmesi.' },
      },
    },
    'tip-distribution': {
      title: 'Bahşiş dağıtımı',
      intro: 'Vardiya bahşişlerini ağırlıklara göre bölüştürür ve kaydı saklar.',
      sections: {
        overview: { title: 'Dağıtım ekranı', steps: ['Yan menüde Bahşiş dağıtımı\'na dokunun.', 'Vardiya ve tarih seçin.', 'Bahşişleri yükle toplamları hesaplar.'], caption: 'Bahşiş dağıtım ekranı.' },
        filters: { title: 'Vardiya ve tarih', steps: ['Vardiyayı seçin.', 'Tarihi seçin (gelecek olamaz).', 'Bahşişleri yükle\'ye dokunun.'], caption: 'Vardiya, tarih ve yükle.' },
        table: { title: 'Dağıtım tablosu', steps: ['Toplam bahşiş vardiya tutarını gösterir.', 'Her satır: kullanıcı, rol, ağırlık ve pay.', 'Gönder kaydı saklar.'], caption: 'Toplamlar ve kullanıcı tablosu.' },
      },
    },
  },
  'pt-br': {
    'accounts-overview': {
      title: 'Visão geral de Contas',
      intro: 'Contas é o hub financeiro: plano de contas, diários, razão e demonstrações.',
      sections: {
        open: { title: 'Abrir Contas', steps: ['Entre com acesso a contas.', 'Toque em Contas na barra lateral.', 'Abre no Plano de contas.'], caption: 'Tela Contas.' },
        tabs: { title: 'Navegação por abas', intro: 'Abas agrupam setup, lançamentos e relatórios.', steps: ['Role horizontalmente.', 'Setup: Plano e Grupos.', 'Relatórios: Razão, Balancete, Balanço.'], caption: 'Barra de abas Contas.' },
        chart: { title: 'Plano de contas', steps: ['Mantenha contas GL.', 'Adicione ou edite códigos e tipos.', 'A estrutura alimenta razão e demonstrações.'], caption: 'Painel Plano de contas.' },
      },
    },
    'accounts-expenses': {
      title: 'Lançamentos e grupos de contas',
      intro: 'Lance transações com diários e organize o plano com grupos. Despesas de caixa no fechamento são separadas.',
      sections: {
        journal: { title: 'Lançamentos', steps: ['Abra Lançamentos.', 'Crie linhas débito/crédito equilibradas.', 'Salve para postar no razão.'], caption: 'Aba Lançamentos.' },
        groups: { title: 'Grupos de contas', intro: 'Grupos organizam contas para demonstrações.', steps: ['Abra Grupos de contas.', 'Crie grupos alinhados aos relatórios.', 'Atribua contas aos grupos.'], caption: 'Aba Grupos de contas.' },
      },
    },
    'accounts-ledgers': {
      title: 'Razão e saldos',
      intro: 'Revise atividade lançada e saldos do período.',
      sections: {
        ledger: { title: 'Razão geral', steps: ['Abra Razão geral.', 'Filtre por conta e datas.', 'Detalhe lançamentos da conta.'], caption: 'Aba Razão geral.' },
        trial: { title: 'Balancete', intro: 'Lista totais débito e crédito por conta.', steps: ['Abra Balancete.', 'Escolha o período.', 'Confirme débitos = créditos.'], caption: 'Aba Balancete.' },
        'balance-sheet': { title: 'Balanço patrimonial', steps: ['Abra Balanço.', 'Revise ativos, passivos e patrimônio.', 'Outras demonstrações seguem o mesmo padrão.'], caption: 'Aba Balanço.' },
      },
    },
    'hr-overview': {
      title: 'Visão geral de RH',
      intro: 'RH cobre pessoas: funcionários, ponto, férias, escalas e folha.',
      sections: {
        open: { title: 'Abrir RH', steps: ['Entre com acesso RH.', 'Toque em RH na barra lateral.', 'Abre no Painel.'], caption: 'Tela RH.' },
        tabs: { title: 'Navegação por abas', intro: 'Abas agrupam cadastros e processos.', steps: ['Role horizontalmente.', 'Pessoas: Funcionários, Departamentos, Cargos.', 'Tempo: Ponto, Escalas, Férias, Feriados.'], caption: 'Barra de abas RH.' },
        dashboard: { title: 'Painel', steps: ['Resume métricas de RH.', 'Use como ponto de partida.', 'Outras abas gerenciam dados e operações.'], caption: 'Painel RH.' },
      },
    },
    'hr-employees': {
      title: 'Funcionários',
      intro: 'Mantenha funcionários e a estrutura organizacional.',
      sections: {
        employees: { title: 'Lista de funcionários', steps: ['Abra Funcionários.', 'Adicione ou edite com função e departamento.', 'Alimenta ponto, férias e folha.'], caption: 'Aba Funcionários.' },
        departments: { title: 'Departamentos', intro: 'Agrupam equipes para relatórios.', steps: ['Abra Departamentos.', 'Crie departamentos das equipes.', 'Atribua no formulário do funcionário.'], caption: 'Aba Departamentos.' },
        positions: { title: 'Cargos', steps: ['Abra Cargos.', 'Defina títulos para registros e escalas.', 'Alinhe a perfis de pagamento se houver folha.'], caption: 'Aba Cargos.' },
      },
    },
    'hr-attendance': {
      title: 'Ponto',
      intro: 'Acompanhe batidas e escalas para horas corretas.',
      sections: {
        attendance: { title: 'Registros de ponto', steps: ['Abra Ponto.', 'Revise entradas e saídas.', 'Corrija ou aprove exceções.'], caption: 'Aba Ponto.' },
        scheduling: { title: 'Escalas', intro: 'Planejam quem trabalha em cada turno.', steps: ['Abra Escalas.', 'Monte turnos futuros.', 'Escalas publicadas guiam a equipe.'], caption: 'Aba Escalas.' },
      },
    },
    'hr-leave': {
      title: 'Folgas',
      intro: 'Gerencie pedidos de ausência e feriados.',
      sections: {
        leave: { title: 'Pedidos de folga', steps: ['Abra Folgas.', 'Revise pendentes e aprovados.', 'Aprove ou rejeite conforme o papel.'], caption: 'Aba Folgas.' },
        holidays: { title: 'Feriados', intro: 'Marcam dias não úteis ou de pagamento premium.', steps: ['Abra Feriados.', 'Adicione feriados do local.', 'Alimentam escalas e regras de pagamento.'], caption: 'Aba Feriados.' },
      },
    },
    'tip-distribution': {
      title: 'Distribuição de gorjetas',
      intro: 'Calcula como dividir gorjetas do turno e salva o registro oficial.',
      sections: {
        overview: { title: 'Tela de distribuição', steps: ['Toque em Distribuição de gorjetas.', 'Selecione turno e data.', 'Carregar gorjetas calcula totais.'], caption: 'Tela de distribuição.' },
        filters: { title: 'Turno e data', steps: ['Escolha o turno.', 'Escolha a data.', 'Toque em Carregar gorjetas.'], caption: 'Turno, data e carregar.' },
        table: { title: 'Tabela de distribuição', steps: ['Total mostra o valor do turno.', 'Cada linha: usuário, função, peso e parte.', 'Enviar salva após revisar.'], caption: 'Totais e tabela.' },
      },
    },
  },
  fr: {
    'accounts-overview': {
      title: 'Vue d\'ensemble Comptabilité',
      intro: 'Comptabilité est le hub financier : plan comptable, journaux, grands livres et états.',
      sections: {
        open: { title: 'Ouvrir Comptabilité', steps: ['Connectez-vous avec accès comptabilité.', 'Appuyez sur Comptabilité.', 'S\'ouvre sur le Plan comptable.'], caption: 'Écran Comptabilité.' },
        tabs: { title: 'Navigation par onglets', intro: 'Onglets : paramétrage, écritures et rapports.', steps: ['Faites défiler horizontalement.', 'Paramétrage : Plan et Groupes.', 'Rapports : Grand livre, Balance, Bilan.'], caption: 'Barre d\'onglets.' },
        chart: { title: 'Plan comptable', steps: ['Maintenez les comptes GL.', 'Ajoutez ou modifiez codes et types.', 'La structure alimente livres et états.'], caption: 'Panneau Plan comptable.' },
      },
    },
    'accounts-expenses': {
      title: 'Écritures et groupes de comptes',
      intro: 'Enregistrez les transactions via journaux et organisez le plan avec des groupes.',
      sections: {
        journal: { title: 'Écritures de journal', steps: ['Ouvrez Écritures.', 'Créez des lignes débit/crédit équilibrées.', 'Enregistrez pour poster au grand livre.'], caption: 'Onglet Écritures.' },
        groups: { title: 'Groupes de comptes', intro: 'Les groupes organisent les comptes pour les états.', steps: ['Ouvrez Groupes de comptes.', 'Créez des groupes selon les rapports.', 'Assignez les comptes.'], caption: 'Onglet Groupes.' },
      },
    },
    'accounts-ledgers': {
      title: 'Livres et soldes',
      intro: 'Consultez l\'activité postée et les soldes de période.',
      sections: {
        ledger: { title: 'Grand livre', steps: ['Ouvrez Grand livre.', 'Filtrez par compte et dates.', 'Détaillez l\'activité d\'un compte.'], caption: 'Onglet Grand livre.' },
        trial: { title: 'Balance de vérification', intro: 'Liste les totaux débit/crédit par compte.', steps: ['Ouvrez Balance.', 'Choisissez la période.', 'Vérifiez débits = crédits.'], caption: 'Onglet Balance.' },
        'balance-sheet': { title: 'Bilan', steps: ['Ouvrez Bilan.', 'Examinez actifs, passifs et capitaux.', 'Les autres états suivent le même schéma.'], caption: 'Onglet Bilan.' },
      },
    },
    'hr-overview': {
      title: 'Vue d\'ensemble RH',
      intro: 'RH couvre le personnel : employés, présence, congés, plannings et paie.',
      sections: {
        open: { title: 'Ouvrir RH', steps: ['Connectez-vous avec accès RH.', 'Appuyez sur RH.', 'S\'ouvre sur le Tableau de bord.'], caption: 'Écran RH.' },
        tabs: { title: 'Navigation par onglets', intro: 'Onglets de paramétrage et processus RH.', steps: ['Faites défiler horizontalement.', 'Personnes : Employés, Départements, Postes.', 'Temps : Présence, Planning, Congés, Jours fériés.'], caption: 'Barre d\'onglets RH.' },
        dashboard: { title: 'Tableau de bord', steps: ['Résume les indicateurs RH.', 'Point de départ avant les onglets détaillés.', 'Les autres onglets gèrent données et opérations.'], caption: 'Tableau de bord RH.' },
      },
    },
    'hr-employees': {
      title: 'Employés',
      intro: 'Maintenez les employés et la structure organisationnelle.',
      sections: {
        employees: { title: 'Liste des employés', steps: ['Ouvrez Employés.', 'Ajoutez ou modifiez avec rôle et département.', 'Alimente présence, congés et paie.'], caption: 'Onglet Employés.' },
        departments: { title: 'Départements', intro: 'Regroupent les équipes pour les rapports.', steps: ['Ouvrez Départements.', 'Créez des départements.', 'Assignez sur la fiche employé.'], caption: 'Onglet Départements.' },
        positions: { title: 'Postes', steps: ['Ouvrez Postes.', 'Définissez les titres.', 'Alignez avec les profils de paie si activé.'], caption: 'Onglet Postes.' },
      },
    },
    'hr-attendance': {
      title: 'Présence',
      intro: 'Suivez pointages et plannings pour des heures exactes.',
      sections: {
        attendance: { title: 'Registres de présence', steps: ['Ouvrez Présence.', 'Examinez entrées et sorties.', 'Corrigez ou approuvez les exceptions.'], caption: 'Onglet Présence.' },
        scheduling: { title: 'Planning', intro: 'Planifie qui travaille quels shifts.', steps: ['Ouvrez Planning.', 'Construisez les shifts à venir.', 'Les plannings publiés guident l\'équipe.'], caption: 'Onglet Planning.' },
      },
    },
    'hr-leave': {
      title: 'Congés',
      intro: 'Gérez demandes d\'absence et jours fériés.',
      sections: {
        leave: { title: 'Demandes de congé', steps: ['Ouvrez Congés.', 'Examinez en attente et approuvés.', 'Approuvez ou refusez selon le rôle.'], caption: 'Onglet Congés.' },
        holidays: { title: 'Jours fériés', intro: 'Marquent les jours non travaillés ou à prime.', steps: ['Ouvrez Jours fériés.', 'Ajoutez les fériés du site.', 'Alimentent planning et règles de paie.'], caption: 'Onglet Jours fériés.' },
      },
    },
    'tip-distribution': {
      title: 'Répartition des pourboires',
      intro: 'Calcule la répartition des pourboires du shift et enregistre le résultat.',
      sections: {
        overview: { title: 'Écran de répartition', steps: ['Appuyez sur Répartition des pourboires.', 'Sélectionnez shift et date.', 'Charger calcule les totaux.'], caption: 'Écran de répartition.' },
        filters: { title: 'Shift et date', steps: ['Choisissez le shift.', 'Choisissez la date.', 'Appuyez sur Charger.'], caption: 'Shift, date et chargement.' },
        table: { title: 'Tableau de répartition', steps: ['Le total montre le montant du shift.', 'Chaque ligne : utilisateur, rôle, poids et part.', 'Envoyer enregistre après contrôle.'], caption: 'Totaux et tableau.' },
      },
    },
  },
  nl: {
    'accounts-overview': {
      title: 'Boekhouding overzicht',
      intro: 'Boekhouding is het financiële hub: rekeningschema, journaal, grootboek en overzichten.',
      sections: {
        open: { title: 'Boekhouding openen', steps: ['Log in met boekhoudtoegang.', 'Tik op Boekhouding.', 'Opent op Rekeningschema.'], caption: 'Boekhoudscherm.' },
        tabs: { title: 'Tabnavigatie', intro: 'Tabs groeperen setup, boekingen en rapporten.', steps: ['Scroll horizontaal.', 'Setup: Schema en Groepen.', 'Rapporten: Grootboek, Proefbalans, Balans.'], caption: 'Boekhouding tabbalk.' },
        chart: { title: 'Rekeningschema', steps: ['Beheer GL-rekeningen.', 'Voeg codes en typen toe.', 'Structuur voedt boeken en staten.'], caption: 'Rekeningschema-paneel.' },
      },
    },
    'accounts-expenses': {
      title: 'Journaalposten en rekeninggroepen',
      intro: 'Boek transacties via journaal en organiseer het schema met groepen.',
      sections: {
        journal: { title: 'Journaalposten', steps: ['Open Journaalposten.', 'Maak gebalanceerde debet/credit regels.', 'Sla op om naar het grootboek te boeken.'], caption: 'Tabblad Journaalposten.' },
        groups: { title: 'Rekeninggroepen', intro: 'Groepen organiseren rekeningen voor overzichten.', steps: ['Open Rekeninggroepen.', 'Maak groepen voor rapportage.', 'Wijs rekeningen toe.'], caption: 'Tabblad Rekeninggroepen.' },
      },
    },
    'accounts-ledgers': {
      title: 'Boeken en saldi',
      intro: 'Bekijk geboekte activiteit en periodesaldi.',
      sections: {
        ledger: { title: 'Grootboek', steps: ['Open Grootboek.', 'Filter op rekening en datums.', 'Bekijk detail per rekening.'], caption: 'Tabblad Grootboek.' },
        trial: { title: 'Proefbalans', intro: 'Toont debet- en credittotalen per rekening.', steps: ['Open Proefbalans.', 'Kies de periode.', 'Controleer debet = credit.'], caption: 'Tabblad Proefbalans.' },
        'balance-sheet': { title: 'Balans', steps: ['Open Balans.', 'Bekijk activa, passiva en eigen vermogen.', 'Andere staten volgen hetzelfde patroon.'], caption: 'Tabblad Balans.' },
      },
    },
    'hr-overview': {
      title: 'HR overzicht',
      intro: 'HR dekt personeel: medewerkers, aanwezigheid, verlof, roosters en payroll.',
      sections: {
        open: { title: 'HR openen', steps: ['Log in met HR-toegang.', 'Tik op HR.', 'Opent op Dashboard.'], caption: 'HR-scherm.' },
        tabs: { title: 'Tabnavigatie', intro: 'Tabs groeperen setup en processen.', steps: ['Scroll horizontaal.', 'Mensen: Medewerkers, Afdelingen, Functies.', 'Tijd: Aanwezigheid, Rooster, Verlof, Feestdagen.'], caption: 'HR tabbalk.' },
        dashboard: { title: 'Dashboard', steps: ['Vat HR-metrics samen.', 'Startpunt voor detailtabs.', 'Andere tabs beheren data en transacties.'], caption: 'HR-dashboard.' },
      },
    },
    'hr-employees': {
      title: 'Medewerkers',
      intro: 'Beheer medewerkers en organisatiestructuur.',
      sections: {
        employees: { title: 'Medewerkerslijst', steps: ['Open Medewerkers.', 'Voeg toe of bewerk met rol en afdeling.', 'Voedt aanwezigheid, verlof en payroll.'], caption: 'Tabblad Medewerkers.' },
        departments: { title: 'Afdelingen', intro: 'Groeperen teams voor rapportage.', steps: ['Open Afdelingen.', 'Maak afdelingen voor teams.', 'Wijs toe op het medewerkersformulier.'], caption: 'Tabblad Afdelingen.' },
        positions: { title: 'Functies', steps: ['Open Functies.', 'Definieer functietitels.', 'Lijn uit met betaalprofielen indien payroll actief.'], caption: 'Tabblad Functies.' },
      },
    },
    'hr-attendance': {
      title: 'Aanwezigheid',
      intro: 'Volg kloktijden en roosters voor accurate uren.',
      sections: {
        attendance: { title: 'Aanwezigheidsrecords', steps: ['Open Aanwezigheid.', 'Bekijk in- en uitklokken.', 'Corrigeer of keur uitzonderingen goed.'], caption: 'Tabblad Aanwezigheid.' },
        scheduling: { title: 'Rooster', intro: 'Plant wie welke shifts werkt.', steps: ['Open Rooster.', 'Bouw of pas shifts aan.', 'Gepubliceerde roosters sturen de bezetting.'], caption: 'Tabblad Rooster.' },
      },
    },
    'hr-leave': {
      title: 'Verlof',
      intro: 'Beheer verlofaanvragen en feestdagen.',
      sections: {
        leave: { title: 'Verlofaanvragen', steps: ['Open Verlof.', 'Bekijk openstaande en goedgekeurde.', 'Keur goed of af volgens rol.'], caption: 'Tabblad Verlof.' },
        holidays: { title: 'Feestdagen', intro: 'Markeren niet-werkdagen of premium dagen.', steps: ['Open Feestdagen.', 'Voeg locatiefeestdagen toe.', 'Voeden rooster en betaalregels.'], caption: 'Tabblad Feestdagen.' },
      },
    },
    'tip-distribution': {
      title: 'Fooienverdeling',
      intro: 'Berekent hoe fooien per shift worden verdeeld en slaat het record op.',
      sections: {
        overview: { title: 'Verdelingsscherm', steps: ['Tik op Fooienverdeling.', 'Selecteer shift en datum.', 'Fooien laden berekent totalen.'], caption: 'Fooienverdelingsscherm.' },
        filters: { title: 'Shift en datum', steps: ['Kies de shift.', 'Kies de datum.', 'Tik op Fooien laden.'], caption: 'Shift, datum en laden.' },
        table: { title: 'Verdelingstabel', steps: ['Totaal toont het shiftbedrag.', 'Elke rij: gebruiker, rol, gewicht en aandeel.', 'Indienen slaat op na controle.'], caption: 'Totalen en tabel.' },
      },
    },
  },
  de: {
    'accounts-overview': {
      title: 'Buchhaltung Übersicht',
      intro: 'Buchhaltung ist das Finanz-Hub: Kontenplan, Journale, Bücher und Abschlüsse.',
      sections: {
        open: { title: 'Buchhaltung öffnen', steps: ['Mit Buchhaltungszugriff anmelden.', 'Buchhaltung tippen.', 'Öffnet den Kontenplan.'], caption: 'Buchhaltungsbildschirm.' },
        tabs: { title: 'Tab-Navigation', intro: 'Tabs gruppieren Setup, Buchungen und Berichte.', steps: ['Horizontal scrollen.', 'Setup: Kontenplan und Gruppen.', 'Berichte: Hauptbuch, Saldenliste, Bilanz.'], caption: 'Buchhaltung-Tableiste.' },
        chart: { title: 'Kontenplan', steps: ['GL-Konten pflegen.', 'Konten mit Code und Typ anlegen.', 'Struktur speist Bücher und Abschlüsse.'], caption: 'Kontenplan-Panel.' },
      },
    },
    'accounts-expenses': {
      title: 'Journalbuchungen und Kontengruppen',
      intro: 'Buchen Sie Transaktionen per Journal und organisieren Sie den Plan mit Gruppen.',
      sections: {
        journal: { title: 'Journalbuchungen', steps: ['Tab Journal öffnen.', 'Ausgeglichene Soll/Haben-Zeilen erstellen.', 'Speichern zum Buchen ins Hauptbuch.'], caption: 'Tab Journal.' },
        groups: { title: 'Kontengruppen', intro: 'Gruppen organisieren Konten für Abschlüsse.', steps: ['Tab Kontengruppen öffnen.', 'Gruppen für die Berichtsstruktur anlegen.', 'Konten zuweisen.'], caption: 'Tab Kontengruppen.' },
      },
    },
    'accounts-ledgers': {
      title: 'Bücher und Salden',
      intro: 'Gebuchte Aktivität und Periodensalden prüfen.',
      sections: {
        ledger: { title: 'Hauptbuch', steps: ['Tab Hauptbuch öffnen.', 'Nach Konto und Datum filtern.', 'Buchungen eines Kontos einsehen.'], caption: 'Tab Hauptbuch.' },
        trial: { title: 'Saldenliste', intro: 'Soll- und Habensummen je Konto.', steps: ['Tab Saldenliste öffnen.', 'Periode wählen.', 'Soll = Haben prüfen.'], caption: 'Tab Saldenliste.' },
        'balance-sheet': { title: 'Bilanz', steps: ['Tab Bilanz öffnen.', 'Aktiva, Passiva und Eigenkapital prüfen.', 'Andere Abschlüsse folgen demselben Muster.'], caption: 'Tab Bilanz.' },
      },
    },
    'hr-overview': {
      title: 'HR Übersicht',
      intro: 'HR deckt Personal ab: Mitarbeiter, Anwesenheit, Urlaub, Dienstpläne und Lohn.',
      sections: {
        open: { title: 'HR öffnen', steps: ['Mit HR-Zugriff anmelden.', 'HR tippen.', 'Öffnet das Dashboard.'], caption: 'HR-Bildschirm.' },
        tabs: { title: 'Tab-Navigation', intro: 'Tabs gruppieren Setup und Prozesse.', steps: ['Horizontal scrollen.', 'Personen: Mitarbeiter, Abteilungen, Positionen.', 'Zeit: Anwesenheit, Dienstplan, Urlaub, Feiertage.'], caption: 'HR-Tableiste.' },
        dashboard: { title: 'Dashboard', steps: ['Fasst HR-Kennzahlen zusammen.', 'Startpunkt vor Detailtabs.', 'Andere Tabs verwalten Daten und Vorgänge.'], caption: 'HR-Dashboard.' },
      },
    },
    'hr-employees': {
      title: 'Mitarbeiter',
      intro: 'Mitarbeiter und Organisationsstruktur pflegen.',
      sections: {
        employees: { title: 'Mitarbeiterliste', steps: ['Tab Mitarbeiter öffnen.', 'Mit Rolle und Abteilung anlegen oder bearbeiten.', 'Speist Anwesenheit, Urlaub und Lohn.'], caption: 'Tab Mitarbeiter.' },
        departments: { title: 'Abteilungen', intro: 'Gruppieren Teams für Berichte.', steps: ['Tab Abteilungen öffnen.', 'Abteilungen anlegen.', 'Im Mitarbeiterformular zuweisen.'], caption: 'Tab Abteilungen.' },
        positions: { title: 'Positionen', steps: ['Tab Positionen öffnen.', 'Jobtitel definieren.', 'Mit Pay-Profilen abstimmen wenn Lohn aktiv.'], caption: 'Tab Positionen.' },
      },
    },
    'hr-attendance': {
      title: 'Anwesenheit',
      intro: 'Stempelzeiten und Dienstpläne für genaue Stunden.',
      sections: {
        attendance: { title: 'Anwesenheitsdaten', steps: ['Tab Anwesenheit öffnen.', 'Ein- und Ausstempelungen prüfen.', 'Ausnahmen korrigieren oder freigeben.'], caption: 'Tab Anwesenheit.' },
        scheduling: { title: 'Dienstplan', intro: 'Plant wer welche Schichten arbeitet.', steps: ['Tab Dienstplan öffnen.', 'Kommende Schichten bauen.', 'Veröffentlichte Pläne steuern die Besetzung.'], caption: 'Tab Dienstplan.' },
      },
    },
    'hr-leave': {
      title: 'Urlaub',
      intro: 'Abwesenheitsanträge und Feiertage verwalten.',
      sections: {
        leave: { title: 'Urlaubsanträge', steps: ['Tab Urlaub öffnen.', 'Offene und genehmigte prüfen.', 'Je nach Rolle genehmigen oder ablehnen.'], caption: 'Tab Urlaub.' },
        holidays: { title: 'Feiertage', intro: 'Markieren arbeitsfreie oder Premium-Tage.', steps: ['Tab Feiertage öffnen.', 'Standortfeiertage hinzufügen.', 'Speisen Dienstplan und Lohnregeln.'], caption: 'Tab Feiertage.' },
      },
    },
    'tip-distribution': {
      title: 'Trinkgeldverteilung',
      intro: 'Berechnet die Schichtverteilung und speichert den Datensatz.',
      sections: {
        overview: { title: 'Verteilungsbildschirm', steps: ['Trinkgeldverteilung tippen.', 'Schicht und Datum wählen.', 'Trinkgeld laden berechnet Totale.'], caption: 'Verteilungsbildschirm.' },
        filters: { title: 'Schicht und Datum', steps: ['Schicht wählen.', 'Datum wählen.', 'Trinkgeld laden tippen.'], caption: 'Schicht, Datum und Laden.' },
        table: { title: 'Verteilungstabelle', steps: ['Gesamt zeigt den Schichtbetrag.', 'Jede Zeile: Nutzer, Rolle, Gewicht und Anteil.', 'Senden speichert nach Prüfung.'], caption: 'Totale und Tabelle.' },
      },
    },
  },
  it: {
    'accounts-overview': {
      title: 'Panoramica Contabilità',
      intro: 'Contabilità è l\'hub finanziario: piano dei conti, giornali, mastri e bilanci.',
      sections: {
        open: { title: 'Apri Contabilità', steps: ['Accedi con accesso contabilità.', 'Tocca Contabilità.', 'Si apre sul Piano dei conti.'], caption: 'Schermata Contabilità.' },
        tabs: { title: 'Navigazione schede', intro: 'Schede di setup, registrazioni e report.', steps: ['Scorri orizzontalmente.', 'Setup: Piano e Gruppi.', 'Report: Mastro, Bilancio di verifica, Stato patrimoniale.'], caption: 'Barra schede Contabilità.' },
        chart: { title: 'Piano dei conti', steps: ['Mantieni i conti GL.', 'Aggiungi o modifica codici e tipi.', 'La struttura alimenta mastri e bilanci.'], caption: 'Pannello Piano dei conti.' },
      },
    },
    'accounts-expenses': {
      title: 'Registrazioni e gruppi conti',
      intro: 'Registra transazioni con giornali e organizza il piano con gruppi.',
      sections: {
        journal: { title: 'Registrazioni di giornale', steps: ['Apri Registrazioni.', 'Crea righe dare/avere bilanciate.', 'Salva per registrare nel mastro.'], caption: 'Scheda Registrazioni.' },
        groups: { title: 'Gruppi conti', intro: 'I gruppi organizzano i conti per i bilanci.', steps: ['Apri Gruppi conti.', 'Crea gruppi per i report.', 'Assegna i conti.'], caption: 'Scheda Gruppi conti.' },
      },
    },
    'accounts-ledgers': {
      title: 'Mastri e saldi',
      intro: 'Rivedi attività registrata e saldi di periodo.',
      sections: {
        ledger: { title: 'Mastro generale', steps: ['Apri Mastro generale.', 'Filtra per conto e date.', 'Dettaglia l\'attività del conto.'], caption: 'Scheda Mastro.' },
        trial: { title: 'Bilancio di verifica', intro: 'Elenca totali dare/avere per conto.', steps: ['Apri Bilancio di verifica.', 'Scegli il periodo.', 'Verifica dare = avere.'], caption: 'Scheda Bilancio di verifica.' },
        'balance-sheet': { title: 'Stato patrimoniale', steps: ['Apri Stato patrimoniale.', 'Rivedi attività, passività e patrimonio.', 'Altri bilanci seguono lo stesso schema.'], caption: 'Scheda Stato patrimoniale.' },
      },
    },
    'hr-overview': {
      title: 'Panoramica HR',
      intro: 'HR copre le persone: dipendenti, presenza, ferie, turni e payroll.',
      sections: {
        open: { title: 'Apri HR', steps: ['Accedi con accesso HR.', 'Tocca HR.', 'Si apre sul Dashboard.'], caption: 'Schermata HR.' },
        tabs: { title: 'Navigazione schede', intro: 'Schede di setup e processi HR.', steps: ['Scorri orizzontalmente.', 'Persone: Dipendenti, Reparti, Posizioni.', 'Tempo: Presenza, Turni, Ferie, Festività.'], caption: 'Barra schede HR.' },
        dashboard: { title: 'Dashboard', steps: ['Riassume metriche HR.', 'Punto di partenza.', 'Altre schede gestiscono dati e operazioni.'], caption: 'Dashboard HR.' },
      },
    },
    'hr-employees': {
      title: 'Dipendenti',
      intro: 'Mantieni dipendenti e struttura organizzativa.',
      sections: {
        employees: { title: 'Elenco dipendenti', steps: ['Apri Dipendenti.', 'Aggiungi o modifica con ruolo e reparto.', 'Alimenta presenza, ferie e payroll.'], caption: 'Scheda Dipendenti.' },
        departments: { title: 'Reparti', intro: 'Raggruppano i team per i report.', steps: ['Apri Reparti.', 'Crea reparti.', 'Assegna nel form dipendente.'], caption: 'Scheda Reparti.' },
        positions: { title: 'Posizioni', steps: ['Apri Posizioni.', 'Definisci titoli di lavoro.', 'Allinea ai profili retributivi se attivo.'], caption: 'Scheda Posizioni.' },
      },
    },
    'hr-attendance': {
      title: 'Presenza',
      intro: 'Traccia timbrature e turni per ore accurate.',
      sections: {
        attendance: { title: 'Registri presenza', steps: ['Apri Presenza.', 'Rivedi entrate e uscite.', 'Correggi o approva eccezioni.'], caption: 'Scheda Presenza.' },
        scheduling: { title: 'Turni', intro: 'Pianifica chi lavora quali turni.', steps: ['Apri Turni.', 'Costruisci turni futuri.', 'I turni pubblicati guidano lo staff.'], caption: 'Scheda Turni.' },
      },
    },
    'hr-leave': {
      title: 'Ferie',
      intro: 'Gestisci richieste di assenza e festività.',
      sections: {
        leave: { title: 'Richieste ferie', steps: ['Apri Ferie.', 'Rivedi in attesa e approvate.', 'Approva o rifiuta secondo il ruolo.'], caption: 'Scheda Ferie.' },
        holidays: { title: 'Festività', intro: 'Segnano giorni non lavorativi o premium.', steps: ['Apri Festività.', 'Aggiungi festività della sede.', 'Alimentano turni e regole paga.'], caption: 'Scheda Festività.' },
      },
    },
    'tip-distribution': {
      title: 'Distribuzione mance',
      intro: 'Calcola come dividere le mance del turno e salva il record.',
      sections: {
        overview: { title: 'Schermata distribuzione', steps: ['Tocca Distribuzione mance.', 'Seleziona turno e data.', 'Carica mance calcola i totali.'], caption: 'Schermata distribuzione.' },
        filters: { title: 'Turno e data', steps: ['Scegli il turno.', 'Scegli la data.', 'Tocca Carica mance.'], caption: 'Turno, data e carica.' },
        table: { title: 'Tabella distribuzione', steps: ['Il totale mostra l\'importo del turno.', 'Ogni riga: utente, ruolo, peso e quota.', 'Invia salva dopo il controllo.'], caption: 'Totali e tabella.' },
      },
    },
  },
  ar: {
    'accounts-overview': {
      title: 'نظرة عامة على الحسابات',
      intro: 'الحسابات هي المركز المالي: دليل الحسابات واليوميات والدفاتر والقوائم.',
      sections: {
        open: { title: 'فتح الحسابات', steps: ['سجّل الدخول بصلاحية الحسابات.', 'اضغط الحسابات في الشريط الجانبي.', 'تفتح على دليل الحسابات افتراضياً.'], caption: 'شاشة الحسابات.' },
        tabs: { title: 'التنقل بين التبويبات', intro: 'التبويبات تجمع الإعداد والترحيل والتقارير.', steps: ['مرّر أفقياً.', 'الإعداد: الدليل والمجموعات.', 'التقارير: الأستاذ وميزان المراجعة والميزانية.'], caption: 'شريط تبويبات الحسابات.' },
        chart: { title: 'دليل الحسابات', steps: ['صيانة حسابات الأستاذ.', 'أضف أو عدّل الرموز والأنواع.', 'البنية تغذي الدفاتر والقوائم.'], caption: 'لوحة دليل الحسابات.' },
      },
    },
    'accounts-expenses': {
      title: 'قيود اليومية ومجموعات الحسابات',
      intro: 'سجّل المعاملات بقيود اليومية ونظّم الدليل بالمجموعات. مصروفات نقدية الإغلاق منفصلة.',
      sections: {
        journal: { title: 'قيود اليومية', steps: ['افتح قيود اليومية.', 'أنشئ أسطر مدين/دائن متوازنة.', 'احفظ للترحيل إلى الأستاذ.'], caption: 'تبويب قيود اليومية.' },
        groups: { title: 'مجموعات الحسابات', intro: 'المجموعات تنظّم الحسابات للقوائم.', steps: ['افتح مجموعات الحسابات.', 'أنشئ مجموعات وفق التقارير.', 'عيّن الحسابات للمجموعات.'], caption: 'تبويب مجموعات الحسابات.' },
      },
    },
    'accounts-ledgers': {
      title: 'الدفاتر والأرصدة',
      intro: 'راجع النشاط المرحّل وأرصدة الفترة.',
      sections: {
        ledger: { title: 'الأستاذ العام', steps: ['افتح الأستاذ العام.', 'صفِّ حسب الحساب والتواريخ.', 'اعرض تفصيل حركة الحساب.'], caption: 'تبويب الأستاذ العام.' },
        trial: { title: 'ميزان المراجعة', intro: 'يعرض إجماليات المدين والدائن لكل حساب.', steps: ['افتح ميزان المراجعة.', 'اختر الفترة.', 'تأكد أن المدين يساوي الدائن.'], caption: 'تبويب ميزان المراجعة.' },
        'balance-sheet': { title: 'الميزانية العمومية', steps: ['افتح الميزانية.', 'راجع الأصول والخصوم وحقوق الملكية.', 'قوائم أخرى تتبع نفس النمط.'], caption: 'تبويب الميزانية.' },
      },
    },
    'hr-overview': {
      title: 'نظرة عامة على الموارد البشرية',
      intro: 'الموارد البشرية تغطي الموظفين والحضور والإجازات والجداول والرواتب.',
      sections: {
        open: { title: 'فتح الموارد البشرية', steps: ['سجّل الدخول بصلاحية HR.', 'اضغط الموارد البشرية.', 'تفتح على لوحة المعلومات.'], caption: 'شاشة الموارد البشرية.' },
        tabs: { title: 'التنقل بين التبويبات', intro: 'التبويبات تجمع الإعداد والعمليات.', steps: ['مرّر أفقياً.', 'الأشخاص: الموظفون والأقسام والمناصب.', 'الوقت: الحضور والجداول والإجازات والعطل.'], caption: 'شريط تبويبات HR.' },
        dashboard: { title: 'لوحة المعلومات', steps: ['تلخّص مؤشرات HR.', 'نقطة البداية قبل التبويبات التفصيلية.', 'تبويبات أخرى تدير البيانات والعمليات.'], caption: 'لوحة HR.' },
      },
    },
    'hr-employees': {
      title: 'الموظفون',
      intro: 'صيانة سجلات الموظفين والهيكل التنظيمي.',
      sections: {
        employees: { title: 'قائمة الموظفين', steps: ['افتح الموظفين.', 'أضف أو عدّل بالدور والقسم.', 'تغذي الحضور والإجازات والرواتب.'], caption: 'تبويب الموظفين.' },
        departments: { title: 'الأقسام', intro: 'تجمع الفرق للتقارير.', steps: ['افتح الأقسام.', 'أنشئ أقسام الفرق.', 'عيّن في نموذج الموظف.'], caption: 'تبويب الأقسام.' },
        positions: { title: 'المناصب', steps: ['افتح المناصب.', 'عرّف المسميات الوظيفية.', 'واءم مع ملفات الأجر إن وُجدت الرواتب.'], caption: 'تبويب المناصب.' },
      },
    },
    'hr-attendance': {
      title: 'الحضور',
      intro: 'تتبع أوقات البصمة والجداول لساعات دقيقة.',
      sections: {
        attendance: { title: 'سجلات الحضور', steps: ['افتح الحضور.', 'راجع الدخول والخروج.', 'صحّح أو وافق على الاستثناءات.'], caption: 'تبويب الحضور.' },
        scheduling: { title: 'الجداول', intro: 'تخطط من يعمل أي وردية.', steps: ['افتح الجداول.', 'ابنِ أو عدّل الورديات القادمة.', 'الجداول المنشورة توجّه الطاقم.'], caption: 'تبويب الجداول.' },
      },
    },
    'hr-leave': {
      title: 'الإجازات',
      intro: 'إدارة طلبات الإجازة والعطل الرسمية.',
      sections: {
        leave: { title: 'طلبات الإجازة', steps: ['افتح الإجازات.', 'راجع المعلّق والمعتمد.', 'وافق أو ارفض حسب الدور.'], caption: 'تبويب الإجازات.' },
        holidays: { title: 'العطل', intro: 'تحدد أيام عدم العمل أو الأجر الإضافي.', steps: ['افتح العطل.', 'أضف عطل المكان.', 'تغذي الجداول وقواعد الأجر.'], caption: 'تبويب العطل.' },
      },
    },
    'tip-distribution': {
      title: 'توزيع الإكراميات',
      intro: 'يحسب تقسيم إكراميات الوردية ويحفظ السجل الرسمي.',
      sections: {
        overview: { title: 'شاشة التوزيع', steps: ['اضغط توزيع الإكراميات.', 'اختر الوردية والتاريخ.', 'تحميل الإكراميات يحسب الإجماليات.'], caption: 'شاشة توزيع الإكراميات.' },
        filters: { title: 'الوردية والتاريخ', steps: ['اختر الوردية.', 'اختر التاريخ.', 'اضغط تحميل الإكراميات.'], caption: 'الوردية والتاريخ والتحميل.' },
        table: { title: 'جدول التوزيع', steps: ['الإجمالي يعرض مبلغ الوردية.', 'كل صف: مستخدم ودور ووزن وحصة.', 'إرسال يحفظ بعد المراجعة.'], caption: 'الإجماليات والجدول.' },
      },
    },
  },
  ru: {
    'accounts-overview': {
      title: 'Обзор учёта',
      intro: 'Учёт — финансовый центр: план счетов, журналы, книги и отчёты.',
      sections: {
        open: { title: 'Открыть учёт', steps: ['Войдите с доступом к учёту.', 'Нажмите Учёт.', 'Открывается план счетов.'], caption: 'Экран Учёт.' },
        tabs: { title: 'Навигация по вкладкам', intro: 'Вкладки группируют настройку, проводки и отчёты.', steps: ['Прокручивайте горизонтально.', 'Настройка: План и Группы.', 'Отчёты: Главная книга, ОСВ, Баланс.'], caption: 'Панель вкладок Учёт.' },
        chart: { title: 'План счетов', steps: ['Ведите счета ГК.', 'Добавляйте или меняйте коды и типы.', 'Структура питает книги и отчёты.'], caption: 'Панель плана счетов.' },
      },
    },
    'accounts-expenses': {
      title: 'Проводки и группы счетов',
      intro: 'Проводите операции журналом и организуйте план группами. Кассовые расходы закрытия — отдельно.',
      sections: {
        journal: { title: 'Журнальные проводки', steps: ['Откройте Проводки.', 'Создайте сбалансированные дебет/кредит.', 'Сохраните для проведения в главную книгу.'], caption: 'Вкладка Проводки.' },
        groups: { title: 'Группы счетов', intro: 'Группы организуют счета для отчётов.', steps: ['Откройте Группы счетов.', 'Создайте группы под отчётность.', 'Назначьте счета.'], caption: 'Вкладка Группы счетов.' },
      },
    },
    'accounts-ledgers': {
      title: 'Книги и остатки',
      intro: 'Просматривайте проведённую активность и остатки периода.',
      sections: {
        ledger: { title: 'Главная книга', steps: ['Откройте Главную книгу.', 'Фильтруйте по счёту и датам.', 'Смотрите детализацию счёта.'], caption: 'Вкладка Главная книга.' },
        trial: { title: 'Оборотно-сальдовая ведомость', intro: 'Итоги дебета и кредита по счетам.', steps: ['Откройте ОСВ.', 'Выберите период.', 'Проверьте дебет = кредит.'], caption: 'Вкладка ОСВ.' },
        'balance-sheet': { title: 'Баланс', steps: ['Откройте Баланс.', 'Просмотрите активы, обязательства и капитал.', 'Другие отчёты следуют тому же шаблону.'], caption: 'Вкладка Баланс.' },
      },
    },
    'hr-overview': {
      title: 'Обзор HR',
      intro: 'HR охватывает персонал: сотрудники, посещаемость, отпуска, графики и зарплата.',
      sections: {
        open: { title: 'Открыть HR', steps: ['Войдите с доступом HR.', 'Нажмите HR.', 'Открывается Дашборд.'], caption: 'Экран HR.' },
        tabs: { title: 'Навигация по вкладкам', intro: 'Вкладки группируют настройку и процессы.', steps: ['Прокручивайте горизонтально.', 'Люди: Сотрудники, Отделы, Должности.', 'Время: Посещаемость, График, Отпуска, Праздники.'], caption: 'Панель вкладок HR.' },
        dashboard: { title: 'Дашборд', steps: ['Сводит ключевые метрики HR.', 'Точка старта перед детальными вкладками.', 'Другие вкладки ведут данные и операции.'], caption: 'Дашборд HR.' },
      },
    },
    'hr-employees': {
      title: 'Сотрудники',
      intro: 'Ведите сотрудников и оргструктуру.',
      sections: {
        employees: { title: 'Список сотрудников', steps: ['Откройте Сотрудники.', 'Добавьте или измените роль и отдел.', 'Питает посещаемость, отпуска и зарплату.'], caption: 'Вкладка Сотрудники.' },
        departments: { title: 'Отделы', intro: 'Группируют команды для отчётов.', steps: ['Откройте Отделы.', 'Создайте отделы команд.', 'Назначьте в карточке сотрудника.'], caption: 'Вкладка Отделы.' },
        positions: { title: 'Должности', steps: ['Откройте Должности.', 'Определите названия должностей.', 'Согласуйте с профилями оплаты при зарплате.'], caption: 'Вкладка Должности.' },
      },
    },
    'hr-attendance': {
      title: 'Посещаемость',
      intro: 'Отслеживайте отметки и графики для точных часов.',
      sections: {
        attendance: { title: 'Записи посещаемости', steps: ['Откройте Посещаемость.', 'Просмотрите входы и выходы.', 'Исправляйте или утверждайте исключения.'], caption: 'Вкладка Посещаемость.' },
        scheduling: { title: 'График', intro: 'Планирует, кто работает в какие смены.', steps: ['Откройте График.', 'Создайте смены на ближайшие дни.', 'Опубликованные графики направляют штат.'], caption: 'Вкладка График.' },
      },
    },
    'hr-leave': {
      title: 'Отпуска',
      intro: 'Управляйте запросами на отсутствие и праздниками.',
      sections: {
        leave: { title: 'Запросы на отпуск', steps: ['Откройте Отпуска.', 'Просмотрите ожидающие и утверждённые.', 'Утвердите или отклоните по роли.'], caption: 'Вкладка Отпуска.' },
        holidays: { title: 'Праздники', intro: 'Отмечают нерабочие или премиальные дни.', steps: ['Откройте Праздники.', 'Добавьте праздники площадки.', 'Питают график и правила оплаты.'], caption: 'Вкладка Праздники.' },
      },
    },
    'tip-distribution': {
      title: 'Распределение чаевых',
      intro: 'Считает, как делить чаевые смены, и сохраняет запись.',
      sections: {
        overview: { title: 'Экран распределения', steps: ['Нажмите Распределение чаевых.', 'Выберите смену и дату.', 'Загрузить чаевые считает итоги.'], caption: 'Экран распределения.' },
        filters: { title: 'Смена и дата', steps: ['Выберите смену.', 'Выберите дату.', 'Нажмите Загрузить чаевые.'], caption: 'Смена, дата и загрузка.' },
        table: { title: 'Таблица распределения', steps: ['Итого показывает сумму смены.', 'Каждая строка: пользователь, роль, вес и доля.', 'Отправить сохраняет после проверки.'], caption: 'Итоги и таблица.' },
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
