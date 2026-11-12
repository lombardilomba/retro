// Private content is readable only by its author, regardless of the room role.
export function canReadCard(card, revealed, uid) {
  return !!card && (revealed || card.author === uid);
}
export function publicPreview(card) {
  return {id: card.id, column: card.column, author: card.author, expiresAt: card.expiresAt};
}
export function cardViews(cards, previews, revealed, uid) {
  const result = new Map(previews.map(p => [p.id, {...publicPreview(p), _private: true}]));
  for (const card of cards) {
    result.set(card.id, canReadCard(card, revealed, uid)
      ? card : {...publicPreview(card), _private: true});
  }
  return [...result.values()];
}
