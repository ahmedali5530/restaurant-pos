import {useCallback, useEffect, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {getRecipe} from "@/lib/inventory/production.service.ts";

export const useProductionRecipe = (recipeId: string | null) => {
  const db = useDB();
  const dbRef = useRef(db);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const load = useCallback(async () => {
    if (!recipeId) {
      setRecipe(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getRecipe(dbRef.current, recipeId);
      setRecipe(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipe");
      setRecipe(null);
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    load();
  }, [load]);

  return {recipe, loading, error, reload: load};
};
