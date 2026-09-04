-- Migration: 2026_09_14_tax_deduction_finder.surql
--
-- AI Restaurant Tax Deduction Finder — 93rd POSR-exclusive differentiator.
--
-- Research finding: Restaurants miss $2,000-10,000/year in tax deductions
-- (IRS Small Business Report, NRA Tax Survey, Restaurant Accounting Services):
--   - Equipment depreciation: ovens, fryers, POS hardware depreciated over
--     5-7 years (Section 179 allows immediate expensing up to $1M)
--   - Meal comps: employee meals (100% deductible), comp meals for customers
--     (50% deductible) — often not tracked properly
--   - Charitable donations: leftover food donated to charities (enhanced
--     deduction = basis + 50% of appreciation)
--   - Energy tax credits: ENERGY STAR equipment (up to $5,000 credit),
--     solar installation (30% ITC)
--   - Supplies deduction: smallware, linens, uniforms, cleaning supplies
--     (often missed or under-claimed)
--   - Home office: owner-manager home office ($5/sqft up to 300 sqft)
--   - Workers comp credit: safety program tax credits (state-specific)
--   - Startup costs: first-year organizing costs ($5,000 deduction)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO tax deduction
-- tracking. Toast integrates with QuickBooks but doesn't IDENTIFY deductions.
-- Third-party tax services (Avalara, TaxJar) handle sales tax compliance —
-- NOT income tax deduction discovery. Restaurant CPAs charge $200-500/hr
-- for deduction review.
--
-- POSR's existing services cover DIFFERENT financial aspects:
--   - order-tax.service = SALES tax calculation on orders (transactional)
--     — NOT income tax deductions
--   - compliance-tracking.service = EMPLOYEE document expiry (food handler
--     certs, alcohol permits) — NOT tax deductions
--   - cash-flow.service = 30-day CASH POSITION projection — NOT tax optimization
--   - break-even-tracker.service = DAILY break-even tracking — NOT tax
--   - payment-fee-optimizer.service = PAYMENT processing fee optimization
--     — NOT tax deductions
--   - carbon-footprint-tracker.service = CO2 emissions tracking — NOT tax
--     (though energy credits overlap, the tracking is different)
--
-- This new service IDENTIFIES TAX DEDUCTIONS:
--   - Tracks equipment purchases eligible for Section 179 depreciation
--   - Logs employee meals + customer comps (deductible portions)
--   - Tracks charitable food donations (enhanced deduction)
--   - Identifies ENERGY STAR equipment for tax credits
--   - Categorizes supplies for maximum deduction
--   - Calculates home office deduction for owner-managers
--   - Flags workers comp safety program credits
--   - Tracks startup/organizing costs for first-year deduction
--   - Estimates total annual tax savings

DEFINE TABLE IF NOT EXISTS tax_deduction_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON tax_deduction_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON tax_deduction_alert TYPE string;
  -- 'equipment_depreciation' | 'meal_comp_deduction' | 'charitable_donation' |
--   'energy_tax_credit' | 'supplies_deduction' | 'home_office_deduction' |
--   'workers_comp_credit' | 'startup_cost_deduction'
DEFINE FIELD IF NOT EXISTS severity        ON tax_deduction_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS deduction_category ON tax_deduction_alert TYPE string;
  -- 'section_179' | 'meal_deduction' | 'charitable' | 'energy_credit' |
--   'supplies' | 'home_office' | 'safety_credit' | 'startup'
DEFINE FIELD IF NOT EXISTS current_claim   ON tax_deduction_alert TYPE float DEFAULT 0;
  -- $ currently claimed for this category
DEFINE FIELD IF NOT EXISTS eligible_amount  ON tax_deduction_alert TYPE float DEFAULT 0;
  -- $ eligible but not yet claimed
DEFINE FIELD IF NOT EXISTS tax_savings      ON tax_deduction_alert TYPE float DEFAULT 0;
  -- estimated $ tax savings (at 21% corporate rate or owner's marginal rate)
DEFINE FIELD IF NOT EXISTS documentation_status ON tax_deduction_alert TYPE option<string>;
  -- 'complete' | 'partial' | 'missing'
DEFINE FIELD IF NOT EXISTS deadline         ON tax_deduction_alert TYPE option<string>;
  -- filing deadline for this deduction (e.g., '2027-04-15')
DEFINE FIELD IF NOT EXISTS description      ON tax_deduction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight       ON tax_deduction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON tax_deduction_alert TYPE option<string>;
  -- 'claim_now' | 'gather_docs' | 'consult_cpa' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status           ON tax_deduction_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at      ON tax_deduction_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON tax_deduction_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_tax_rule      ON tax_deduction_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_tax_status    ON tax_deduction_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_tax_severity  ON tax_deduction_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_tax_category  ON tax_deduction_alert FIELDS deduction_category;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS tax_ai_enabled        ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS tax_corporate_rate    ON settings TYPE option<float> DEFAULT 21.0;
  -- corporate tax rate % (default 21% federal)
DEFINE FIELD IF NOT EXISTS tax_section_179_limit ON settings TYPE option<int> DEFAULT 1000000;
  -- Section 179 immediate expensing limit (2024: $1.16M, rounded to $1M)
DEFINE FIELD IF NOT EXISTS tax_meal_deduction_pct ON settings TYPE option<float> DEFAULT 50.0;
  -- customer meal deduction % (50% — employee meals 100%)
DEFINE FIELD IF NOT EXISTS tax_filing_deadline   ON settings TYPE option<string> DEFAULT '2027-04-15';
  -- next tax filing deadline
