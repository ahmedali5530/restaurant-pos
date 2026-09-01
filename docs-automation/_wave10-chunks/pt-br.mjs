  "pt-br": {
    orders: {
      sections: {
        "cancel-void": {
          title: "Cancelar / anular itens",
          intro: "No menu ⋯ do pedido, Cancelar abre modal para anular linhas ou a conta inteira. Pedidos pagos podem acionar reversão contábil.",
          steps: [
            "Abra ⋯ em pedido Em andamento (ou Pago elegível) e escolha Cancelar pedido.",
            "Selecione motivo de anulação (obrigatório).",
            "Marque linhas e ajuste quantidades com +/−.",
            "Opcionalmente comente e confirme a cancelamento."
          ],
          caption: "Modal cancelar com motivo e seleção de itens.",
          fields: [
            {
              name: "Motivo",
              effect: "Motivo obrigatório do enum OrderVoidReason; salvo em order_void e impresso em tickets de exclusão."
            },
            {
              name: "Itens",
              effect: "Selecione linhas e quantidades parciais. Todos selecionados cancela o pedido; parcial reduz quantidade ou remove linha."
            },
            {
              name: "Comentários",
              effect: "Nota opcional nos registros de anulação e impressões de exclusão."
            },
            {
              name: "Confirmar cancelamento",
              effect: "Cria order_void, cancela estágios de cozinha, envia impressões por cozinha e reverte GL em pagos se integrações ativas."
            }
          ]
        },
        refund: {
          title: "Reembolsar itens pagos",
          intro: "Reembolso disponível em pedidos Pagos pelo menu ⋯. Imposto, taxa de serviço, extras e gorjeta são proporcionais.",
          steps: [
            "Abra ⋯ em pedido Pago → Reembolso.",
            "Marque itens no painel esquerdo.",
            "Revise total proporcional.",
            "Motivo opcional à direita e confirme."
          ],
          caption: "Modal de reembolso com itens e totais.",
          fields: [
            {
              name: "Selecionar itens",
              effect: "Lista de linhas ativas; total escala imposto, desconto, serviço, extras e gorjeta."
            },
            {
              name: "Motivo",
              effect: "Texto opcional em order_refunds para auditoria."
            },
            {
              name: "Reembolsar",
              effect: "Cria order_refunds, marca is_refunded, etiqueta Reembolsado, publica evento contábil e imprime nota."
            }
          ]
        },
        "split-seats": {
          title: "Dividir por assentos",
          intro: "Divide uma conta em pedidos por assento. Arraste itens entre colunas antes de salvar.",
          steps: [
            "Escolha Dividir por assentos no ⋯ (PIN gerente pode ser exigido).",
            "Revise colunas dos assentos dos itens.",
            "Arraste ou reatribua itens.",
            "Adicione/remova assentos e salve."
          ],
          caption: "Dividir por assentos com arrastar e soltar.",
          fields: [
            {
              name: "Colunas de assento",
              effect: "Cada coluna vira pedido Em andamento com fatura própria."
            },
            {
              name: "Adicionar assento",
              effect: "Coluna vazia para lugares extras."
            },
            {
              name: "Remover assento",
              effect: "Remove coluna vazia quando há mais de uma divisão."
            },
            {
              name: "Salvar divisões",
              effect: "Persiste pedidos, reatribui itens, marca pai como Dividido."
            }
          ]
        },
        "split-items": {
          title: "Dividir por itens",
          intro: "Divide linhas manualmente em duas ou mais contas, independente do assento.",
          steps: [
            "⋯ → Dividir por itens.",
            "Itens em Divisão 1; + para novas divisões.",
            "Arraste entre colunas.",
            "Salve com todos atribuídos e ≥2 divisões."
          ],
          caption: "Dividir por itens com várias colunas.",
          fields: [
            {
              name: "Colunas de divisão",
              effect: "Divisões nomeadas viram pedidos separados."
            },
            {
              name: "Arrastar itens",
              effect: "Move linha entre divisões; item só em uma ao salvar."
            },
            {
              name: "Adicionar divisão",
              effect: "Nova coluna vazia."
            },
            {
              name: "Remover divisão",
              effect: "Remove coluna e devolve itens à Divisão 1."
            },
            {
              name: "Salvar divisões",
              effect: "Cria pedidos filhos e marca origem Dividido."
            }
          ]
        },
        "split-amount": {
          title: "Dividir por valor",
          intro: "Divide por valores; cada parte recebe share proporcional de impostos, taxas e gorjetas.",
          steps: [
            "⋯ → Dividir por valor.",
            "Informe valores por divisão.",
            "Soma deve igualar total do pedido.",
            "Salve para gerar pedidos filhos."
          ],
          caption: "Dividir por valor com totais por conta.",
          fields: [
            {
              name: "Valor da divisão",
              effect: "Entrada por divisão; soma = total com imposto, extras, serviço e gorjeta."
            },
            {
              name: "Restante",
              effect: "Saldo não atribuído; salvar bloqueado até zero."
            },
            {
              name: "Adicionar divisão",
              effect: "Nova coluna iniciando em 0."
            },
            {
              name: "Remover divisão",
              effect: "Remove quando restam ≥2."
            },
            {
              name: "Salvar divisões",
              effect: "Cria pedidos com preços escalados pela proporção."
            }
          ]
        },
        merge: {
          title: "Mesclar pedidos",
          intro: "Combina várias contas de mesa Em andamento. Fluxo: marcar origens, escolher mesa destino.",
          steps: [
            "No primeiro pedido ⋯ → Mesclar (PIN gerente).",
            "Repita para cada origem.",
            "Toque Escolher mesa e selecione destino.",
            "Confirme; itens e totais consolidam."
          ],
          caption: "Fluxo de mesclagem com seletor de mesa.",
          fields: [
            {
              name: "Mesclar (menu)",
              effect: "Marca pedido como origem na seleção pendente."
            },
            {
              name: "Escolher mesa",
              effect: "Seleciona pedido sobrevivente; origens mescladas e etiquetadas."
            },
            {
              name: "PIN gerente",
              effect: "Pode ser exigido por regras de segurança."
            }
          ]
        }
      }
    },
    "accounts-ledgers": {
      sections: {
        "profit-loss": {
          title: "Demonstração de resultados",
          intro: "DRE resume receitas e despesas do período, usando a mesma agrupação de contas dos demais relatórios.",
          steps: [
            "Abra a aba Demonstração de resultados em Contas.",
            "Selecione intervalo de datas ou período.",
            "Revise receitas, CMV e despesas.",
            "Exporte ou detalhe lançamentos vinculados."
          ],
          caption: "Aba de demonstração de resultados."
        },
        "cash-flow": {
          title: "Fluxo de caixa",
          intro: "Mostra como o caixa se moveu em atividades operacionais, de investimento e financiamento.",
          steps: [
            "Abra a aba Fluxo de caixa.",
            "Escolha o período.",
            "Compare saldos inicial e final por seção.",
            "Use junto com DRE e balanço no fechamento."
          ],
          caption: "Aba de fluxo de caixa."
        }
      }
    },
    "inventory-reconciliation": {
      title: "Conciliação de cozinha",
      intro: "Compara uso esperado de estoque com contagens físicas, perdas, refeições de funcionários e cortesias por local e data operacional.",
      sections: {
        overview: {
          title: "Tela de conciliação",
          steps: [
            "Abra Estoque → Conciliação de cozinha.",
            "Escolha data operacional e local de estoque.",
            "Gere ou reabra a conciliação."
          ],
          caption: "Cabeçalho com data e local.",
          fields: [
            {
              name: "Data operacional",
              effect: "Data do período; impulsiona consumo esperado de vendas e receitas."
            },
            {
              name: "Local",
              effect: "Local de estoque ativo da cozinha; obrigatório antes de gerar."
            },
            {
              name: "Gerar",
              effect: "Chama generateReconciliation para criar/atualizar linhas esperadas."
            }
          ]
        },
        grid: {
          title: "Grade de conciliação",
          intro: "Informe contagens físicas e ajustes por item. Salve rascunho ou importe CSV.",
          steps: [
            "Revise estoque esperado e variância por item.",
            "Informe contagem física, perda, refeição funcionário e cortesia.",
            "Salve rascunho sem verificar.",
            "Use CSV para cozinhas grandes."
          ],
          caption: "Grade com contagens e variância.",
          fields: [
            {
              name: "Contagem física",
              effect: "Quantidade contada no fechamento; comparada ao esperado."
            },
            {
              name: "Qtd. perda",
              effect: "Perda registrada deduzida do uso esperado."
            },
            {
              name: "Qtd. refeição funcionário",
              effect: "Uso de refeição de funcionário na data."
            },
            {
              name: "Qtd. cortesia",
              effect: "Uso cortesia/comp na data."
            },
            {
              name: "Salvar rascunho",
              effect: "Persiste entradas via saveManualInputs sem bloquear."
            },
            {
              name: "Importar CSV",
              effect: "Upload em massa mapeado por código; validação antes de aplicar."
            }
          ]
        },
        verify: {
          title: "Verificar conciliação",
          steps: [
            "Revise totais de variância e avisos de dias perdidos.",
            "Resolva grandes variâncias ou adicione notas.",
            "Verifique para bloquear (PIN gerente pode ser exigido).",
            "Abra histórico de revisões."
          ],
          caption: "Resumo de variância e ação Verificar.",
          fields: [
            {
              name: "Verificar",
              effect: "Chama verifyReconciliation; pode exigir aprovação via protectAction."
            },
            {
              name: "Histórico de revisões",
              effect: "Instantâneos com valores antes/depois por campo."
            },
            {
              name: "Banner dias perdidos",
              effect: "Avisa quando datas anteriores não têm conciliações verificadas."
            }
          ]
        }
      }
    },
    "inventory-production": {
      title: "Lotes de produção",
      intro: "Execute produção por receita para consumir insumos e criar produtos acabados, sub-receitas ou perdas.",
      sections: {
        overview: {
          title: "Aba Produção",
          steps: [
            "Abra Estoque → Produção.",
            "Revise painel e histórico de lotes.",
            "Inicie lote quando prep exigir saída escalada."
          ],
          caption: "Aba Produção com histórico."
        },
        "run-batch": {
          title: "Executar lote de produção",
          intro: "Complete lote de receita ativa. Pré-visualize insumos/saídas antes de confirmar.",
          steps: [
            "Toque Iniciar lote / Executar produção.",
            "Selecione receita, quantidade e lote opcional.",
            "Revise pré-visualização.",
            "Confirme para registrar movimentos."
          ],
          caption: "Formulário de lote com pré-visualização.",
          fields: [
            {
              name: "Receita",
              effect: "Receita ativa com insumos, saídas, rendimento % e alocação de custo."
            },
            {
              name: "Qtd. produzida",
              effect: "Quantidade alvo; escala linhas via previewProductionBatch."
            },
            {
              name: "Número do lote",
              effect: "Identificador opcional; auto-gerado se vazio."
            },
            {
              name: "Notas",
              effect: "Nota livre no registro do lote."
            },
            {
              name: "Atualizar custo do item",
              effect: "Recalcula custos de saída a partir dos insumos."
            },
            {
              name: "Confirmar lote",
              effect: "Chama completeProductionBatch para deduzir insumos e registrar totais."
            }
          ]
        },
        history: {
          title: "Histórico de lotes",
          steps: [
            "Percorra tabela de lotes passados.",
            "Filtre por receita se necessário.",
            "Abra linha para insumos, saídas e custos."
          ],
          caption: "Lista de lotes concluídos."
        }
      }
    },
    "inventory-buffet": {
      title: "Sessões de buffet",
      intro: "Planeje e encerre sessões: convidados esperados, cardápio, lotes e conciliação de consumo.",
      sections: {
        "sessions-list": {
          title: "Lista de sessões",
          steps: [
            "Abra Estoque → Buffet.",
            "Navegue sessões com data, tipo, cardápio e status.",
            "Crie sessão ou abra painel ativo."
          ],
          caption: "Tabela de sessões de buffet."
        },
        "session-form": {
          title: "Criar sessão de buffet",
          steps: [
            "Toque Criar sessão.",
            "Selecione cardápio e local.",
            "Defina data, tipo, convidados esperados e preço.",
            "Salve para abrir painel."
          ],
          caption: "Formulário de nova sessão.",
          fields: [
            {
              name: "Cardápio",
              effect: "Define itens e planos de produção."
            },
            {
              name: "Local",
              effect: "Local de estoque do buffet."
            },
            {
              name: "Data operacional",
              effect: "Data operacional da sessão."
            },
            {
              name: "Tipo de sessão",
              effect: "Café da manhã, almoço ou jantar."
            },
            {
              name: "Convidados esperados",
              effect: "Coberturas previstas para escalar produção."
            },
            {
              name: "Preço buffet",
              effect: "Preço por convidado no painel."
            },
            {
              name: "Notas",
              effect: "Notas opcionais visíveis no painel."
            }
          ]
        },
        "session-dashboard": {
          title: "Painel e encerramento",
          intro: "Gerencie lotes, convidados reais e conciliação de encerramento.",
          steps: [
            "Inicie sessão ao começar serviço.",
            "Gere e complete lotes do plano.",
            "Informe convidados reais e consumo.",
            "Complete encerramento para finalizar."
          ],
          caption: "Painel com progresso de produção.",
          fields: [
            {
              name: "Iniciar sessão",
              effect: "Passa de planejada para ativa."
            },
            {
              name: "Gerar plano de produção",
              effect: "Cria lotes escalados aos convidados esperados."
            },
            {
              name: "Convidados reais",
              effect: "Coberturas registradas para comparar projeção vs real."
            },
            {
              name: "Completar encerramento",
              effect: "Captura contagens restantes e marca sessão concluída."
            }
          ]
        }
      }
    },
    "hr-cost-centers": {
      title: "Centros de custo",
      intro: "Centros de custo alocam mão de obra e folha a dimensões contábeis. Atribua em funcionários e regras de pagamento.",
      sections: {
        "cost-centers-list": {
          title: "Lista de centros de custo",
          steps: [
            "Abra RH → Centros de custo.",
            "Navegue códigos com nome e status.",
            "Adicione ou edite centros."
          ],
          caption: "Tabela de centros de custo."
        },
        "cost-center-form": {
          title: "Formulário de centro de custo",
          steps: [
            "Toque Adicionar ou editar.",
            "Informe código, nome e descrição.",
            "Defina Ativo e salve."
          ],
          caption: "Modal criar/editar centro de custo.",
          fields: [
            {
              name: "Código",
              effect: "Identificador curto único em funcionários e regras."
            },
            {
              name: "Nome",
              effect: "Nome exibido em seletores RH."
            },
            {
              name: "Descrição",
              effect: "Explicação opcional para administradores."
            },
            {
              name: "Ativo",
              effect: "Inativos ocultos de novas atribuições; histórico preservado."
            }
          ]
        }
      }
    },
    "hr-pay": {
      title: "Perfis e regras de pagamento",
      intro: "Configure taxas base por funcionário e ajustes automáticos via regras de pagamento.",
      sections: {
        "pay-profiles-list": {
          title: "Perfis de pagamento",
          steps: [
            "Abra RH → Perfis de pagamento.",
            "Cada linha liga funcionário a tipo e taxa base.",
            "Adicione perfil ao contratar ou mudar compensação."
          ],
          caption: "Lista de perfis de pagamento."
        },
        "pay-profile-form": {
          title: "Formulário de perfil",
          steps: [
            "Selecione funcionário, tipo e taxa base.",
            "Defina vigência inicial e final opcional.",
            "Salve para ativar no cálculo da folha."
          ],
          caption: "Formulário de perfil de pagamento.",
          fields: [
            {
              name: "Funcionário",
              effect: "Funcionário deste perfil."
            },
            {
              name: "Tipo de pagamento",
              effect: "Horista, salário, diária, contrato, comissão ou misto."
            },
            {
              name: "Taxa base",
              effect: "Taxa principal conforme tipo."
            },
            {
              name: "Moeda",
              effect: "Código ISO (padrão USD)."
            },
            {
              name: "Vigência desde",
              effect: "Início obrigatório."
            },
            {
              name: "Vigência até",
              effect: "Fim opcional."
            },
            {
              name: "Notas",
              effect: "Notas internas RH."
            }
          ]
        },
        "pay-rules-list": {
          title: "Regras de pagamento",
          intro: "Regras aplicam multiplicadores, bônus ou deduções por horários, departamentos, cargos e feriados.",
          steps: [
            "Abra RH → Regras de pagamento.",
            "Revise prioridade e empilhamento.",
            "Edite regras de hora extra e prêmios."
          ],
          caption: "Lista de regras."
        },
        "pay-rule-form": {
          title: "Formulário de regra",
          steps: [
            "Informe código, nome, prioridade e empilhamento.",
            "Adicione efeitos (multiplicador, bônus/dedução).",
            "Restrinja por filtros.",
            "Salve; regras ativas entram na pré-visualização."
          ],
          caption: "Formulário com efeitos.",
          fields: [
            {
              name: "Código / Nome",
              effect: "Identificador na execução da folha."
            },
            {
              name: "Prioridade",
              effect: "Menor número avaliado primeiro em modo prioridade."
            },
            {
              name: "Modo de empilhamento",
              effect: "Permitir, impedir, maior vence ou prioridade."
            },
            {
              name: "Exclusiva",
              effect: "Para avaliação após correspondência."
            },
            {
              name: "Efeitos",
              effect: "Tipo, valor e applies_to (regular, overtime, all hours)."
            },
            {
              name: "Filtros",
              effect: "Funcionário, departamento, cargo, centro, feriado, dia, mês, hora."
            },
            {
              name: "Ativa",
              effect: "Inativas ignoradas pelo motor."
            }
          ]
        }
      }
    },
    "hr-payroll": {
      title: "Períodos e execuções de folha",
      intro: "Defina períodos e gere execuções de pré-visualização agregando ponto, perfis e regras.",
      sections: {
        "payroll-periods-list": {
          title: "Períodos de folha",
          steps: [
            "Abra RH → Períodos de folha.",
            "Mantenha períodos abertos, bloqueados, fechados ou pagos.",
            "Crie período antes da execução."
          ],
          caption: "Tabela de períodos."
        },
        "payroll-period-form": {
          title: "Formulário de período",
          steps: [
            "Informe nome, tipo e datas.",
            "Defina status (geralmente aberto).",
            "Salve para permitir execuções."
          ],
          caption: "Formulário de período.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo em execuções e exportações."
            },
            {
              name: "Tipo de período",
              effect: "Semanal, quinzenal, mensal ou personalizado."
            },
            {
              name: "Data início / fim",
              effect: "Limites inclusivos do período."
            },
            {
              name: "Status",
              effect: "Aberto aceita execuções; demais restringem edições."
            }
          ]
        },
        "payroll-runs-list": {
          title: "Execuções de folha",
          steps: [
            "Abra RH → Execuções de folha.",
            "Cada execução pertence a um período.",
            "Abra para revisar, aprovar ou exportar."
          ],
          caption: "Lista de execuções."
        },
        "payroll-run-form": {
          title: "Criar execução",
          steps: [
            "Escolha período aberto.",
            "Confirme número sugerido.",
            "Gere pré-visualização."
          ],
          caption: "Formulário de nova execução.",
          fields: [
            {
              name: "Período de folha",
              effect: "Período aberto obrigatório."
            },
            {
              name: "Número da execução",
              effect: "Sequencial por período."
            },
            {
              name: "Gerar pré-visualização",
              effect: "Chama generatePreview sem finalizar pagamento."
            }
          ]
        }
      }
    },
    "hr-documents": {
      title: "Documentos do funcionário",
      intro: "Armazene contratos, licenças, IDs e arquivos com vencimento opcional.",
      sections: {
        "documents-list": {
          title: "Lista de documentos",
          steps: [
            "Abra RH → Documentos.",
            "Filtre por funcionário ou categoria.",
            "Envie novos ou revise vencimentos."
          ],
          caption: "Tabela de documentos."
        },
        "document-form": {
          title: "Upload de documento",
          steps: [
            "Selecione funcionário e categoria.",
            "Informe título e vencimento opcional.",
            "Anexe arquivo e salve."
          ],
          caption: "Modal de upload.",
          fields: [
            {
              name: "Funcionário",
              effect: "Proprietário do registro."
            },
            {
              name: "Categoria",
              effect: "Contrato, certificado, licença, ID, médico, advertência ou outro."
            },
            {
              name: "Título",
              effect: "Nome exibido."
            },
            {
              name: "Vence em",
              effect: "Data opcional para lembretes."
            },
            {
              name: "Arquivo",
              effect: "Binário em employee_documents; obrigatório ao criar."
            }
          ]
        }
      }
    },
    "hr-performance": {
      title: "Notas de desempenho",
      intro: "Registre advertências, elogios, avaliações e incidentes. Controle visibilidade ao funcionário.",
      sections: {
        "performance-list": {
          title: "Lista de notas",
          steps: [
            "Abra RH → Desempenho.",
            "Navegue por funcionário, tipo e severidade.",
            "Adicione notas após turnos ou avaliações."
          ],
          caption: "Tabela de notas."
        },
        "performance-form": {
          title: "Formulário de nota",
          steps: [
            "Selecione funcionário, tipo e título.",
            "Escreva conteúdo e severidade opcional.",
            "Escolha se funcionário pode ver.",
            "Salve no registro RH."
          ],
          caption: "Formulário de nota.",
          fields: [
            {
              name: "Funcionário",
              effect: "Sujeito da nota."
            },
            {
              name: "Tipo",
              effect: "Advertência, elogio, avaliação ou incidente."
            },
            {
              name: "Título",
              effect: "Resumo curto."
            },
            {
              name: "Conteúdo",
              effect: "Corpo detalhado obrigatório."
            },
            {
              name: "Severidade",
              effect: "Opcional baixa/média/alta/crítica."
            },
            {
              name: "Visível ao funcionário",
              effect: "Se marcado, pode aparecer ao funcionário; senão só RH."
            }
          ]
        }
      }
    },
    "hr-employees": {
      sections: {
        "employee-form": {
          title: "Formulário de funcionário",
          steps: [
            "Funcionários → Adicionar ou editar.",
            "Vincule usuário POS, departamento, cargo, centro de custo e gerente.",
            "Defina status, tipo, datas e notas."
          ],
          caption: "Formulário criar/editar funcionário.",
          fields: [
            {
              name: "Número do funcionário",
              effect: "ID RH único; pode auto-gerar com usuário POS."
            },
            {
              name: "Nome / Sobrenome",
              effect: "Nome legal em registros e escalas."
            },
            {
              name: "Usuário",
              effect: "Vínculo POS opcional para ponto e gorjetas."
            },
            {
              name: "Departamento / Cargo",
              effect: "Atribuição organizacional."
            },
            {
              name: "Centro de custo",
              effect: "Dimensão contábil de mão de obra."
            },
            {
              name: "Gerente",
              effect: "Outro funcionário para hierarquia."
            },
            {
              name: "Status de emprego",
              effect: "Ativo, inativo, demitido, licença ou suspenso."
            },
            {
              name: "Tipo de emprego",
              effect: "Horista, salário, contrato, comissão ou misto."
            },
            {
              name: "Admissão / Demissão",
              effect: "Datas para elegibilidade da folha."
            },
            {
              name: "Notas",
              effect: "Notas RH livres."
            }
          ]
        },
        "department-form": {
          title: "Formulário de departamento",
          steps: [
            "Departamentos → Adicionar.",
            "Informe nome e salve.",
            "Atribua em funcionários."
          ],
          caption: "Formulário de departamento.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo em funcionários, escalas e filtros."
            }
          ]
        },
        "position-form": {
          title: "Formulário de cargo",
          steps: [
            "Cargos → Adicionar.",
            "Informe título e salve.",
            "Mapeie funcionários e regras."
          ],
          caption: "Formulário de cargo.",
          fields: [
            {
              name: "Nome",
              effect: "Título em registros e filtros."
            }
          ]
        }
      }
    },
    "hr-attendance": {
      sections: {
        "attendance-form": {
          title: "Entrada manual de ponto",
          intro: "Gerentes podem corrigir batidas quando relógios falharam.",
          steps: [
            "Ponto → Adicionar entrada manual.",
            "Selecione funcionário e entrada/saída.",
            "Notas opcionais e salve."
          ],
          caption: "Formulário manual de ponto.",
          fields: [
            {
              name: "Funcionário",
              effect: "Funcionário da batida manual."
            },
            {
              name: "Entrada",
              effect: "Início obrigatório."
            },
            {
              name: "Saída",
              effect: "Fim após entrada."
            },
            {
              name: "Notas",
              effect: "Motivo ou referência."
            }
          ]
        }
      }
    },
    "hr-leave": {
      sections: {
        "leave-type-form": {
          title: "Formulário de tipo de licença",
          steps: [
            "Licenças → tipos → Adicionar.",
            "Configure código, pago, aprovação, acúmulo e limites."
          ],
          caption: "Formulário de tipo.",
          fields: [
            {
              name: "Código / Nome",
              effect: "Identificador em solicitações."
            },
            {
              name: "Pago",
              effect: "Conta como tempo pago na folha."
            },
            {
              name: "Requer aprovação",
              effect: "Solicitações ficam pendentes."
            },
            {
              name: "Máx. dias/ano",
              effect: "Teto anual opcional."
            },
            {
              name: "Taxa de acúmulo",
              effect: "Unidades por período."
            },
            {
              name: "Ativo",
              effect: "Inativos não selecionáveis."
            }
          ]
        },
        "leave-request-form": {
          title: "Formulário de solicitação",
          steps: [
            "Adicione solicitação.",
            "Funcionário, tipo e intervalo.",
            "Motivo opcional; dias calculados."
          ],
          caption: "Formulário de solicitação.",
          fields: [
            {
              name: "Funcionário",
              effect: "Solicitante."
            },
            {
              name: "Tipo de licença",
              effect: "Pago/não pago e fluxo de aprovação."
            },
            {
              name: "Início / Fim",
              effect: "Intervalo inclusivo."
            },
            {
              name: "Dias",
              effect: "Substituição opcional de dias úteis."
            },
            {
              name: "Motivo",
              effect: "Comentário armazenado."
            }
          ]
        }
      }
    },
    "admin-menus": {
      sections: {
        "dish-form": {
          title: "Formulário de prato",
          steps: [
            "Pratos → Adicionar/editar.",
            "Número, nome, preço, custo, categorias e foto.",
            "Modificadores, fluxo, cozinha e receita."
          ],
          caption: "Formulário de prato.",
          fields: [
            {
              name: "Nome / Número",
              effect: "Nome e PLU/SKU."
            },
            {
              name: "Prioridade",
              effect: "Ordem nas categorias."
            },
            {
              name: "Preço venda / Custo",
              effect: "Preço e custo teórico."
            },
            {
              name: "Categorias",
              effect: "Visibilidade e navegação."
            },
            {
              name: "Foto",
              effect: "Imagem opcional."
            },
            {
              name: "Fluxo de trabalho",
              effect: "Prep com overrides de cozinha."
            },
            {
              name: "Grupos de modificadores",
              effect: "Grupo, obrigatório, auto-abrir, prioridade."
            },
            {
              name: "Linhas de receita",
              effect: "Itens de estoque com quantidade e custo."
            }
          ]
        },
        "menu-form": {
          title: "Formulário de cardápio",
          steps: [
            "Cardápios → Adicionar.",
            "Nome e horários.",
            "Ativo e salve."
          ],
          caption: "Formulário de cardápio.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo do cardápio."
            },
            {
              name: "Início / Fim",
              effect: "Janela diária; vazio = dia inteiro."
            },
            {
              name: "Termina no dia seguinte",
              effect: "Cardápios noturnos."
            },
            {
              name: "Ativo",
              effect: "Inativos ocultos."
            }
          ]
        },
        "category-form": {
          title: "Formulário de categoria",
          steps: [
            "Categorias → Adicionar.",
            "Nome, prioridade e mostrar no cardápio."
          ],
          caption: "Formulário de categoria.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo do botão."
            },
            {
              name: "Prioridade",
              effect: "Ordem entre categorias."
            },
            {
              name: "Mostrar no cardápio",
              effect: "Oculta da UI de pedidos se desligado."
            }
          ]
        },
        "modifier-group-form": {
          title: "Grupo de modificadores",
          intro: "Modificadores (pratos) com preços e regras aninhadas.",
          steps: [
            "Grupos → Adicionar.",
            "Nome e prioridade.",
            "Modificadores com preço e grupos seguintes."
          ],
          caption: "Formulário de grupo.",
          fields: [
            {
              name: "Nome / Prioridade",
              effect: "Rótulo e ordem."
            },
            {
              name: "Modificador (prato)",
              effect: "Prato como opção."
            },
            {
              name: "Preço",
              effect: "Cobrança adicional."
            },
            {
              name: "Grupos seguintes permitidos",
              effect: "Fluxo aninhado."
            },
            {
              name: "Overrides de grupo seguinte",
              effect: "Ocultar ou substituir preços."
            }
          ]
        }
      }
    },
    "admin-floors": {
      sections: {
        "floor-form": {
          title: "Formulário de salão",
          steps: [
            "Salões → Adicionar.",
            "Nome, prioridade e cores.",
            "Salve e arrume mesas."
          ],
          caption: "Formulário de salão.",
          fields: [
            {
              name: "Nome",
              effect: "Nome no seletor de mesas."
            },
            {
              name: "Prioridade",
              effect: "Ordem no alternador."
            },
            {
              name: "Fundo / Cor",
              effect: "Cores do plano."
            }
          ]
        },
        "table-form": {
          title: "Formulário de mesa",
          steps: [
            "Mesas → Adicionar.",
            "Salão, número, cores e restrições.",
            "Salve e posicione."
          ],
          caption: "Formulário de mesa.",
          fields: [
            {
              name: "Nome / Número",
              effect: "Identificador em contas e cozinha."
            },
            {
              name: "Prioridade",
              effect: "Ordem no plano."
            },
            {
              name: "Salão",
              effect: "Salão pai obrigatório."
            },
            {
              name: "Fundo / Cor",
              effect: "Cores do tile."
            },
            {
              name: "Categorias / Tipos pedido / Pagamento",
              effect: "Restrições opcionais."
            },
            {
              name: "Pedir coberturas",
              effect: "Exige número de convidados."
            }
          ]
        }
      }
    },
    "admin-promotions": {
      sections: {
        "discount-form": {
          title: "Regra de desconto",
          intro: "Motor completo com categoria, alvos, horários e empilhamento.",
          steps: [
            "Descontos → Regras → Adicionar.",
            "Categoria, escopo, modo e alvos.",
            "Valor, empilhamento e impostos.",
            "Horários; Compre X Leve Y."
          ],
          caption: "Formulário de regra.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo em recibos."
            },
            {
              name: "Categoria",
              effect: "manager, staff, vip/corporate, happy_hour, category/product, floor, damage_wastage, bulk_order, manual, buy_x_get_y."
            },
            {
              name: "Escopo",
              effect: "item, category, cart, customer ou floor."
            },
            {
              name: "Modo de aplicação",
              effect: "manual, automatic ou both."
            },
            {
              name: "Alvos",
              effect: "IDs conforme escopo."
            },
            {
              name: "Tipo / Taxa min/máx",
              effect: "Percentual ou fixo."
            },
            {
              name: "Teto máximo",
              effect: "Teto em descontos percentuais."
            },
            {
              name: "Pedido mínimo",
              effect: "Subtotal mínimo."
            },
            {
              name: "Prioridade",
              effect: "Ordem em empilhamento priority."
            },
            {
              name: "Modo empilhamento",
              effect: "allow, prevent, highest_wins, priority."
            },
            {
              name: "Tratamento fiscal",
              effect: "tax_before_discount, tax_after_discount, inclusive, exclusive."
            },
            {
              name: "Empilhável / Exclusiva",
              effect: "Flags de combinação."
            },
            {
              name: "Requer motivo / aprovação",
              effect: "No POS."
            },
            {
              name: "Ativa",
              effect: "Inativas excluídas."
            },
            {
              name: "Horário",
              effect: "Janelas automáticas."
            },
            {
              name: "Condições Compre X Leve Y",
              effect: "Para buy_x_get_y."
            }
          ]
        },
        "coupon-form": {
          title: "Formulário de cupom",
          steps: [
            "Cupons → Adicionar.",
            "Código, tipo/valor, limites e validade.",
            "Dias/horas válidos."
          ],
          caption: "Formulário de cupom.",
          fields: [
            {
              name: "Código",
              effect: "String no pagamento."
            },
            {
              name: "Descrição",
              effect: "Nota interna."
            },
            {
              name: "Tipo de cupom",
              effect: "Uso único ou múltiplo."
            },
            {
              name: "Tipo / Valor",
              effect: "Percentual ou fixo."
            },
            {
              name: "Pedido mín. / Desconto máx.",
              effect: "Limites opcionais."
            },
            {
              name: "Limite uso / Por usuário",
              effect: "Global e por cliente."
            },
            {
              name: "Prioridade",
              effect: "Ordem de aplicação."
            },
            {
              name: "Dias / Validade",
              effect: "Calendário e intradiário."
            },
            {
              name: "Ativo",
              effect: "Inativos rejeitados."
            }
          ]
        }
      }
    },
    "admin-kitchen": {
      sections: {
        "kitchen-form": {
          title: "Formulário de cozinha",
          steps: [
            "Cozinhas → Adicionar.",
            "Nome, prioridade, pratos e impressoras."
          ],
          caption: "Estação de cozinha.",
          fields: [
            {
              name: "Nome",
              effect: "Nome em tickets."
            },
            {
              name: "Prioridade",
              effect: "Ordem nos filtros KDS."
            },
            {
              name: "Impressoras",
              effect: "KOT/exclusão."
            },
            {
              name: "Itens (pratos)",
              effect: "Roteamento."
            }
          ]
        },
        "workflow-form": {
          title: "Fluxo de trabalho",
          steps: [
            "Fluxos → Adicionar.",
            "Nome e etapas com cozinhas.",
            "Reordene e salve."
          ],
          caption: "Formulário de fluxo.",
          fields: [
            {
              name: "Nome",
              effect: "Template anexável a pratos."
            },
            {
              name: "Etapas",
              effect: "Passos ordenados com cozinha."
            },
            {
              name: "Ordem das etapas",
              effect: "Controles cima/baixo."
            }
          ]
        }
      }
    },
    "admin-printing": {
      sections: {
        "printer-form": {
          title: "Formulário de impressora",
          steps: [
            "Impressoras → Adicionar.",
            "Conexão e tipo."
          ],
          caption: "Formulário de impressora.",
          fields: [
            {
              name: "Nome",
              effect: "Nome amigável."
            },
            {
              name: "Tipo",
              effect: "Rede, USB, etc."
            },
            {
              name: "IP / Porta",
              effect: "Destino de rede."
            },
            {
              name: "VID / PID",
              effect: "USB."
            }
          ]
        },
        "print-setting-form": {
          title: "Configuração de impressão",
          steps: [
            "Configurações → tipo de modelo.",
            "Seções do recibo.",
            "Salve para novos pedidos."
          ],
          caption: "Modelo de impressão.",
          fields: [
            {
              name: "Tipo de impressão",
              effect: "Provisório, final, cozinha, resumo, delivery."
            },
            {
              name: "Editor de seções",
              effect: "Blocos ordenados."
            },
            {
              name: "Cópias / Opções",
              effect: "Padrões."
            }
          ]
        }
      }
    },
    "admin-payments": {
      sections: {
        "payment-type-form": {
          title: "Tipo de pagamento",
          intro: "Tipos aparecem na tela de pagamento; Remoto habilita gateways.",
          steps: [
            "Tipos → Adicionar.",
            "Nome, tipo, prioridade, imposto, descontos.",
            "Remoto: gateway e credenciais."
          ],
          caption: "Formulário com gateway.",
          fields: [
            {
              name: "Nome",
              effect: "Botão na tela."
            },
            {
              name: "Prioridade",
              effect: "Ordem dos botões."
            },
            {
              name: "Tipo",
              effect: "Dinheiro, Cartão, Pontos ou Remoto."
            },
            {
              name: "Gateway",
              effect: "Stripe, PayPal, Razorpay, etc."
            },
            {
              name: "Modo gateway",
              effect: "sandbox ou live."
            },
            {
              name: "Chave pública / secreta",
              effect: "API em payment_type_gateway_configs."
            },
            {
              name: "Segredo webhook",
              effect: "Callbacks assíncronos."
            },
            {
              name: "Client ID / secret",
              effect: "OAuth."
            },
            {
              name: "Merchant ID / salt",
              effect: "Campos do provedor."
            },
            {
              name: "Imposto",
              effect: "Opcional por tender."
            },
            {
              name: "Descontos",
              effect: "Fixos auto-aplicados."
            }
          ]
        }
      }
    },
    "admin-users": {
      sections: {
        "user-form": {
          title: "Formulário de usuário",
          steps: [
            "Usuários → Adicionar.",
            "PIN ou senha, nome, papel, turno.",
            "Funcionário vinculado opcional."
          ],
          caption: "Conta de usuário.",
          fields: [
            {
              name: "Método de login",
              effect: "PIN 4 dígitos ou usuário/senha."
            },
            {
              name: "Nome / Sobrenome",
              effect: "Exibido em pedidos."
            },
            {
              name: "Login / PIN",
              effect: "Credenciais."
            },
            {
              name: "Senha",
              effect: "Obrigatória se senha."
            },
            {
              name: "Papel",
              effect: "Acesso a módulos."
            },
            {
              name: "Turno",
              effect: "Padrão opcional."
            },
            {
              name: "Criar funcionário",
              effect: "Auto-cria RH vinculado."
            },
            {
              name: "Número funcionário",
              effect: "Obrigatório se criar."
            }
          ]
        },
        "role-form": {
          title: "Formulário de papel",
          steps: [
            "Papéis → Adicionar.",
            "Nome do papel.",
            "Módulos e permissões."
          ],
          caption: "Permissões de papel.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo do papel."
            },
            {
              name: "Módulos",
              effect: "Árvore ACCESS_RULE_MODULES."
            }
          ]
        },
        "shift-form": {
          title: "Formulário de turno",
          steps: [
            "Turnos → Adicionar.",
            "Nome e horários.",
            "Noturno define ends_next_day."
          ],
          caption: "Formulário de turno.",
          fields: [
            {
              name: "Nome",
              effect: "Rótulo do turno."
            },
            {
              name: "Início / Fim",
              effect: "Horário local."
            }
          ]
        },
        "tip-definition-form": {
          title: "Definição de gorjetas",
          intro: "Pesos do pool por papel e usuário.",
          steps: [
            "Definição de gorjetas.",
            "Linhas de papel com peso.",
            "Overrides por usuário.",
            "Salve."
          ],
          caption: "Editor de pesos.",
          fields: [
            {
              name: "Linhas por papel",
              effect: "Peso no pool."
            },
            {
              name: "Linhas por usuário",
              effect: "Overrides."
            },
            {
              name: "Salvar",
              effect: "Persiste tip_distribution."
            }
          ]
        }
      }
    }
  },
