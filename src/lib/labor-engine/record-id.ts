import type {User} from '@/api/model/user.ts';
import {toRecordId} from '@/lib/utils.ts';

export const toUserRecordId = (user?: User | null) =>
  user?.id ? toRecordId(user.id) : null;

export const toEntityRecordId = (id?: string | null) =>
  id ? toRecordId(id) : null;
