export type Nullish = null | undefined;
export type Nullable<T> = T | Nullish;

export function isDefined<T>(value: Nullable<T>): value is T {
  return value !== null && value !== undefined;
}

export function isNullish<T>(value: Nullable<T>): value is Nullish {
  return value === null || value === undefined;
}

export function isString(value: Nullable<unknown>): value is string {
  return typeof value === 'string';
}

export function isEmptyString(value: Nullable<unknown>): value is string {
  return typeof value === 'string' && value.trim() === '';
}

export function isNonEmptyString(value: Nullable<unknown>): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function isFunction(value: Nullable<unknown>): value is (...args: any[]) => any {
  return typeof value === 'function';
}

export function isEmpty<T>(value: Nullable<T>) {
  if (isNullish(value)) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Set) return value.size === 0;

  switch (typeof value) {
    case 'string':
      return value.trim() === '';

    case 'bigint':
    case 'number':
      return value == 0;
    case 'boolean':
      return value === false;
    case 'undefined':
      return true;
    case 'object': {
      const propertyNames = Object.getOwnPropertyNames(value);
      const propertySymbols = Object.getOwnPropertySymbols(value);
      return [...propertyNames, ...propertySymbols].length === 0;
    }

    default:
      return false;
  }
}
