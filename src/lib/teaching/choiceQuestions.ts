const optionPrefix = /^\s*[A-L](?:[.、:：)）]|\s+)\s*/i;

export function choiceKey(index: number) {
  return String.fromCharCode(65 + index);
}

export function choiceText(option: string) {
  return option.replace(optionPrefix, "").trim();
}

export function choiceLabel(option: string, index: number) {
  return `${choiceKey(index)}. ${choiceText(option)}`;
}

function splitMultiple(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const delimited = trimmed.split(/[,，、;；]+/).map((item) => item.trim()).filter(Boolean);
  if (delimited.length > 1) return delimited;
  if (/^[A-L](?:\s+[A-L])+$/i.test(trimmed)) return trimmed.split(/\s+/);
  return [trimmed];
}

export function normalizeChoiceValue(value: string, options: string[]) {
  const normalized = value.trim();
  const upper = normalized.toUpperCase();
  const keys = options.map((_, index) => choiceKey(index));
  if (keys.includes(upper)) return upper;
  const matchingIndex = options.findIndex((option) => {
    const text = choiceText(option);
    return option.trim().toLocaleUpperCase() === upper || text.toLocaleUpperCase() === upper;
  });
  return matchingIndex >= 0 ? choiceKey(matchingIndex) : upper;
}

export function normalizeChoiceAnswer(value: string, options: string[], multiple = false) {
  if (!multiple) return normalizeChoiceValue(value, options);
  const direct = normalizeChoiceValue(value, options);
  if (options.some((_, index) => choiceKey(index) === direct)) return direct;
  return [...new Set(splitMultiple(value).map((item) => normalizeChoiceValue(item, options)).filter(Boolean))]
    .sort()
    .join(",");
}

export function isValidChoiceAnswer(value: string, options: string[], multiple = false) {
  const validKeys = new Set(options.map((_, index) => choiceKey(index)));
  const normalized = normalizeChoiceAnswer(value, options, multiple);
  const values = normalized.split(",").filter(Boolean);
  return values.length > 0 && values.every((item) => validKeys.has(item));
}
