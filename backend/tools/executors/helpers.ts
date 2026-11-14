import { asArray } from '../../normalizers/toolResult.ts';

// Search results wrap matches in <span> highlight tags.
const stripHtml = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text || null;
};

const firstSentence = (text, max = 140) => {
  if (!text) return null;
  const sentence = text.split(/(?<=[.!?])\s/)[0];
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
};

const toIsoTime = (value) => {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
};

// Feed and tweet items often have content but no title, so the title falls
// back to the content's first sentence.
const mapNewsItems = (items, limit = 5) =>
  asArray(items).slice(0, limit).map((item) => {
    const english = item.multilanguageContent?.find((entry) => entry.language === 'en');
    const content = stripHtml(item.content || english?.content);
    const title = stripHtml(item.title || english?.title) || firstSentence(content);
    return {
      id: item.id,
      title,
      content: content && content.length > 400 ? `${content.slice(0, 399)}…` : content,
      sourceLink: item.source_link || item.sourceLink,
      releaseTime: item.release_time || item.releaseTime,
      releasedAt: toIsoTime(item.release_time || item.releaseTime),
      category: item.category,
      author: item.author,
      tags: asArray(item.tags).slice(0, 5)
    };
  });

export { mapNewsItems };
