// Fixtures no formato oficial dos webhooks de mensagens do Instagram
// (developers.facebook.com/documentation/instagram-platform/webhooks/examples), com IDs
// fictícios. Nenhum dado real de consumidor ou de conta.
export const BUSINESS_ID = '17841400000000001';
export const OTHER_BUSINESS_ID = '17841400000000009';
export const CONSUMER_ID = '900000000000777';

function envelope(messaging, id = BUSINESS_ID) {
  return { object: 'instagram', entry: [{ id, time: Date.now(), messaging }] };
}

export function messageEvent({ mid = 'aWdfZAG1faWQ6MTIzNDU2', sender = CONSUMER_ID, recipient = BUSINESS_ID, at = Date.now(), extra = {} } = {}) {
  return {
    sender: { id: sender },
    recipient: { id: recipient },
    timestamp: at,
    message: { mid, text: 'Olá! Gostaria de conhecer o cardápio.', ...extra }
  };
}

export const fixtures = {
  message: (options) => envelope([messageEvent(options)], options?.account),
  echo: () => envelope([{
    sender: { id: BUSINESS_ID }, recipient: { id: CONSUMER_ID }, timestamp: Date.now(),
    message: { mid: 'echo-1', text: 'Resposta enviada', is_echo: true }
  }]),
  read: () => envelope([{ sender: { id: CONSUMER_ID }, recipient: { id: BUSINESS_ID }, timestamp: Date.now(), read: { mid: 'm-1' } }]),
  reaction: () => envelope([{
    sender: { id: CONSUMER_ID }, recipient: { id: BUSINESS_ID }, timestamp: Date.now(),
    reaction: { mid: 'm-1', action: 'react', reaction: 'love', emoji: '\u2764\uFE0F' }
  }]),
  edit: () => envelope([{
    sender: { id: CONSUMER_ID }, recipient: { id: BUSINESS_ID }, timestamp: Date.now(),
    message_edit: { mid: 'm-1', text: 'editado', num_edit: 1 }
  }]),
  deleted: () => envelope([messageEvent({ mid: 'del-1', extra: { is_deleted: true } })]),
  unsupported: () => envelope([messageEvent({ mid: 'uns-1', extra: { is_unsupported: true } })]),
  selfTest: () => envelope([messageEvent({ mid: 'self-1', extra: { is_self: true } })]),
  postback: () => envelope([{
    sender: { id: CONSUMER_ID }, recipient: { id: BUSINESS_ID }, timestamp: Date.now(),
    postback: { mid: 'pb-1', title: 'Ver vitrine', payload: 'VER' }
  }]),
  referral: () => envelope([{
    sender: { id: CONSUMER_ID }, recipient: { id: BUSINESS_ID }, timestamp: Date.now(),
    referral: { ref: 'campanha', source: 'IGME', type: 'OPEN_THREAD' }
  }]),
  attachmentOnly: () => envelope([{
    sender: { id: CONSUMER_ID }, recipient: { id: BUSINESS_ID }, timestamp: Date.now(),
    message: { mid: 'att-1', attachments: [{ type: 'image', payload: { url: 'https://cdn.example.invalid/x.jpg' } }] }
  }]),
  batch: (count) => envelope(Array.from({ length: count }, (_, index) =>
    messageEvent({ mid: `batch-${index}`, sender: `90000000000${1000 + index}` })))
};
