import {TabList, Tabs} from "react-aria-components";
import {Layout} from "@/screens/partials/layout.tsx";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs";
import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import ScrollContainer from "react-indiana-drag-scroll";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {ChartOfAccounts} from "@/components/accounts/chart.of.accounts.tsx";
import {AccountGroups} from "@/components/accounts/account.groups.tsx";
import {JournalEntries} from "@/components/accounts/journal.entries.tsx";
import {GeneralLedger} from "@/components/accounts/general.ledger.tsx";
import {TrialBalance} from "@/components/accounts/trial.balance.tsx";
import {BalanceSheet} from "@/components/accounts/balance.sheet.tsx";
import {ProfitLoss} from "@/components/accounts/profit.loss.tsx";
import {CashFlow} from "@/components/accounts/cash.flow.tsx";
import {CustomerStatement} from "@/components/accounts/customer.statement.tsx";
import {SupplierStatement} from "@/components/accounts/supplier.statement.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";

/** Stable permission codes stored in user roles — not translated labels. */
const ACCOUNTS_TAB_MODULES: Record<string, string> = {
  'chart-of-accounts': 'accounts.chart_of_accounts',
  'account-groups': 'accounts.account_groups',
  'journal-entries': 'accounts.journal_entries',
  'general-ledger': 'accounts.general_ledger',
  'trial-balance': 'accounts.trial_balance',
  'balance-sheet': 'accounts.balance_sheet',
  'profit-loss': 'accounts.profit_loss',
  'cash-flow': 'accounts.cash_flow',
  'customer-statement': 'accounts.customer_statement',
  'supplier-statement': 'accounts.supplier_statement',
};

export const AccountsScreen = () => {
  const {t} = useTranslation('accounts');
  const {t: tNav} = useTranslation('navigation');
  const [selected, setSelected] = useState('chart-of-accounts');
  const {protectAction} = useSecurity();

  const pages = useMemo(() => ({
    'chart-of-accounts': {component: <ChartOfAccounts/>, title: t('tabs.chartOfAccounts')},
    'account-groups': {component: <AccountGroups/>, title: t('tabs.accountGroups')},
    'journal-entries': {component: <JournalEntries/>, title: t('tabs.journalEntries')},
    'general-ledger': {component: <GeneralLedger/>, title: t('tabs.generalLedger')},
    'trial-balance': {component: <TrialBalance/>, title: t('tabs.trialBalance')},
    'balance-sheet': {component: <BalanceSheet/>, title: t('tabs.balanceSheet')},
    'profit-loss': {component: <ProfitLoss/>, title: t('tabs.profitLoss')},
    'cash-flow': {component: <CashFlow/>, title: t('tabs.cashFlow')},
    'customer-statement': {component: <CustomerStatement/>, title: t('tabs.customerStatement')},
    'supplier-statement': {component: <SupplierStatement/>, title: t('tabs.supplierStatement')},
  }), [t]);

  return (
    <Layout containerClassName="">
      <DocumentTitle parts={[pages[selected]?.title, tNav('sidebar.accounts')]} />
      <div data-testid="accounts-page">
        <Tabs
          className="w-full flex flex-col rounded-xl"
          selectedKey={selected}
          onSelectionChange={(key: string) => {
            protectAction(() => {
              setSelected(key);
            }, {
              module: ACCOUNTS_TAB_MODULES[key],
              description: t('security.accessTab', {module: pages[key].title}),
            });
          }}
        >
          <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink">
            <TabList
              aria-label="Tabs"
              className="flex flex-row gap-3 px-1 py-3 flex-nowrap"
              data-testid="accounts-tabs"
            >
              {Object.keys(pages).map(key => (
                <Tab id={key} key={key} data-testid={`accounts-tab-${key}`}>{pages[key].title}</Tab>
              ))}
            </TabList>
          </ScrollContainer>
          {Object.keys(pages).map((key) => (
            <TabPanel id={key} key={key} className="bg-white shadow flex-grow flex-shrink-0">
              <div data-testid={`accounts-panel-${key}`}>
                {pages[key].component}
              </div>
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
};
