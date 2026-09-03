/**
 * AI Social Media Content Generator — platform-specific post generation.
 *
 * 52nd POSR-exclusive differentiator — restaurants spend $200-$500/mo on
 * social media management (Hootsuite, Buffer, Sprout Social) + $50-150/mo
 * on content creation. 73% say social is #1 marketing channel but 68%
 * struggle with consistent content (NRA).
 *
 * Distinct from:
 *   - marketing.service (email/SMS campaigns to existing customers — NOT
 *     social media content generation for acquisition)
 *   - sentiment.service (analyzes reviews — doesn't create social posts)
 *   - review-response.service (responds to reviews — doesn't generate
 *     promotional social content)
 *   - menu-optimization.service (BCG matrix — not social media)
 *   - promo-analytics.service (tracks promo performance — doesn't create content)
 *
 * Auto-generates platform-specific social content from restaurant data:
 *   - Menu highlights (new dishes, bestsellers, seasonal specials)
 *   - Customer reviews (turn 5★ reviews into promotional posts)
 *   - Events/promotions (happy hour, live music, holiday menus)
 *   - Behind-the-scenes (kitchen prep, staff spotlights)
 *   - Engagement posts (polls, questions, food facts)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type SocialRuleId =
  | 'menu_highlight'
  | 'review_showcase'
  | 'event_promotion'
  | 'behind_scenes'
  | 'engagement_poll';

export type SocialAiRec =
  | 'post_now'
  | 'schedule_optimal'
  | 'edit_image_first'
  | 'hold_for_event'
  | 'monitor';

export type Platform = 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'linkedin';
export type ContentType = 'image_post' | 'carousel' | 'story' | 'reel' | 'text_only';

export interface SocialPost {
  id?: string;
  rule_id: SocialRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  platform: Platform;
  content_type: ContentType;
  caption?: string;
  hashtags?: string;
  suggested_image_prompt?: string;
  best_post_time?: Date;
  source_data?: string;
  est_reach: number;
  est_engagement_rate: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: SocialAiRec;
  status: 'open' | 'scheduled' | 'posted' | 'declined' | 'expired';
  posted_at?: Date;
  detected_at: Date;
  expires_at?: Date;
}

export interface SocialConfig {
  aiEnabled: boolean;
  brandVoice: 'formal' | 'casual' | 'playful';
  hashtagCount: number;
  maxCaptionChars: number;
}

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  aiEnabled: true,
  brandVoice: 'casual',
  hashtagCount: 8,
  maxCaptionChars: 2200,
};

export const readSocialConfig = (settings: any): SocialConfig => ({
  aiEnabled: settings?.social_ai_enabled ?? true,
  brandVoice: (settings?.social_brand_voice as 'formal' | 'casual' | 'playful') ?? 'casual',
  hashtagCount: safeNumber(settings?.social_hashtag_count, 8),
  maxCaptionChars: safeNumber(settings?.social_max_caption_chars, 2200),
});

const PLATFORM_LIMITS: Record<Platform, { maxChars: number; maxHashtags: number; contentType: ContentType }> = {
  instagram: { maxChars: 2200, maxHashtags: 30, contentType: 'image_post' },
  facebook:  { maxChars: 63206, maxHashtags: 10, contentType: 'image_post' },
  twitter:   { maxChars: 280, maxHashtags: 3, contentType: 'text_only' },
  tiktok:    { maxChars: 2200, maxHashtags: 8, contentType: 'reel' },
  linkedin:  { maxChars: 3000, maxHashtags: 5, contentType: 'image_post' },
};

// Best posting times (local time, hour: 0-23) — industry benchmarks
const BEST_POST_TIMES: Record<Platform, number[]> = {
  instagram: [11, 13, 17, 19],   // lunch + after work + evening
  facebook:  [9, 13, 15],        // morning + lunch + afternoon
  twitter:   [8, 12, 17, 18],    // commute + lunch + after work
  tiktok:    [6, 10, 22],        // early morning + late evening
  linkedin:  [8, 10, 12],        // business hours
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface DishData {
  id: string;
  name: string;
  price: number;
  category: string;
  units_sold: number;
}

interface ReviewData {
  id: string;
  customer_name: string;
  rating: number;
  text: string;
  platform: string;
}

/**
 * Run the social content generator engine.
 * Fetches restaurant data (top dishes, positive reviews), generates
 * platform-specific social posts.
 */
export const runSocialEngine = async (
  db: ReturnType<typeof useDB>,
  config: SocialConfig = DEFAULT_SOCIAL_CONFIG
): Promise<{ posts: SocialPost[]; generated: number }> => {
  const posts: SocialPost[] = [];
  const now = new Date();

  // 1. Fetch top-selling dishes (bestsellers for menu_highlight posts)
  let topDishes: DishData[] = [];
  try {
    const result = await db.query(
      `SELECT
         item.id AS id,
         item.name AS name,
         item.price AS price,
         item.category AS category,
         math::sum(quantity) AS units_sold
       FROM order_item
       WHERE order.status = 'Paid'
         AND order.deleted_at IS NONE
         AND deleted_at IS NONE
         AND item IS NOT NONE
         AND created_at > time::now() - 7d
       GROUP BY item.id, item.name, item.price, item.category
       ORDER BY units_sold DESC
       LIMIT 10`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    topDishes = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Unknown Dish'),
      price: safeNumber(r.price, 0),
      category: String(r.category ?? ''),
      units_sold: safeNumber(r.units_sold, 0),
    })).filter(d => d.units_sold >= 3);
  } catch (err) {
    console.warn('[social] fetchTopDishes failed', err);
  }

  // 2. Fetch recent 5-star reviews (for review_showcase posts)
  let topReviews: ReviewData[] = [];
  try {
    const result = await db.query(
      `SELECT id, customer.name AS customer_name, rating, text, platform
       FROM review
       WHERE rating >= 4
         AND text IS NOT NONE
         AND text != ''
         AND deleted_at IS NONE
         AND created_at > time::now() - 14d
       ORDER BY created_at DESC
       LIMIT 10`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    topReviews = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      customer_name: String(r.customer_name ?? 'Anonymous'),
      rating: safeNumber(r.rating, 5),
      text: String(r.text ?? ''),
      platform: String(r.platform ?? 'internal'),
    })).filter(r => r.text.length > 20);
  } catch (err) {
    console.warn('[social] fetchTopReviews failed', err);
  }

  // 3. Generate posts per platform
  const platforms: Platform[] = ['instagram', 'facebook', 'twitter', 'tiktok', 'linkedin'];

  // --- Rule 1: MENU_HIGHLIGHT — bestseller dish posts ---
  if (topDishes.length > 0) {
    const topDish = topDishes[0];
    for (const platform of platforms) {
      const limit = PLATFORM_LIMITS[platform];
      const post = await generateMenuHighlightPost(db, config, platform, topDish, limit, now);
      if (post) posts.push(post);
    }
  }

  // --- Rule 2: REVIEW_SHOWCASE — turn 5★ review into promotional post ---
  if (topReviews.length > 0) {
    const topReview = topReviews[0];
    // Only Instagram + Facebook for review showcases (visual platforms)
    for (const platform of ['instagram', 'facebook'] as Platform[]) {
      const limit = PLATFORM_LIMITS[platform];
      const post = await generateReviewShowcasePost(db, config, platform, topReview, limit, now);
      if (post) posts.push(post);
    }
  }

  // --- Rule 3: EVENT_PROMOTION — happy hour / weekend special posts ---
  // Generate event promo for Instagram + Facebook + Twitter
  for (const platform of ['instagram', 'facebook', 'twitter'] as Platform[]) {
    const limit = PLATFORM_LIMITS[platform];
    const post = await generateEventPromoPost(db, config, platform, limit, now);
    if (post) posts.push(post);
  }

  // --- Rule 4: BEHIND_SCENES — kitchen/staff spotlight ---
  // Only Instagram + TikTok (visual storytelling platforms)
  for (const platform of ['instagram', 'tiktok'] as Platform[]) {
    const limit = PLATFORM_LIMITS[platform];
    const post = await generateBehindScenesPost(db, config, platform, limit, now);
    if (post) posts.push(post);
  }

  // --- Rule 5: ENGAGEMENT_POLL — audience interaction posts ---
  // Twitter + Instagram Stories (polls work best here)
  for (const platform of ['twitter', 'instagram'] as Platform[]) {
    const limit = PLATFORM_LIMITS[platform];
    const post = await generateEngagementPollPost(db, config, platform, limit, now);
    if (post) posts.push(post);
  }

  // 4. AI insight for top 5 high-priority posts
  if (config.aiEnabled && posts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topPosts = posts
        .filter(p => p.severity === 'high' || p.severity === 'medium')
        .slice(0, 5);
      for (const p of topPosts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a social media strategy AI for restaurants. Respond with a single insight (max 200 chars).' },
            { role: 'user', content: `Post for ${p.platform} (${p.rule_id}): est reach ${p.est_reach}, engagement ${p.est_engagement_rate}%. Caption preview: ${(p.caption ?? '').slice(0, 100)}...` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          p.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM social_post WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const p of posts) {
    try {
      await db.query(`CREATE social_post CONTENT $data`, {
        data: {
          ...p,
          best_post_time: p.best_post_time?.toISOString(),
          detected_at: p.detected_at.toISOString(),
        },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { posts, generated: posts.length };
};

// ---------------------------------------------------------------------------
// Post generators (one per rule)
// ---------------------------------------------------------------------------

const generateMenuHighlightPost = async (
  db: ReturnType<typeof useDB>,
  config: SocialConfig,
  platform: Platform,
  dish: DishData,
  limit: { maxChars: number; maxHashtags: number; contentType: ContentType },
  now: Date
): Promise<SocialPost | null> => {
  let caption = '';
  let hashtags = '';
  let imagePrompt = '';

  if (config.aiEnabled) {
    try {
      const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
      if (callOpenAIChat) {
        const voiceInstruction = config.brandVoice === 'formal'
          ? 'Formal, elegant tone (fine dining)'
          : config.brandVoice === 'playful'
          ? 'Playful, energetic tone with food puns and humor'
          : 'Casual, friendly tone (neighborhood spot)';

        const platformInstruction = platform === 'instagram'
          ? 'Instagram: visual-first, emoji-rich, end with call-to-action'
          : platform === 'twitter'
          ? 'Twitter/X: punchy, under 280 chars, 1-2 hashtags max'
          : platform === 'facebook'
          ? 'Facebook: conversational, ask a question to drive comments'
          : platform === 'tiktok'
          ? 'TikTok: trendy, use current slang, encourage duets/stitches'
          : 'LinkedIn: professional, focus on craftsmanship and quality';

        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a social media content writer for restaurants. Generate a single post caption, no preamble.' },
          { role: 'user', content: `Create a social media post for our bestselling dish:
Dish: ${dish.name}
Price: $${dish.price.toFixed(2)}
Category: ${dish.category}
Units sold this week: ${dish.units_sold}

Requirements:
- ${voiceInstruction}
- ${platformInstruction}
- Max ${Math.min(limit.maxChars, config.maxCaptionChars)} characters
- Include ${Math.min(limit.maxHashtags, config.hashtagCount)} relevant hashtags at the end
- Do not use placeholders` },
        ], { temperature: 0.7, maxTokens: 300 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        // Split caption and hashtags
        const hashtagMatch = text.match(/(#[\w]+(?:\s+#[\w]+)*)\s*$/);
        if (hashtagMatch) {
          caption = text.slice(0, hashtagMatch.index).trim();
          hashtags = hashtagMatch[1];
        } else {
          caption = text.trim();
        }
        caption = caption.slice(0, limit.maxChars);
      }
    } catch (err) {
      console.warn('[social] AI caption failed', err);
    }
  }

  // Fallback caption
  if (!caption) {
    const emoji = platform === 'instagram' ? ' 🍽️✨' : '';
    caption = `Our bestselling ${dish.name} just got even better! ${dish.units_sold} orders this week alone. Come taste why everyone's talking about it${emoji}`;
    hashtags = `#${dish.category.replace(/\s+/g, '')} #bestseller #foodie #restaurant #${platform === 'instagram' ? 'instafood' : 'localfood'}`;
  }

  // Image prompt for AI image generation or stock photo search
  imagePrompt = `Professional food photography of ${dish.name}, ${dish.category} cuisine, appetizing presentation, warm lighting, shallow depth of field, top-down angle`;

  // Best post time (pick next optimal slot)
  const optimalHours = BEST_POST_TIMES[platform];
  const nextOptimal = getNextOptimalTime(now, optimalHours);

  // Estimated reach (platform benchmarks)
  const estReach = platform === 'instagram' ? 350 + dish.units_sold * 10
    : platform === 'facebook' ? 200 + dish.units_sold * 5
    : platform === 'twitter' ? 100 + dish.units_sold * 3
    : platform === 'tiktok' ? 500 + dish.units_sold * 15
    : 80 + dish.units_sold * 2; // linkedin

  const estEngagement = platform === 'instagram' ? 0.045
    : platform === 'tiktok' ? 0.058
    : platform === 'twitter' ? 0.012
    : platform === 'facebook' ? 0.025
    : 0.018; // linkedin

  return {
    rule_id: 'menu_highlight',
    severity: 'high',
    platform,
    content_type: limit.contentType,
    caption,
    hashtags: hashtags.split(/\s+/).slice(0, Math.min(limit.maxHashtags, config.hashtagCount)).join(' '),
    suggested_image_prompt: imagePrompt,
    best_post_time: nextOptimal,
    source_data: JSON.stringify({ dish_id: dish.id, dish_name: dish.name, units_sold: dish.units_sold }),
    est_reach: Math.round(estReach),
    est_engagement_rate: estEngagement,
    description: `${platform} ${limit.contentType} — ${dish.name} (bestseller, ${dish.units_sold} sold/wk)`,
    ai_recommendation: 'schedule_optimal',
    status: 'open',
    detected_at: now,
  };
};

const generateReviewShowcasePost = async (
  db: ReturnType<typeof useDB>,
  config: SocialConfig,
  platform: Platform,
  review: ReviewData,
  limit: { maxChars: number; maxHashtags: number; contentType: ContentType },
  now: Date
): Promise<SocialPost | null> => {
  let caption = '';

  if (config.aiEnabled) {
    try {
      const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
      if (callOpenAIChat) {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a social media content writer for restaurants. Generate a single post caption that turns a customer review into a promotional social post, no preamble.' },
          { role: 'user', content: `Turn this ${review.rating}★ review into a social media post for ${platform}:

Review from ${review.customer_name}: "${review.text}"

Requirements:
- ${config.brandVoice} tone
- Quote the review (paraphrase if too long)
- Add grateful response + invitation to visit again
- Max ${Math.min(limit.maxChars, config.maxCaptionChars)} characters
- Include 3-5 relevant hashtags` },
        ], { temperature: 0.6, maxTokens: 250 });

        caption = typeof response === 'string' ? response : (response as any)?.content ?? '';
        caption = caption.slice(0, limit.maxChars);
      }
    } catch (err) {
      console.warn('[social] AI review post failed', err);
    }
  }

  // Fallback
  if (!caption) {
    const shortReview = review.text.length > 100 ? review.text.slice(0, 100) + '...' : review.text;
    caption = `"${shortReview}" — ${review.customer_name}\n\nThis is why we do what we do! Thank you for the love. Come taste what everyone's raving about. 💛\n\n#customerlove #5star #review #restaurant #foodie`;
  }

  const optimalHours = BEST_POST_TIMES[platform];
  const nextOptimal = getNextOptimalTime(now, optimalHours);

  return {
    rule_id: 'review_showcase',
    severity: 'medium',
    platform,
    content_type: limit.contentType,
    caption,
    hashtags: '#customerlove #review #5star #restaurant #foodie',
    suggested_image_prompt: `Customer testimonial graphic featuring the review quote, elegant typography, restaurant branding, warm background`,
    best_post_time: nextOptimal,
    source_data: JSON.stringify({ review_id: review.id, customer_name: review.customer_name, rating: review.rating }),
    est_reach: platform === 'instagram' ? 280 : 180,
    est_engagement_rate: platform === 'instagram' ? 0.038 : 0.022,
    description: `${platform} — ${review.rating}★ review showcase from ${review.customer_name}`,
    ai_recommendation: 'schedule_optimal',
    status: 'open',
    detected_at: now,
  };
};

const generateEventPromoPost = async (
  db: ReturnType<typeof useDB>,
  config: SocialConfig,
  platform: Platform,
  limit: { maxChars: number; maxHashtags: number; contentType: ContentType },
  now: Date
): Promise<SocialPost | null> => {
  // Detect upcoming event (happy hour, weekend, etc.)
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Fri/Sat
  const eventText = isWeekend ? 'Weekend Special' : 'Happy Hour';
  const eventDesc = isWeekend
    ? 'Join us this weekend for our signature dishes + craft cocktails'
    : 'Happy Hour 4-6 PM: 50% off appetizers + $5 signature cocktails';

  let caption = '';
  if (config.aiEnabled) {
    try {
      const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
      if (callOpenAIChat) {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a social media content writer for restaurants. Generate a single promotional post, no preamble.' },
          { role: 'user', content: `Create a ${platform} post for: ${eventText}
Details: ${eventDesc}
Tone: ${config.brandVoice}
Max ${Math.min(limit.maxChars, config.maxCaptionChars)} chars
Include 3-5 hashtags` },
        ], { temperature: 0.7, maxTokens: 200 });
        caption = typeof response === 'string' ? response : (response as any)?.content ?? '';
        caption = caption.slice(0, limit.maxChars);
      }
    } catch { /* skip */ }
  }

  if (!caption) {
    caption = `${eventText} is here! 🎉 ${eventDesc}. Tag a friend who needs to try this. #${eventText.replace(/\s+/g, '').toLowerCase()} #special #restaurant`;
  }

  const optimalHours = BEST_POST_TIMES[platform];
  const nextOptimal = getNextOptimalTime(now, optimalHours);

  return {
    rule_id: 'event_promotion',
    severity: 'high',
    platform,
    content_type: limit.contentType,
    caption,
    hashtags: `#${eventText.replace(/\s+/g, '').toLowerCase()} #special #restaurant #foodie #${platform === 'instagram' ? 'instafood' : 'local'}`,
    suggested_image_prompt: `Promotional graphic for ${eventText}, vibrant colors, food and drinks, event details overlay`,
    best_post_time: nextOptimal,
    source_data: JSON.stringify({ event: eventText, description: eventDesc }),
    est_reach: platform === 'instagram' ? 400 : platform === 'facebook' ? 250 : 120,
    est_engagement_rate: platform === 'instagram' ? 0.042 : platform === 'twitter' ? 0.015 : 0.028,
    description: `${platform} — ${eventText} promotion`,
    ai_recommendation: 'post_now',
    status: 'open',
    detected_at: now,
  };
};

const generateBehindScenesPost = async (
  db: ReturnType<typeof useDB>,
  config: SocialConfig,
  platform: Platform,
  limit: { maxChars: number; maxHashtags: number; contentType: ContentType },
  now: Date
): Promise<SocialPost | null> => {
  let caption = '';
  if (config.aiEnabled) {
    try {
      const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
      if (callOpenAIChat) {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a social media content writer for restaurants. Generate a single behind-the-scenes post, no preamble.' },
          { role: 'user', content: `Create a ${platform} behind-the-scenes post showing kitchen prep / chef at work.
Tone: ${config.brandVoice}, authentic, humanizing
Max ${Math.min(limit.maxChars, config.maxCaptionChars)} chars
Include 3-5 hashtags` },
        ], { temperature: 0.7, maxTokens: 200 });
        caption = typeof response === 'string' ? response : (response as any)?.content ?? '';
        caption = caption.slice(0, limit.maxChars);
      }
    } catch { /* skip */ }
  }

  if (!caption) {
    caption = platform === 'tiktok'
      ? 'POV: You\'re in the kitchen with us 🧑‍🍳 Watch how the magic happens. #behindthescenes #kitchen #chef #restaurant #pov'
      : 'Behind the scenes: where the magic happens ✨ Every plate starts here. #behindthescenes #kitchen #cheflife #restaurant #foodie';
  }

  const optimalHours = BEST_POST_TIMES[platform];
  const nextOptimal = getNextOptimalTime(now, optimalHours);

  return {
    rule_id: 'behind_scenes',
    severity: 'medium',
    platform,
    content_type: platform === 'tiktok' ? 'reel' : 'image_post',
    caption,
    hashtags: '#behindthescenes #kitchen #cheflife #restaurant #foodie',
    suggested_image_prompt: `Behind-the-scenes kitchen photo, chef plating a dish, action shot, warm kitchen lighting, authentic candid moment`,
    best_post_time: nextOptimal,
    source_data: JSON.stringify({ scene: 'kitchen_prep' }),
    est_reach: platform === 'tiktok' ? 600 : 320,
    est_engagement_rate: platform === 'tiktok' ? 0.065 : 0.048,
    description: `${platform} — behind the scenes kitchen spotlight`,
    ai_recommendation: 'edit_image_first',
    status: 'open',
    detected_at: now,
  };
};

const generateEngagementPollPost = async (
  db: ReturnType<typeof useDB>,
  config: SocialConfig,
  platform: Platform,
  limit: { maxChars: number; maxHashtags: number; contentType: ContentType },
  now: Date
): Promise<SocialPost | null> => {
  let caption = '';
  if (config.aiEnabled) {
    try {
      const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
      if (callOpenAIChat) {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a social media content writer for restaurants. Generate a single engagement poll post, no preamble.' },
          { role: 'user', content: `Create a ${platform} poll/engagement post asking followers a food-related question.
Tone: ${config.brandVoice}, interactive, fun
Max ${Math.min(limit.maxChars, config.maxCaptionChars)} chars
Include 2-3 hashtags
End with a clear question for followers to answer` },
        ], { temperature: 0.8, maxTokens: 150 });
        caption = typeof response === 'string' ? response : (response as any)?.content ?? '';
        caption = caption.slice(0, limit.maxChars);
      }
    } catch { /* skip */ }
  }

  if (!caption) {
    caption = platform === 'twitter'
      ? 'Quick poll: What\'s your go-to comfort food? 🍕🍜🌮 Reply with your pick!'
      : 'Let\'s settle this: sweet or savory breakfast? 🥞🥓 Drop your vote in the comments! #poll #foodie #breakfast';
  }

  const optimalHours = BEST_POST_TIMES[platform];
  const nextOptimal = getNextOptimalTime(now, optimalHours);

  return {
    rule_id: 'engagement_poll',
    severity: 'low',
    platform,
    content_type: platform === 'instagram' ? 'story' : 'text_only',
    caption,
    hashtags: '#poll #foodie #question #restaurant',
    suggested_image_prompt: undefined, // polls are often text-only or story format
    best_post_time: nextOptimal,
    source_data: JSON.stringify({ poll_type: 'food_question' }),
    est_reach: platform === 'twitter' ? 150 : 250,
    est_engagement_rate: platform === 'twitter' ? 0.025 : 0.055, // polls drive higher engagement
    description: `${platform} — engagement poll to boost audience interaction`,
    ai_recommendation: 'post_now',
    status: 'open',
    detected_at: now,
  };
};

// Helper: get next optimal posting time
const getNextOptimalTime = (now: Date, optimalHours: number[]): Date => {
  const currentHour = now.getHours();
  for (const hour of optimalHours) {
    if (hour > currentHour) {
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      return next;
    }
  }
  // All optimal hours passed today — schedule for tomorrow's first optimal slot
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(optimalHours[0], 0, 0, 0);
  return tomorrow;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActivePosts = async (db: ReturnType<typeof useDB>): Promise<SocialPost[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM social_post
       WHERE status = 'open'
       ORDER BY est_reach DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  pendingCount: number;
  totalEstReach: number;
  avgEngagementRate: number;
  platformCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(est_reach) AS reach,
         math::mean(est_engagement_rate) AS engagement,
         count(DISTINCT platform) AS platforms
       FROM social_post
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      pendingCount: safeNumber(r.total, 0),
      totalEstReach: safeNumber(r.reach, 0),
      avgEngagementRate: safeNumber(r.engagement, 0),
      platformCount: safeNumber(r.platforms, 0),
    };
  } catch {
    return { pendingCount: 0, totalEstReach: 0, avgEngagementRate: 0, platformCount: 0 };
  }
};

export const updatePostStatus = async (
  db: ReturnType<typeof useDB>,
  postId: string,
  status: 'scheduled' | 'posted' | 'declined' | 'expired'
): Promise<void> => {
  const now = new Date().toISOString();
  await db.query(`UPDATE $id SET status = $status, posted_at = $now`, {
    id: postId, status, now,
  });
};
