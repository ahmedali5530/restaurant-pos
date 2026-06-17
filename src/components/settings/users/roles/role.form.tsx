import React, { useEffect, useMemo, useState } from "react";
import { Resolver, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { toast } from "sonner";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { ACCESS_RULE_MODULES, AccessRuleModule } from "@/lib/access.rules.ts";
import { getAccessRuleChildLabel, getAccessRuleModuleLabel } from "@/lib/access.rules.i18n.ts";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';

interface Props {
  open: boolean
  onClose: () => void
  data?: UserRole
}

interface ModuleCheckboxProps {
  module: string;
  moduleConfig: AccessRuleModule;
  level: number;
  selectedModules: string[];
  onChange: (modules: string[]) => void;
  searchTerm?: string;
}

const ModuleCheckbox: React.FC<ModuleCheckboxProps> = ({ 
  module, 
  moduleConfig, 
  level, 
  selectedModules, 
  onChange,
  searchTerm = ""
}) => {
  const isChecked = selectedModules.includes(module);
  const hasChildren = moduleConfig.children.length > 0;

  // Filter children based on search term
  const filteredChildren = moduleConfig.children.filter(child => 
    getAccessRuleChildLabel(child).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getAccessRuleModuleLabel(module).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if this module or any of its children match the search
  const matchesSearch = 
    getAccessRuleModuleLabel(module).toLowerCase().includes(searchTerm.toLowerCase()) ||
    filteredChildren.length > 0;

  // If there's a search term and nothing matches, don't render this module
  if (searchTerm && !matchesSearch) {
    return null;
  }

  const handleModuleChange = (checked: boolean) => {
    if (checked) {
      const next = new Set(selectedModules);
      next.add(module);
      moduleConfig.children.forEach((c) => next.add(c));
      onChange([...next]);
    } else {
      const remove = new Set([module, ...moduleConfig.children]);
      onChange(selectedModules.filter((m) => !remove.has(m)));
    }
  };

  const handleChildChange = (child: string, checked: boolean) => {
    let newModules = [...selectedModules];
    
    if (checked) {
      newModules.push(child);
      // Ensure parent is selected when child is selected
      if (!newModules.includes(module)) {
        newModules.push(module);
      }
    } else {
      newModules = newModules.filter(m => m !== child);
    }
    
    onChange(newModules);
  };

  return (
    <div className={`${level === 0 ? '' : 'ml-6'}`}>
      <div className="flex items-center space-x-2 mb-2">
        <Checkbox
          type="checkbox"
          id={module}
          checked={isChecked}
          onChange={(e) => handleModuleChange(e.currentTarget.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          label={getAccessRuleModuleLabel(module)}
        />
      </div>
      
      {hasChildren && (
        <div className="mt-2 space-y-2">
          {(searchTerm ? filteredChildren : moduleConfig.children).map((child) => (
            <div key={child} className="flex items-center space-x-2 ml-4">
              <Checkbox
                type="checkbox"
                id={child}
                checked={selectedModules.includes(child)}
                onChange={(e) => handleChildChange(child, e.currentTarget.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                label={getAccessRuleChildLabel(child)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

type RoleFormValues = {
  name: string;
  roles: string[];
};

export const UserRoleForm = ({ open, onClose, data }: Props) => {
  const db = useDB();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const validationSchema = useMemo(() => yup.object({
    name: yup.string().required(t('validation:required')),
    roles: yup.array().of(yup.string()).default([]).min(1, t('validation:required')),
  }), [t]);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<RoleFormValues>({
    resolver: yupResolver(validationSchema) as Resolver<RoleFormValues>,
    defaultValues: {
      name: "",
      roles: [],
    },
  });

  const selectedModules = watch("roles") ?? [];

  const setRoles = (modules: string[]) => {
    setValue("roles", modules, { shouldValidate: true, shouldDirty: true });
  };

  const closeModal = () => {
    onClose();
    reset({
      name: "",
      roles: [],
    });
    setSearchTerm("");
  };

  useEffect(() => {
    if (data) {
      reset({
        name: data.name ?? "",
        roles: data.roles ?? [],
      });
    } else {
      reset({
        name: "",
        roles: [],
      });
    }
  }, [data, reset]);

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
      toast.success(t('toast:admin.roleSaved', { name: values.name }));
    } catch (e) {
      toast.error(String(e));
      console.log(e);
    }
  };

  return (
    <Modal
      title={data ? t('forms.updateRole', { name: data.name }) : t('forms.createRole')}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <Input label={t('forms.roleName')} {...register("name")} autoFocus error={errors?.name?.message} />
          </div>
        </div>
        
        <div className="flex-1">
          <label>{t('forms.modules')}</label>
          {errors?.roles?.message != null && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {String(errors.roles.message)}
            </p>
          )}
          
          {/* Search Box */}
          <div className="mt-2 mb-4">
            <Input
              type="text"
              placeholder={t('forms.searchModules')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          
          {/* Module Checkboxes */}
          <div className="space-y-3 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
            {Object.entries(ACCESS_RULE_MODULES).map(([module, moduleConfig]) => (
              <ModuleCheckbox
                key={module}
                module={module}
                moduleConfig={moduleConfig}
                level={0}
                selectedModules={selectedModules}
                onChange={setRoles}
                searchTerm={searchTerm}
              />
            ))}
            
            {searchTerm && Object.entries(ACCESS_RULE_MODULES).every(([moduleKey, moduleConfig]) => {
              const matchesSearch = 
                getAccessRuleModuleLabel(moduleKey).toLowerCase().includes(searchTerm.toLowerCase()) ||
                moduleConfig.children.some(child => 
                  getAccessRuleChildLabel(child).toLowerCase().includes(searchTerm.toLowerCase())
                );
              return !matchesSearch;
            }) && (
              <div className="text-center text-gray-500 py-4">
                {t('forms.noModulesFound', { term: searchTerm })}
              </div>
            )}
          </div>
        </div>
        
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};
