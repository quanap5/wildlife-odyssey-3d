/** Centralised localisation hooks. Components call `useT()`; no translated text lives in components. */
import { useCallback } from 'react';
import type { Lang } from '../data/species';
import { useGame } from '../store/gameStore';
import { translate, translateDynamic, type Params, type TextKey } from './translate';

export * from './translate';

export type Translator = (key: TextKey, params?: Params) => string;
export type DynamicTranslator = (key: string, params?: Params) => string;

export function useT(): Translator {
  const lang = useGame((s) => s.settings.language);
  return useCallback((key: TextKey, params?: Params) => translate(lang, key, params), [lang]);
}

/** For keys assembled at run time (`biome.${id}`, `behavior.${b}`). */
export function useTd(): DynamicTranslator {
  const lang = useGame((s) => s.settings.language);
  return useCallback((key: string, params?: Params) => translateDynamic(lang, key, params), [lang]);
}

export function useLang(): Lang {
  return useGame((s) => s.settings.language);
}
