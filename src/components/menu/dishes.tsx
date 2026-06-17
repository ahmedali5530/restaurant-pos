import {Swiper, SwiperSlide} from "swiper/react";
import _ from "lodash";
import {cn} from "@/lib/utils.ts";
import {useAtom} from "jotai";
import {appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {useEffect, useMemo} from "react";
import {useMediaQuery} from "react-responsive";
import {MenuDish} from "@/components/menu/dish.tsx";
import {CartModifierGroup, MenuItem} from "@/api/model/cart_item.ts";
import {resolveMenuAwareData} from "@/lib/menu.resolver.ts";
import {toast} from "sonner";
import i18n from "@/lib/i18n.ts";

export const MenuDishes = () => {
  const isTablet = useMediaQuery({maxWidth: 1024});

  const ITEMS_PER_SLIDE = useMemo(() => {
    return isTablet ? 15 : 20;
  }, [isTablet]);

  const [state, setState] = useAtom(appState);
  const [settings] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const orderTakingBlocked = enforcement.orderTakingBlocked;
  const {dishes: allDishes} = useMemo(() => (
    resolveMenuAwareData({
      categories: settings.categories,
      dishes: settings.dishes,
      menus: settings.menus
    })
  ), [settings.categories, settings.dishes, settings.menus]);

  const dishes = useMemo(() => {
    if (state.category) {
      return allDishes?.filter(item =>
        item.categories.filter(cat => cat.id.toString() === state?.category?.id.toString()).length > 0
      );
    }

    return allDishes || [];
  }, [allDishes, state.category]);

  const slides = Math.ceil(dishes?.length / (ITEMS_PER_SLIDE));

  const onClick = (item: MenuItem, selectedGroups?: CartModifierGroup[]) => {
    if (orderTakingBlocked) {
      toast.warning(enforcement.message ?? i18n.t('closing:orderTakingDisabled'));
      return;
    }

    setState(prev => ({
      ...prev,
      cart: [
        {
          ...item,
          selectedGroups
        },
        ...prev.cart,
      ]
    }));
  }

  useEffect(() => {
    return () => {
      setState(prev => ({
        ...prev,
        category: undefined
      }))
    }
  }, []);

  return (
    <>
      <Swiper
        slidesPerView={1}
        className={cn("dishes-swiper", orderTakingBlocked && "opacity-50 pointer-events-none")}
        direction="vertical"
      >
        {_.range(0, slides).map(rowId => (
          <SwiperSlide
            key={rowId}
            className={cn(
              "!grid sm:grid-cols-3 md:grid-cols-4 md:grid-rows-5 sm:grid-rows-4"
            )}
          >
            {dishes.slice(rowId * ITEMS_PER_SLIDE, ((rowId * ITEMS_PER_SLIDE) + ITEMS_PER_SLIDE)).map((item, index) => (
              <MenuDish
                onClick={onClick}
                item={item}
                key={index}
                level={0}
                price={item.price}
              />
            ))}
          </SwiperSlide>
        ))}
      </Swiper>
    </>
  )
}
