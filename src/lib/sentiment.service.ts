/**
 * Customer Sentiment Analysis service — review collection + AI insights.
 *
 * Research finding: Square Customer Insights + Lightspeed Customer Engagement
 * bundle sentiment analysis in higher tiers (~$50/mo). POSR offers it free —
 * collects customer reviews (post-order) + AI analyzes for sentiment, themes,
 * and actionable insights.
 *
 * Architecture:
 *   1. Review collection:
 *      - Post-order prompt (kiosk/tableside asks for 1-5 stars + optional comment)
 *      - Digital receipt follow-up (SMS/email link to /review/:orderId)
 *      - Delivery platform webhooks (DoorDash/UberEats/Grubhub ratings)
 *      - Manual entry (waiter asks, enters in admin)
 *   2. AI analysis (per review):
 *      - Sentiment: positive / neutral / negative / mixed
 *      - Sentiment score: -1.0 to +1.0
 *      - Emotion: joy / satisfaction / disappointment / anger / etc.
 *      - Themes: food_quality / service / price / ambiance / cleanliness /
 *        wait_time / portion_size / temperature / presentation / staff_friendliness
 *      - Mentioned dishes (extracted from comment)
 *      - Actionability: low / medium / high
 *      - Suggested response (for negative reviews, to be edited + sent)
 *      - Key phrases (max 5)
 *   3. Aggregated summaries (daily/weekly/monthly):
 *      - Total reviews, avg rating, avg sentiment score, NPS
 *      - Positive/neutral/negative counts
 *      - Top positive + negative themes
 *      - Top mentioned dishes
 *
 * Fallback: when AI is disabled or unavailable, uses keyword-based sentiment
 * (positive/negative word lists) — less accurate but always works offline.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed';
export type Emotion = 'joy' | 'satisfaction' | 'disappointment' | 'anger' | 'frustration' | 'excitement' | 'neutral';
export type Actionability = 'low' | 'medium' | 'high';
export type ReviewSource = 'manual' | 'sms_receipt' | 'email_receipt' | 'kiosk' | 'doordash' | 'ubereats' | 'grubhub';

export interface CustomerReview {
  id?: string;
  order_id?: string;
  customer?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  rating: number;           // 1-5
  comment?: string;
  tags?: string[];
  source: ReviewSource;
  visit_date?: Date;
  submitted_at?: Date;
  branch_id?: string;
  is_responded?: boolean;
  response_text?: string;
  responded_at?: Date;
  responded_by?: string;
}

export interface SentimentAnalysis {
  id?: string;
  review?: string;
  review_id: string;
  sentiment: Sentiment;
  sentiment_score: number;     // -1.0 to +1.0
  emotion?: Emotion;
  themes: string[];
  mentioned_dishes: string[];
  actionability: Actionability;
  suggested_response?: string;
  key_phrases: string[];
  analyzed_at: Date;
  expires_at?: Date;
  model_used?: string;
}

export interface SentimentSummary {
  id?: string;
  period_type: 'daily' | 'weekly' | 'monthly';
  period_start: Date;
  period_end: Date;
  total_reviews: number;
  avg_rating: number;
  avg_sentiment_score: number;
  nps_score: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  top_positive_themes: string[];
  top_negative_themes: string[];
  top_mentioned_dishes: string[];
  generated_at: Date;
}

export interface SentimentConfig {
  collectionEnabled: boolean;
  aiEnabled: boolean;
  autoRespondThreshold: number;
  reminderDelayHours: number;
}

export const DEFAULT_SENTIMENT_CONFIG: SentimentConfig = {
  collectionEnabled: true,
  aiEnabled: true,
  autoRespondThreshold: 2,
  reminderDelayHours: 2,
};

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

export const readSentimentConfig = (settings: any): SentimentConfig => ({
  collectionEnabled: settings?.sentiment_collection_enabled ?? true,
  aiEnabled: settings?.sentiment_ai_enabled ?? true,
  autoRespondThreshold: safeNumber(settings?.sentiment_auto_respond_threshold, 2),
  reminderDelayHours: safeNumber(settings?.sentiment_reminder_delay_hours, 2),
});

// ---------------------------------------------------------------------------
// Review lifecycle — create, fetch, respond
// ---------------------------------------------------------------------------

const REVIEW_TABLE = 'customer_review';
const ANALYSIS_TABLE = 'sentiment_analysis';
const SUMMARY_TABLE = 'sentiment_summary';

export const createReview = async (
  db: ReturnType<typeof useDB>,
  review: Omit<CustomerReview, 'id' | 'submitted_at'>
): Promise<string> => {
  const now = new Date().toISOString();
  try {
    const result = await db.query<any>(
      `CREATE ${REVIEW_TABLE} CONTENT $data`,
      {
        data: {
          ...review,
          order_id: review.order_id,
          customer: review.customer,
          visit_date: review.visit_date?.toISOString(),
          submitted_at: now,
          is_responded: false,
          tags: review.tags ?? [],
        },
      }
    );
    const id = (result as any)?.id?.toString?.() ?? (Array.isArray(result) ? result[0]?.id?.toString() : '');
    return id;
  } catch (err) {
    console.error('[sentiment] createReview failed', err);
    throw err;
  }
};

export const getRecentReviews = async (
  db: ReturnType<typeof useDB>,
  limit = 50
): Promise<CustomerReview[]> => {
  try {
    const result = await db.query<CustomerReview[]>(
      `SELECT * FROM ${REVIEW_TABLE} ORDER BY submitted_at DESC LIMIT $limit`,
      { limit }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[sentiment] getRecentReviews failed', err);
    return [];
  }
};

export const getReviewsByRating = async (
  db: ReturnType<typeof useDB>,
  minRating: number,
  maxRating: number
): Promise<CustomerReview[]> => {
  try {
    const result = await db.query<CustomerReview[]>(
      `SELECT * FROM ${REVIEW_TABLE} WHERE rating >= $min AND rating <= $max ORDER BY submitted_at DESC`,
      { min: minRating, max: maxRating }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[sentiment] getReviewsByRating failed', err);
    return [];
  }
};

export const respondToReview = async (
  db: ReturnType<typeof useDB>,
  reviewId: string,
  responseText: string,
  userId: string
): Promise<void> => {
  const now = new Date().toISOString();
  await db.query(
    `UPDATE $id SET is_responded = true, response_text = $text, responded_at = $now, responded_by = $user`,
    {
      id: reviewId,
      text: responseText,
      now,
      user: userId,
    }
  );
};

// ---------------------------------------------------------------------------
// Keyword-based sentiment fallback (when AI is unavailable)
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = [
  'excellent', 'amazing', 'great', 'love', 'delicious', 'fantastic', 'wonderful',
  'perfect', 'awesome', 'best', 'fresh', 'friendly', 'fast', 'clean', 'recommend',
  'tasty', 'yummy', 'enjoyed', 'happy', 'satisfied', 'generous', 'comfortable',
];

const NEGATIVE_WORDS = [
  'terrible', 'awful', 'bad', 'worst', 'cold', 'slow', 'rude', 'dirty', 'disgusting',
  'horrible', 'disappointed', 'overpriced', 'bland', 'salty', 'burnt', 'undercooked',
  'raw', 'stale', 'unprofessional', 'ignored', 'forgot', 'wrong', 'mistake', 'never',
  'never again', 'waste', 'expensive', 'small', 'tiny', 'portion',
];

const THEME_KEYWORDS: Record<string, string[]> = {
  food_quality: ['taste', 'flavor', 'delicious', 'bland', 'salty', 'spicy', 'cold food', 'hot food', 'fresh', 'stale'],
  service: ['waiter', 'staff', 'service', 'friendly', 'rude', 'helpful', 'attentive', 'ignored', 'forgot'],
  price: ['expensive', 'overpriced', 'cheap', 'value', 'worth', 'pricey', 'affordable'],
  ambiance: ['atmosphere', 'ambiance', 'music', 'loud', 'quiet', 'cozy', 'modern', 'decor'],
  cleanliness: ['clean', 'dirty', 'hygiene', 'sanitary', 'messy'],
  wait_time: ['slow', 'fast', 'waited', 'quick', 'long wait', 'wait time'],
  portion_size: ['portion', 'small', 'large', 'generous', 'tiny', 'big'],
  temperature: ['hot', 'cold', 'warm', 'lukewarm', 'burnt'],
  presentation: ['presentation', 'plating', 'beautiful', 'messy', 'looks'],
  staff_friendliness: ['friendly', 'rude', 'welcoming', 'warm', 'cold'],
};

const keywordSentiment = (comment: string): { sentiment: Sentiment; score: number } => {
  if (!comment) return { sentiment: 'neutral', score: 0 };
  const lower = comment.toLowerCase();
  let positive = 0;
  let negative = 0;
  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) positive++;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negative++;
  }
  const score = positive + negative > 0 ? (positive - negative) / (positive + negative) : 0;
  let sentiment: Sentiment = 'neutral';
  if (score > 0.3) sentiment = 'positive';
  else if (score < -0.3) sentiment = 'negative';
  else if (positive > 0 && negative > 0) sentiment = 'mixed';
  return { sentiment, score };
};

const extractThemes = (comment: string): string[] => {
  if (!comment) return [];
  const lower = comment.toLowerCase();
  const themes: string[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      themes.push(theme);
    }
  }
  return themes;
};

// ---------------------------------------------------------------------------
// AI analysis — per-review sentiment + themes + suggested response
// ---------------------------------------------------------------------------

const analyzeReviewWithAI = async (
  review: CustomerReview,
  dishNames: string[]
): Promise<Partial<SentimentAnalysis>> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[sentiment] OpenAI not available — using keyword fallback');
    return keywordFallback(review, dishNames);
  }

  const prompt = `You are a restaurant customer feedback analyst.
Analyze this review and respond with valid JSON only.

Review:
  Rating: ${review.rating}/5
  Comment: "${review.comment ?? '(no comment)'}"
  Known dishes (mention if any appear): ${dishNames.slice(0, 50).join(', ')}

Respond with this exact JSON structure:
{
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "sentiment_score": <number -1.0 to 1.0>,
  "emotion": "joy" | "satisfaction" | "disappointment" | "anger" | "frustration" | "excitement" | "neutral",
  "themes": [<array of: food_quality, service, price, ambiance, cleanliness, wait_time, portion_size, temperature, presentation, staff_friendliness>],
  "mentioned_dishes": [<array of dish names found in comment>],
  "actionability": "low" | "medium" | "high",
  "suggested_response": "<max 300 chars, only for negative reviews — empathetic + actionable, empty string for positive>",
  "key_phrases": [<max 5 notable phrases>]
}`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant customer feedback analyst AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2, maxTokens: 600 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return keywordFallback(review, dishNames);
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      sentiment: parsed.sentiment ?? 'neutral',
      sentiment_score: safeNumber(parsed.sentiment_score, 0),
      emotion: parsed.emotion,
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      mentioned_dishes: Array.isArray(parsed.mentioned_dishes) ? parsed.mentioned_dishes : [],
      actionability: parsed.actionability ?? 'low',
      suggested_response: parsed.suggested_response || undefined,
      key_phrases: Array.isArray(parsed.key_phrases) ? parsed.key_phrases.slice(0, 5) : [],
      model_used: 'openai',
    };
  } catch (err) {
    console.warn('[sentiment] AI analysis failed — using keyword fallback', err);
    return keywordFallback(review, dishNames);
  }
};

const keywordFallback = (
  review: CustomerReview,
  dishNames: string[]
): Partial<SentimentAnalysis> => {
  const comment = review.comment ?? '';
  const { sentiment, score } = keywordSentiment(comment);
  const themes = extractThemes(comment);
  const mentioned = dishNames.filter(name =>
    comment.toLowerCase().includes(name.toLowerCase())
  );
  // If rating is low but comment is empty/neutral, infer negative from rating
  let finalSentiment = sentiment;
  let finalScore = score;
  if (review.rating <= 2 && finalSentiment === 'neutral') {
    finalSentiment = 'negative';
    finalScore = -0.5;
  } else if (review.rating >= 4 && finalSentiment === 'neutral') {
    finalSentiment = 'positive';
    finalScore = 0.5;
  }
  return {
    sentiment: finalSentiment,
    sentiment_score: finalScore,
    emotion: finalSentiment === 'positive' ? 'satisfaction' : finalSentiment === 'negative' ? 'disappointment' : 'neutral',
    themes,
    mentioned_dishes: mentioned,
    actionability: review.rating <= 2 ? 'high' : review.rating === 3 ? 'medium' : 'low',
    suggested_response: review.rating <= 2 ? `Thank you for your feedback. We're sorry your experience didn't meet expectations — we'd love to make it right. Please reach out to management.` : undefined,
    key_phrases: [],
    model_used: 'keyword-fallback',
  };
};

// ---------------------------------------------------------------------------
// Main entry — analyze all unanalyzed reviews
// ---------------------------------------------------------------------------

export interface AnalyzeResult {
  analyzed: number;
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
  highActionability: number;
  generatedAt: Date;
}

export const analyzeUnanalyzedReviews = async (
  db: ReturnType<typeof useDB>,
  config: SentimentConfig = DEFAULT_SENTIMENT_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeResult> => {
  // 1. Find reviews without analysis (or expired analysis)
  let unanalyzed: CustomerReview[] = [];
  try {
    const result = await db.query<CustomerReview[]>(
      `SELECT * FROM ${REVIEW_TABLE}
       WHERE id NOT IN (SELECT review_id FROM ${ANALYSIS_TABLE} WHERE expires_at > time::now())
       ORDER BY submitted_at DESC
       LIMIT 100`
    );
    unanalyzed = Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[sentiment] fetch unanalyzed failed', err);
    return { analyzed: 0, positive: 0, neutral: 0, negative: 0, mixed: 0, highActionability: 0, generatedAt: new Date() };
  }

  if (unanalyzed.length === 0) {
    return { analyzed: 0, positive: 0, neutral: 0, negative: 0, mixed: 0, highActionability: 0, generatedAt: new Date() };
  }

  // 2. Fetch dish names for matching (single query)
  let dishNames: string[] = [];
  try {
    const dishResult = await db.query<any[]>('SELECT name FROM dish WHERE deleted_at IS NONE');
    dishNames = (Array.isArray(dishResult) ? dishResult.flat() : []).map(d => d.name).filter(Boolean);
  } catch {
    // Continue without dish matching
  }

  // 3. Analyze each review
  let processed = 0;
  const counts = { positive: 0, neutral: 0, negative: 0, mixed: 0, highActionability: 0 };

  for (const review of unanalyzed) {
    if (onProgress) onProgress(++processed, unanalyzed.length);
    const reviewId = review.id?.toString?.() ?? '';
    if (!reviewId) continue;

    const analysis = config.aiEnabled
      ? await analyzeReviewWithAI(review, dishNames)
      : keywordFallback(review, dishNames);

    const fullAnalysis: SentimentAnalysis = {
      review_id: reviewId,
      sentiment: analysis.sentiment ?? 'neutral',
      sentiment_score: safeNumber(analysis.sentiment_score, 0),
      emotion: analysis.emotion,
      themes: analysis.themes ?? [],
      mentioned_dishes: analysis.mentioned_dishes ?? [],
      actionability: analysis.actionability ?? 'low',
      suggested_response: analysis.suggested_response,
      key_phrases: analysis.key_phrases ?? [],
      analyzed_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      model_used: analysis.model_used,
    };

    // Count
    counts[fullAnalysis.sentiment as keyof typeof counts] = (counts[fullAnalysis.sentiment as keyof typeof counts] ?? 0) + 1;
    if (fullAnalysis.actionability === 'high') counts.highActionability++;

    // Persist
    try {
      await db.query(
        `CREATE ${ANALYSIS_TABLE} CONTENT $data`,
        {
          data: {
            ...fullAnalysis,
            review: reviewId,
            analyzed_at: fullAnalysis.analyzed_at.toISOString(),
            expires_at: fullAnalysis.expires_at?.toISOString(),
          },
        }
      );
    } catch (err) {
      console.warn('[sentiment] persist analysis failed for', reviewId, err);
    }
  }

  return {
    analyzed: unanalyzed.length,
    ...counts,
    generatedAt: new Date(),
  };
};

// ---------------------------------------------------------------------------
// Summary aggregation — daily/weekly/monthly rollups
// ---------------------------------------------------------------------------

export const generateSummary = async (
  db: ReturnType<typeof useDB>,
  periodType: 'daily' | 'weekly' | 'monthly' = 'weekly'
): Promise<SentimentSummary | null> => {
  const now = new Date();
  const periodStart = periodType === 'daily'
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : periodType === 'weekly'
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Fetch reviews in the period
    const reviewsResult = await db.query<CustomerReview[]>(
      `SELECT * FROM ${REVIEW_TABLE} WHERE submitted_at >= $start AND submitted_at <= $end`,
      { start: periodStart.toISOString(), end: now.toISOString() }
    );
    const reviews = Array.isArray(reviewsResult) ? reviewsResult.flat() : [];
    if (reviews.length === 0) return null;

    // Fetch analyses for these reviews
    const reviewIds = reviews.map(r => r.id?.toString?.()).filter(Boolean) as string[];
    const analysesResult = await db.query<SentimentAnalysis[]>(
      `SELECT * FROM ${ANALYSIS_TABLE} WHERE review_id IN $ids`,
      { ids: reviewIds }
    );
    const analyses = Array.isArray(analysesResult) ? analysesResult.flat() : [];

    // Compute aggregates
    const totalReviews = reviews.length;
    const avgRating = reviews.reduce((s, r) => s + safeNumber(r.rating, 0), 0) / totalReviews;
    const analysesWithScore = analyses.filter(a => a.sentiment_score !== undefined);
    const avgSentiment = analysesWithScore.length > 0
      ? analysesWithScore.reduce((s, a) => s + safeNumber(a.sentiment_score, 0), 0) / analysesWithScore.length
      : 0;

    // NPS: promoters (4-5) - detractors (1-2), as percentage
    const promoters = reviews.filter(r => safeNumber(r.rating, 0) >= 4).length;
    const detractors = reviews.filter(r => safeNumber(r.rating, 0) <= 2).length;
    const npsScore = totalReviews > 0 ? ((promoters - detractors) / totalReviews) * 100 : 0;

    const positiveCount = analyses.filter(a => a.sentiment === 'positive').length;
    const negativeCount = analyses.filter(a => a.sentiment === 'negative').length;
    const neutralCount = analyses.filter(a => a.sentiment === 'neutral').length;

    // Top themes (positive vs negative)
    const positiveThemes = new Map<string, number>();
    const negativeThemes = new Map<string, number>();
    for (const a of analyses) {
      for (const theme of (a.themes ?? [])) {
        if (a.sentiment === 'positive') {
          positiveThemes.set(theme, (positiveThemes.get(theme) ?? 0) + 1);
        } else if (a.sentiment === 'negative') {
          negativeThemes.set(theme, (negativeThemes.get(theme) ?? 0) + 1);
        }
      }
    }
    const topPositiveThemes = Array.from(positiveThemes.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    const topNegativeThemes = Array.from(negativeThemes.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

    // Top mentioned dishes
    const dishMentions = new Map<string, number>();
    for (const a of analyses) {
      for (const dish of (a.mentioned_dishes ?? [])) {
        dishMentions.set(dish, (dishMentions.get(dish) ?? 0) + 1);
      }
    }
    const topMentionedDishes = Array.from(dishMentions.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([d]) => d);

    const summary: SentimentSummary = {
      period_type: periodType,
      period_start: periodStart,
      period_end: now,
      total_reviews: totalReviews,
      avg_rating: Math.round(avgRating * 10) / 10,
      avg_sentiment_score: Math.round(avgSentiment * 100) / 100,
      nps_score: Math.round(npsScore),
      positive_count: positiveCount,
      neutral_count: neutralCount,
      negative_count: negativeCount,
      top_positive_themes: topPositiveThemes,
      top_negative_themes: topNegativeThemes,
      top_mentioned_dishes: topMentionedDishes,
      generated_at: now,
    };

    // Persist summary
    try {
      await db.query(
        `CREATE ${SUMMARY_TABLE} CONTENT $data`,
        {
          data: {
            ...summary,
            period_start: summary.period_start.toISOString(),
            period_end: summary.period_end.toISOString(),
            generated_at: summary.generated_at.toISOString(),
          },
        }
      );
    } catch (err) {
      console.warn('[sentiment] persist summary failed', err);
    }

    return summary;
  } catch (err) {
    console.error('[sentiment] generateSummary failed', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Analysis retrieval
// ---------------------------------------------------------------------------

export const getRecentAnalyses = async (
  db: ReturnType<typeof useDB>,
  limit = 50
): Promise<{ review: CustomerReview; analysis?: SentimentAnalysis }[]> => {
  try {
    const result = await db.query<any[]>(
      `SELECT
         *,
         (SELECT * FROM ${ANALYSIS_TABLE} WHERE review_id = $parent.id ORDER BY analyzed_at DESC LIMIT 1)[0] AS analysis
       FROM ${REVIEW_TABLE}
       ORDER BY submitted_at DESC
       LIMIT $limit`,
      { limit }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map(r => ({
      review: r as CustomerReview,
      analysis: r.analysis as SentimentAnalysis | undefined,
    }));
  } catch (err) {
    console.error('[sentiment] getRecentAnalyses failed', err);
    return [];
  }
};

export const getLatestSummary = async (
  db: ReturnType<typeof useDB>,
  periodType: 'daily' | 'weekly' | 'monthly' = 'weekly'
): Promise<SentimentSummary | null> => {
  try {
    const result = await db.query<SentimentSummary[]>(
      `SELECT * FROM ${SUMMARY_TABLE}
       WHERE period_type = $type
       ORDER BY generated_at DESC LIMIT 1`,
      { type: periodType }
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list[0] ?? null;
  } catch (err) {
    console.error('[sentiment] getLatestSummary failed', err);
    return null;
  }
};
