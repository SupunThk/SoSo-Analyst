// Share links: a post on X that links back to the app with the question
// pre-filled (/?q=...), so whoever clicks it lands on a live answer.

const appOrigin = () =>
  (typeof window !== 'undefined' && window.location?.origin) || '';

/** A question that routes to price, trend and news data, so the answer carries a trade signal. */
export const signalQuestion = (asset: string) => {
  const base = asset.toUpperCase().replace(/-USD$/, '');
  return `Analyze ${base}: price, recent price trend and latest ${base} news. What is the directional bias?`;
};

export const questionLink = (question: string) =>
  `${appOrigin()}/?q=${encodeURIComponent(question)}`;

export const shareOnXUrl = (text: string, url: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

export const openShareOnX = (text: string, question: string) => {
  const href = shareOnXUrl(text, questionLink(question));
  window.open(href, '_blank', 'noopener,noreferrer');
};

/** Reads a ?q= question from the current URL and removes it, so a reload does not re-run it. */
export const takeQuestionFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const question = url.searchParams.get('q')?.trim();
    if (!question) return null;
    url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return question.slice(0, 500);
  } catch {
    return null;
  }
};
