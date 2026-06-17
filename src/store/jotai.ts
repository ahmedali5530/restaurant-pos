import {atomWithStorage, createJSONStorage, unwrap} from "jotai/utils";
import {atom} from 'jotai';
import {Dish} from "@/api/model/dish.ts";
import {Table} from "@/api/model/table.ts";
import {Category} from "@/api/model/category.ts";
import {ModifierGroup} from "@/api/model/modifier_group.ts";
import {Floor} from "@/api/model/floor.ts";
import {Customer} from "@/api/model/customer.ts";
import {Order} from "@/api/model/order.ts";
import {MenuItem} from "@/api/model/cart_item.ts";
import {OrderType} from "@/api/model/order_type.ts";
import {User} from "@/api/model/user.ts";
import {LabelValue} from "@/api/model/common.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {createStore, del, get, set} from 'idb-keyval'
import {PaymentType} from "@/api/model/payment_type.ts";
import {DishModifierGroup} from "@/api/model/dish_modifier_group.ts";
import {Menu} from "@/api/model/menu.ts";
import type {AppTextDirection} from "@/lib/languages.ts";


export interface AppStateInterface {
  loggedIn: boolean
  floor?: Floor
  table?: Table
  customer?: Customer
  orderType?: OrderType
  persons?: string
  category?: Category
  dish?: Dish
  order?: {
    id?: string | 'new'
    order?: Order
  }
  orders: Order[]
  showFloor?: boolean
  showPersons?: boolean
  cart: MenuItem[]
  seats: string[]
  seat?: string
  switchTable?: boolean
  hideTableSelection?: boolean
  ordersFilters: {
    users: LabelValue[]
    floors: LabelValue[]
    statuses: LabelValue[]
    orderTypes: LabelValue[]
  }
}

export const appState = atomWithStorage<AppStateInterface>(
  "app-state",
  {
    loggedIn: false,
    persons: '1',
    orders: [],
    showFloor: true,
    cart: [],
    seats: [],
    ordersFilters: {
      users: [],
      floors: [],
      statuses: [],
      orderTypes: [],
    }
  }
);

export interface AppPageInterface {
  page: string
  locked?: boolean
  lockedBy?: User
  user?: User
  touch?: boolean
  language?: string
  direction?: AppTextDirection
}

export const appPage = atomWithStorage<AppPageInterface>(
  "app-page",
  {
    page: "Login",
    touch: true,
    language: 'en',
    direction: 'ltr',
  }
);

const appStorageStore = createStore('posr-react', 'jotai-storage')

export const indexedDBStorage = {
  getItem: async (key: string) => {
    const storedValue = await get<string>(key, appStorageStore)
    if (storedValue !== undefined) {
      return storedValue
    }

    if (typeof window === 'undefined') {
      return null
    }

    const legacyValue = window.localStorage.getItem(key)
    if (legacyValue !== null) {
      await set(key, legacyValue, appStorageStore)
      window.localStorage.removeItem(key)
    }

    return legacyValue
  },
  setItem: async (key: string, value: string) => {
    await set(key, value, appStorageStore)
  },
  removeItem: async (key: string) => {
    await del(key, appStorageStore)
  },
}

export interface AppSettingsInterface {
  order_types: OrderType[]
  categories: Category[]
  dishes: Dish[]
  modifier_groups: ModifierGroup[]
  groups_dishes: DishModifierGroup[]
  floors: Floor[]
  tables: Table[]
  kitchens: Kitchen[]
  payment_types: PaymentType[]
  menus: Menu[]
}

const defaultAppSettings: AppSettingsInterface = {
  order_types: [],
  categories: [],
  modifier_groups: [],
  groups_dishes: [],
  floors: [],
  tables: [],
  kitchens: [],
  dishes: [],
  payment_types: [],
  menus: []
}

const normalizeAppSettings = (settings?: Partial<AppSettingsInterface>): AppSettingsInterface => ({
  ...defaultAppSettings,
  ...settings
})

const appSettingsStorageAtom = atomWithStorage<AppSettingsInterface>(
  'app-settings',
  defaultAppSettings,
  createJSONStorage<AppSettingsInterface>(() => indexedDBStorage),
  {getOnInit: true}
);

const appSettingsStorageAtomUnwrapped = unwrap(
  appSettingsStorageAtom, () => defaultAppSettings
)

export const appSettings = atom(
  (get) => normalizeAppSettings(get(appSettingsStorageAtomUnwrapped)),
  (
    get,
    set,
    update: AppSettingsInterface | ((prev: AppSettingsInterface) => AppSettingsInterface)
  ) => {
    const current = normalizeAppSettings(get(appSettingsStorageAtomUnwrapped))
    const nextValue =
      typeof update === 'function' ? update(current) : update

    set(appSettingsStorageAtom, normalizeAppSettings(nextValue))
  }
);

export interface AppAlertInterface {
  opened: boolean
  message: string
  type: "info" | "error" | "warning" | "success"
}

export const appAlert = atom<AppAlertInterface>({
  opened: false,
  message: '',
  type: 'info'
})

export const defaultClosingEnforcementState = {
  orderTakingBlocked: false,
  orderMutationsBlocked: false,
  cycleEndedAt: null as Date | null,
  dayClosingCompleted: false,
  message: null as string | null,
};

export type ClosingEnforcementAtomState = typeof defaultClosingEnforcementState;

export const closingEnforcementAtom = atom<ClosingEnforcementAtomState>(defaultClosingEnforcementState);