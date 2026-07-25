import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { ACCESS_RULE_MODULES } from "@/lib/access.rules.ts";
import { getAccessRuleChildLabel, getAccessRuleModuleLabel } from "@/lib/access.rules.i18n.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  roleName: string;
  modules: string[];
}

type ModuleGroup = {
  key: string;
  label: string;
  items: { key: string; label: string }[];
};

const buildGroups = (modules: string[], otherLabel: string): ModuleGroup[] => {
  const selected = new Set(modules);
  const claimed = new Set<string>();
  const groups: ModuleGroup[] = [];

  for (const [moduleKey, moduleConfig] of Object.entries(ACCESS_RULE_MODULES)) {
    const items: { key: string; label: string }[] = [];
    const parentSelected = selected.has(moduleKey);

    if (parentSelected) {
      claimed.add(moduleKey);
    }

    for (const child of moduleConfig.children) {
      if (selected.has(child)) {
        claimed.add(child);
        items.push({
          key: child,
          label: getAccessRuleChildLabel(child),
        });
      }
    }

    // Parent-only modules (e.g. Riders) still need a visible entry
    if (parentSelected && items.length === 0) {
      items.push({
        key: moduleKey,
        label: getAccessRuleModuleLabel(moduleKey),
      });
    }

    if (parentSelected || items.length > 0) {
      groups.push({
        key: moduleKey,
        label: getAccessRuleModuleLabel(moduleKey),
        items,
      });
    }
  }

  const orphans = modules.filter((m) => !claimed.has(m));
  if (orphans.length > 0) {
    groups.push({
      key: "__other__",
      label: otherLabel,
      items: orphans.map((key) => ({
        key,
        label: getAccessRuleChildLabel(key),
      })),
    });
  }

  return groups;
};

export const RoleModulesModal = ({ open, onClose, roleName, modules }: Props) => {
  const { t } = useTranslation(["admin", "common"]);
  const [searchTerm, setSearchTerm] = useState("");

  const groups = useMemo(
    () => buildGroups(modules ?? [], t("forms.otherModules")),
    [modules, t]
  );

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return groups;
    }

    return groups
      .map((group) => {
        const groupMatches = group.label.toLowerCase().includes(term);
        const items = groupMatches
          ? group.items
          : group.items.filter(
              (item) =>
                item.label.toLowerCase().includes(term) ||
                item.key.toLowerCase().includes(term)
            );
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, searchTerm]);

  const handleClose = () => {
    setSearchTerm("");
    onClose();
  };

  return (
    <Modal
      title={t("forms.roleModulesTitle", { name: roleName })}
      open={open}
      onClose={handleClose}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <div>
          <Input
            type="text"
            placeholder={t("forms.searchModules")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            autoFocus
          />
        </div>

        {modules.length === 0 ? (
          <div className="text-center text-neutral-500 py-8">
            {t("forms.noModulesAssigned")}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center text-neutral-500 py-8">
            {t("forms.noModulesFound", { term: searchTerm })}
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto space-y-4 pr-1">
            {filteredGroups.map((group) => (
              <div key={group.key} className="border border-neutral-200 rounded-lg overflow-hidden">
                <div className="bg-neutral-100 px-3 py-2 font-medium text-sm flex items-center justify-between">
                  <span>{group.label}</span>
                  <span className="text-neutral-500 text-xs font-normal">
                    {t("forms.moduleCount", { count: group.items.length })}
                  </span>
                </div>
                <div className="p-3 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span className="tag" key={item.key}>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
