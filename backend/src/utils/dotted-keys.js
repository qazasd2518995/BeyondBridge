const LEGACY_NESTED_ATTRIBUTE_ROOTS = ['stats', 'settings'];

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }

  return value;
}

function splitDottedPath(key) {
  if (typeof key !== 'string' || !key.includes('.')) {
    return null;
  }

  const segments = key.split('.');
  if (segments.length < 2 || segments.some(segment => segment.length === 0)) {
    return null;
  }

  return segments;
}

function setNestedValue(target, pathSegments, value) {
  if (!isPlainObject(target) || !Array.isArray(pathSegments) || pathSegments.length === 0) {
    return target;
  }

  let current = target;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    if (!isPlainObject(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[pathSegments[pathSegments.length - 1]] = value;
  return target;
}

function normalizeDottedUpdateMap(updates = {}, currentItem = {}) {
  const normalized = {};
  const dottedEntries = [];

  Object.entries(updates).forEach(([key, value]) => {
    const path = splitDottedPath(key);
    if (!path) {
      normalized[key] = value;
      return;
    }

    dottedEntries.push({ key, path, value });
  });

  if (dottedEntries.length === 0) {
    return {
      updates: { ...updates },
      legacyKeys: []
    };
  }

  dottedEntries.forEach(({ path }) => {
    const [root] = path;
    if (Object.prototype.hasOwnProperty.call(normalized, root)) {
      if (!isPlainObject(normalized[root])) {
        normalized[root] = {};
      }
      return;
    }

    const source = Object.prototype.hasOwnProperty.call(updates, root)
      ? updates[root]
      : currentItem?.[root];

    normalized[root] = isPlainObject(source) ? cloneValue(source) : {};
  });

  dottedEntries.forEach(({ path, value }) => {
    const [root, ...nestedPath] = path;
    setNestedValue(normalized[root], nestedPath, value);
  });

  return {
    updates: normalized,
    legacyKeys: dottedEntries.map(entry => entry.key)
  };
}

function normalizeLegacyDottedAttributes(item, options = {}) {
  if (!item || typeof item !== 'object') {
    return { item, changed: false, legacyKeys: [] };
  }

  const {
    allowedRoots = LEGACY_NESTED_ATTRIBUTE_ROOTS
  } = options;

  const normalizedItem = cloneValue(item);
  const legacyKeys = [];

  Object.keys(item).forEach((key) => {
    const path = splitDottedPath(key);
    if (!path) return;
    if (Array.isArray(allowedRoots) && allowedRoots.length > 0 && !allowedRoots.includes(path[0])) {
      return;
    }

    const [root, ...nestedPath] = path;
    if (!isPlainObject(normalizedItem[root])) {
      normalizedItem[root] = {};
    }

    setNestedValue(normalizedItem[root], nestedPath, item[key]);
    delete normalizedItem[key];
    legacyKeys.push(key);
  });

  return {
    item: normalizedItem,
    changed: legacyKeys.length > 0,
    legacyKeys
  };
}

module.exports = {
  LEGACY_NESTED_ATTRIBUTE_ROOTS,
  isPlainObject,
  cloneValue,
  splitDottedPath,
  setNestedValue,
  normalizeDottedUpdateMap,
  normalizeLegacyDottedAttributes
};
