import {useDB} from "@/api/db/db.ts";
import {toRecordId} from "@/lib/utils.ts";

export const useFetchRow = () => {
  const db = useDB();
  const fetchRow = async (id: string, fetches: string[] = []) => {
    const [result] = await db.query(`SELECT * FROM ONLY ${toRecordId(id)} ${fetches.length > 0 ? `FETCH ${fetches.join(', ')}` : ''}`);

    return result;
  }

  return {
    fetchRow
  }
}