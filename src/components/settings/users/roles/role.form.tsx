import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Resolver, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { ACCESS_RULE_MODULES, normalizeModules } from "@/lib/access.rules.ts";
import { getAccessRuleChildLabel, getAccessRuleModuleLabel } from "@/lib/access.rules.i18n.ts";
import { Checkbox } from "@/components/common/input/checkbox.tsx";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
  data?: UserRole;
}

type ChildItem = {
  key: string;
  label: string;
};

type ModuleCatalogItem = {
  key: string;
  label: string;
  children: ChildItem[];
};

interface ModuleCheckboxProps {
  module: ModuleCatalogItem;
  selectedSet: Set<string>;
  onChange: (modules: string[]) => void;
  searchTerm: string;
  expanded: boolean;
  onToggleExpand: (moduleKey: string) => void;
}

const moduleSelectionEqual = (
  prev: ModuleCheckboxProps,
  next: ModuleCheckboxProps
): boolean => {
  if (prev.searchTerm !== next.searchTerm) return false;
  if (prev.expanded !== next.expanded) return false;
  if (prev.module !== next.module) return false;
  if (prev.onChange !== next.onChange) return false;
  if (prev.onToggleExpand !== next.onToggleExpand) return false;

  if (prev.selectedSet.has(prev.module.key) !== next.selectedSet.has(next.module.key)) {
    return false;
  }

  for (const child of prev.module.children) {
    if (prev.selectedSet.has(child.key) !== next.selectedSet.has(child.key)) {
      return false;
    }
  }

  return true;
};

const ModuleCheckbox = memo(function ModuleCheckbox({
  module,
  selectedSet,
  onChange,
  searchTerm,
  expanded,
  onToggleExpand,
}: ModuleCheckboxProps) {
  const term = searchTerm.trim().toLowerCase();
  const isChecked = selectedSet.has(module.key);
  const hasChildren = module.children.length > 0;

  const filteredChildren = term
    ? module.children.filter(
        (child) =>
          child.label.toLowerCase().includes(term) ||
          child.key.toLowerCase().includes(term) ||
          module.label.toLowerCase().includes(term)
      )
    : module.children;

  const matchesSearch =
    !term ||
    module.label.toLowerCase().includes(term) ||
    module.key.toLowerCase().includes(term) ||
    filteredChildren.length > 0;

  if (!matchesSearch) {
    return null;
  }

  const showChildren = hasChildren && (expanded || !!term);
  const visibleChildren = term ? filteredChildren : module.children;

  const handleModuleChange = (checked: boolean) => {
    if (checked) {
      const next = new Set(selectedSet);
      next.add(module.key);
      module.children.forEach((c) => next.add(c.key));
      onChange([...next]);
    } else {
      const remove = new Set([module.key, ...module.children.map((c) => c.key)]);
      onChange([...selectedSet].filter((m) => !remove.has(m)));
    }
  };

  const handleChildChange = (child: string, checked: boolean) => {
    const next = new Set(selectedSet);

    if (checked) {
      next.add(child);
      next.add(module.key);
      const parts = child.split(".");
      if (parts.length >= 3) {
        next.add(`${parts[0]}.${parts[1]}`);
      }
    } else {
      next.delete(child);
    }

    onChange([...next]);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {hasChildren && !term && (
          <button
            type="button"
            className="w-5 h-5 flex items-center justify-center text-neutral-500 hover:text-neutral-800 shrink-0"
            onClick={() => onToggleExpand(module.key)}
            aria-expanded={expanded}
          >
            <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} size="sm" />
          </button>
        )}
        {(term || !hasChildren) && <span className="w-5 shrink-0" />}
        <Checkbox
          type="checkbox"
          id={`role-module-${module.key}`}
          checked={isChecked}
          onChange={(e) => handleModuleChange(e.currentTarget.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          label={module.label}
        />
      </div>

      {showChildren && (
        <div className="mt-2 space-y-2 ml-11">
          {visibleChildren.map((child) => (
            <div key={child.key} className="flex items-center space-x-2">
              <Checkbox
                type="checkbox"
                id={`role-perm-${child.key}`}
                checked={selectedSet.has(child.key)}
                onChange={(e) => handleChildChange(child.key, e.currentTarget.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                label={child.label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}, moduleSelectionEqual);

type RoleFormValues = {
  name: string;
  roles: string[];
};

const buildModuleCatalog = (): ModuleCatalogItem[] =>
  Object.entries(ACCESS_RULE_MODULES).map(([key, config]) => ({
    key,
    label: getAccessRuleModuleLabel(key),
    children: config.children.map((child) => ({
      key: child,
      label: getAccessRuleChildLabel(child),
    })),
  }));

export const UserRoleForm = ({ open, onClose, data }: Props) => {
  const db = useDB();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set());
  const { t, i18n } = useTranslation(["admin", "common", "validation", "toast"]);

  const validationSchema = useMemo(
    () =>
      yup.object({
        name: yup.string().required(t("validation:required")),
        roles: yup.array().of(yup.string()).default([]).min(1, t("validation:required")),
      }),
    [t]
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    clearErrors,
  } = useForm<RoleFormValues>({
    resolver: yupResolver(validationSchema) as Resolver<RoleFormValues>,
    defaultValues: {
      name: "",
      roles: [],
    },
  });

  const language = i18n.language;
  const moduleCatalog = useMemo(
    () => (open ? buildModuleCatalog() : []),
    [open, language]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const setRoles = useCallback(
    (modules: string[]) => {
      setSelectedSet(new Set(modules));
      setValue("roles", modules, { shouldDirty: true, shouldValidate: false });
      if (modules.length > 0) {
        clearErrors("roles");
      }
    },
    [setValue, clearErrors]
  );

  const onToggleExpand = useCallback((moduleKey: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) {
        next.delete(moduleKey);
      } else {
        next.add(moduleKey);
      }
      return next;
    });
  }, []);

  const closeModal = () => {
    onClose();
    reset({
      name: "",
      roles: [],
    });
    setSelectedSet(new Set());
    setSearchTerm("");
    setDebouncedSearch("");
    setExpandedModules(new Set());
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    if (data) {
      const roles = normalizeModules(data.roles ?? []);
      reset({
        name: data.name ?? "",
        roles,
      });
      setSelectedSet(new Set(roles));
    } else {
      reset({
        name: "",
        roles: [],
      });
      setSelectedSet(new Set());
    }
    setSearchTerm("");
    setDebouncedSearch("");
    setExpandedModules(new Set());
  }, [data, reset, open]);

  const filteredModules = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) {
      return moduleCatalog;
    }

    return moduleCatalog.filter((module) => {
      if (module.label.toLowerCase().includes(term) || module.key.toLowerCase().includes(term)) {
        return true;
      }
      return module.children.some(
        (child) =>
          child.label.toLowerCase().includes(term) || child.key.toLowerCase().includes(term)
      );
    });
  }, [moduleCatalog, debouncedSearch]);

  const onSubmit = async (values: RoleFormValues) => {
    const payload = {
      name: values.name,
      roles: values.roles,
      ...(data?.id != null ? { id: data.id } : {}),
    };

    try {
      if (data?.id != null) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.user_roles, payload);
      }
      closeModal();
      toast.success(t("toast:admin.roleSaved", { name: values.name }));
    } catch (e) {
      toast.error(String(e));
      console.log(e);
    }
  };

  return (
    <Modal
      title={data ? t("forms.updateRole", { name: data.name }) : t("forms.createRole")}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <InputField
              name="name"
              control={control}
              label={t("forms.roleName")}
              autoFocus
              error={errors?.name?.message}
            />
          </div>
        </div>

        <div className="flex-1">
          <label>{t("forms.modules")}</label>
          {errors?.roles?.message != null && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {String(errors.roles.message)}
            </p>
          )}

          <div className="mt-2 mb-4">
            <Input
              type="text"
              placeholder={t("forms.searchModules")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
            {filteredModules.map((module) => (
              <ModuleCheckbox
                key={module.key}
                module={module}
                selectedSet={selectedSet}
                onChange={setRoles}
                searchTerm={debouncedSearch}
                expanded={expandedModules.has(module.key)}
                onToggleExpand={onToggleExpand}
              />
            ))}

            {debouncedSearch.trim() && filteredModules.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                {t("forms.noModulesFound", { term: debouncedSearch })}
              </div>
            )}
          </div>
        </div>

        <div>
          <Button type="submit" variant="primary">
            {t("common:actions.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
