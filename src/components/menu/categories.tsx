import { cn } from "@/lib/utils.ts";
import { useAtom } from "jotai";
import { appSettings, appState } from "@/store/jotai.ts";
import ScrollContainer from 'react-indiana-drag-scroll'
import {CSSProperties, useEffect, useMemo} from "react";
import {resolveMenuAwareData} from "@/lib/menu.resolver.ts";


export const MenuCategories = () => {
  const [settings] = useAtom(appSettings);
  const [state, setState] = useAtom(appState);

  const {categories} = useMemo(() => (
    resolveMenuAwareData({
      categories: settings.categories,
      dishes: settings.dishes,
      menus: settings.menus
    })
  ), [settings.categories, settings.dishes, settings.menus]);

  useEffect(() => {
    const currentCategoryExists = categories.some(
      category => category.id?.toString() === state.category?.id?.toString()
    );

    if (categories.length > 0 && (!state.category || !currentCategoryExists)) {
      setState(prev => ({
        ...prev,
        category: categories[0]
      }));
      return;
    }

    if (categories.length === 0 && state.category) {
      setState(prev => ({
        ...prev,
        category: undefined
      }));
    }
  }, [categories, state.category]);

  const categoryClasses = 'flex-auto whitespace-nowrap !h-[56px] pressable rounded-full px-5';
  const categoryStyles = {
    '--padding': '0 1.25rem'
  } as CSSProperties;

  return (
    <ScrollContainer className="flex flex-row gap-1 p-1" mouseScroll>
      {categories.map((item, index) => (
        <button
          key={index}
          className={cn(
            categoryClasses,
            state?.category?.id?.toString() === item?.id?.toString() ? 'bg-gradient' : 'bg-white border-3 border-transparent select-none'
          )}
          onClick={() => setState(prev => ({
            ...prev,
            category: item
          }))}
          style={categoryStyles}
        >
          {item.name}
        </button>
      ))}
    </ScrollContainer>
  )
}
