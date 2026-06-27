import type {RecordId} from "surrealdb";
import type {Account} from "./account";
import type {AccountJournalEntry} from "./account.journal.entry";

export interface AccountJournalLine {
  id: RecordId | string;
  entry: AccountJournalEntry;
  account: Account;
  debit: number;
  credit: number;
  description?: string;
  created_at?: Date;
}
