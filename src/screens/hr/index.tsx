import {TabList, Tabs} from "react-aria-components";
import {Layout} from "@/screens/partials/layout.tsx";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs";
import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import ScrollContainer from "react-indiana-drag-scroll";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {HrDashboard} from "@/components/hr/dashboard/index.tsx";
import {HrEmployees} from "@/components/hr/employees/index.tsx";
import {HrDepartments} from "@/components/hr/departments/index.tsx";
import {HrPositions} from "@/components/hr/positions/index.tsx";
import {HrCostCenters} from "@/components/hr/cost_centers/index.tsx";
import {HrPayProfiles} from "@/components/hr/pay_profiles/index.tsx";
import {HrPayRules} from "@/components/hr/pay_rules/index.tsx";
import {HrScheduling} from "@/components/hr/scheduling/index.tsx";
import {HrAttendance} from "@/components/hr/attendance/index.tsx";
import {HrLeave} from "@/components/hr/leave/index.tsx";
import {HrHolidays} from "@/components/hr/holidays/index.tsx";
import {HrPayrollPeriods} from "@/components/hr/payroll_periods/index.tsx";
import {HrPayrollRuns} from "@/components/hr/payroll_runs/index.tsx";
import {HrAdjustments} from "@/components/hr/adjustments/index.tsx";
import {HrDocuments} from "@/components/hr/documents/index.tsx";
import {HrPerformance} from "@/components/hr/performance/index.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";

/** Stable permission codes stored in user roles — not translated labels. */
export const HR_TAB_MODULES: Record<string, string> = {
  dashboard: "HR Dashboard",
  employees: "Employees",
  departments: "Departments",
  positions: "Positions",
  "cost-centers": "Cost Centers",
  "pay-profiles": "Pay Profiles",
  "pay-rules": "Pay Rules",
  scheduling: "Scheduling",
  attendance: "Attendance",
  leave: "Leave",
  holidays: "Holidays",
  "payroll-periods": "Payroll Periods",
  "payroll-runs": "Payroll Runs",
  adjustments: "Adjustments",
  documents: "Documents",
  performance: "Performance",
};

export const HrScreen = () => {
  const {t} = useTranslation("hr");
  const {t: tNav} = useTranslation("navigation");
  const [selected, setSelected] = useState("dashboard");
  const {protectAction} = useSecurity();

  const pages = useMemo(() => ({
    dashboard: {component: <HrDashboard/>, title: t("tabs.dashboard")},
    attendance: {component: <HrAttendance/>, title: t("tabs.attendance")},
    employees: {component: <HrEmployees/>, title: t("tabs.employees")},
    departments: {component: <HrDepartments/>, title: t("tabs.departments")},
    positions: {component: <HrPositions/>, title: t("tabs.positions")},
    "cost-centers": {component: <HrCostCenters/>, title: t("tabs.costCenters")},
    "pay-profiles": {component: <HrPayProfiles/>, title: t("tabs.payProfiles")},
    "pay-rules": {component: <HrPayRules/>, title: t("tabs.payRules")},
    scheduling: {component: <HrScheduling/>, title: t("tabs.scheduling")},
    leave: {component: <HrLeave/>, title: t("tabs.leave")},
    holidays: {component: <HrHolidays/>, title: t("tabs.holidays")},
    "payroll-periods": {component: <HrPayrollPeriods/>, title: t("tabs.payrollPeriods")},
    "payroll-runs": {component: <HrPayrollRuns/>, title: t("tabs.payrollRuns")},
    adjustments: {component: <HrAdjustments/>, title: t("tabs.adjustments")},
    documents: {component: <HrDocuments/>, title: t("tabs.documents")},
    performance: {component: <HrPerformance/>, title: t("tabs.performance")},
  }), [t]);

  return (
    <Layout containerClassName="">
      <DocumentTitle parts={[pages[selected]?.title, tNav("sidebar.hr")]} />
      <Tabs
        className="w-full flex flex-col rounded-xl"
        selectedKey={selected}
        onSelectionChange={(key: string) => {
          protectAction(() => {
            setSelected(key);
          }, {
            module: HR_TAB_MODULES[key],
            description: t("security.accessTab", {module: pages[key].title}),
          });
        }}
      >
        <ScrollContainer mouseScroll hideScrollbars={false} className="flex-grow-0 flex-shrink">
          <TabList aria-label="HR Tabs" className="flex flex-row gap-3 px-1 py-3 flex-nowrap">
            {Object.keys(pages).map((key) => (
              <Tab id={key} key={key}>{pages[key].title}</Tab>
            ))}
          </TabList>
        </ScrollContainer>
        {Object.keys(pages).map((key) => (
          <TabPanel id={key} key={key} className="bg-white shadow flex-grow flex-shrink-0">
            <div>{pages[key].component}</div>
          </TabPanel>
        ))}
      </Tabs>
    </Layout>
  );
};
