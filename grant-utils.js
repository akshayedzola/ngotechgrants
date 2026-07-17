(function exposeGrantUtils(global) {
  function amountValue(value) {
    const matches = [...String(value || '').matchAll(/([\d,.]+)\s*([kKmM])?/g)];
    return matches.reduce((maximum, match) => {
      const number = Number(match[1].replaceAll(',', '')) || 0;
      const multiplier = match[2]?.toLowerCase() === 'm' ? 1000000 : match[2]?.toLowerCase() === 'k' ? 1000 : 1;
      return Math.max(maximum, number * multiplier);
    }, 0);
  }

  global.GrantUtils = { amountValue };
}(typeof window === 'undefined' ? globalThis : window));
