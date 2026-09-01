import {User} from "@/api/model/user.ts";

export interface Setting {
  id: string
  key: string
  values: any
  is_global?: boolean
  user?: User
}