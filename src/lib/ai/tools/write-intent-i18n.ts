/**
 * Multilingual write-intent and entity keywords for assistant tool routing.
 * Matches verbs/terms from supported UI locales (en, tr, de, es, fr, it, nl, pt-br, ru).
 */

const WRITE_INTENT_VERBS = [
  // English
  "add", "create", "new", "update", "change", "modify", "set", "edit",
  "raise", "lower", "increase", "decrease", "rename", "assign", "attach", "hire", "import",
  "remove", "delete", "detach",
  // Turkish
  "ekle", "oluştur", "yeni", "güncelle", "değiştir", "düzenle", "ata", "kaydet",
  // German
  "hinzufügen", "erstellen", "neu", "neue", "neuer", "neues", "aktualisieren", "ändern", "bearbeiten",
  // Spanish
  "añadir", "agregar", "crear", "nuevo", "nueva", "actualizar", "cambiar", "modificar", "editar",
  // French
  "ajouter", "créer", "nouveau", "nouvelle", "mettre", "modifier", "éditer",
  // Italian
  "aggiungi", "aggiungere", "crea", "creare", "nuovo", "nuova", "aggiorna", "aggiornare", "modifica",
  // Dutch
  "toevoegen", "maken", "nieuw", "nieuwe", "bijwerken", "wijzigen", "bewerken",
  // Portuguese
  "adicionar", "criar", "novo", "nova", "atualizar", "alterar", "editar",
  // Russian
  "добавить", "создать", "новый", "новая", "новое", "обновить", "изменить",
].join("|");

/** True when the prompt asks to create or update master data (any supported language). */
export const WRITE_INTENT_PATTERN = new RegExp(`(?:^|[^\\p{L}])(${WRITE_INTENT_VERBS})(?:[^\\p{L}]|$)`, "iu");

export const DISH_WRITE_KEYWORDS =
  /(\b(dish|dishes|menu item|menu items|yemek|yemeği|yemekler|gericht|gerichte|plato|platos|piatto|piatti|prato|pratos|блюдо|блюда)\b)|menü\s*(kalemi|öğesi|ürünü)|menu\s*(item|items)/iu;

export const CATEGORY_WRITE_KEYWORDS =
  /(\b(categor(?:y|ies)|kategori|kategoriler|categoría|categorías|catégorie|catégories|categoria|categorie|kategorie|kategorien|categoria|categorias)\b)|menü\s*kategorisi/iu;

export const DISCOUNT_WRITE_KEYWORDS =
  /\b(discount|discounts|indirim|indirimler|rabatt|rabatte|descuento|descuentos|remise|remises|sconto|sconti|скидк\w*)\b|buy.?x.?get.?y|bxgy|buy \d+ get \d+/iu;

export const TABLE_WRITE_KEYWORDS =
  /\b(table|tables|masa|masalar|tisch|tische|mesa|mesas|tableau|tables)\b/iu;
