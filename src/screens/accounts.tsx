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

/** Stable permission codes stored in user roles — not translated labels. */
const ACCOUNTS_TAB_MODULES: Record<string, string> = {
  'chart-of-accounts': 'Chart of Accounts',
  'account-groups': 'Account Groups',
  'journal-entries': 'Journal Entries',
  'general-ledger': 'General Ledger',
  'trial-balance': 'Trial Balance',
  'balance-sheet': 'Balance Sheet',
  'profit-loss': 'Profit & Loss',
  'cash-flow': 'Cash Flow',
  'customer-statement': 'Customer Statement',
  'supplier-statement': 'Supplier Statement',
};

export const AccountsScreen = () => {
  const {t} = useTranslation('accounts');
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
        <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink bg-white">
          <TabList aria-label="Tabs"
                   className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
            {Object.keys(pages).map(key => (
              <Tab id={key} key={key}>{pages[key].title}</Tab>
            ))}
          </TabList>
        </ScrollContainer>
        {Object.keys(pages).map((key) => (
          <TabPanel id={key} key={key} className="bg-white shadow flex-grow flex-shrink-0">
            <div>
              {pages[key].component}
            </div>
          </TabPanel>
        ))}
      </Tabs>
    </Layout>
  );
};
