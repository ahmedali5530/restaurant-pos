import {useDB} from "@/api/db/db.ts";
import {useState} from "react";
import {Setting} from "@/api/model/setting.ts";
import {Tables} from "@/api/db/tables.ts";

export const useFetchSettings = (key: string, is_global?: boolean) => {
  const db = useDB();
  const [s, setS] = useState<Setting>();
  const [isLoading, setLoading] = useState(false);

  const fetchSettings = async () => {
    let globalQuery = '';
    if(is_global){
      globalQuery = ' and is_global = true';
    }
    const [setting] = await db.query(`SELECT * FROM ${Tables.settings} where key = $key ${globalQuery}`, {
      key
    });

    setS(setting[0]);
  }

  return {
    setting: s,
    loading: isLoading
  }
}