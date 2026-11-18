import { useEffect, useState } from 'react';

export interface ObjectUrlState {
  url: string | null;
  missing: boolean;
  blob: Blob | null;
}

/** Loads a blob from storage and exposes an object URL for it. The URL is revoked when the component unmounts or the key changes. */
export function useObjectUrl(load: () => Promise<Blob | null>, key: string): ObjectUrlState {
  const [state, setState] = useState<ObjectUrlState>({ url: null, missing: false, blob: null });
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setState({ url: null, missing: false, blob: null });
    load()
      .then((blob) => {
        if (!alive) return;
        if (!blob) return setState({ url: null, missing: true, blob: null });
        url = URL.createObjectURL(blob);
        setState({ url, missing: false, blob });
      })
      .catch(() => alive && setState({ url: null, missing: true, blob: null }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // `load` is recreated every render; the key identifies the media item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
