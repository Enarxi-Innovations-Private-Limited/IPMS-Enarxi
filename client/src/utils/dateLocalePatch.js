function pad2(value) {
  return String(value).padStart(2, '0');
}

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDatePart(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatTimePart(date, includeSeconds = false) {
  const base = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return includeSeconds ? `${base}:${pad2(date.getSeconds())}` : base;
}

function shouldIncludeTime(options) {
  if (!options || typeof options !== 'object') return true;
  return ['hour', 'minute', 'second', 'timeStyle'].some((key) => key in options);
}

if (!Date.prototype.__ipmsDateFormatPatched) {
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
  const originalToLocaleString = Date.prototype.toLocaleString;

  Object.defineProperty(Date.prototype, '__ipmsDateFormatPatched', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  Date.prototype.toLocaleDateString = function patchedToLocaleDateString(locale, options) {
    const date = toValidDate(this);
    if (!date) return originalToLocaleDateString.call(this, locale, options);
    return formatDatePart(date);
  };

  Date.prototype.toLocaleTimeString = function patchedToLocaleTimeString(locale, options) {
    const date = toValidDate(this);
    if (!date) return originalToLocaleTimeString.call(this, locale, options);
    const includeSeconds = Boolean(options && typeof options === 'object' && (options.second || options.timeStyle === 'medium' || options.timeStyle === 'long'));
    return formatTimePart(date, includeSeconds);
  };

  Date.prototype.toLocaleString = function patchedToLocaleString(locale, options) {
    const date = toValidDate(this);
    if (!date) return originalToLocaleString.call(this, locale, options);
    if (options && typeof options === 'object' && !shouldIncludeTime(options)) {
      return formatDatePart(date);
    }
    const includeSeconds = Boolean(options && typeof options === 'object' && (options.second || options.timeStyle === 'medium' || options.timeStyle === 'long'));
    return `${formatDatePart(date)} ${formatTimePart(date, includeSeconds)}`;
  };
}
