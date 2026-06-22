import {DateTime} from "surrealdb";
import {Recipe} from "@/api/model/recipe.ts";
import {User} from "@/api/model/user.ts";

export type BuffetSessionType = "breakfast" | "lunch" | "dinner";

export interface BuffetMenu {
  id: string;
  name: string;
  code?: string;
  session_type: BuffetSessionType;
  is_active: boolean;
  notes?: string;
  created_at: DateTime;
  created_by: User;
  items?: BuffetMenuItem[];
}

export interface BuffetMenuItem {
  id: string;
  menu: BuffetMenu;
  recipe: Recipe;
  per_guest_qty: number;
  sort_order: number;
}
