import { useEffect, useState } from 'react';
import { pendingPhoto, readDraft, removeDraft, writeDraft } from './draftStorage';
export function useEvidenceDraft(key, initial) {
  const [draft, setDraft] = useState(() => ({
    ...initial,
    ...readDraft(key),
  }));
  useEffect(() => {
    writeDraft(key, draft);
  }, [key, draft]);
  useEffect(() => {
    let active = true;
    pendingPhoto().then((uri) => {
      if (active && uri)
        setDraft((d) => ({
          ...d,
          photoUri: uri,
        }));
    });
    return () => {
      active = false;
    };
  }, []);
  const update = (fields) =>
    setDraft((d) => ({
      ...d,
      ...fields,
    }));
  const clearDraft = () => removeDraft(key);
  return [draft, update, clearDraft];
}
