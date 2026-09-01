#!/usr/bin/env node
/** Generates pt-br, fr, nl, de, it, ar, ru chunk files from embedded translation packs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function f(name, effect) { return { name, effect }; }

const packs = {
  'pt-br': requirePackPtBr(),
};

function serialize(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(obj)) {
    return '[\n' + obj.map((v) => padIn + (typeof v === 'string' ? JSON.stringify(v) : serialize(v, indent + 1))).join(',\n') + '\n' + pad + ']';
  }
  if (obj && typeof obj === 'object') {
    return '{\n' + Object.entries(obj).map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$-]*$/.test(k) && !k.includes('-') ? k : JSON.stringify(k);
      return padIn + key + ': ' + serialize(v, indent + 1);
    }).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(obj);
}

function renderLang(lang, pack) {
  return `  ${JSON.stringify(lang)}: ${serialize(pack, 1)},\n`;
}

for (const [lang, pack] of Object.entries(packs)) {
  fs.writeFileSync(path.join(__dirname, `${lang}.mjs`), renderLang(lang, pack));
  console.log('wrote', lang);
}

function requirePackPtBr() {
  return buildFromEsLike({
    orders: secOrdersPt(),
    'accounts-ledgers': secAccountsPt(),
    'inventory-reconciliation': secInvReconPt(),
    'inventory-production': secInvProdPt(),
    'inventory-buffet': secInvBuffetPt(),
    'hr-cost-centers': secHrCcPt(),
    'hr-pay': secHrPayPt(),
    'hr-payroll': secHrPayrollPt(),
    'hr-documents': secHrDocsPt(),
    'hr-performance': secHrPerfPt(),
    'hr-employees': secHrEmpPt(),
    'hr-attendance': secHrAttPt(),
    'hr-leave': secHrLeavePt(),
    'admin-menus': secAdminMenusPt(),
    'admin-floors': secAdminFloorsPt(),
    'admin-promotions': secAdminPromoPt(),
    'admin-kitchen': secAdminKitchenPt(),
    'admin-printing': secAdminPrintPt(),
    'admin-payments': secAdminPayPt(),
    'admin-users': secAdminUsersPt(),
  });
}

function buildFromEsLike(chapters) {
  return chapters;
}

// --- Portuguese (Brazil) section builders ---
function secOrdersPt() {
  return { sections: {
    'cancel-void': { title: 'Cancelar / anular itens', intro: 'No menu ⋯ do pedido, Cancelar abre modal para anular linhas ou a conta inteira. Pedidos pagos podem acionar reversão contábil.', steps: ['Abra ⋯ em pedido Em andamento (ou Pago elegível) e escolha Cancelar pedido.', 'Selecione motivo de anulação (obrigatório).', 'Marque linhas e ajuste quantidades com +/−.', 'Opcionalmente comente e confirme a cancelamento.'], caption: 'Modal cancelar com motivo e seleção de itens.', fields: [f('Motivo','Motivo obrigatório do enum OrderVoidReason; salvo em order_void e impresso em tickets de exclusão.'), f('Itens','Selecione linhas e quantidades parciais. Todos selecionados cancela o pedido; parcial reduz quantidade ou remove linha.'), f('Comentários','Nota opcional nos registros de anulação e impressões de exclusão.'), f('Confirmar cancelamento','Cria order_void, cancela estágios de cozinha, envia impressões por cozinha e reverte GL em pagos se integrações ativas.')] },
    refund: { title: 'Reembolsar itens pagos', intro: 'Reembolso disponível em pedidos Pagos pelo menu ⋯. Imposto, taxa de serviço, extras e gorjeta são proporcionais.', steps: ['Abra ⋯ em pedido Pago → Reembolso.', 'Marque itens no painel esquerdo.', 'Revise total proporcional.', 'Motivo opcional à direita e confirme.'], caption: 'Modal de reembolso com itens e totais.', fields: [f('Selecionar itens','Lista de linhas ativas; total escala imposto, desconto, serviço, extras e gorjeta.'), f('Motivo','Texto opcional em order_refunds para auditoria.'), f('Reembolsar','Cria order_refunds, marca is_refunded, etiqueta Reembolsado, publica evento contábil e imprime nota.')] },
    'split-seats': { title: 'Dividir por assentos', intro: 'Divide uma conta em pedidos por assento. Arraste itens entre colunas antes de salvar.', steps: ['Escolha Dividir por assentos no ⋯ (PIN gerente pode ser exigido).', 'Revise colunas dos assentos dos itens.', 'Arraste ou reatribua itens.', 'Adicione/remova assentos e salve.'], caption: 'Dividir por assentos com arrastar e soltar.', fields: [f('Colunas de assento','Cada coluna vira pedido Em andamento com fatura própria.'), f('Adicionar assento','Coluna vazia para lugares extras.'), f('Remover assento','Remove coluna vazia quando há mais de uma divisão.'), f('Salvar divisões','Persiste pedidos, reatribui itens, marca pai como Dividido.')] },
    'split-items': { title: 'Dividir por itens', intro: 'Divide linhas manualmente em duas ou mais contas, independente do assento.', steps: ['⋯ → Dividir por itens.', 'Itens em Divisão 1; + para novas divisões.', 'Arraste entre colunas.', 'Salve com todos atribuídos e ≥2 divisões.'], caption: 'Dividir por itens com várias colunas.', fields: [f('Colunas de divisão','Divisões nomeadas viram pedidos separados.'), f('Arrastar itens','Move linha entre divisões; item só em uma ao salvar.'), f('Adicionar divisão','Nova coluna vazia.'), f('Remover divisão','Remove coluna e devolve itens à Divisão 1.'), f('Salvar divisões','Cria pedidos filhos e marca origem Dividido.')] },
    'split-amount': { title: 'Dividir por valor', intro: 'Divide por valores; cada parte recebe share proporcional de impostos, taxas e gorjetas.', steps: ['⋯ → Dividir por valor.', 'Informe valores por divisão.', 'Soma deve igualar total do pedido.', 'Salve para gerar pedidos filhos.'], caption: 'Dividir por valor com totais por conta.', fields: [f('Valor da divisão','Entrada por divisão; soma = total com imposto, extras, serviço e gorjeta.'), f('Restante','Saldo não atribuído; salvar bloqueado até zero.'), f('Adicionar divisão','Nova coluna iniciando em 0.'), f('Remover divisão','Remove quando restam ≥2.'), f('Salvar divisões','Cria pedidos com preços escalados pela proporção.')] },
    merge: { title: 'Mesclar pedidos', intro: 'Combina várias contas de mesa Em andamento. Fluxo: marcar origens, escolher mesa destino.', steps: ['No primeiro pedido ⋯ → Mesclar (PIN gerente).', 'Repita para cada origem.', 'Toque Escolher mesa e selecione destino.', 'Confirme; itens e totais consolidam.'], caption: 'Fluxo de mesclagem com seletor de mesa.', fields: [f('Mesclar (menu)','Marca pedido como origem na seleção pendente.'), f('Escolher mesa','Seleciona pedido sobrevivente; origens mescladas e etiquetadas.'), f('PIN gerente','Pode ser exigido por regras de segurança.')] },
  }};
}

function secAccountsPt() {
  return { sections: {
    'profit-loss': { title: 'Demonstração de resultados', intro: 'DRE resume receitas e despesas do período, usando a mesma agrupação de contas dos demais relatórios.', steps: ['Abra a aba Demonstração de resultados em Contas.', 'Selecione intervalo de datas ou período.', 'Revise receitas, CMV e despesas.', 'Exporte ou detalhe lançamentos vinculados.'], caption: 'Aba de demonstração de resultados.' },
    'cash-flow': { title: 'Fluxo de caixa', intro: 'Mostra como o caixa se moveu em atividades operacionais, de investimento e financiamento.', steps: ['Abra a aba Fluxo de caixa.', 'Escolha o período.', 'Compare saldos inicial e final por seção.', 'Use junto com DRE e balanço no fechamento.'], caption: 'Aba de fluxo de caixa.' },
  }};
}

function secInvReconPt() {
  return { title: 'Conciliação de cozinha', intro: 'Compara uso esperado de estoque com contagens físicas, perdas, refeições de funcionários e cortesias por local e data operacional.', sections: {
    overview: { title: 'Tela de conciliação', steps: ['Abra Estoque → Conciliação de cozinha.', 'Escolha data operacional e local de estoque.', 'Gere ou reabra a conciliação.'], caption: 'Cabeçalho com data e local.', fields: [f('Data operacional','Data do período; impulsiona consumo esperado de vendas e receitas.'), f('Local','Local de estoque ativo da cozinha; obrigatório antes de gerar.'), f('Gerar','Chama generateReconciliation para criar/atualizar linhas esperadas.')] },
    grid: { title: 'Grade de conciliação', intro: 'Informe contagens físicas e ajustes por item. Salve rascunho ou importe CSV.', steps: ['Revise estoque esperado e variância por item.', 'Informe contagem física, perda, refeição funcionário e cortesia.', 'Salve rascunho sem verificar.', 'Use CSV para cozinhas grandes.'], caption: 'Grade com contagens e variância.', fields: [f('Contagem física','Quantidade contada no fechamento; comparada ao esperado.'), f('Qtd. perda','Perda registrada deduzida do uso esperado.'), f('Qtd. refeição funcionário','Uso de refeição de funcionário na data.'), f('Qtd. cortesia','Uso cortesia/comp na data.'), f('Salvar rascunho','Persiste entradas via saveManualInputs sem bloquear.'), f('Importar CSV','Upload em massa mapeado por código; validação antes de aplicar.')] },
    verify: { title: 'Verificar conciliação', steps: ['Revise totais de variância e avisos de dias perdidos.', 'Resolva grandes variâncias ou adicione notas.', 'Verifique para bloquear (PIN gerente pode ser exigido).', 'Abra histórico de revisões.'], caption: 'Resumo de variância e ação Verificar.', fields: [f('Verificar','Chama verifyReconciliation; pode exigir aprovação via protectAction.'), f('Histórico de revisões','Instantâneos com valores antes/depois por campo.'), f('Banner dias perdidos','Avisa quando datas anteriores não têm conciliações verificadas.')] },
  }};
}

function secInvProdPt() {
  return { title: 'Lotes de produção', intro: 'Execute produção por receita para consumir insumos e criar produtos acabados, sub-receitas ou perdas.', sections: {
    overview: { title: 'Aba Produção', steps: ['Abra Estoque → Produção.', 'Revise painel e histórico de lotes.', 'Inicie lote quando prep exigir saída escalada.'], caption: 'Aba Produção com histórico.' },
    'run-batch': { title: 'Executar lote de produção', intro: 'Complete lote de receita ativa. Pré-visualize insumos/saídas antes de confirmar.', steps: ['Toque Iniciar lote / Executar produção.', 'Selecione receita, quantidade e lote opcional.', 'Revise pré-visualização.', 'Confirme para registrar movimentos.'], caption: 'Formulário de lote com pré-visualização.', fields: [f('Receita','Receita ativa com insumos, saídas, rendimento % e alocação de custo.'), f('Qtd. produzida','Quantidade alvo; escala linhas via previewProductionBatch.'), f('Número do lote','Identificador opcional; auto-gerado se vazio.'), f('Notas','Nota livre no registro do lote.'), f('Atualizar custo do item','Recalcula custos de saída a partir dos insumos.'), f('Confirmar lote','Chama completeProductionBatch para deduzir insumos e registrar totais.')] },
    history: { title: 'Histórico de lotes', steps: ['Percorra tabela de lotes passados.', 'Filtre por receita se necessário.', 'Abra linha para insumos, saídas e custos.'], caption: 'Lista de lotes concluídos.' },
  }};
}

function secInvBuffetPt() {
  return { title: 'Sessões de buffet', intro: 'Planeje e encerre sessões: convidados esperados, cardápio, lotes e conciliação de consumo.', sections: {
    'sessions-list': { title: 'Lista de sessões', steps: ['Abra Estoque → Buffet.', 'Navegue sessões com data, tipo, cardápio e status.', 'Crie sessão ou abra painel ativo.'], caption: 'Tabela de sessões de buffet.' },
    'session-form': { title: 'Criar sessão de buffet', steps: ['Toque Criar sessão.', 'Selecione cardápio e local.', 'Defina data, tipo, convidados esperados e preço.', 'Salve para abrir painel.'], caption: 'Formulário de nova sessão.', fields: [f('Cardápio','Define itens e planos de produção.'), f('Local','Local de estoque do buffet.'), f('Data operacional','Data operacional da sessão.'), f('Tipo de sessão','Café da manhã, almoço ou jantar.'), f('Convidados esperados','Coberturas previstas para escalar produção.'), f('Preço buffet','Preço por convidado no painel.'), f('Notas','Notas opcionais visíveis no painel.')] },
    'session-dashboard': { title: 'Painel e encerramento', intro: 'Gerencie lotes, convidados reais e conciliação de encerramento.', steps: ['Inicie sessão ao começar serviço.', 'Gere e complete lotes do plano.', 'Informe convidados reais e consumo.', 'Complete encerramento para finalizar.'], caption: 'Painel com progresso de produção.', fields: [f('Iniciar sessão','Passa de planejada para ativa.'), f('Gerar plano de produção','Cria lotes escalados aos convidados esperados.'), f('Convidados reais','Coberturas registradas para comparar projeção vs real.'), f('Completar encerramento','Captura contagens restantes e marca sessão concluída.')] },
  }};
}

function secHrCcPt() {
  return { title: 'Centros de custo', intro: 'Centros de custo alocam mão de obra e folha a dimensões contábeis. Atribua em funcionários e regras de pagamento.', sections: {
    'cost-centers-list': { title: 'Lista de centros de custo', steps: ['Abra RH → Centros de custo.', 'Navegue códigos com nome e status.', 'Adicione ou edite centros.'], caption: 'Tabela de centros de custo.' },
    'cost-center-form': { title: 'Formulário de centro de custo', steps: ['Toque Adicionar ou editar.', 'Informe código, nome e descrição.', 'Defina Ativo e salve.'], caption: 'Modal criar/editar centro de custo.', fields: [f('Código','Identificador curto único em funcionários e regras.'), f('Nome','Nome exibido em seletores RH.'), f('Descrição','Explicação opcional para administradores.'), f('Ativo','Inativos ocultos de novas atribuições; histórico preservado.')] },
  }};
}

function secHrPayPt() {
  return { title: 'Perfis e regras de pagamento', intro: 'Configure taxas base por funcionário e ajustes automáticos via regras de pagamento.', sections: {
    'pay-profiles-list': { title: 'Perfis de pagamento', steps: ['Abra RH → Perfis de pagamento.', 'Cada linha liga funcionário a tipo e taxa base.', 'Adicione perfil ao contratar ou mudar compensação.'], caption: 'Lista de perfis de pagamento.' },
    'pay-profile-form': { title: 'Formulário de perfil', steps: ['Selecione funcionário, tipo e taxa base.', 'Defina vigência inicial e final opcional.', 'Salve para ativar no cálculo da folha.'], caption: 'Formulário de perfil de pagamento.', fields: [f('Funcionário','Funcionário deste perfil.'), f('Tipo de pagamento','Horista, salário, diária, contrato, comissão ou misto.'), f('Taxa base','Taxa principal conforme tipo.'), f('Moeda','Código ISO (padrão USD).'), f('Vigência desde','Início obrigatório.'), f('Vigência até','Fim opcional.'), f('Notas','Notas internas RH.')] },
    'pay-rules-list': { title: 'Regras de pagamento', intro: 'Regras aplicam multiplicadores, bônus ou deduções por horários, departamentos, cargos e feriados.', steps: ['Abra RH → Regras de pagamento.', 'Revise prioridade e empilhamento.', 'Edite regras de hora extra e prêmios.'], caption: 'Lista de regras.' },
    'pay-rule-form': { title: 'Formulário de regra', steps: ['Informe código, nome, prioridade e empilhamento.', 'Adicione efeitos (multiplicador, bônus/dedução).', 'Restrinja por filtros.', 'Salve; regras ativas entram na pré-visualização.'], caption: 'Formulário com efeitos.', fields: [f('Código / Nome','Identificador na execução da folha.'), f('Prioridade','Menor número avaliado primeiro em modo prioridade.'), f('Modo de empilhamento','Permitir, impedir, maior vence ou prioridade.'), f('Exclusiva','Para avaliação após correspondência.'), f('Efeitos','Tipo, valor e applies_to (regular, overtime, all hours).'), f('Filtros','Funcionário, departamento, cargo, centro, feriado, dia, mês, hora.'), f('Ativa','Inativas ignoradas pelo motor.')] },
  }};
}

function secHrPayrollPt() {
  return { title: 'Períodos e execuções de folha', intro: 'Defina períodos e gere execuções de pré-visualização agregando ponto, perfis e regras.', sections: {
    'payroll-periods-list': { title: 'Períodos de folha', steps: ['Abra RH → Períodos de folha.', 'Mantenha períodos abertos, bloqueados, fechados ou pagos.', 'Crie período antes da execução.'], caption: 'Tabela de períodos.' },
    'payroll-period-form': { title: 'Formulário de período', steps: ['Informe nome, tipo e datas.', 'Defina status (geralmente aberto).', 'Salve para permitir execuções.'], caption: 'Formulário de período.', fields: [f('Nome','Rótulo em execuções e exportações.'), f('Tipo de período','Semanal, quinzenal, mensal ou personalizado.'), f('Data início / fim','Limites inclusivos do período.'), f('Status','Aberto aceita execuções; demais restringem edições.')] },
    'payroll-runs-list': { title: 'Execuções de folha', steps: ['Abra RH → Execuções de folha.', 'Cada execução pertence a um período.', 'Abra para revisar, aprovar ou exportar.'], caption: 'Lista de execuções.' },
    'payroll-run-form': { title: 'Criar execução', steps: ['Escolha período aberto.', 'Confirme número sugerido.', 'Gere pré-visualização.'], caption: 'Formulário de nova execução.', fields: [f('Período de folha','Período aberto obrigatório.'), f('Número da execução','Sequencial por período.'), f('Gerar pré-visualização','Chama generatePreview sem finalizar pagamento.')] },
  }};
}

function secHrDocsPt() {
  return { title: 'Documentos do funcionário', intro: 'Armazene contratos, licenças, IDs e arquivos com vencimento opcional.', sections: {
    'documents-list': { title: 'Lista de documentos', steps: ['Abra RH → Documentos.', 'Filtre por funcionário ou categoria.', 'Envie novos ou revise vencimentos.'], caption: 'Tabela de documentos.' },
    'document-form': { title: 'Upload de documento', steps: ['Selecione funcionário e categoria.', 'Informe título e vencimento opcional.', 'Anexe arquivo e salve.'], caption: 'Modal de upload.', fields: [f('Funcionário','Proprietário do registro.'), f('Categoria','Contrato, certificado, licença, ID, médico, advertência ou outro.'), f('Título','Nome exibido.'), f('Vence em','Data opcional para lembretes.'), f('Arquivo','Binário em employee_documents; obrigatório ao criar.')] },
  }};
}

function secHrPerfPt() {
  return { title: 'Notas de desempenho', intro: 'Registre advertências, elogios, avaliações e incidentes. Controle visibilidade ao funcionário.', sections: {
    'performance-list': { title: 'Lista de notas', steps: ['Abra RH → Desempenho.', 'Navegue por funcionário, tipo e severidade.', 'Adicione notas após turnos ou avaliações.'], caption: 'Tabela de notas.' },
    'performance-form': { title: 'Formulário de nota', steps: ['Selecione funcionário, tipo e título.', 'Escreva conteúdo e severidade opcional.', 'Escolha se funcionário pode ver.', 'Salve no registro RH.'], caption: 'Formulário de nota.', fields: [f('Funcionário','Sujeito da nota.'), f('Tipo','Advertência, elogio, avaliação ou incidente.'), f('Título','Resumo curto.'), f('Conteúdo','Corpo detalhado obrigatório.'), f('Severidade','Opcional baixa/média/alta/crítica.'), f('Visível ao funcionário','Se marcado, pode aparecer ao funcionário; senão só RH.')] },
  }};
}

function secHrEmpPt() {
  return { sections: {
    'employee-form': { title: 'Formulário de funcionário', steps: ['Funcionários → Adicionar ou editar.', 'Vincule usuário POS, departamento, cargo, centro de custo e gerente.', 'Defina status, tipo, datas e notas.'], caption: 'Formulário criar/editar funcionário.', fields: [f('Número do funcionário','ID RH único; pode auto-gerar com usuário POS.'), f('Nome / Sobrenome','Nome legal em registros e escalas.'), f('Usuário','Vínculo POS opcional para ponto e gorjetas.'), f('Departamento / Cargo','Atribuição organizacional.'), f('Centro de custo','Dimensão contábil de mão de obra.'), f('Gerente','Outro funcionário para hierarquia.'), f('Status de emprego','Ativo, inativo, demitido, licença ou suspenso.'), f('Tipo de emprego','Horista, salário, contrato, comissão ou misto.'), f('Admissão / Demissão','Datas para elegibilidade da folha.'), f('Notas','Notas RH livres.')] },
    'department-form': { title: 'Formulário de departamento', steps: ['Departamentos → Adicionar.', 'Informe nome e salve.', 'Atribua em funcionários.'], caption: 'Formulário de departamento.', fields: [f('Nome','Rótulo em funcionários, escalas e filtros.')] },
    'position-form': { title: 'Formulário de cargo', steps: ['Cargos → Adicionar.', 'Informe título e salve.', 'Mapeie funcionários e regras.'], caption: 'Formulário de cargo.', fields: [f('Nome','Título em registros e filtros.')] },
  }};
}

function secHrAttPt() {
  return { sections: {
    'attendance-form': { title: 'Entrada manual de ponto', intro: 'Gerentes podem corrigir batidas quando relógios falharam.', steps: ['Ponto → Adicionar entrada manual.', 'Selecione funcionário e entrada/saída.', 'Notas opcionais e salve.'], caption: 'Formulário manual de ponto.', fields: [f('Funcionário','Funcionário da batida manual.'), f('Entrada','Início obrigatório.'), f('Saída','Fim após entrada.'), f('Notas','Motivo ou referência.')] },
  }};
}

function secHrLeavePt() {
  return { sections: {
    'leave-type-form': { title: 'Formulário de tipo de licença', steps: ['Licenças → tipos → Adicionar.', 'Configure código, pago, aprovação, acúmulo e limites.'], caption: 'Formulário de tipo.', fields: [f('Código / Nome','Identificador em solicitações.'), f('Pago','Conta como tempo pago na folha.'), f('Requer aprovação','Solicitações ficam pendentes.'), f('Máx. dias/ano','Teto anual opcional.'), f('Taxa de acúmulo','Unidades por período.'), f('Ativo','Inativos não selecionáveis.')] },
    'leave-request-form': { title: 'Formulário de solicitação', steps: ['Adicione solicitação.', 'Funcionário, tipo e intervalo.', 'Motivo opcional; dias calculados.'], caption: 'Formulário de solicitação.', fields: [f('Funcionário','Solicitante.'), f('Tipo de licença','Pago/não pago e fluxo de aprovação.'), f('Início / Fim','Intervalo inclusivo.'), f('Dias','Substituição opcional de dias úteis.'), f('Motivo','Comentário armazenado.')] },
  }};
}

function secAdminMenusPt() {
  return { sections: {
    'dish-form': { title: 'Formulário de prato', steps: ['Pratos → Adicionar/editar.', 'Número, nome, preço, custo, categorias e foto.', 'Modificadores, fluxo, cozinha e receita.'], caption: 'Formulário de prato.', fields: [f('Nome / Número','Nome e PLU/SKU.'), f('Prioridade','Ordem nas categorias.'), f('Preço venda / Custo','Preço e custo teórico.'), f('Categorias','Visibilidade e navegação.'), f('Foto','Imagem opcional.'), f('Fluxo de trabalho','Prep com overrides de cozinha.'), f('Grupos de modificadores','Grupo, obrigatório, auto-abrir, prioridade.'), f('Linhas de receita','Itens de estoque com quantidade e custo.')] },
    'menu-form': { title: 'Formulário de cardápio', steps: ['Cardápios → Adicionar.', 'Nome e horários.', 'Ativo e salve.'], caption: 'Formulário de cardápio.', fields: [f('Nome','Rótulo do cardápio.'), f('Início / Fim','Janela diária; vazio = dia inteiro.'), f('Termina no dia seguinte','Cardápios noturnos.'), f('Ativo','Inativos ocultos.')] },
    'category-form': { title: 'Formulário de categoria', steps: ['Categorias → Adicionar.', 'Nome, prioridade e mostrar no cardápio.'], caption: 'Formulário de categoria.', fields: [f('Nome','Rótulo do botão.'), f('Prioridade','Ordem entre categorias.'), f('Mostrar no cardápio','Oculta da UI de pedidos se desligado.')] },
    'modifier-group-form': { title: 'Grupo de modificadores', intro: 'Modificadores (pratos) com preços e regras aninhadas.', steps: ['Grupos → Adicionar.', 'Nome e prioridade.', 'Modificadores com preço e grupos seguintes.'], caption: 'Formulário de grupo.', fields: [f('Nome / Prioridade','Rótulo e ordem.'), f('Modificador (prato)','Prato como opção.'), f('Preço','Cobrança adicional.'), f('Grupos seguintes permitidos','Fluxo aninhado.'), f('Overrides de grupo seguinte','Ocultar ou substituir preços.')] },
  }};
}

function secAdminFloorsPt() {
  return { sections: {
    'floor-form': { title: 'Formulário de salão', steps: ['Salões → Adicionar.', 'Nome, prioridade e cores.', 'Salve e arrume mesas.'], caption: 'Formulário de salão.', fields: [f('Nome','Nome no seletor de mesas.'), f('Prioridade','Ordem no alternador.'), f('Fundo / Cor','Cores do plano.')] },
    'table-form': { title: 'Formulário de mesa', steps: ['Mesas → Adicionar.', 'Salão, número, cores e restrições.', 'Salve e posicione.'], caption: 'Formulário de mesa.', fields: [f('Nome / Número','Identificador em contas e cozinha.'), f('Prioridade','Ordem no plano.'), f('Salão','Salão pai obrigatório.'), f('Fundo / Cor','Cores do tile.'), f('Categorias / Tipos pedido / Pagamento','Restrições opcionais.'), f('Pedir coberturas','Exige número de convidados.')] },
  }};
}

function secAdminPromoPt() {
  return { sections: {
    'discount-form': { title: 'Regra de desconto', intro: 'Motor completo com categoria, alvos, horários e empilhamento.', steps: ['Descontos → Regras → Adicionar.', 'Categoria, escopo, modo e alvos.', 'Valor, empilhamento e impostos.', 'Horários; Compre X Leve Y.'], caption: 'Formulário de regra.', fields: [f('Nome','Rótulo em recibos.'), f('Categoria','manager, staff, vip/corporate, happy_hour, category/product, floor, damage_wastage, bulk_order, manual, buy_x_get_y.'), f('Escopo','item, category, cart, customer ou floor.'), f('Modo de aplicação','manual, automatic ou both.'), f('Alvos','IDs conforme escopo.'), f('Tipo / Taxa min/máx','Percentual ou fixo.'), f('Teto máximo','Teto em descontos percentuais.'), f('Pedido mínimo','Subtotal mínimo.'), f('Prioridade','Ordem em empilhamento priority.'), f('Modo empilhamento','allow, prevent, highest_wins, priority.'), f('Tratamento fiscal','tax_before_discount, tax_after_discount, inclusive, exclusive.'), f('Empilhável / Exclusiva','Flags de combinação.'), f('Requer motivo / aprovação','No POS.'), f('Ativa','Inativas excluídas.'), f('Horário','Janelas automáticas.'), f('Condições Compre X Leve Y','Para buy_x_get_y.')] },
    'coupon-form': { title: 'Formulário de cupom', steps: ['Cupons → Adicionar.', 'Código, tipo/valor, limites e validade.', 'Dias/horas válidos.'], caption: 'Formulário de cupom.', fields: [f('Código','String no pagamento.'), f('Descrição','Nota interna.'), f('Tipo de cupom','Uso único ou múltiplo.'), f('Tipo / Valor','Percentual ou fixo.'), f('Pedido mín. / Desconto máx.','Limites opcionais.'), f('Limite uso / Por usuário','Global e por cliente.'), f('Prioridade','Ordem de aplicação.'), f('Dias / Validade','Calendário e intradiário.'), f('Ativo','Inativos rejeitados.')] },
  }};
}

function secAdminKitchenPt() {
  return { sections: {
    'kitchen-form': { title: 'Formulário de cozinha', steps: ['Cozinhas → Adicionar.', 'Nome, prioridade, pratos e impressoras.'], caption: 'Estação de cozinha.', fields: [f('Nome','Nome em tickets.'), f('Prioridade','Ordem nos filtros KDS.'), f('Impressoras','KOT/exclusão.'), f('Itens (pratos)','Roteamento.')] },
    'workflow-form': { title: 'Fluxo de trabalho', steps: ['Fluxos → Adicionar.', 'Nome e etapas com cozinhas.', 'Reordene e salve.'], caption: 'Formulário de fluxo.', fields: [f('Nome','Template anexável a pratos.'), f('Etapas','Passos ordenados com cozinha.'), f('Ordem das etapas','Controles cima/baixo.')] },
  }};
}

function secAdminPrintPt() {
  return { sections: {
    'printer-form': { title: 'Formulário de impressora', steps: ['Impressoras → Adicionar.', 'Conexão e tipo.'], caption: 'Formulário de impressora.', fields: [f('Nome','Nome amigável.'), f('Tipo','Rede, USB, etc.'), f('IP / Porta','Destino de rede.'), f('VID / PID','USB.')] },
    'print-setting-form': { title: 'Configuração de impressão', steps: ['Configurações → tipo de modelo.', 'Seções do recibo.', 'Salve para novos pedidos.'], caption: 'Modelo de impressão.', fields: [f('Tipo de impressão','Provisório, final, cozinha, resumo, delivery.'), f('Editor de seções','Blocos ordenados.'), f('Cópias / Opções','Padrões.')] },
  }};
}

function secAdminPayPt() {
  return { sections: {
    'payment-type-form': { title: 'Tipo de pagamento', intro: 'Tipos aparecem na tela de pagamento; Remoto habilita gateways.', steps: ['Tipos → Adicionar.', 'Nome, tipo, prioridade, imposto, descontos.', 'Remoto: gateway e credenciais.'], caption: 'Formulário com gateway.', fields: [f('Nome','Botão na tela.'), f('Prioridade','Ordem dos botões.'), f('Tipo','Dinheiro, Cartão, Pontos ou Remoto.'), f('Gateway','Stripe, PayPal, Razorpay, etc.'), f('Modo gateway','sandbox ou live.'), f('Chave pública / secreta','API em payment_type_gateway_configs.'), f('Segredo webhook','Callbacks assíncronos.'), f('Client ID / secret','OAuth.'), f('Merchant ID / salt','Campos do provedor.'), f('Imposto','Opcional por tender.'), f('Descontos','Fixos auto-aplicados.')] },
  }};
}

function secAdminUsersPt() {
  return { sections: {
    'user-form': { title: 'Formulário de usuário', steps: ['Usuários → Adicionar.', 'PIN ou senha, nome, papel, turno.', 'Funcionário vinculado opcional.'], caption: 'Conta de usuário.', fields: [f('Método de login','PIN 4 dígitos ou usuário/senha.'), f('Nome / Sobrenome','Exibido em pedidos.'), f('Login / PIN','Credenciais.'), f('Senha','Obrigatória se senha.'), f('Papel','Acesso a módulos.'), f('Turno','Padrão opcional.'), f('Criar funcionário','Auto-cria RH vinculado.'), f('Número funcionário','Obrigatório se criar.')] },
    'role-form': { title: 'Formulário de papel', steps: ['Papéis → Adicionar.', 'Nome do papel.', 'Módulos e permissões.'], caption: 'Permissões de papel.', fields: [f('Nome','Rótulo do papel.'), f('Módulos','Árvore ACCESS_RULE_MODULES.')] },
    'shift-form': { title: 'Formulário de turno', steps: ['Turnos → Adicionar.', 'Nome e horários.', 'Noturno define ends_next_day.'], caption: 'Formulário de turno.', fields: [f('Nome','Rótulo do turno.'), f('Início / Fim','Horário local.')] },
    'tip-definition-form': { title: 'Definição de gorjetas', intro: 'Pesos do pool por papel e usuário.', steps: ['Definição de gorjetas.', 'Linhas de papel com peso.', 'Overrides por usuário.', 'Salve.'], caption: 'Editor de pesos.', fields: [f('Linhas por papel','Peso no pool.'), f('Linhas por usuário','Overrides.'), f('Salvar','Persiste tip_distribution.')] },
  }};
}
