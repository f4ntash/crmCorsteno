import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function snapshotValue(value: unknown): unknown {
  if (value === '') return undefined;
  if (Array.isArray(value)) return value.map(snapshotValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = snapshotValue(item);
        return result;
      }, {});
  }
  return value;
}

export function configValueSnapshot(value: unknown) {
  return JSON.stringify(snapshotValue(value));
}

/** Tracks a controlled editor against the last loaded or successfully saved values. */
export function useConfigEditorState<T>(initialValues: T, currentValues: T) {
  const initialSnapshot = useMemo(() => configValueSnapshot(initialValues), [initialValues]);
  const currentSnapshot = useMemo(() => configValueSnapshot(currentValues), [currentValues]);
  const [baselineSnapshot, setBaselineSnapshot] = useState(initialSnapshot);
  const previousInitialSnapshot = useRef(initialSnapshot);
  const initialValuesChanged = previousInitialSnapshot.current !== initialSnapshot;

  useEffect(() => {
    if (previousInitialSnapshot.current === initialSnapshot) return;
    previousInitialSnapshot.current = initialSnapshot;
    setBaselineSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  const reset = useCallback((values: T) => {
    setBaselineSnapshot(configValueSnapshot(values));
  }, []);

  return {
    dirty: currentSnapshot !== (initialValuesChanged ? initialSnapshot : baselineSnapshot),
    reset,
  };
}
