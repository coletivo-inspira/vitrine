export function extractPhoneDigits(raw) {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 15);
}

export function formatWhatsappBR(raw) {
  const digits = extractPhoneDigits(raw);
  if (!digits) return '';

  if (digits.startsWith('55')) {
    const brDigits = digits.slice(0, 13);
    if (brDigits.length <= 2) {
      return `+${brDigits}`;
    }
    const ddd = brDigits.slice(2, 4);
    if (brDigits.length <= 4) {
      return `+55 (${ddd}`;
    }
    const local = brDigits.slice(4);
    if (local.length <= 4) {
      return `+55 (${ddd}) ${local}`;
    }
    if (local.length <= 8) {
      return `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
    }
    return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5, 9)}`;
  }

  let ddiLen = 2;
  if (digits.startsWith('1') || digits.startsWith('7')) {
    ddiLen = 1;
  } else if (/^(?:351|598|595|591|593|506|507|244|258)/.test(digits)) {
    ddiLen = 3;
  }

  if (digits.length <= ddiLen) {
    return `+${digits}`;
  }

  const ddi = digits.slice(0, ddiLen);
  const rest = digits.slice(ddiLen);
  const groups = [];
  for (let i = 0; i < rest.length; i += 4) {
    groups.push(rest.slice(i, i + 4));
  }
  return `+${ddi} ${groups.join(' ')}`;
}

export function findCursorAfterDigits(formatted, digitCount) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen === digitCount) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

export function attachWhatsappMask(input, onChange) {
  if (!input) return;

  let prevDigits = extractPhoneDigits(input.value);
  if (prevDigits) {
    input.value = formatWhatsappBR(prevDigits);
  }

  input.addEventListener('input', (event) => {
    const rawValue = input.value;
    const selectionStart = typeof input.selectionStart === 'number' ? input.selectionStart : rawValue.length;
    let digitsBeforeCursor = (rawValue.slice(0, selectionStart).match(/\d/g) || []).length;
    let currentDigits = extractPhoneDigits(rawValue);

    if (
      event?.inputType === 'deleteContentBackward' &&
      currentDigits === prevDigits &&
      digitsBeforeCursor > 0
    ) {
      currentDigits =
        currentDigits.slice(0, digitsBeforeCursor - 1) + currentDigits.slice(digitsBeforeCursor);
      digitsBeforeCursor -= 1;
    }

    prevDigits = currentDigits;
    const formatted = formatWhatsappBR(currentDigits);
    input.value = formatted;

    if (typeof input.setSelectionRange === 'function') {
      const nextPos = findCursorAfterDigits(formatted, digitsBeforeCursor);
      try {
        input.setSelectionRange(nextPos, nextPos);
      } catch {
        // Ignore on unsupported input types
      }
    }

    if (typeof onChange === 'function') {
      onChange(currentDigits, formatted);
    }
  });
}
