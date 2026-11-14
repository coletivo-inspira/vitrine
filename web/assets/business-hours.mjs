// Horário de funcionamento e endereço público da vitrine.
// Módulo puro, sem dependências: roda no Worker, no Node (testes) e no navegador.
// O rascunho e o snapshot público usam o mesmo formato normalizado.

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
export const WEEK_DAYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
export const WEEK_DAY_LABELS = Object.freeze({
  sun: 'Domingo',
  mon: 'Segunda-feira',
  tue: 'Terça-feira',
  wed: 'Quarta-feira',
  thu: 'Quinta-feira',
  fri: 'Sexta-feira',
  sat: 'Sábado'
});
const WEEK_DAY_SHORT = Object.freeze({
  sun: 'domingo',
  mon: 'segunda',
  tue: 'terça',
  wed: 'quarta',
  thu: 'quinta',
  fri: 'sexta',
  sat: 'sábado'
});
const SCHEMA_DAY = Object.freeze({
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday'
});

export const MAX_RANGES_PER_DAY = 2;
export const MAX_CLOSED_DATES = 30;
export const ADDRESS_LIMITS = Object.freeze({
  street: 120,
  district: 60,
  city: 60,
  postalCode: 9
});
export const BRAZIL_UFS = Object.freeze([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
]);

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const POSTAL_CODE_PATTERN = /^\d{5}-?\d{3}$/;
const CONTROL_OR_MARKUP = /[<>\u0000-\u001f\u007f]/;
const DAY_MINUTES = 1440;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toMinutes(time) {
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isValidIsoDate(value) {
  const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Valida o horário vindo do editor. Devolve `{ value, errors }`: `value` é o horário
 * normalizado (ou `undefined` quando não há nenhuma faixa nem exceção) e cada erro
 * traz `field` no formato `businessHours.week.mon.0.closes`.
 */
export function validateBusinessHours(raw) {
  const errors = [];
  const push = (field, code, message) => errors.push({ field: `businessHours${field ? `.${field}` : ''}`, code, message });

  if (raw === undefined || raw === null) return { value: undefined, errors };
  if (!isPlainObject(raw)) {
    push('', 'INVALID_BUSINESS_HOURS', 'O horário de funcionamento deve ser um objeto.');
    return { value: undefined, errors };
  }
  if (raw.timeZone !== undefined && raw.timeZone !== BUSINESS_TIME_ZONE) {
    push('timeZone', 'INVALID_BUSINESS_HOURS', `O fuso do horário deve ser ${BUSINESS_TIME_ZONE}.`);
  }

  const week = {};
  const rawWeek = raw.week === undefined ? {} : raw.week;
  if (!isPlainObject(rawWeek)) {
    push('week', 'INVALID_BUSINESS_HOURS', 'Os dias da semana do horário são inválidos.');
  } else {
    for (const key of Object.keys(rawWeek)) {
      if (!WEEK_DAYS.includes(key)) push(`week.${key}`, 'INVALID_BUSINESS_HOURS', `Dia da semana desconhecido: ${key}.`);
    }
    for (const day of WEEK_DAYS) {
      const ranges = rawWeek[day] ?? [];
      const label = WEEK_DAY_LABELS[day];
      if (!Array.isArray(ranges)) {
        push(`week.${day}`, 'INVALID_BUSINESS_HOURS', `${label}: as faixas de horário são inválidas.`);
        continue;
      }
      if (ranges.length > MAX_RANGES_PER_DAY) {
        push(`week.${day}`, 'INVALID_BUSINESS_HOURS', `${label}: use no máximo ${MAX_RANGES_PER_DAY} faixas de horário.`);
        continue;
      }
      const normalized = [];
      ranges.forEach((range, index) => {
        const base = `week.${day}.${index}`;
        const position = ranges.length > 1 ? ` (faixa ${index + 1})` : '';
        if (!isPlainObject(range)) {
          push(base, 'INVALID_BUSINESS_HOURS', `${label}${position}: faixa de horário inválida.`);
          return;
        }
        const opens = toMinutes(range.opens);
        const closes = toMinutes(range.closes);
        if (opens === null) {
          push(`${base}.opens`, 'INVALID_BUSINESS_HOURS', `${label}${position}: informe o início no formato 18:00.`);
        }
        if (closes === null) {
          push(`${base}.closes`, 'INVALID_BUSINESS_HOURS', `${label}${position}: informe o fim no formato 23:00.`);
        }
        if (opens === null || closes === null) return;
        const overnight = range.overnight === true;
        if (!overnight && closes <= opens) {
          push(
            `${base}.closes`,
            'BUSINESS_HOURS_END_BEFORE_START',
            `${label}${position}: o fim precisa ser depois do início. Se a faixa passa da meia-noite, marque "Termina no dia seguinte".`
          );
          return;
        }
        if (overnight && closes > opens) {
          push(
            `${base}.closes`,
            'BUSINESS_HOURS_END_BEFORE_START',
            `${label}${position}: com "Termina no dia seguinte", o fim precisa ser antes do início (ex.: 18:00 às 02:00).`
          );
          return;
        }
        normalized.push({ opens: range.opens, closes: range.closes, ...(overnight ? { overnight: true } : {}) });
      });
      if (normalized.length === 2) {
        const [first, second] = normalized
          .map((r) => ({ ...r, start: toMinutes(r.opens), end: toMinutes(r.closes) + (r.overnight ? DAY_MINUTES : 0) }))
          .sort((a, b) => a.start - b.start);
        if (second.start < first.end) {
          push(`week.${day}.1.opens`, 'BUSINESS_HOURS_OVERLAP', `${label}: as duas faixas de horário se sobrepõem.`);
        }
        normalized.sort((a, b) => toMinutes(a.opens) - toMinutes(b.opens));
      }
      week[day] = normalized;
    }
  }

  const closedDates = [];
  if (raw.closedDates !== undefined) {
    if (!Array.isArray(raw.closedDates)) {
      push('closedDates', 'INVALID_BUSINESS_HOURS', 'As datas fechadas devem ser uma lista.');
    } else if (raw.closedDates.length > MAX_CLOSED_DATES) {
      push('closedDates', 'INVALID_BUSINESS_HOURS', `Informe no máximo ${MAX_CLOSED_DATES} datas fechadas.`);
    } else {
      raw.closedDates.forEach((date, index) => {
        if (!isValidIsoDate(date)) {
          push(`closedDates.${index}`, 'INVALID_BUSINESS_HOURS', 'Data fechada inválida. Use o formato 2026-12-25.');
        } else if (!closedDates.includes(date)) {
          closedDates.push(date);
        }
      });
      closedDates.sort();
    }
  }

  if (errors.length) return { value: undefined, errors };
  const hasRanges = WEEK_DAYS.some((day) => week[day]?.length);
  if (!hasRanges && closedDates.length === 0) return { value: undefined, errors };
  return {
    value: {
      timeZone: BUSINESS_TIME_ZONE,
      week: Object.fromEntries(WEEK_DAYS.map((day) => [day, week[day] ?? []])),
      ...(closedDates.length ? { closedDates } : {})
    },
    errors
  };
}

/**
 * Valida o endereço público opcional. Rua, cidade e UF são obrigatórios quando
 * qualquer campo é preenchido; bairro e CEP são opcionais.
 */
export function validatePublicAddress(raw) {
  const errors = [];
  const push = (field, message) => errors.push({ field: `publicAddress.${field}`, code: 'INVALID_PUBLIC_ADDRESS', message });
  if (raw === undefined || raw === null) return { value: undefined, errors };
  if (!isPlainObject(raw)) {
    errors.push({ field: 'publicAddress', code: 'INVALID_PUBLIC_ADDRESS', message: 'O endereço público deve ser um objeto.' });
    return { value: undefined, errors };
  }
  for (const key of Object.keys(raw)) {
    if (!['street', 'district', 'city', 'uf', 'postalCode'].includes(key)) push(key, `Campo de endereço desconhecido: ${key}.`);
  }
  const street = cleanText(raw.street);
  const district = cleanText(raw.district);
  const city = cleanText(raw.city);
  const uf = cleanText(raw.uf).toUpperCase();
  const postalCode = cleanText(raw.postalCode);
  if (!street && !district && !city && !uf && !postalCode) return { value: undefined, errors };

  const texts = { street, district, city };
  const labels = { street: 'A rua e o número', district: 'O bairro', city: 'A cidade' };
  for (const [field, value] of Object.entries(texts)) {
    if (value.length > ADDRESS_LIMITS[field]) push(field, `${labels[field]} deve ter no máximo ${ADDRESS_LIMITS[field]} caracteres.`);
    else if (value && CONTROL_OR_MARKUP.test(value)) push(field, `${labels[field]} não pode ter os caracteres < ou >.`);
  }
  if (!street) push('street', 'Informe a rua e o número para mostrar o endereço.');
  if (!city) push('city', 'Informe a cidade do endereço.');
  if (!BRAZIL_UFS.includes(uf)) push('uf', 'Escolha o estado (UF) do endereço.');
  if (postalCode && !POSTAL_CODE_PATTERN.test(postalCode)) push('postalCode', 'CEP inválido. Use o formato 01310-100.');

  if (errors.length) return { value: undefined, errors };
  const digits = postalCode.replace('-', '');
  return {
    value: {
      street,
      ...(district ? { district } : {}),
      city,
      uf,
      ...(digits ? { postalCode: `${digits.slice(0, 5)}-${digits.slice(5)}` } : {})
    },
    errors
  };
}

/** Erros de horário e endereço de um rascunho, na ordem dos campos do editor. */
export function collectPlaceErrors(content = {}) {
  return [
    ...validateBusinessHours(content?.businessHours).errors,
    ...validatePublicAddress(content?.publicAddress).errors
  ];
}

/** Campos públicos de horário e endereço; omite o que estiver vazio. */
export function projectPublicPlace(content = {}) {
  const hours = validateBusinessHours(content?.businessHours);
  const address = validatePublicAddress(content?.publicAddress);
  const hasRanges = hours.value && WEEK_DAYS.some((day) => hours.value.week[day].length);
  return {
    ...(hasRanges ? { businessHours: hours.value } : {}),
    ...(address.value ? { publicAddress: address.value } : {})
  };
}

export function formatPublicAddress(address) {
  if (!address) return '';
  const parts = [address.street, address.district, `${address.city} – ${address.uf}`];
  if (address.postalCode) parts.push(address.postalCode);
  return parts.filter(Boolean).join(', ');
}

/** Link "Traçar rota" do Google Maps, sem chave de API. */
export function buildRouteUrl(address) {
  if (!address?.street || !address?.city || !address?.uf) return '';
  const destination = [address.street, address.district, `${address.city} - ${address.uf}`, address.postalCode, 'Brasil']
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

const zonedFormatterCache = new Map();
function zonedFormatter(timeZone) {
  if (!zonedFormatterCache.has(timeZone)) {
    zonedFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    );
  }
  return zonedFormatterCache.get(timeZone);
}

/** Data, dia da semana e minuto do dia no fuso informado. */
export function zonedClock(now = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = Object.fromEntries(zonedFormatter(timeZone).formatToParts(now).map((p) => [p.type, p.value]));
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayIndex,
    day: WEEK_DAYS[dayIndex],
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function shiftIsoDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Data de hoje (AAAA-MM-DD) em São Paulo. */
export function todayInBusinessTimeZone(now = new Date()) {
  return zonedClock(now).date;
}

export function formatHourLabel(time) {
  const [h, m] = time.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/**
 * Situação do horário em `now`. Uma data em `closedDates` cancela as faixas que
 * começam nela; a parte depois da meia-noite de uma faixa do dia anterior continua.
 * Devolve `null` quando não há horário publicado.
 */
export function getOpenStatus(hours, now = new Date()) {
  if (!hours?.week || !WEEK_DAYS.some((day) => hours.week[day]?.length)) return null;
  const clock = zonedClock(now, hours.timeZone || BUSINESS_TIME_ZONE);
  const closed = new Set(hours.closedDates ?? []);
  const intervals = [];
  for (let offset = -1; offset <= 7; offset += 1) {
    const date = shiftIsoDate(clock.date, offset);
    if (closed.has(date)) continue;
    const day = WEEK_DAYS[(clock.dayIndex + offset + 7) % 7];
    for (const range of hours.week[day] ?? []) {
      const opens = toMinutes(range.opens);
      const closes = toMinutes(range.closes);
      if (opens === null || closes === null) continue;
      const start = offset * DAY_MINUTES + opens;
      const end = (offset + (range.overnight ? 1 : 0)) * DAY_MINUTES + closes;
      intervals.push({ start, end, range });
    }
  }
  const t = clock.minutes;
  const current = intervals.find((interval) => interval.start <= t && t < interval.end);
  const closedToday = closed.has(clock.date);
  if (current) {
    return {
      open: true,
      closedToday,
      closesAt: current.range.closes,
      label: 'Aberto agora',
      detail: `Fecha às ${formatHourLabel(current.range.closes)}`
    };
  }
  const next = intervals.filter((interval) => interval.start > t).sort((a, b) => a.start - b.start)[0];
  if (!next) return { open: false, closedToday, label: closedToday ? 'Fechado hoje' : 'Fechado', detail: '' };
  const dayOffset = Math.floor(next.start / DAY_MINUTES);
  const at = formatHourLabel(next.range.opens);
  const when = dayOffset === 0
    ? `abre às ${at}`
    : dayOffset === 1
      ? `abre amanhã às ${at}`
      : `abre ${WEEK_DAY_SHORT[WEEK_DAYS[(clock.dayIndex + dayOffset) % 7]]} às ${at}`;
  return {
    open: false,
    closedToday,
    opensAt: next.range.opens,
    opensInDays: dayOffset,
    label: `${closedToday ? 'Fechado hoje' : 'Fechado'} · ${when}`,
    detail: ''
  };
}

/** Linhas legíveis por dia ("Segunda-feira: 18h às 23h"), para a lista da vitrine. */
export function describeWeek(hours) {
  if (!hours?.week) return [];
  return [1, 2, 3, 4, 5, 6, 0].map((index) => {
    const day = WEEK_DAYS[index];
    const ranges = hours.week[day] ?? [];
    const text = ranges.length
      ? ranges.map((r) => `${formatHourLabel(r.opens)} às ${formatHourLabel(r.closes)}`).join(' e ')
      : 'Fechado';
    return { day, label: WEEK_DAY_LABELS[day], text };
  });
}

/** `openingHoursSpecification` do schema.org (dados estruturados de negócio local). */
export function toOpeningHoursSpecification(hours) {
  if (!hours?.week) return [];
  return WEEK_DAYS.flatMap((day) =>
    (hours.week[day] ?? []).map((range) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAY[day]}`,
      opens: range.opens,
      closes: range.closes
    }))
  );
}
