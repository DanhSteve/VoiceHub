/** In-flight dedupe — nhiều request cùng key chia sẻ một Promise downstream. */
const inFlight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
function coalesce(key, loader) {
  const k = String(key || '').trim();
  if (!k) return loader();

  const existing = inFlight.get(k);
  if (existing) return existing;

  const flight = Promise.resolve()
    .then(loader)
    .finally(() => {
      inFlight.delete(k);
    });

  inFlight.set(k, flight);
  return flight;
}

function inFlightCount() {
  return inFlight.size;
}

module.exports = { coalesce, inFlightCount };
