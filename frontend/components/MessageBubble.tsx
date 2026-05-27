'use client';

import React, { useState, useEffect } from 'react';
import { Message, MessageFeedbackRating } from '@/lib/types';
import ToolCallBadge from './ToolCallBadge';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { ChartDataPoint, PriceChart } from './charts/PriceChart';

interface MessageBubbleProps {
  message: Message;
  isThinking?: boolean;
  statusText?: string;
  canRate?: boolean;
  onFeedback?: (rating: MessageFeedbackRating) => void;
}

type ChartSeries = {
  key: string;
  color: string;
  name?: string;
};

type ChartPayload = {
  title?: string;
  chartType: 'line' | 'area';
  xAxisKey: string;
  data: ChartDataPoint[];
  series: ChartSeries[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isChartDataPoint = (value: unknown): value is ChartDataPoint =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string' || typeof item === 'number');

const isChartSeries = (value: unknown): value is ChartSeries =>
  isRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.color === 'string' &&
  (value.name === undefined || typeof value.name === 'string');

const parseChartPayload = (raw: string): ChartPayload | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.type !== 'chart' || !Array.isArray(parsed.data) || !parsed.data.every(isChartDataPoint)) {
      return null;
    }

    const series = Array.isArray(parsed.series) && parsed.series.every(isChartSeries)
      ? parsed.series
      : [{ key: 'value', color: '#00FF9D' }];

    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      chartType: parsed.chartType === 'area' ? 'area' : 'line',
      xAxisKey: typeof parsed.xAxisKey === 'string' ? parsed.xAxisKey : 'date',
      data: parsed.data,
      series
    };
  } catch {
    return null;
  }
};

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';

    if (lang === 'json') {
      const chart = parseChartPayload(String(children).replace(/\n$/, ''));
      if (chart) {
        return (
          <div className="my-4 border border-border/50 rounded-lg p-4 bg-[#0A100C]">
            {chart.title && <h4 className="text-accent-green mb-2 font-mono text-sm">{chart.title}</h4>}
            <PriceChart
              data={chart.data}
              type={chart.chartType}
              xAxisKey={chart.xAxisKey}
              series={chart.series}
            />
          </div>
        );
      }
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

const AnimatedMarkdown: React.FC<{ content: string; animate: boolean }> = ({ content, animate }) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const shouldAnimateReveal = animate && !prefersReducedMotion;
  const [visibleLength, setVisibleLength] = useState(() => (shouldAnimateReveal ? 0 : content.length));

  useEffect(() => {
    if (!shouldAnimateReveal) {
      return;
    }

    const reset = setTimeout(() => setVisibleLength(0), 0);
    const charsPerTick = Math.max(3, Math.ceil(content.length / 120));
    const interval = setInterval(() => {
      setVisibleLength((prev) => {
        const next = prev + charsPerTick;
        if (next >= content.length) {
          clearInterval(interval);
          return content.length;
        }

        return next;
      });
    }, 16);

    return () => {
      clearTimeout(reset);
      clearInterval(interval);
    };
  }, [shouldAnimateReveal, content]);

  const isRevealing = shouldAnimateReveal && visibleLength < content.length;
  const displayContent = shouldAnimateReveal ? content.slice(0, visibleLength) : content;

  return (
    <div className={`terminal-markdown text-[13px] md:text-sm font-sans leading-relaxed text-text-primary ${isRevealing ? 'typing-cursor' : ''}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isThinking, statusText, canRate, onFeedback }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Elapsed time counter for thinking state
  useEffect(() => {
    if (!isThinking) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isThinking]);

  const formatTime = (date: Date) => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toISOString().slice(11, 19) + ' UTC';
    } catch {
      return '';
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const shouldAnimateMarkdown =
    !isUser &&
    !isThinking &&
    Boolean(message.content) &&
    message.id !== 'welcome' &&
    !message.id.startsWith('db-') &&
    message.content.length <= 2000;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group flex flex-col mb-6 ${isUser ? 'items-end' : 'items-start'} msg-enter`}
    >
      {/* Label row */}
      <div className={`flex items-center gap-2 mb-1 px-1 font-mono text-[10px] uppercase tracking-wider ${isUser ? 'flex-row-reverse text-text-secondary' : 'text-accent-green font-bold'}`}>
        <span>{isUser ? '> USER' : '◈ ANALYST'}</span>
        <span className="opacity-30">│</span>
        <span className="opacity-50 tabular-nums">{formatTime(message.timestamp)}</span>
      </div>

      {/* Message body */}
      <div
        className={`relative max-w-[96%] md:max-w-[82%] rounded-md shadow-[0_6px_28px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.04] ${
          isUser
            ? 'bg-[#0A100C] border border-border/90 border-r-2 border-r-text-secondary/35'
            : 'bg-[#060A06] border border-border/90 border-l-2 border-l-accent-green/55 pulse-border-green'
        }`}
      >
        {/* Tool calls */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-3 pb-0 border-b border-border/50 mb-0">
            <span className="w-full text-[10px] font-mono text-text-secondary uppercase tracking-wider mb-1">
              ▸ DATA SOURCES QUERIED
            </span>
            {message.toolCalls.map((tool, idx) => (
              <ToolCallBadge key={idx} tool={tool} />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-4 md:p-5">
          {isThinking ? (
            /* ── Refined Thinking Indicator ── */
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                {/* Radar sweep ring */}
                <div className="relative w-8 h-8 flex-shrink-0">
                  <svg className="w-8 h-8 radar-ring" viewBox="0 0 32 32">
                    <circle
                      cx="16" cy="16" r="13"
                      fill="none"
                      stroke="rgba(0, 255, 157, 0.15)"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M16 3 A13 13 0 0 1 29 16"
                      fill="none"
                      stroke="#00FF9D"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-accent-green rounded-full radar-core shadow-[0_0_8px_rgba(0,255,157,0.55)]" />
                  </div>
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-xs font-sans font-medium text-accent-green uppercase tracking-wider truncate">
                    {statusText || 'Querying data feeds...'}
                  </span>
                  <span className="text-[10px] font-mono text-text-secondary elapsed-badge">
                    {elapsedSeconds}s elapsed
                  </span>
                </div>
              </div>

              {/* Live tool badges during streaming */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {message.toolCalls.map((tool, idx) => (
                    <ToolCallBadge key={idx} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          ) : isUser ? (
            <div className="text-[13px] md:text-sm font-sans leading-relaxed text-text-primary whitespace-pre-wrap">
              {message.content}
            </div>
          ) : (
            <AnimatedMarkdown content={message.content} animate={shouldAnimateMarkdown} />
          )}
        </div>

        {/* Copy + feedback - assistant messages only */}
        {!isUser && !isThinking && message.content && (
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canRate && onFeedback && (
              <>
                <button
                  type="button"
                  onClick={() => onFeedback('up')}
                  className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider border rounded-sm ${
                    message.feedback?.rating === 'up'
                      ? 'text-accent-green border-accent-green/50 bg-accent-green/10'
                      : 'text-text-secondary border-transparent hover:border-accent-green/30 hover:text-accent-green'
                  }`}
                  title="Helpful response"
                  aria-label="Mark response as helpful"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback('down')}
                  className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider border rounded-sm ${
                    message.feedback?.rating === 'down'
                      ? 'text-accent-red border-accent-red/50 bg-accent-red/10'
                      : 'text-text-secondary border-transparent hover:border-accent-red/30 hover:text-accent-red'
                  }`}
                  title="Not helpful"
                  aria-label="Mark response as not helpful"
                >
                  ▼
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary hover:text-accent-green border border-transparent hover:border-accent-green/30 rounded-sm"
              title="Copy response"
              aria-label={copied ? 'Copied to clipboard' : 'Copy response to clipboard'}
            >
              {copied ? '✓ COPIED' : '⧉ COPY'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MessageBubble;
