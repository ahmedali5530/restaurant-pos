/**
 * Marketing Campaign Management — admin UI for creating + sending campaigns.
 *
 * New tab in Admin screen (19th tab, after 'gift_cards').
 *
 * Features:
 *   - Create campaign (segment selection + channel + content + offer)
 *   - AI-assisted content generation (button → generateCampaignContent)
 *   - Preview recipients (count + sample)
 *   - Send campaign (creates recipient records + updates stats)
 *   - View campaign stats (sent/opened/clicked/redeemed)
 *   - Segment builder (tier, visits, spend filters)
 */

import { useState, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Textarea } from "@/components/common/input/textarea.tsx";
import {
  createCampaign,
  sendCampaign,
  getCampaignStats,
  findSegmentCustomers,
  generateCampaignContent,
  type CampaignChannel,
  type OfferType,
  type SegmentCriteria,
} from "@/lib/marketing.service.ts";

export function MarketingManagement() {
  const { t } = useTranslation(["admin", "common"]);
  const db = useDB();

  // Campaign form
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("email");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [offerType, setOfferType] = useState<OfferType>("discount_percent");
  const [offerValue, setOfferValue] = useState<number>(10);
  const [recipientCount, setRecipientCount] = useState<number>(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  // Segment criteria
  const [tierFilter, setTierFilter] = useState<string[]>([]);
  const [minSpend, setMinSpend] = useState<number>(0);
  const [lastVisitDays, setLastVisitDays] = useState<number>(0);

  // Preview recipients
  const handlePreview = useCallback(async () => {
    const criteria: SegmentCriteria = {
      loyalty_tier: tierFilter.length > 0 ? tierFilter : undefined,
      min_spend: minSpend > 0 ? minSpend : undefined,
      last_visit_days: lastVisitDays > 0 ? lastVisitDays : undefined,
    };
    try {
      const { count } = await findSegmentCustomers(db, criteria);
      setRecipientCount(count);
      toast.success(
        t("admin:marketing.recipientsFound", { defaultValue: "{{count}} recipients match this segment", count })
      );
    } catch {
      toast.error(t("admin:marketing.previewFailed", { defaultValue: "Failed to preview segment" }));
    }
  }, [db, tierFilter, minSpend, lastVisitDays, t]);

  // AI content generation
  const handleAiGenerate = useCallback(async () => {
    setAiGenerating(true);
    try {
      const result = await generateCampaignContent({
        campaign_type: offerType === "points_bonus" ? "loyalty_bonus" : "discount",
        offer_type: offerType,
        offer_value: offerValue,
        segment_description: tierFilter.length > 0 ? `${tierFilter.join(", ")} tier customers` : "all customers",
      });
      setSubject(result.subject);
      setBodyText(result.body_text);
      toast.success(t("admin:marketing.aiGenerated", { defaultValue: "AI content generated!" }));
    } catch {
      toast.error(t("admin:marketing.aiFailed", { defaultValue: "AI generation failed — using template" }));
    } finally {
      setAiGenerating(false);
    }
  }, [offerType, offerValue, tierFilter, t]);

  // Create + send
  const handleCreateAndSend = useCallback(async () => {
    if (!name.trim() || !bodyText.trim()) {
      toast.error(t("admin:marketing.fillRequired", { defaultValue: "Fill in name and body text" }));
      return;
    }
    setSending(true);
    try {
      const campaignId = await createCampaign(db, {
        name,
        channel,
        subject: subject || undefined,
        body_text: bodyText,
        offer_type: offerType,
        offer_value: offerValue,
      });

      const { sent, failed } = await sendCampaign(db, campaignId);
      toast.success(
        t("admin:marketing.sent", { defaultValue: "Campaign sent to {{sent}} recipients ({{failed}} failed)", sent, failed })
      );

      // Reset form
      setName(""); setSubject(""); setBodyText("");
      setRecipientCount(0);
    } catch (err: any) {
      toast.error(err?.message || t("admin:marketing.sendFailed", { defaultValue: "Failed to send campaign" }));
    } finally {
      setSending(false);
    }
  }, [db, name, channel, subject, bodyText, offerType, offerValue, t]);

  const channelOptions = [
    { label: t("admin:marketing.channelEmail", { defaultValue: "Email" }), value: "email" },
    { label: t("admin:marketing.channelSms", { defaultValue: "SMS" }), value: "sms" },
    { label: t("admin:marketing.channelBoth", { defaultValue: "Email + SMS" }), value: "both" },
  ];

  const offerOptions = [
    { label: t("admin:marketing.offerPercent", { defaultValue: "Discount (% off)" }), value: "discount_percent" },
    { label: t("admin:marketing.offerFixed", { defaultValue: "Discount ($ off)" }), value: "discount_fixed" },
    { label: t("admin:marketing.offerPoints", { defaultValue: "Bonus loyalty points" }), value: "points_bonus" },
    { label: t("admin:marketing.offerFreeItem", { defaultValue: "Free item" }), value: "free_item" },
    { label: t("admin:marketing.offerNone", { defaultValue: "No offer (info only)" }), value: "none" },
  ];

  const tierOptions = [
    { label: "Bronze", value: "bronze" },
    { label: "Silver", value: "silver" },
    { label: "Gold", value: "gold" },
    { label: "Platinum", value: "platinum" },
  ];

  return (
    <div className="p-4 space-y-4" data-testid="marketing-management">
      {/* Campaign name + channel */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <h3 className="text-lg font-semibold">
          {t("admin:marketing.newCampaign", { defaultValue: "New Campaign" })}
        </h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <InputField
              name="campaignName"
              label={t("admin:marketing.campaignName", { defaultValue: "Campaign name" })}
              control={{ value: name, onChange: (v: any) => setName(String(v || "")) } as any}
            />
          </div>
          <div className="w-[160px]">
            <label className="block text-sm font-semibold mb-2">{t("admin:marketing.channel", { defaultValue: "Channel" })}</label>
            <ReactSelect
              value={channelOptions.find((o) => o.value === channel)}
              onChange={(opt: any) => setChannel(opt?.value || "email")}
              options={channelOptions}
            />
          </div>
        </div>
      </div>

      {/* Segment builder */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <h4 className="font-semibold text-sm">
          {t("admin:marketing.targetAudience", { defaultValue: "Target Audience" })}
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-2">{t("admin:marketing.loyaltyTier", { defaultValue: "Loyalty tier" })}</label>
            <ReactSelect
              isMulti
              value={tierOptions.filter((o) => tierFilter.includes(o.value))}
              onChange={(opts: any) => setTierFilter(opts ? opts.map((o: any) => o.value) : [])}
              options={tierOptions}
              placeholder={t("admin:marketing.allTiers", { defaultValue: "All tiers" })}
            />
          </div>
          <div>
            <InputField
              name="minSpend"
              label={t("admin:marketing.minSpend", { defaultValue: "Min total spend" })}
              control={{ value: minSpend, onChange: (v: any) => setMinSpend(Number(v) || 0) } as any}
              type="number"
            />
          </div>
          <div>
            <InputField
              name="lastVisitDays"
              label={t("admin:marketing.lastVisit", { defaultValue: "Last visit (days)" })}
              control={{ value: lastVisitDays, onChange: (v: any) => setLastVisitDays(Number(v) || 0) } as any}
              type="number"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => void handlePreview()}>
            {t("admin:marketing.previewRecipients", { defaultValue: "Preview recipients" })}
          </Button>
          {recipientCount > 0 && (
            <span className="text-sm font-medium text-primary">
              {t("admin:marketing.recipientCount", { defaultValue: "{{count}} recipients", count: recipientCount })}
            </span>
          )}
        </div>
      </div>

      {/* Campaign content */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">
            {t("admin:marketing.content", { defaultValue: "Content" })}
          </h4>
          <Button variant="ghost" onClick={() => void handleAiGenerate()} disabled={aiGenerating}>
            {aiGenerating
              ? t("admin:marketing.aiGenerating", { defaultValue: "AI generating…" })
              : t("admin:marketing.aiGenerate", { defaultValue: "✨ Generate with AI" })}
          </Button>
        </div>
        {channel !== "sms" && (
          <InputField
            name="subject"
            label={t("admin:marketing.subject", { defaultValue: "Subject line" })}
            control={{ value: subject, onChange: (v: any) => setSubject(String(v || "")) } as any}
            placeholder="Special offer just for you!"
          />
        )}
        <div>
          <label className="block text-sm font-semibold mb-2">{t("admin:marketing.body", { defaultValue: "Message body" })}</label>
          <Textarea
            value={bodyText}
            onChange={(e: any) => setBodyText(e?.target?.value ?? e ?? "")}
            rows={6}
            placeholder="Hi {{first_name}}, we have a special offer for you…"
          />
        </div>
        <p className="text-xs text-neutral-400">
          {t("admin:marketing.variables", { defaultValue: "Variables: {{first_name}}, {{offer_code}}, {{expiry_date}}" })}
        </p>
      </div>

      {/* Offer */}
      <div className="bg-white rounded-xl shadow p-5 space-y-3">
        <h4 className="font-semibold text-sm">{t("admin:marketing.offer", { defaultValue: "Offer" })}</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-2">{t("admin:marketing.offerType", { defaultValue: "Offer type" })}</label>
            <ReactSelect
              value={offerOptions.find((o) => o.value === offerType)}
              onChange={(opt: any) => setOfferType(opt?.value || "discount_percent")}
              options={offerOptions}
            />
          </div>
          {offerType !== "none" && offerType !== "free_item" && (
            <div>
              <InputField
                name="offerValue"
                label={t("admin:marketing.offerValue", { defaultValue: "Offer value" })}
                control={{ value: offerValue, onChange: (v: any) => setOfferValue(Number(v) || 0) } as any}
                type="number"
              />
            </div>
          )}
        </div>
      </div>

      {/* Send button */}
      <div className="flex justify-end gap-3">
        <Button
          variant="primary"
          onClick={() => void handleCreateAndSend()}
          disabled={sending || !name.trim() || !bodyText.trim()}
          data-testid="marketing-send-btn"
        >
          {sending
            ? t("common:actions.processing", { defaultValue: "Processing…" })
            : t("admin:marketing.createAndSend", { defaultValue: "Create & Send Campaign" })}
        </Button>
      </div>
    </div>
  );
}
