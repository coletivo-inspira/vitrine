import {
  AUCTION_RULES,
  AuctionError,
  applySoftClose,
  computeMaxBidCents,
  computeNextMinimumCents,
  getAuctionTerms,
  isAuctionItem,
  shortBidRef
} from '../web/assets/auction-rules.mjs';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function iso(ms) {
  return new Date(ms).toISOString();
}

function findAuctionItem(menu, itemId) {
  const items = Array.isArray(menu?.items) ? menu.items : [];
  return items.find((item) => item?.id === itemId && isAuctionItem(item)) ?? null;
}

export function lotPublicView(lot, bids, nowMs) {
  const valid = bids
    .filter((bid) => bid.lotId === lot.id && bid.status === 'valid')
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  return {
    itemId: lot.itemId,
    status: lot.endsAtMs > nowMs ? 'open' : 'closed',
    endsAt: iso(lot.endsAtMs),
    scheduledEndsAt: iso(lot.scheduledEndsAtMs),
    startCents: lot.startCents,
    incrementCents: lot.incrementCents,
    currentCents: lot.highestCents,
    nextMinCents: computeNextMinimumCents({
      startCents: lot.startCents,
      incrementCents: lot.incrementCents,
      currentCents: lot.highestCents
    }),
    bidCount: lot.bidCount,
    leadingRef: lot.highestBidId ? shortBidRef(lot.highestBidId) : null,
    recentBids: valid
      .slice(0, AUCTION_RULES.recentBidsShown)
      .map((bid) => ({ amountCents: bid.amountCents, placedAt: iso(bid.createdAtMs) }))
  };
}

function virtualLotView(item, terms, nowMs) {
  const endsMs = Date.parse(terms.scheduledEndsAt);
  return {
    itemId: item.id,
    status: endsMs > nowMs ? 'open' : 'closed',
    endsAt: terms.scheduledEndsAt,
    scheduledEndsAt: terms.scheduledEndsAt,
    startCents: terms.startCents,
    incrementCents: terms.incrementCents,
    currentCents: null,
    nextMinCents: terms.startCents,
    bidCount: 0,
    leadingRef: null,
    recentBids: []
  };
}

export function teamAuctionViewsFromRows(lotRows, bidRows, nowMs = Date.now()) {
  const bidsByLot = new Map();
  for (const row of Array.isArray(bidRows) ? bidRows : []) {
    const list = bidsByLot.get(row.lot_id) ?? [];
    list.push({
      id: row.id,
      amountCents: Number(row.amount_cents),
      name: row.bidder_name,
      whatsapp: row.bidder_whatsapp,
      status: row.status,
      voidReason: row.void_reason ?? null,
      voidedAt: row.voided_at ? iso(Date.parse(row.voided_at)) : null,
      placedAt: iso(Date.parse(row.created_at))
    });
    bidsByLot.set(row.lot_id, list);
  }
  return (Array.isArray(lotRows) ? lotRows : [])
    .map((row) => {
      const endsAtMs = Date.parse(row.ends_at);
      const lotBids = (bidsByLot.get(row.id) ?? []).sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
      const leader = row.highest_bid_id ? lotBids.find((bid) => bid.id === row.highest_bid_id) : null;
      return {
        lotId: row.id,
        itemId: row.item_id,
        itemName: row.item_name,
        status: endsAtMs > nowMs ? 'open' : 'closed',
        endsAt: iso(endsAtMs),
        scheduledEndsAt: iso(Date.parse(row.scheduled_ends_at)),
        startCents: Number(row.start_cents),
        incrementCents: Number(row.increment_cents),
        currentCents: row.highest_cents === null || row.highest_cents === undefined ? null : Number(row.highest_cents),
        bidCount: Number(row.bid_count) || 0,
        personalDataPurged: Boolean(row.personal_data_purged_at),
        winner: leader
          ? { bidId: leader.id, name: leader.name, whatsapp: leader.whatsapp, amountCents: leader.amountCents, placedAt: leader.placedAt }
          : null,
        bids: lotBids
      };
    })
    .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt));
}

/**
 * Livro de leilões em memória usado pelo store de testes e pela prévia local.
 * Espelha `private.place_auction_bid` / `read_auction_board` / `void_auction_bid`.
 */
export function createAuctionBook() {
  const lots = [];
  const bids = [];
  const blocks = [];

  function findLot(siteId, itemId, scheduledEndsAtMs, nowMs) {
    const open = lots
      .filter((lot) => lot.siteId === siteId && lot.itemId === itemId && lot.endsAtMs > nowMs)
      .sort((a, b) => b.endsAtMs - a.endsAtMs)[0];
    if (open) return open;
    return lots.find(
      (lot) => lot.siteId === siteId && lot.itemId === itemId && lot.scheduledEndsAtMs === scheduledEndsAtMs
    ) ?? null;
  }

  function purge(siteId, nowMs) {
    for (const lot of lots) {
      if (
        lot.siteId === siteId &&
        !lot.personalDataPurgedAtMs &&
        lot.endsAtMs < nowMs - AUCTION_RULES.retentionDays * DAY_MS
      ) {
        lot.personalDataPurgedAtMs = nowMs;
        lot.highestBidId = null;
        for (let i = bids.length - 1; i >= 0; i -= 1) {
          if (bids[i].lotId === lot.id) bids.splice(i, 1);
        }
      }
    }
  }

  function teamView(lot, nowMs) {
    const lotBids = bids
      .filter((bid) => bid.lotId === lot.id)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    const leader = lot.highestBidId ? lotBids.find((bid) => bid.id === lot.highestBidId) : null;
    return {
      lotId: lot.id,
      itemId: lot.itemId,
      itemName: lot.itemName,
      status: lot.endsAtMs > nowMs ? 'open' : 'closed',
      endsAt: iso(lot.endsAtMs),
      scheduledEndsAt: iso(lot.scheduledEndsAtMs),
      startCents: lot.startCents,
      incrementCents: lot.incrementCents,
      currentCents: lot.highestCents,
      bidCount: lot.bidCount,
      personalDataPurged: Boolean(lot.personalDataPurgedAtMs),
      winner: leader
        ? {
            bidId: leader.id,
            name: leader.name,
            whatsapp: leader.whatsapp,
            amountCents: leader.amountCents,
            placedAt: iso(leader.createdAtMs)
          }
        : null,
      bids: lotBids.map((bid) => ({
        id: bid.id,
        amountCents: bid.amountCents,
        name: bid.name,
        whatsapp: bid.whatsapp,
        status: bid.status,
        voidReason: bid.voidReason ?? null,
        voidedAt: bid.voidedAtMs ? iso(bid.voidedAtMs) : null,
        placedAt: iso(bid.createdAtMs)
      }))
    };
  }

  return {
    readBoard({ siteId, menu, now = Date.now() }) {
      const items = Array.isArray(menu?.items) ? menu.items : [];
      const views = [];
      for (const item of items) {
        if (!isAuctionItem(item)) continue;
        const terms = getAuctionTerms(item);
        const lot = findLot(siteId, item.id, Date.parse(terms.scheduledEndsAt), now);
        views.push(lot ? lotPublicView(lot, bids, now) : virtualLotView(item, terms, now));
      }
      return { serverNow: iso(now), lots: views };
    },

    placeBid({ siteId, menu, itemId, name, whatsapp, amountCents, visitorKey, now = Date.now() }) {
      const item = findAuctionItem(menu, itemId);
      if (!item) throw new AuctionError('AUCTION_NOT_FOUND');
      const terms = getAuctionTerms(item);
      const scheduledMs = Date.parse(terms.scheduledEndsAt);

      if (whatsapp === menu?.whatsapp) throw new AuctionError('BIDDER_IS_OWNER');
      if (
        blocks.some(
          (block) =>
            block.siteId === siteId && (block.whatsapp === whatsapp || block.visitorKey === visitorKey)
        )
      ) {
        throw new AuctionError('BIDDER_BLOCKED');
      }

      let lot = findLot(siteId, itemId, scheduledMs, now);
      let created = false;
      if (!lot || lot.endsAtMs <= now) {
        if (lot || scheduledMs <= now) throw new AuctionError('AUCTION_CLOSED');
        lot = {
          id: globalThis.crypto.randomUUID(),
          siteId,
          itemId,
          itemName: String(item.name || 'Item').slice(0, 160),
          startCents: terms.startCents,
          incrementCents: terms.incrementCents,
          scheduledEndsAtMs: scheduledMs,
          endsAtMs: scheduledMs,
          highestBidId: null,
          highestCents: null,
          bidCount: 0,
          personalDataPurgedAtMs: null
        };
        created = true;
      }

      const siteBids = bids.filter((bid) => bid.siteId === siteId && bid.visitorKey === visitorKey);
      const lastMs = Math.max(0, ...siteBids.map((bid) => bid.createdAtMs));
      if (lastMs > now - AUCTION_RULES.visitorMinIntervalMs) throw new AuctionError('BID_RATE_LIMITED');
      const lotVisitorBids = siteBids.filter((bid) => bid.lotId === lot.id);
      if (lotVisitorBids.filter((bid) => bid.createdAtMs > now - HOUR_MS).length >= AUCTION_RULES.visitorLotHourlyMax) {
        throw new AuctionError('BID_RATE_LIMITED');
      }
      if (siteBids.filter((bid) => bid.createdAtMs > now - DAY_MS).length >= AUCTION_RULES.visitorSiteDailyMax) {
        throw new AuctionError('BID_RATE_LIMITED');
      }
      const identities = new Set(lotVisitorBids.map((bid) => bid.whatsapp).filter((phone) => phone !== whatsapp));
      if (identities.size >= AUCTION_RULES.visitorLotMaxIdentities) throw new AuctionError('TOO_MANY_IDENTITIES');
      if (bids.filter((bid) => bid.lotId === lot.id).length >= AUCTION_RULES.lotMaxBids) {
        throw new AuctionError('AUCTION_BID_LIMIT');
      }
      if (lot.highestBidId && bids.find((bid) => bid.id === lot.highestBidId)?.whatsapp === whatsapp) {
        throw new AuctionError('ALREADY_LEADING');
      }

      const requiredCents = computeNextMinimumCents({
        startCents: lot.startCents,
        incrementCents: lot.incrementCents,
        currentCents: lot.highestCents
      });
      if (amountCents < requiredCents) throw new AuctionError('BID_TOO_LOW', { requiredCents });
      if (amountCents > computeMaxBidCents(requiredCents)) throw new AuctionError('BID_TOO_HIGH');

      if (created) lots.push(lot);
      const bid = {
        id: globalThis.crypto.randomUUID(),
        lotId: lot.id,
        siteId,
        amountCents,
        name,
        whatsapp,
        visitorKey,
        status: 'valid',
        createdAtMs: now
      };
      bids.push(bid);
      lot.highestBidId = bid.id;
      lot.highestCents = amountCents;
      lot.bidCount += 1;
      lot.endsAtMs = applySoftClose({ endsAtMs: lot.endsAtMs, scheduledEndsAtMs: lot.scheduledEndsAtMs, nowMs: now });
      purge(siteId, now);

      return {
        bid: { ref: shortBidRef(bid.id), amountCents, placedAt: iso(now) },
        lot: lotPublicView(lot, bids, now)
      };
    },

    listSiteAuctions({ siteId, now = Date.now() }) {
      return lots
        .filter((lot) => lot.siteId === siteId)
        .sort((a, b) => b.endsAtMs - a.endsAtMs)
        .map((lot) => teamView(lot, now));
    },

    voidBid({ siteId, bidId, reason, block = false, now = Date.now() }) {
      const bid = bids.find((entry) => entry.id === bidId && entry.siteId === siteId);
      if (!bid) return { status: 'not_found' };
      if (bid.status === 'void') return { status: 'already_void' };
      bid.status = 'void';
      bid.voidReason = reason;
      bid.voidedAtMs = now;
      const lot = lots.find((entry) => entry.id === bid.lotId);
      const top = bids
        .filter((entry) => entry.lotId === lot.id && entry.status === 'valid')
        .sort((a, b) => b.amountCents - a.amountCents || a.createdAtMs - b.createdAtMs)[0];
      lot.highestBidId = top?.id ?? null;
      lot.highestCents = top?.amountCents ?? null;
      lot.bidCount = bids.filter((entry) => entry.lotId === lot.id && entry.status === 'valid').length;
      if (block) blocks.push({ siteId, whatsapp: bid.whatsapp, visitorKey: bid.visitorKey, reason });
      return { status: 'ok', auction: teamView(lot, now) };
    },

    _debug: { lots, bids, blocks }
  };
}
