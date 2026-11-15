/**
 * POS displays tables as `${name}${number}` (e.g. name "F" + number "1" → "F1").
 * Models often put the full label in both fields ("F1"/"F1" → "F1F1"). Repair that.
 */
export function normalizeTableNameAndNumber(
  nameInput: unknown,
  numberInput: unknown,
): {name: string; number: string} {
  let name = String(nameInput ?? "").trim();
  let number = String(numberInput ?? "").trim();

  if (!name && !number) {
    return {name, number};
  }

  // Identical full labels: "F1"/"F1" → name "F", number "1"
  if (name && number && name === number) {
    const match = name.match(/^(.*\D)(\d+)$/);
    if (match) {
      return {name: match[1], number: match[2]};
    }
  }

  // name already includes number suffix: "F1"/"1" → name "F", number "1"
  if (name && number && name.endsWith(number) && name.length > number.length) {
    const prefix = name.slice(0, -number.length);
    if (prefix && /\D$/.test(prefix)) {
      return {name: prefix, number};
    }
  }

  // number is the full label and name is only the prefix: "F"/"F1" → name "F", number "1"
  if (name && number && number.startsWith(name) && number.length > name.length) {
    const suffix = number.slice(name.length);
    if (/^\d+$/.test(suffix)) {
      return {name, number: suffix};
    }
  }

  return {name, number};
}
