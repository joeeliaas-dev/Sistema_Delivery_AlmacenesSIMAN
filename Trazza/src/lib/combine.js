export function combine(subscribes, merge, cb) {
  const values = new Array(subscribes.length);
  const seen = new Array(subscribes.length).fill(false);
  let cancelled = false;
  const cancels = subscribes.map((subscribe, i) =>
    subscribe((value) => {
      if (cancelled) return;
      values[i] = value;
      seen[i] = true;
      if (seen.every(Boolean)) cb(merge(...values));
    }),
  );
  return () => {
    cancelled = true;
    cancels.forEach((cancel) => cancel?.());
  };
}
