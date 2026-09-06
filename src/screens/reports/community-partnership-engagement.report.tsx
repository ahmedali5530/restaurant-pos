/**
 * AI Community Partnership & Local Engagement Optimizer — predicts how
 * community partnerships and local engagement (school partnerships, charity
 * fundraising nights, local sports team sponsorship, business lunch programs,
 * neighborhood events, food bank donations, local artisan features, community
 * board hosting) impact customer acquisition, brand loyalty, local SEO, and
 * competitive differentiation.
 *
 * 180th POSR-exclusive differentiator.
 */

import { useState, useCallback, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHandshake, faRotate, faHeart, faGraduationCap, faFutbol,
  faBriefcase, faBoxOpen, faSignsPost, faPalette,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runCommunityPartnershipEngine, getActiveCommunityPartnershipAlerts, getCommunityPartnershipSummary,
  updateCommunityPartnershipAlertStatus, readCommunityPartnershipConfig, DEFAULT_COMMUNITY_PARTNERSHIP_CONFIG,
  type CommunityPartnershipAlert,
} from "@/lib/community-partnership-engagement.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  community_partnership_absent:        { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faHandshake,       label: 'NO PARTNERSHIPS' },
  charity_fundraising_night_missing:  { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faHeart,           label: 'NO CHARITY NIGHTS' },
  local_school_partnership_absent:    { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faGraduationCap,   label: 'NO SCHOOL PARTNER' },
  local_sports_sponsorship_missing:   { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faFutbol,          label: 'NO SPORTS SPONSOR' },
  corporate_account_program_absent:   { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faBriefcase,       label: 'NO CORPORATE ACCTS' },
  food_bank_donation_program_missing: { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faBoxOpen,         label: 'NO FOOD BANK' },
  community_board_hosting_absent:     { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faSignsPost,       label: 'NO COMMUNITY BOARD' },
  local_artisan_feature_missing:      { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faPalette,         label: 'NO ARTISAN FEAT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function CommunityPartnershipEngagementScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<CommunityPartnershipAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noCommunityCount: 0, noCharityNightCount: 0, noCorporateAccountCount: 0, noArtisanCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_COMMUNITY_PARTNERSHIP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCommunityPartnershipConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveCommunityPartnershipAlerts(db), getCommunityPartnershipSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[community-partnership-engagement-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCommunityPartnershipEngine(db, config);
      toast.success(`Analyzed ${result.generated} community partnership + engagement signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[community-partnership-engagement-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateCommunityPartnershipAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[community-partnership-engagement-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Community Partnership & Local Engagement Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHandshake} className="text-violet-600" />
              AI Community Partnership &amp; Local Engagement Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how community partnerships + local engagement (school partnerships, charity fundraising nights, local sports team sponsorship, business lunch programs, neighborhood events, food bank donations, community board, local artisan features) impact customer acquisition + brand loyalty + local SEO + competitive differentiation — 68% prefer community-supporting restaurants (Cone Communications); 15-25% higher retention (Cornell CHR); charity nights boost slow-night traffic 30-40%; school partnerships worth $2,000-8,000/yr per school; sports sponsorship = 500+ walking billboard impressions/season; corporate accounts generate $3,000-15,000/mo recurring; food bank donations = $1,000-5,000 PR value; community board = 10-15% foot traffic lift
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faHandshake} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze community'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faHandshake} label="No partnerships" value={String(summary.noCommunityCount)} color={summary.noCommunityCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faHeart} label="No charity nights" value={String(summary.noCharityNightCount)} color={summary.noCharityNightCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBriefcase} label="No corporate accts" value={String(summary.noCorporateAccountCount)} color={summary.noCorporateAccountCount > 0 ? 'text-emerald-600' : 'text-emerald-600'} />
          <SummaryCard icon={faPalette} label="No artisan features" value={String(summary.noArtisanCount)} color={summary.noArtisanCount > 0 ? 'text-fuchsia-600' : 'text-emerald-600'} />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faHandshake} spin className="text-4xl mb-3" />
            <p>Analyzing community partnership + local engagement opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No community partnership / local engagement alerts</p>
            <p className="text-sm mt-1">Community programs active across multiple channels (charity fundraising nights hosted, local school partnerships with PTA + team dinners, local sports team sponsorship with 500+ jersey impressions/season, corporate lunch accounts generating $3,000-15,000/mo recurring, food bank donation program with documented PR value, community event board with 10-15% foot traffic lift, local artisan features with cross-promotion partnerships).</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faHandshake, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.market_setting && (
                            <span className="text-xs text-neutral-500">{alert.market_setting}</span>
                          )}
                          {alert.has_community_partnerships != null && (
                            <span className={`text-xs ${alert.has_community_partnerships ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_community_partnerships ? 'partnerships yes' : 'NO partnerships'}</span>
                          )}
                          {alert.community_programs_count != null && alert.community_programs_count > 0 && (
                            <span className={`text-xs ${alert.community_programs_count < 3 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.community_programs_count} programs</span>
                          )}
                          {alert.community_programs && alert.community_programs.length > 0 && (
                            <span className="text-xs text-neutral-500">{alert.community_programs.join(', ')}</span>
                          )}
                          {alert.has_charity_fundraising_nights != null && (
                            <span className={`text-xs ${alert.has_charity_fundraising_nights ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_charity_fundraising_nights ? 'charity nights yes' : 'NO charity nights'}</span>
                          )}
                          {alert.charity_nights_per_month != null && alert.charity_nights_per_month > 0 && (
                            <span className="text-xs text-neutral-500">{alert.charity_nights_per_month} nights/mo</span>
                          )}
                          {alert.charity_donation_pct != null && alert.charity_donation_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.charity_donation_pct}% donated</span>
                          )}
                          {alert.charity_night_traffic_lift_pct != null && alert.charity_night_traffic_lift_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">+{alert.charity_night_traffic_lift_pct}% traffic</span>
                          )}
                          {alert.has_local_school_partnership != null && (
                            <span className={`text-xs ${alert.has_local_school_partnership ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_local_school_partnership ? 'school yes' : 'NO school'}</span>
                          )}
                          {alert.school_partnerships_count != null && alert.school_partnerships_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.school_partnerships_count} schools</span>
                          )}
                          {alert.school_partnership_revenue_yr != null && alert.school_partnership_revenue_yr > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${(alert.school_partnership_revenue_yr / 1000).toFixed(1)}k/yr school</span>
                          )}
                          {alert.has_local_sports_sponsorship != null && (
                            <span className={`text-xs ${alert.has_local_sports_sponsorship ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_local_sports_sponsorship ? 'sports yes' : 'NO sports'}</span>
                          )}
                          {alert.sports_teams_sponsored != null && alert.sports_teams_sponsored > 0 && (
                            <span className="text-xs text-neutral-500">{alert.sports_teams_sponsored} teams</span>
                          )}
                          {alert.sports_jersey_impressions_per_season != null && alert.sports_jersey_impressions_per_season > 0 && (
                            <span className={`text-xs ${alert.sports_jersey_impressions_per_season < 500 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.sports_jersey_impressions_per_season} imp/season</span>
                          )}
                          {alert.sports_total_impressions_yr != null && alert.sports_total_impressions_yr > 0 && (
                            <span className="text-xs text-violet-600 font-medium">{alert.sports_total_impressions_yr.toLocaleString()} imp/yr</span>
                          )}
                          {alert.has_corporate_account_program != null && (
                            <span className={`text-xs ${alert.has_corporate_account_program ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_corporate_account_program ? 'corporate yes' : 'NO corporate'}</span>
                          )}
                          {alert.corporate_accounts_count != null && alert.corporate_accounts_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.corporate_accounts_count} accounts</span>
                          )}
                          {alert.corporate_account_avg_monthly != null && alert.corporate_account_avg_monthly > 0 && (
                            <span className="text-xs text-neutral-500">${alert.corporate_account_avg_monthly}/acct/mo</span>
                          )}
                          {alert.corporate_revenue_monthly != null && alert.corporate_revenue_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.corporate_revenue_monthly}/mo corporate</span>
                          )}
                          {alert.has_food_bank_donation_program != null && (
                            <span className={`text-xs ${alert.has_food_bank_donation_program ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_food_bank_donation_program ? 'food bank yes' : 'NO food bank'}</span>
                          )}
                          {alert.food_bank_donations_lb_yr != null && alert.food_bank_donations_lb_yr > 0 && (
                            <span className="text-xs text-neutral-500">{alert.food_bank_donations_lb_yr.toLocaleString()} lbs/yr</span>
                          )}
                          {alert.food_bank_pr_value_yr != null && alert.food_bank_pr_value_yr > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${(alert.food_bank_pr_value_yr / 1000).toFixed(1)}k PR/yr</span>
                          )}
                          {alert.has_community_board != null && (
                            <span className={`text-xs ${alert.has_community_board ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_community_board ? 'board yes' : 'NO board'}</span>
                          )}
                          {alert.community_board_events_per_month != null && alert.community_board_events_per_month > 0 && (
                            <span className="text-xs text-neutral-500">{alert.community_board_events_per_month} events/mo</span>
                          )}
                          {alert.community_board_traffic_lift_pct != null && alert.community_board_traffic_lift_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">+{alert.community_board_traffic_lift_pct}% traffic</span>
                          )}
                          {alert.has_local_artisan_features != null && (
                            <span className={`text-xs ${alert.has_local_artisan_features ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_local_artisan_features ? 'artisan yes' : 'NO artisan'}</span>
                          )}
                          {alert.artisan_count != null && alert.artisan_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.artisan_count} artisans</span>
                          )}
                          {alert.artisan_categories && alert.artisan_categories.length > 0 && (
                            <span className="text-xs text-neutral-500">{alert.artisan_categories.join(', ')}</span>
                          )}
                          {alert.artisan_cross_promo_partners != null && alert.artisan_cross_promo_partners > 0 && (
                            <span className="text-xs text-violet-600 font-medium">{alert.artisan_cross_promo_partners} cross-promos</span>
                          )}
                          {alert.customer_retention_rate != null && alert.customer_retention_rate > 0 && (
                            <span className={`text-xs ${alert.customer_retention_rate < 75 ? 'text-rose-600 font-medium' : alert.customer_retention_rate < 80 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.customer_retention_rate}% retention</span>
                          )}
                          {alert.community_customer_acquisition_yr != null && alert.community_customer_acquisition_yr > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.community_customer_acquisition_yr} new/yr</span>
                          )}
                          {alert.local_seo_rank != null && alert.local_seo_rank > 0 && (
                            <span className={`text-xs ${alert.local_seo_rank > 10 ? 'text-rose-600 font-medium' : alert.local_seo_rank > 3 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>SEO #{alert.local_seo_rank}</span>
                          )}
                          {alert.monthly_community_revenue != null && alert.monthly_community_revenue > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.monthly_community_revenue}/mo community</span>
                          )}
                          {alert.community_revenue_pct != null && alert.community_revenue_pct > 0 && (
                            <span className={`text-xs ${alert.community_revenue_pct < 5 ? 'text-rose-600 font-medium' : alert.community_revenue_pct < 10 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.community_revenue_pct}% of total</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.retention_lift_pct != null && alert.retention_lift_pct > 0 && (
                            <span className="text-emerald-600">+{alert.retention_lift_pct}% retention lift (target)</span>
                          )}
                          {alert.traffic_lift_pct != null && alert.traffic_lift_pct > 0 && (
                            <span className="text-emerald-600">+{alert.traffic_lift_pct}% traffic lift</span>
                          )}
                          {alert.community_revenue_change != null && alert.community_revenue_change > 0 && (
                            <span className="text-emerald-600">+${alert.community_revenue_change}/mo community</span>
                          )}
                          {alert.pr_value_change != null && alert.pr_value_change > 0 && (
                            <span className="text-violet-600">+${alert.pr_value_change}/yr PR value</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct > 0 && (
                            <span className="text-emerald-600">{alert.predicted_revenue_change_pct}% total revenue</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faHandshake} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo opportunity</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Community partnerships: <span className={config.requireCommunityPartnerships ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCommunityPartnerships ? 'required' : 'optional'}</span></span>
          <span>Charity nights: <span className={config.requireCharityFundraisingNights ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCharityFundraisingNights ? 'required' : 'optional'}</span></span>
          <span>School partnership: <span className={config.requireLocalSchoolPartnership ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLocalSchoolPartnership ? 'required' : 'optional'}</span></span>
          <span>Sports sponsorship: <span className={config.requireLocalSportsSponsorship ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLocalSportsSponsorship ? 'required' : 'optional'}</span></span>
          <span>Corporate accounts: <span className={config.requireCorporateAccountProgram ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCorporateAccountProgram ? 'required' : 'optional'}</span></span>
          <span>Food bank: <span className={config.requireFoodBankDonationProgram ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFoodBankDonationProgram ? 'required' : 'optional'}</span></span>
          <span>Community board: <span className={config.requireCommunityBoard ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCommunityBoard ? 'required' : 'optional'}</span></span>
          <span>Local artisans: <span className={config.requireLocalArtisanFeatures ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLocalArtisanFeatures ? 'required' : 'optional'}</span></span>
          <span>Min retention: {config.minRetentionRate}%</span>
          <span>Min charity night traffic lift: {config.minCharityNightTrafficLiftPct}%</span>
          <span>Min sports impressions/season: {config.minSportsImpressionsPerSeason}</span>
          <span>Min corporate account/mo: ${config.minCorporateAccountMonthly}</span>
          <span className="text-neutral-400">180th POSR-exclusive differentiator</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default CommunityPartnershipEngagementScreen;
