import type {RecordId} from "surrealdb";
import type {User} from "./user";
import type {AccountJournalLine} from "./account.journal.line";
import type {Document} from "./document";

export interface AccountJournalEntry {
  id: RecordId | string;
  entry_number: number;
  date: Date | string;
  memo?: string;
  source_module?: string;
  source_id?: string;
  created_by?: User;
  posted: boolean;
  lines?: AccountJournalLine[];
  documents?: Document[];
  created_at?: Date;
  updated_at?: Date;
}
