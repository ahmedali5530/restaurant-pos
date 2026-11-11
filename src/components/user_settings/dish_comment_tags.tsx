import {useEffect, useMemo, useState} from "react";
import {Controller, useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Setting} from "@/api/model/setting.ts";
import {
  DEFAULT_DISH_COMMENT_TAGS,
  DISH_COMMENT_TAGS_KEY,
  type DishCommentTagsSettings,
  normalizeDishCommentTags,
} from "@/api/model/dish_comment_tags.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";

type TagOption = {label: string; value: string};

interface FormValues {
  tags: TagOption[];
}

export const DishCommentTagsSettingsCard = () => {
  const db = useDB();
  const {t} = useTranslation(["settings", "common"]);
  const {protectFormSubmit} = useSecurity();
  const [settings, setSettings] = useState<Setting>();

  const {control, handleSubmit, reset} = useForm<FormValues>({
    defaultValues: {tags: []},
  });

  const loadSettings = async () => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      {key: DISH_COMMENT_TAGS_KEY},
    );
    setSettings((rows as Setting[] | undefined)?.[0]);
  };

  const saveSettings = async (values: FormValues) => {
    const payload: DishCommentTagsSettings = {
      tags: normalizeDishCommentTags({
        tags: (values.tags || []).map((opt) => opt.value),
      }),
    };

    if (settings?.id) {
      await db.merge(settings.id, {values: payload});
    } else {
      await db.create(Tables.settings, {
        key: DISH_COMMENT_TAGS_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t("settings:dishCommentTags.updated"));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    const tags = normalizeDishCommentTags({
      ...DEFAULT_DISH_COMMENT_TAGS,
      ...(settings?.values as DishCommentTagsSettings | undefined),
    });
    reset({
      tags: tags.map((tag) => ({label: tag, value: tag})),
    });
  }, [settings, reset]);

  const createOption = useMemo(
    () => (input: string): TagOption => {
      const value = input.trim();
      return {label: value, value};
    },
    [],
  );

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-dish-comment-tags">
      <h2 className="text-xl font-semibold mb-1">{t("settings:dishCommentTags.title")}</h2>
      <p className="text-sm text-muted mb-5">
        {t("settings:dishCommentTags.description")}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: "settings.dish_comment_tags",
          description: t("settings:dishCommentTags.saveDescription"),
        })}
      >
        <div className="mb-5">
          <label className="block text-sm font-medium mb-2">
            {t("settings:dishCommentTags.tagsLabel")}
          </label>
          <Controller
            name="tags"
            control={control}
            render={({field}) => (
              <div>
                <ReactSelect
                  creatable
                  isMulti
                  isClearable
                  options={field.value || []}
                  value={field.value || []}
                  onChange={(opts) => field.onChange(opts || [])}
                  onBlur={field.onBlur}
                  placeholder={t("settings:dishCommentTags.placeholder")}
                  formatCreateLabel={(input) =>
                    t("settings:dishCommentTags.createTag", {tag: input.trim()})
                  }
                  getNewOptionData={(input) => createOption(input)}
                  noOptionsMessage={() => t("settings:dishCommentTags.noOptions")}
                />
              </div>
            )}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          {t("common:actions.save")}
        </button>
      </form>
    </div>
  );
};
