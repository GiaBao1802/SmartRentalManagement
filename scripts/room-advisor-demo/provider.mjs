// Provider port: explain(result) -> { source, message, cards }.
// A paid provider can replace this adapter; ranking/validation stay in the engine.
export function fallback(result, message = 'Đang dùng lời giải thích từ bộ lọc; chưa sử dụng AI.', reason = 'not_requested') {
  return { source: 'rules', reason, message, cards: result.cards.map(card => ({ id: card.id, text: card.explanation })) };
}
export function validateNarration(raw, result) {
  const value = JSON.parse(raw);
  if (!value || Object.keys(value).join() !== 'cards' || !Array.isArray(value.cards) || value.cards.length !== result.cards.length) throw new Error('Invalid narration');
  return value.cards.map((item,index) => {
    const card = result.cards[index];
    if (!item || Object.keys(item).sort().join() !== 'factIds,id' || item.id !== card.id
        || !Array.isArray(item.factIds) || item.factIds.length !== 3 || new Set(item.factIds).size !== 3
        || !item.factIds.includes('budget') || !item.factIds.includes('travel')) throw new Error('Invalid facts');
    const selected = item.factIds.map(id => card.facts.find(f => f.id === id));
    if (selected.some(f => !f)) throw new Error('Unknown fact');
    // Never render arbitrary model prose. Model composes only verified sentences.
    return { id: card.id, text: selected.map(f => f.text).join(' ') };
  });
}
export const DEFAULT_MODEL_TIMEOUT_MS = 45000;
export const DEFAULT_MODEL = 'qwen3:1.7b';
export function createOllamaProvider({ fetchImpl = fetch, timeoutMs = DEFAULT_MODEL_TIMEOUT_MS, model = DEFAULT_MODEL } = {}) {
  let busy = false;
  return {
    async explain(result, { signal: callerSignal } = {}) {
      const startedAt = Date.now();
      const finish = value => ({ ...value, elapsedMs: Date.now() - startedAt });
      if (!result.cards.length) return finish(fallback(result, 'Không có phòng đáp ứng; không gọi AI.', 'empty'));
      if (callerSignal?.aborted) return finish(fallback(result, 'Yêu cầu tư vấn đã hủy.', 'cancelled'));
      if (busy) return finish(fallback(result, 'AI đang xử lý yêu cầu khác. Kết quả lọc vẫn dùng được.', 'busy'));
      busy = true;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = callerSignal ? AbortSignal.any([callerSignal,timeoutSignal]) : timeoutSignal;
      let failure = 'unavailable';
      try {
        const response = await fetchImpl('http://127.0.0.1:11434/api/chat', {
          method: 'POST', signal, redirect: 'error', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: false, think: false, keep_alive: '0',
            options: { num_ctx: 2048, num_predict: 180, temperature: 0.7 },
            format: { type: 'object', properties: { cards: { type: 'array', minItems: result.cards.length, maxItems: result.cards.length,
              items: { type: 'object', properties: { id: { type: 'string', enum: result.cards.map(c => c.id) },
                factIds: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', enum: ['budget','travel','hours','space','amenities'] } } },
                required: ['id','factIds'], additionalProperties: false } } }, required: ['cards'], additionalProperties: false },
            messages: [
              { role: 'system', content: 'Compose advice by selecting fact IDs only. Preserve room order and IDs. For each room return exactly 3 unique factIds, always budget and travel, plus one relevant fact. No other text. /no_think' },
              { role: 'user', content: JSON.stringify({ priority: result.preferences.priority, late: result.preferences.late,
                required: result.preferences.required, cards: result.cards.map(c => ({ id: c.id, facts: c.facts })) }) },
            ],
          }),
        });
        if (!response.ok) throw new Error('Unavailable');
        failure = 'invalid';
        const data = await response.json();
        if (data?.done_reason !== 'stop') { failure = 'incomplete'; throw new Error('Incomplete'); }
        if (typeof data.message?.content !== 'string') throw new Error('Invalid');
        const cards = validateNarration(data.message.content,result);
        signal.throwIfAborted();
        return finish({ source: 'ollama', reason: 'validated', message: `${model} đã chọn cách trình bày từ thông tin được kiểm tra.`, cards });
      } catch {
        const reason = callerSignal?.aborted ? 'cancelled' : timeoutSignal.aborted ? 'timeout' : failure;
        const messages = {
          cancelled: 'Yêu cầu tư vấn đã hủy.',
          timeout: 'AI phản hồi quá chậm. Đã giữ lời giải thích từ bộ lọc.',
          unavailable: 'Không kết nối được model local. Đã giữ lời giải thích từ bộ lọc.',
          incomplete: 'AI chưa trả lời đầy đủ. Đã giữ lời giải thích từ bộ lọc.',
          invalid: 'AI trả thông tin không hợp lệ. Đã giữ lời giải thích từ bộ lọc.',
        };
        return finish(fallback(result, messages[reason], reason));
      } finally { busy = false; }
    },
  };
}
