export interface Tracking{
  id: string
  auth_method?: string
  coords?: object
  created_at: Date
  manager?: string
  manager_role?: string
  module?: string
  page?: string
  resolution?: string
  user?: string
  user_agent?: string
  user_role?: string
  user_shift?: string
  payload?: any
}