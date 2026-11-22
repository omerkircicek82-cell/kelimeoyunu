import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const key = 'arena.show-mark-symbols';
let writes = Promise.resolve();

export function useMarkSymbols() {
  const [showMarkSymbols, setShowMarkSymbols] = useState(true);
  const touched = useRef(false);
  const [preferenceError, setPreferenceError] = useState('');

  useEffect(() => {
    let active = true;
    void writes
      .then(() => SecureStore.getItemAsync(key))
      .then((stored) => {
        if (active && !touched.current) setShowMarkSymbols(stored !== 'false');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function saveMarkSymbols(value: boolean) {
    touched.current = true;
    setShowMarkSymbols(value);
    setPreferenceError('');
    writes = writes
      .then(() => SecureStore.setItemAsync(key, String(value)))
      .catch(() => setPreferenceError('Görünüm ayarı cihaza kaydedilemedi.'));
  }

  return { showMarkSymbols, saveMarkSymbols, preferenceError };
}
