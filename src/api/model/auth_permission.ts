import {User} from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export interface AuthPermission {
  id: string
  token: string

  created_by: User
  created_at: DateTime

  approved_by?: User
  approved_at?: DateTime

  title: string
  payload?: any

  state: AuthState
}

export enum AuthState {
  pending = 'pending',
  approved = 'approved',
  rejected = 'rejected'
}